import "server-only";

import { unstable_cache } from "next/cache";

import {
  DIAS_DE_AQUECIMENTO,
  DIAS_DE_PREVISAO,
  lerDiario,
  mediaEntreAnos,
  montarJanela,
  type DiaClima,
  type Janela,
  type RespostaDiaria,
} from "./clima";
import { isoHoje, somarDias } from "./format";

/**
 * Busca de clima no Open-Meteo: gratuito e sem chave, mas com etiqueta.
 *
 * Duas APIs, os mesmos nomes de variavel:
 *   forecast  ate 16 dias a frente, e ate ~63 dias para tras
 *   archive   ERA5 observado, com atraso de ~5 dias
 *
 * O ARQUIVO LIMITA CONCORRENCIA de verdade: uma rajada de cinco requisicoes
 * paralelas durante o desenvolvimento derrubou o IP em 429 por varios minutos,
 * e o bloqueio nao passa rapido. Por isso aqui nao existe `Promise.all`: os
 * anos sao buscados em serie, o primeiro fracasso interrompe o resto, e ha
 * orcamento de tempo total. Uma tela de demonstracao nao pode ficar refem de
 * uma cota que ela mesma estourou.
 *
 * O AQUECIMENTO VEM DE GRACA. O balde de agua no solo do modelo novo precisa de
 * passado, e `past_days` na API de PREVISAO entrega isso na mesma requisicao
 * que ja se fazia. A alternativa -- uma chamada ao arquivo para os 120 dias
 * anteriores, como faz o notebook de calibracao -- seria uma requisicao a mais
 * justamente na API que responde 429.
 *
 * `unstable_cache` e nao `fetch(..., { cache })`: o `layout.tsx` declara
 * `dynamic = "force-dynamic"`, que no Next 16 equivale a
 * `fetchCache = "force-no-store"` e ANULA qualquer `cache: "force-cache"` nos
 * fetches da rota. O cache de dados por funcao nao passa por esse ajuste.
 */

const API_PREVISAO = "https://api.open-meteo.com/v1/forecast";
const API_ARQUIVO = "https://archive-api.open-meteo.com/v1/archive";

const VARIAVEIS = [
  "temperature_2m_mean",
  "temperature_2m_min",
  "temperature_2m_max",
  "relative_humidity_2m_mean",
  "precipitation_sum",
  "shortwave_radiation_sum",
  "et0_fao_evapotranspiration",
].join(",");

/** Quantos anos do ERA5 entram na media do complemento. Dois, e nao cinco,
 *  porque cada ano e uma requisicao em serie e a pagina inteira espera. */
const ANOS_DE_HISTORICO = 2;
const TIMEOUT_MS = 10_000;
const ORCAMENTO_MS = 14_000;

/** ~1,1 km. Arredondar da acerto de cache entre simulacoes vizinhas sem mudar
 *  o resultado: a grade do proprio Open-Meteo e mais grossa que isso. */
function arredondar(v: number): number {
  return Math.round(v * 100) / 100;
}

function iso(base: string, dias: number): string {
  return somarDias(base, dias).toISOString().slice(0, 10);
}

/** A mesma data, `anos` anos atras. 29 de fevereiro cai para 28. */
function menosAnos(data: string, anos: number): string {
  const [a, m, d] = data.split("-").map(Number);
  const dt = new Date(Date.UTC(a - anos, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) dt.setUTCDate(0);
  return dt.toISOString().slice(0, 10);
}

async function pedir(url: string): Promise<RespostaDiaria> {
  const resposta = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    // Explicito: sem isto o `force-dynamic` do layout ja mandaria `no-store`,
    // mas deixar escrito evita que alguem "conserte" achando que ha cache aqui.
    // O cache de verdade e o `unstable_cache` que embrulha estas funcoes.
    cache: "no-store",
  });

  if (!resposta.ok) {
    throw new Error(`Open-Meteo respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 120)}`);
  }

  const corpo = (await resposta.json()) as RespostaDiaria;
  if (corpo.error) throw new Error(corpo.reason ?? "Open-Meteo recusou a consulta.");
  return corpo;
}

/**
 * Uma requisicao, dois pedacos: o passado que aquece o balde e a previsao.
 *
 * O corte e por DATA e nao por posicao, porque a API decide sozinha quantos dos
 * `past_days` pedidos ela consegue entregar -- pedimos 92 e vem ~63.
 */
const janelaDaApi = unstable_cache(
  async (lat: number, lon: number, hoje: string): Promise<{ aquecimento: DiaClima[]; previsao: DiaClima[] }> => {
    const url =
      `${API_PREVISAO}?latitude=${lat}&longitude=${lon}&daily=${VARIAVEIS}` +
      `&past_days=${DIAS_DE_AQUECIMENTO}&forecast_days=${DIAS_DE_PREVISAO}` +
      `&timezone=America%2FSao_Paulo`;

    const dias = lerDiario(await pedir(url), "previsao");
    return {
      aquecimento: dias.filter((d) => d.data < hoje).map((d) => ({ ...d, fonte: "observado" as const })),
      previsao: dias.filter((d) => d.data >= hoje),
    };
  },
  ["open-meteo-janela"],
  { revalidate: 3_600, tags: ["clima"] },
);

/**
 * Media dos mesmos dias do calendario nos ultimos anos, observados pelo ERA5.
 *
 * Os anos vao do mais recente para tras e o laco PARA no primeiro fracasso: se
 * o arquivo recusou uma vez, insistir so aprofunda o bloqueio. Um ano ja serve;
 * zero anos devolve lista vazia e quem chamou cai para a repeticao.
 */
const historicoDoPonto = unstable_cache(
  async (
    lat: number,
    lon: number,
    inicio: string,
    fim: string,
  ): Promise<{ dias: DiaClima[]; anos: number[]; aviso: string | null }> => {
    const porAno: DiaClima[][] = [];
    const anos: number[] = [];
    const comecou = Date.now();
    let aviso: string | null = null;

    for (let k = 1; k <= ANOS_DE_HISTORICO; k += 1) {
      if (Date.now() - comecou > ORCAMENTO_MS) {
        aviso = "O arquivo histórico demorou demais; a média usou menos anos.";
        break;
      }

      const de = menosAnos(inicio, k);
      // Cinco dias de sobra: ano bissexto muda o comprimento da janela em um
      // dia, e faltar um dia derrubaria a media inteira para a repeticao.
      const ate = iso(menosAnos(fim, k), 5);

      try {
        const url =
          `${API_ARQUIVO}?latitude=${lat}&longitude=${lon}&daily=${VARIAVEIS}` +
          `&start_date=${de}&end_date=${ate}&timezone=America%2FSao_Paulo`;
        const dias = lerDiario(await pedir(url), "historico");
        if (dias.length === 0) break;

        porAno.push(dias);
        anos.push(Number(de.slice(0, 4)));
      } catch (e) {
        aviso =
          e instanceof Error && /429|concurrent/i.test(e.message)
            ? "O arquivo histórico do Open-Meteo recusou a consulta (limite de uso gratuito)."
            : `O arquivo histórico do Open-Meteo não respondeu (${e instanceof Error ? e.message : "erro"}).`;
        break;
      }
    }

    return { dias: mediaEntreAnos(porAno), anos, aviso };
  },
  ["open-meteo-historico"],
  { revalidate: 86_400, tags: ["clima"] },
);

/**
 * A janela de clima completa para `total` dias a partir de hoje, mais o
 * aquecimento que o balanco de agua no solo precisa.
 *
 * Previsao de verdade nos primeiros 16 dias; do 17 em diante, a media do ERA5
 * observado nos mesmos dias do calendario. Se o arquivo recusar, o padrao dos
 * 16 dias previstos e repetido, e o `Janela` devolvido diz qual dos dois valeu,
 * porque a tela mostra isso.
 */
export async function janelaDoPonto(
  latitude: number,
  longitude: number,
  total: number,
): Promise<Janela> {
  const lat = arredondar(latitude);
  const lon = arredondar(longitude);

  const hoje = isoHoje();
  const datas = Array.from({ length: total }, (_, i) => iso(hoje, i));

  const { aquecimento, previsao } = await janelaDaApi(lat, lon, hoje);

  if (total <= previsao.length) {
    return montarJanela({ aquecimento, previsao, historico: [], anos: [], total, datas });
  }

  const { dias, anos, aviso } = await historicoDoPonto(
    lat,
    lon,
    datas[previsao.length],
    datas[total - 1],
  );

  return montarJanela({
    aquecimento,
    previsao,
    historico: dias,
    anos,
    total,
    datas,
    avisoDoComplemento: aviso,
  });
}
