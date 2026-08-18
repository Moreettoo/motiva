import "server-only";

import { unstable_cache } from "next/cache";

import { isoHoje } from "./format";
import type { Prioridade } from "./types";

/**
 * A IA 2 do simulador.
 *
 * A separacao que define este projeto: o modelo estatistico responde QUANTO a
 * grama cresce, a LLM responde QUANDO roçar e por que. Ela recebe o numero
 * pronto e nao recalcula: as instrucoes abaixo dizem isso na primeira linha,
 * igual as do `analisar_lote.py`.
 *
 * O esquema de saida e o mesmo do lote de proposito. A pagina existe para
 * mostrar o fluxo real funcionando, e um esquema diferente aqui seria uma
 * demonstracao de outra coisa.
 *
 * A resposta e cacheada por uma hora com a entrada como chave. Simulacao e
 * deterministica e a URL e compartilhavel: sem cache, cada pessoa que abrisse o
 * mesmo link gastaria uma chamada para receber o mesmo texto.
 */

export type LeituraIA = {
  data_sugerida: string;
  prioridade: Prioridade;
  justificativa: string;
  fatores: string[];
};

/**
 * O contexto vai em snake_case e em portugues, igual ao do `analisar_lote.py`.
 *
 * Nao e preciosismo. A primeira versao mandava as chaves em camelCase do
 * JavaScript (`diaQueCruza`, `alturaFinalCm`) e a LLM leu `diaQueCruza: 61`
 * como se fosse prazo curto: devolveu "critica" com a justificativa "passa do
 * limite em menos de 7 dias" no mesmo paragrafo em que escreveu "cruza em 61
 * dias". Nomear o campo do jeito que as instrucoes falam dele custa nada e
 * fecha essa porta.
 */
export type ContextoLeitura = {
  especie: string;
  latitude: number;
  longitude: number;
  altura_inicial_cm: number;
  altura_prevista_cm: number;
  dias_simulados: number;
  dias_desde_a_ultima_rocada: number;
  crescimento_previsto_cm_por_dia: number;
  /**
   * O crescimento do periodo, em intervalo. E a saida direta do modelo v3.1:
   * ele nao responde um numero, responde uma faixa, e a largura dela e a
   * incerteza REAL daquele cenario.
   */
  crescimento_no_periodo_cm: { q10: number; q50: number; q90: number };
  /** O numero que manda na prioridade. `null` = nao chega ao limite no periodo. */
  dias_ate_cruzar_o_limite: number | null;
  /** Quando cruza no cenario otimista e no pessimista de crescimento. */
  quando_cruza_o_limite: { mais_cedo_dias: number | null; mais_tarde_dias: number | null };
  altura_limite_de_referencia_cm: number | null;
  temperatura_media_prevista_c: number;
  temperatura_minima_prevista_c: number;
  chuva_total_prevista_mm: number;
  dias_com_chuva_previstos: number;
  agua_no_solo_media_pct: number;
  /** Fertilidade e agua disponivel, e de onde os dois numeros vieram. */
  solo: {
    fertilidade_0_a_1: number;
    capacidade_de_agua_mm: number;
    origem: string;
  };
  dias_de_previsao_real: number;
  origem_do_resto_do_clima: string;
  /** Trecho vizinho que empresta o limite de altura. */
  referencia_operacional: {
    rodovia: string;
    km: string;
    uf: string;
    distancia_km: number;
    altura_limite_cm: number;
    tipo_pista: string | null;
    observacoes: string | null;
  } | null;
};

export type ResultadoLeitura = { ok: true; dados: LeituraIA } | { ok: false; erro: string };

const INSTRUCOES = `Você é o assistente de planejamento de roçada da Motiva, concessionária de rodovias.

Você recebe a previsão numérica de crescimento da vegetação, já calculada por um modelo
estatístico treinado em simulação diária de clima real. NÃO recalcule: confie no número. Sua
função é decidir QUANDO roçar e explicar POR QUÊ.

O modelo responde em INTERVALO, não em ponto. "crescimento_no_periodo_cm" traz q10, q50 e q90
em centímetros: o q50 é a mediana e é o número de trabalho, e a distância entre q10 e q90 é a
incerteza real daquele cenário. "quando_cruza_o_limite" diz o mesmo em dias. Intervalo largo
pede margem maior na data, e vale dizer isso ao gestor.

O contexto vem de um simulador: a pessoa escolheu uma espécie, um ponto no mapa, uma altura
inicial e um número de dias. Não existe trecho cadastrado nesse ponto. O campo
"referencia_operacional" é o trecho monitorado mais próximo, e o limite de altura dele é a
única referência disponível: trate-o como referência, não como regra daquele ponto, e diga
isso se a distância for grande.

A PRIORIDADE É FUNÇÃO APENAS DE "dias_ate_cruzar_o_limite". Não é opinião, não depende da
altura final nem da espécie. Leia o número e aplique a tabela, sem exceção:

  dias_ate_cruzar_o_limite = 0        -> critica  (já está acima do limite)
  dias_ate_cruzar_o_limite de 1 a 7   -> critica
  dias_ate_cruzar_o_limite de 8 a 20  -> alta
  dias_ate_cruzar_o_limite de 21 a 45 -> media
  dias_ate_cruzar_o_limite acima de 45 -> baixa
  dias_ate_cruzar_o_limite = null     -> baixa  (não chega ao limite no período simulado)

Antes de escrever a justificativa, confira: o prazo que você citar no texto tem que ser o
mesmo número do campo, e a prioridade tem que ser a linha da tabela correspondente a ele.

A data segue o prazo. Com prazo longo, sugira uma data próxima do cruzamento, não a de hoje.
Se não cruzar dentro do período simulado, use a data do fim do período e diga que dentro dele
não há necessidade de roçada.

Considere, além disso:
- Curvas e acessos exigem margem maior: antecipe em relação a retas.
- Seca prolongada com vegetação alta = risco de incêndio, antecipe.
- Chuva intensa prevista impede roçada: evite agendar nesses dias.
- Parte do clima pode não vir de previsão, e sim de média histórica
  ("origem_do_resto_do_clima"). Quanto mais longe o horizonte, menos firme é a data, diga
  isso quando for o caso.
- "dias_desde_a_ultima_rocada" é a fase da rebrota: trecho recém-cortado ainda cresce de
  reservas e acelera depois; trecho maduro já está na fase rápida ou saturando.
- O campo "solo" pode ter vindo de um mapa (SoilGrids) ou de premissa, e "origem" diz qual.
  Quando for premissa, não afirme nada sobre o solo daquele ponto como se fosse medição.

data_sugerida em AAAA-MM-DD. Justificativa em português do Brasil, até 3 frases, citando o
número previsto.

Os "fatores" são frases curtas em português, escritas para o gestor ler, nunca nomes de
campo deste JSON. Escreva "cruza o limite em 61 dias", não "dias_ate_cruzar_o_limite=61".`;

const ESQUEMA = {
  name: "leitura_simulacao",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["data_sugerida", "prioridade", "justificativa", "fatores"],
    properties: {
      data_sugerida: { type: "string" },
      prioridade: { type: "string", enum: ["baixa", "media", "alta", "critica"] },
      justificativa: { type: "string" },
      fatores: { type: "array", items: { type: "string" } },
    },
  },
} as const;

async function chamar(ctx: ContextoLeitura): Promise<ResultadoLeitura> {
  const chave = process.env.OPENAI_API_KEY;
  if (!chave) {
    return {
      ok: false,
      erro:
        "A leitura da IA precisa da variável OPENAI_API_KEY. Configure-a no ambiente do painel " +
        "(web/.env.local ou nas variáveis do deploy). A curva acima não depende dela.",
    };
  }

  let resposta: Response;
  try {
    resposta = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
        messages: [
          { role: "system", content: INSTRUCOES },
          {
            role: "user",
            content: JSON.stringify({ ...ctx, data_de_hoje: isoHoje() }),
          },
        ],
        response_format: { type: "json_schema", json_schema: ESQUEMA },
      }),
      signal: AbortSignal.timeout(90_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, erro: "Não foi possível falar com a OpenAI. A curva acima não depende dela." };
  }

  if (!resposta.ok) {
    const corpo = await resposta.text();
    return { ok: false, erro: `A OpenAI respondeu ${resposta.status}: ${corpo.slice(0, 200)}` };
  }

  const corpo = (await resposta.json()) as { choices?: { message?: { content?: string | null } }[] };
  const conteudo = corpo.choices?.[0]?.message?.content;
  if (!conteudo) return { ok: false, erro: "A OpenAI respondeu sem conteúdo." };

  try {
    return { ok: true, dados: JSON.parse(conteudo) as LeituraIA };
  } catch {
    return { ok: false, erro: "A OpenAI respondeu num formato que não deu para ler." };
  }
}

/**
 * `unstable_cache` e nao `fetch(..., { cache })` pelo mesmo motivo do
 * `open-meteo.ts`: `dynamic = "force-dynamic"` no layout equivale a
 * `fetchCache = "force-no-store"` e anularia o cache do fetch.
 */
const leituraCacheada = unstable_cache(
  async (assinatura: string, ctx: ContextoLeitura) => {
    void assinatura; // entra so como chave de cache
    return chamar(ctx);
  },
  ["leitura-simulacao"],
  { revalidate: 3_600, tags: ["simulador"] },
);

/**
 * Impressao digital das instrucoes, para entrar na chave de cache.
 *
 * `unstable_cache` monta a chave com os ARGUMENTOS e o corpo da funcao, as
 * instrucoes nao estao em nenhum dos dois. Sem isto, mexer no prompt deixaria
 * as respostas geradas pelo prompt ANTIGO vivas por mais uma hora, e a proxima
 * pessoa a mexer concluiria que a mudanca nao surtiu efeito.
 */
function digitalDoPrompt(): string {
  let h = 2166136261;
  for (let i = 0; i < INSTRUCOES.length; i += 1) {
    h ^= INSTRUCOES.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

const DIGITAL = digitalDoPrompt();

export async function lerSimulacao(ctx: ContextoLeitura): Promise<ResultadoLeitura> {
  // A chave arredonda o que e continuo: duas simulacoes que diferem na terceira
  // casa decimal da altura final produziriam o mesmo texto e nao merecem duas
  // chamadas. O dia de hoje entra porque a data sugerida depende dele.
  const assinatura = [
    DIGITAL,
    isoHoje(),
    ctx.especie,
    ctx.latitude.toFixed(2),
    ctx.longitude.toFixed(2),
    ctx.altura_inicial_cm.toFixed(1),
    ctx.dias_simulados,
    ctx.altura_prevista_cm.toFixed(1),
    ctx.dias_desde_a_ultima_rocada,
    ctx.dias_ate_cruzar_o_limite ?? "nao-cruza",
    // O solo entra na chave porque ele entra no prompt: sem isto, mexer nos
    // dois campos de solo devolveria o texto da simulacao anterior.
    ctx.solo.fertilidade_0_a_1.toFixed(2),
    Math.round(ctx.solo.capacidade_de_agua_mm),
    ctx.referencia_operacional?.rodovia ?? "sem-referencia",
  ].join("|");

  return leituraCacheada(assinatura, ctx);
}
