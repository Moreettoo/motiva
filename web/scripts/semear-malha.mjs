/**
 * Semeia a MALHA de demonstração: 12 rodovias, uma por concessionária, cada uma
 * com um trecho-piloto de 5 km fatiado em 10 segmentos de 500 m.
 *
 *   node scripts/semear-malha.mjs            # semeia (idempotente)
 *   node scripts/semear-malha.mjs --limpar   # desfaz tudo o que semeou
 *
 * ------------------------------------------------------------------------
 * POR QUE 12 E NÃO 13
 * ------------------------------------------------------------------------
 * A décima terceira é o `SP-021 Rodoanel Oeste`, e ela JÁ ESTÁ NO BANCO — 60
 * segmentos de 500 m vindos de `pesquisa/publicar_rodoanel.py`, que lê duas
 * planilhas de vistoria de campo (13 e 20/03/2026), um KMZ de marcos, um KMZ de
 * classificação de roçada e a série NDVI. Aquilo é MEDIÇÃO; isto aqui é malha
 * inventada com a mesma forma. Este script não encosta no Rodoanel.
 *
 * A diferença fica legível no banco sem coluna nova:
 *   - `ia.trechos.fonte_cadastro`   'levantamento_motiva' (real) vs 'demonstracao'
 *   - `ia.medicoes.origem`          'levantamento_classe' (real) vs 'demonstracao'
 *   - `ia.execucoes.origem`         'inferida_levantamento' (real) vs 'demonstracao'
 *
 * ------------------------------------------------------------------------
 * A MARCA DE ROLLBACK
 * ------------------------------------------------------------------------
 * `fonte_cadastro = 'demonstracao'` sozinho não serve: os 50 trechos antigos da
 * primeira demonstração (3 a 5 km, desativados) também são 'demonstracao', e
 * apagá-los junto levaria histórico que não é meu. A marca é `ref_externa`, que
 * já existia na tabela e estava vazia:
 *
 *     ref_externa = 'malha-demo:<slug>:<marco_em_metros>'
 *
 * Todas as FK para `ia.trechos` são ON DELETE CASCADE, então apagar o trecho
 * leva medição, execução, previsão, agendamento e chamado junto. `--limpar` é
 * um `delete` por prefixo e mais nada.
 *
 * ------------------------------------------------------------------------
 * O QUE ESTE SCRIPT NÃO DECIDE
 * ------------------------------------------------------------------------
 * Ele NÃO escreve previsão, risco nem agendamento. Escreve só a entrada —
 * trecho, medição, execução e zona de clima. Quem transforma isso em agenda é
 * `python ml/analisar_lote.py`, que consulta o Open-Meteo e o SoilGrids de
 * verdade para cada zona nova e roda o `modelo_gramas.pkl`. Semear previsão na
 * mão seria pintar a resposta do modelo sem rodar o modelo.
 *
 * ------------------------------------------------------------------------
 * UMA LIMITAÇÃO CONHECIDA, E ELA É DO MODELO
 * ------------------------------------------------------------------------
 * ViaSul (BR-290, RS, lat ~ -29,9) e ViaCosteira (BR-101/SC, lat ~ -27,7) caem
 * FORA da faixa de latitude que o `modelo_gramas.pkl` viu no treino (~ -25,4 a
 * +0,7). Fora da faixa o modelo não erra com barulho: ele satura no último bin,
 * ou seja, responde como se fosse -25,4. A direção continua certa (mais frio,
 * cresce menos), a calibração não. As duas rodovias entram porque a malha
 * oficial da Motiva tem sete estados e RS e SC são dois deles — mas quem
 * apresentar precisa saber disto antes de alguém perguntar.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);

const db = createClient(
  env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_KEY,
  { db: { schema: "ia" }, auth: { persistSession: false } },
);

const LIMPAR = process.argv.includes("--limpar");
const MARCA = "malha-demo:";
const SEGMENTOS = 10; // 10 x 500 m = 5 km por rodovia

/* ----------------------------------------------------------------------
   Utilidades
   ---------------------------------------------------------------------- */

/* "Hoje" em Brasília, pelo mesmo motivo de `isoHoje()` no painel e de
   `hoje_brasilia()` no lote: das 21 h à meia-noite o relógio de um servidor em
   UTC já virou o dia, e uma medição gravada "hoje" nasceria no futuro. */
const diaEmBrasilia = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function isoData(deslocamentoEmDias = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + deslocamentoEmDias);
  return diaEmBrasilia.format(d);
}

function parar(mensagem, erro) {
  console.error(`\n${mensagem}`);
  if (erro) console.error(erro.message ?? erro);
  process.exit(1);
}

function ou(resultado, mensagem) {
  if (resultado.error) parar(mensagem, resultado.error);
  return resultado.data;
}

const fmt = (n) => new Intl.NumberFormat("pt-BR").format(n);
const arred = (n, casas) => Number(n.toFixed(casas));

/* ----------------------------------------------------------------------
   As 12 rodovias — uma por concessionária do infográfico "Presença Nacional"
   ----------------------------------------------------------------------
   `de` e `ate` são as pontas do trecho-piloto de 5 km. Os 10 pontos médios
   saem de interpolação linear entre as duas: o eixo de uma rodovia num
   recorte de 5 km é reto o bastante para isso, e o que a coordenada precisa
   acertar é o MUNICÍPIO — é ela que escolhe a célula do Open-Meteo e do
   SoilGrids. Errar 200 m no eixo não muda nem clima nem solo; errar de cidade
   muda os dois. */
const RODOVIAS = [
  {
    slug: "sp330", nome: "SP-330 Anhanguera", uf: "SP", concessionaria_id: 1,
    local: "Louveira e Vinhedo", km0: 62, especie: "batatais", equipe_id: 1,
    sentidos: ["Capital", "Interior"],
    de: [-23.0870, -46.9510], ate: [-23.0480, -46.9810],
  },
  {
    slug: "sp075", nome: "SP-075 Castelinho", uf: "SP", concessionaria_id: 2,
    local: "Itu e Salto", km0: 18, especie: "braquiaria", equipe_id: 3,
    sentidos: ["Sorocaba", "Campinas"],
    de: [-23.2640, -47.3000], ate: [-23.2300, -47.2700],
  },
  {
    slug: "br116dutra", nome: "BR-116 Via Dutra", uf: "SP", concessionaria_id: 3,
    local: "Jacareí", km0: 160, especie: "braquiaria", equipe_id: 5,
    sentidos: ["Rio", "São Paulo"],
    de: [-23.3050, -45.9700], ate: [-23.2800, -46.0080],
  },
  {
    slug: "sp280", nome: "SP-280 Castello Branco", uf: "SP", concessionaria_id: 4,
    local: "Tatuí e Cerquilho", km0: 108, especie: "batatais", equipe_id: 4,
    sentidos: ["Capital", "Interior"],
    de: [-23.3600, -47.8400], ate: [-23.3450, -47.8900],
  },
  {
    slug: "rj124", nome: "RJ-124 Via Lagos", uf: "RJ", concessionaria_id: 6,
    local: "Rio Bonito e Araruama", km0: 22, especie: "braquiaria", equipe_id: 6,
    sentidos: ["Região dos Lagos", "Niterói"],
    de: [-22.7300, -42.5100], ate: [-22.7550, -42.4700],
  },
  {
    slug: "br163ms", nome: "BR-163/MS", uf: "MS", concessionaria_id: 7,
    local: "Campo Grande", km0: 500, especie: "braquiaria", equipe_id: 9,
    sentidos: ["Norte", "Sul"],
    de: [-20.5600, -54.6200], ate: [-20.6050, -54.6100],
  },
  {
    slug: "br290", nome: "BR-290 Free Way", uf: "RS", concessionaria_id: 8,
    local: "Gravataí e Santo Antônio da Patrulha", km0: 62, especie: "esmeralda",
    equipe_id: null, equipe_slug: "rs",
    sentidos: ["Litoral", "Porto Alegre"],
    de: [-29.8600, -50.8200], ate: [-29.8300, -50.7800],
  },
  {
    slug: "br101sc", nome: "BR-101/SC", uf: "SC", concessionaria_id: 9,
    local: "Palhoça e Paulo Lopes", km0: 204, especie: "esmeralda",
    equipe_id: null, equipe_slug: "sc",
    sentidos: ["Sul", "Norte"],
    de: [-27.7400, -48.6200], ate: [-27.7800, -48.6000],
  },
  {
    slug: "transolimpica", nome: "Transolímpica", uf: "RJ", concessionaria_id: 10,
    local: "Magalhães Bastos e Curicica", km0: 4, especie: "esmeralda", equipe_id: 7,
    sentidos: ["Barra da Tijuca", "Deodoro"],
    de: [-22.8750, -43.4100], ate: [-22.9000, -43.3700],
  },
  {
    slug: "sp340", nome: "SP-340 Adhemar de Barros", uf: "SP", concessionaria_id: 11,
    local: "Jaguariúna e Santo Antônio de Posse", km0: 132, especie: "batatais", equipe_id: 2,
    sentidos: ["Campinas", "Mococa"],
    de: [-22.7200, -46.9900], ate: [-22.6900, -46.9550],
  },
  {
    slug: "br376", nome: "BR-376 Rodovia do Café", uf: "PR", concessionaria_id: 12,
    local: "Mandaguari e Marialva", km0: 186, especie: "braquiaria", equipe_id: 10,
    sentidos: ["Maringá", "Londrina"],
    de: [-23.5500, -51.6700], ate: [-23.5300, -51.6250],
  },
  {
    slug: "br381", nome: "BR-381 Fernão Dias", uf: "MG", concessionaria_id: 13,
    local: "Pouso Alegre", km0: 852, especie: "braquiaria", equipe_id: 8,
    sentidos: ["Belo Horizonte", "São Paulo"],
    de: [-22.2100, -45.9500], ate: [-22.1750, -45.9250],
  },
];

/* ----------------------------------------------------------------------
   O perfil dos 10 segmentos
   ----------------------------------------------------------------------
   `alturaRel` é a altura medida em relação ao LIMITE do próprio segmento, e
   não um valor absoluto: é isso que faz cada rodovia abrir com um degradê de
   risco em vez de dez cartões da mesma cor. O índice 0 já passou do limite; o
   9 acabou de ser roçado.

   A medição é recente de propósito (4 a 11 dias). Não é enfeite: `analise.py`
   cresce a medição até hoje com o clima OBSERVADO da janela [medição, hoje), e
   com uma medição de dois meses atrás quem decide a altura de hoje é o modelo,
   não este arquivo — o degradê viraria sorteio.

   `rocadaDias` é sempre MAIOR que `diasMedicao`: a roçada vem antes da
   medição. Se viesse depois, `analise.py` (com razão) descartaria a medição e
   partiria da altura de resíduo da roçada, e de novo o degradê se perderia. */
const PERFIL = [
  {
    tipo_pista: "curva", sentido: 0, limite: 30, alturaRel: +1.5,
    diasMedicao: 5, rocadaDias: null, metodo: "Apenas manual", largura_m: 9,
    obs: (r) => `Curva com visibilidade reduzida no fim da tangente, em ${r.local}. `
      + `Duas reclamações de motorista neste mês sobre vegetação encobrindo a placa de advertência. `
      + `Já passou da altura de referência do trecho.`,
  },
  {
    tipo_pista: "canteiro central", sentido: 1, limite: 30, alturaRel: -3,
    diasMedicao: 6, rocadaDias: 42, metodo: "Apenas manual", largura_m: 6,
    obs: (r) => `Canteiro central com defensa metálica contínua: a roçadeira de arrasto não entra `
      + `e o acabamento é todo manual, o que dobra o tempo de serviço em relação ao restante de ${r.nome}.`,
  },
  {
    tipo_pista: "faixa de dominio", sentido: 0, limite: 35, alturaRel: -7,
    diasMedicao: 7, rocadaDias: null, metodo: "Spider, Giro-Zero ou Trator com trincheira", largura_m: 16,
    obs: (r) => `Faixa de domínio larga com cerca lindeira mal conservada. `
      + `Na estiagem o risco é de incêndio de beira de pista, e a janela de roçada precisa ser seca.`
      + ` Trecho de ${r.local}.`,
  },
  {
    tipo_pista: "alca", sentido: 1, limite: 30, alturaRel: -11,
    diasMedicao: 8, rocadaDias: 35, metodo: "Apenas manual", largura_m: 7,
    obs: (r) => `Alça de acesso com raio fechado. A vegetação no nariz da alça encobre a sinalização `
      + `de solo antes de qualquer outro ponto do trecho — é o ponto que define a data de ${r.nome} aqui.`,
  },
  {
    tipo_pista: "reta", sentido: 0, limite: 35, alturaRel: -15,
    diasMedicao: 9, rocadaDias: null, metodo: "Spider, Giro-Zero ou Trator com trincheira", largura_m: 14,
    obs: (r) => `Trecho reto em área agrícola de ${r.local}. Faixa de domínio ampla e sem obstáculo, `
      + `bom rendimento de máquina. Sem histórico de ocorrência.`,
  },
  {
    tipo_pista: "curva", sentido: 1, limite: 30, alturaRel: -19,
    diasMedicao: 10, rocadaDias: 28, metodo: "Apenas manual", largura_m: 10,
    obs: (r) => `Curva em greide descendente na altura de ${r.local}; o talude de corte acumula `
      + `água e a vegetação puxa mais que o resto do trecho, mesmo com roçada no ciclo anterior.`,
  },
  {
    tipo_pista: "faixa de dominio", sentido: 0, limite: 40, alturaRel: -22,
    diasMedicao: 11, rocadaDias: null, metodo: "Spider, Giro-Zero ou Trator com trincheira", largura_m: 18,
    obs: (r) => `Faixa de domínio com talude alto em corte. O maquinário só acessa pelo acostamento `
      + `e a operação exige bloqueio de faixa em ${r.nome}, então vale agrupar com o trecho vizinho `
      + `na mesma ida da equipe.`,
  },
  {
    tipo_pista: "reta", sentido: 1, limite: 35, alturaRel: -24,
    diasMedicao: 7, rocadaDias: 22, metodo: "Spider, Giro-Zero ou Trator com trincheira", largura_m: 13,
    obs: (r) => `Trecho reto e plano, o melhor rendimento de roçadeira de arrasto de ${r.nome} `
      + `neste recorte. É por onde a equipe costuma começar o dia de serviço.`,
  },
  {
    tipo_pista: "acesso", sentido: 0, limite: 40, alturaRel: -25.5,
    diasMedicao: 6, rocadaDias: 18, metodo: null, largura_m: 8,
    obs: (r) => `Acesso a dispositivo de drenagem em ${r.local}, fora da faixa de rolamento. `
      + `Roçado há menos de um mês, sem pendência aberta.`,
  },
  {
    tipo_pista: "canteiro central", sentido: 1, limite: 30, alturaRel: -26.5,
    diasMedicao: 4, rocadaDias: 14, metodo: "Spider, Giro-Zero ou Trator com trincheira", largura_m: 11,
    obs: (r) => `Canteiro central plano e largo, sem defensa. Roçado no ciclo anterior e usado como `
      + `referência de rebrota para calibrar o restante de ${r.nome}.`,
  },
];

/* As duas equipes que faltam: a malha oficial tem sete estados e nenhuma base
   existia em RS nem em SC. O `CHECK` de `base_uf` já aceitava os dois. */
const EQUIPES_NOVAS = [
  { slug: "rs", nome: "Equipe Roçada RS-Metropolitana 01", base_uf: "RS", base_cidade: "Gravataí", capacidade_km_dia: 8.5 },
  { slug: "sc", nome: "Equipe Roçada SC-Litoral 01", base_uf: "SC", base_cidade: "Palhoça", capacidade_km_dia: 7.5 },
];

/* ----------------------------------------------------------------------
   Montagem
   ---------------------------------------------------------------------- */

function pontoMedio(r, i) {
  const t = (i + 0.5) / SEGMENTOS;
  return [
    arred(r.de[0] + (r.ate[0] - r.de[0]) * t, 6),
    arred(r.de[1] + (r.ate[1] - r.de[1]) * t, 6),
  ];
}

function linhasDaRodovia(r) {
  return PERFIL.map((p, i) => {
    const marco = Math.round(r.km0 * 1000) + i * 500;
    const [lat, lon] = pontoMedio(r, i);
    return {
      trecho: {
        rodovia: r.nome,
        km_inicio: arred(r.km0 + i * 0.5, 3),
        km_fim: arred(r.km0 + (i + 1) * 0.5, 3),
        sentido: r.sentidos[p.sentido],
        uf: r.uf,
        latitude: lat,
        longitude: lon,
        especie: r.especie,
        altura_limite_cm: p.limite,
        tipo_pista: p.tipo_pista,
        observacoes: p.obs(r),
        ref_externa: `${MARCA}${r.slug}:${marco}`,
        concessionaria_id: r.concessionaria_id,
        ativo: true,
        fonte_cadastro: "demonstracao",
        km_marco_m: marco,
        metodo_rocada: p.metodo,
        area_rocada_m2: 500 * p.largura_m,
      },
      // A altura medida é relativa ao limite DESTE segmento, com piso de 3 cm:
      // abaixo disso sai da faixa de altura inicial que o modelo viu no treino.
      medicao: {
        data: isoData(-p.diasMedicao),
        altura_cm: arred(Math.max(p.limite + p.alturaRel, 3), 1),
        origem: "demonstracao",
      },
      execucao: p.rocadaDias === null ? null : {
        data_execucao: isoData(-p.rocadaDias),
        km_rocados: 0.5,
        altura_depois_cm: 5,
        altura_antes_cm: arred(p.limite - 2, 1),
        custo_reais: arred(500 * p.largura_m * 0.055, 2),
        origem: "demonstracao",
        observacao: "Roçada de demonstração, inferida do ciclo anterior do trecho.",
      },
    };
  });
}

/* ----------------------------------------------------------------------
   Limpar
   ---------------------------------------------------------------------- */

async function limpar() {
  const trechos = ou(
    await db.from("trechos").select("id,rodovia").like("ref_externa", `${MARCA}%`),
    "Não consegui listar os trechos semeados.",
  );

  if (trechos.length === 0) {
    console.log("Nada semeado por este script no banco. Nada a desfazer.");
  } else {
    // ON DELETE CASCADE em todas as FK para ia.trechos: medição, execução,
    // previsão, agendamento e chamado vão junto, em uma instrução.
    ou(
      await db.from("trechos").delete().like("ref_externa", `${MARCA}%`),
      "Não consegui apagar os trechos semeados.",
    );
    const porRodovia = new Map();
    for (const t of trechos) porRodovia.set(t.rodovia, (porRodovia.get(t.rodovia) ?? 0) + 1);
    console.log(`Apagados ${fmt(trechos.length)} trechos em ${porRodovia.size} rodovias `
      + `(medições, execuções, previsões, agendamentos e chamados foram junto, por cascata).`);
  }

  const zonas = ou(
    await db.from("zonas_clima").delete().like("observacao", `${MARCA}%`).select("id"),
    "Não consegui apagar as zonas de clima semeadas.",
  );
  console.log(`Apagadas ${fmt(zonas.length)} zonas de clima.`);

  // As equipes não são apagadas: um agendamento de outra origem pode apontar
  // para elas. Voltam ao estado em que estavam — inativas.
  const nomes = EQUIPES_NOVAS.map((e) => e.nome);
  const desligadas = ou(
    await db.from("equipes").update({ ativo: false, lider_id: null }).in("nome", nomes).select("id"),
    "Não consegui desativar as equipes novas.",
  );
  const reativadas = ou(
    await db.from("equipes").update({ ativo: false }).lte("id", 10).eq("ativo", true).select("id"),
    "Não consegui devolver as equipes originais ao estado inativo.",
  );
  console.log(`Equipes devolvidas ao estado anterior: ${fmt(desligadas.length + reativadas.length)} desativadas.`);
  console.log("\nO Rodoanel real (fonte_cadastro = 'levantamento_motiva') não foi tocado.");
}

/* ----------------------------------------------------------------------
   Semear
   ---------------------------------------------------------------------- */

async function semearEquipes() {
  // As 10 bases originais estavam desativadas; sem equipe ativa a agenda não
  // tem a quem atribuir roçada e o /campo não abre para ninguém.
  const reativadas = ou(
    await db.from("equipes").update({ ativo: true }).lte("id", 10).eq("ativo", false).select("id"),
    "Não consegui reativar as equipes originais.",
  );

  const porSlug = new Map();
  for (const e of EQUIPES_NOVAS) {
    const existente = ou(
      await db.from("equipes").select("id").eq("nome", e.nome).maybeSingle(),
      `Não consegui procurar a equipe ${e.nome}.`,
    );
    if (existente) {
      ou(await db.from("equipes").update({ ativo: true }).eq("id", existente.id),
        `Não consegui reativar a equipe ${e.nome}.`);
      porSlug.set(e.slug, existente.id);
    } else {
      const criada = ou(
        await db.from("equipes").insert({
          nome: e.nome, base_uf: e.base_uf, base_cidade: e.base_cidade,
          capacidade_km_dia: e.capacidade_km_dia, ativo: true,
        }).select("id").single(),
        `Não consegui criar a equipe ${e.nome}.`,
      );
      porSlug.set(e.slug, criada.id);
    }
  }

  console.log(`Equipes: ${fmt(reativadas.length)} reativadas, ${fmt(porSlug.size)} garantidas em RS e SC.`);
  return porSlug;
}

/**
 * Uma zona por rodovia — mas só onde ainda não existe uma que cubra o trecho.
 *
 * Seis das doze rodovias já têm zonas cadastradas, em bandas largas, da
 * primeira demonstração. `ia.zonas_clima` tem uma restrição de exclusão
 * (`zonas_sem_sobreposicao`) que recusa duas faixas de km sobrepostas na mesma
 * rodovia, então criar uma zona estreita por cima falha — e falha certo: duas
 * zonas cobrindo o mesmo km deixariam `zona_do_trecho` escolhendo por ordem de
 * varredura, que é sorteio.
 *
 * O teste aqui é o MESMO de `analisar_lote.zona_do_trecho`: a zona vale se o
 * ponto médio do trecho cai em [km_inicio, km_fim). Os km de cada rodovia em
 * `RODOVIAS` foram escolhidos para caírem inteiros dentro de uma zona só, ou
 * em faixa nenhuma — nunca metade em cada.
 */
async function semearZonas() {
  let novas = 0;
  let reaproveitadas = 0;

  for (const r of RODOVIAS) {
    const meio = r.km0 + (SEGMENTOS * 0.5) / 2;
    const cobrindo = ou(
      await db.from("zonas_clima").select("id,nome,km_inicio,km_fim").eq("rodovia", r.nome)
        .lte("km_inicio", meio).gt("km_fim", meio),
      `Não consegui procurar a zona de ${r.nome}.`,
    );
    if (cobrindo.length > 0) {
      reaproveitadas += 1;
      continue;
    }

    const [lat, lon] = pontoMedio(r, (SEGMENTOS - 1) / 2);
    ou(
      await db.from("zonas_clima").insert({
        rodovia: r.nome,
        km_inicio: r.km0,
        km_fim: r.km0 + SEGMENTOS * 0.5,
        latitude: arred(lat, 4),
        longitude: arred(lon, 4),
        nome: r.local,
        // `extensao_km` é coluna GERADA (km_fim - km_inicio): mandar valor,
        // mesmo o certo, faz o Postgres recusar a linha inteira.
        observacao: `${MARCA}${r.slug}`,
      }),
      `Não consegui criar a zona de ${r.nome}.`,
    );
    novas += 1;
  }
  console.log(`Zonas de clima: ${fmt(novas)} criadas, ${fmt(reaproveitadas)} já existiam e cobrem o trecho.`);
}

async function semearTrechos(equipesNovas) {
  let trechosNovos = 0;
  let medicoes = 0;
  let execucoes = 0;
  let jaExistiam = 0;
  let observacoesAtualizadas = 0;

  for (const r of RODOVIAS) {
    const equipeId = r.equipe_id ?? equipesNovas.get(r.equipe_slug) ?? null;

    for (const linha of linhasDaRodovia(r)) {
      const existente = ou(
        await db.from("trechos").select("id,observacoes").eq("ref_externa", linha.trecho.ref_externa).maybeSingle(),
        `Não consegui procurar o trecho ${linha.trecho.ref_externa}.`,
      );
      if (existente) {
        jaExistiam += 1;
        // A observação é o único campo que este script reescreve num trecho que
        // já existe, e é de propósito: ela é o texto livre que a LLM lê para
        // justificar a decisão ao gestor. Deixá-la congelada na primeira
        // execução faria o arquivo e o banco divergirem exatamente no campo em
        // que a divergência não aparece em nenhuma tela. Medição, execução e
        // previsão NÃO são refeitas: quem as mudaria é o lote, não este script.
        if (existente.observacoes !== linha.trecho.observacoes) {
          ou(
            await db.from("trechos").update({ observacoes: linha.trecho.observacoes }).eq("id", existente.id),
            `Não consegui atualizar a observação do trecho ${existente.id}.`,
          );
          observacoesAtualizadas += 1;
        }
        continue;
      }

      const criado = ou(
        await db.from("trechos").insert(linha.trecho).select("id").single(),
        `Não consegui criar o trecho ${linha.trecho.ref_externa}.`,
      );

      ou(
        await db.from("medicoes").insert({ ...linha.medicao, trecho_id: criado.id }),
        `Não consegui gravar a medição do trecho ${criado.id}.`,
      );
      medicoes += 1;

      if (linha.execucao) {
        ou(
          await db.from("execucoes").insert({
            ...linha.execucao, trecho_id: criado.id, equipe_id: equipeId,
          }),
          `Não consegui gravar a execução do trecho ${criado.id}.`,
        );
        execucoes += 1;
      }
      trechosNovos += 1;
    }
    process.stdout.write(`  ${r.nome.padEnd(28)} ${r.uf}  km ${r.km0} a ${r.km0 + 5}  ${r.especie}\n`);
  }

  console.log(`\nTrechos: ${fmt(trechosNovos)} criados`
    + (jaExistiam ? `, ${fmt(jaExistiam)} já existiam` : "")
    + (observacoesAtualizadas ? `, ${fmt(observacoesAtualizadas)} observações atualizadas` : "")
    + `. Medições: ${fmt(medicoes)}. Execuções: ${fmt(execucoes)}.`);
}

/* ----------------------------------------------------------------------
   Principal
   ---------------------------------------------------------------------- */

async function principal() {
  if (!env.SUPABASE_URL && !env.NEXT_PUBLIC_SUPABASE_URL) {
    parar("Faltou SUPABASE_URL em web/.env.local.");
  }

  if (LIMPAR) {
    console.log("Desfazendo a malha de demonstração...\n");
    await limpar();
    return;
  }

  console.log(`Semeando a malha de demonstração: ${RODOVIAS.length} rodovias `
    + `x ${SEGMENTOS} segmentos de 500 m = ${fmt(RODOVIAS.length * SEGMENTOS)} trechos.\n`);

  const equipesNovas = await semearEquipes();
  await semearZonas();
  await semearTrechos(equipesNovas);

  const ativos = ou(
    await db.from("trechos").select("id", { count: "exact", head: true }).eq("ativo", true),
    "Não consegui contar os trechos ativos.",
  );

  console.log("\nO Rodoanel real não foi tocado: continua com os 60 segmentos de");
  console.log("`levantamento_motiva`, que são a única medição de campo do projeto.");
  console.log("\nPróximo passo, e é ele que acende risco, agenda e chamado:");
  console.log("  python ml/analisar_lote.py");
  console.log("\nPara desfazer tudo:  node scripts/semear-malha.mjs --limpar");
  void ativos;
}

principal().catch((e) => parar("O seed da malha falhou.", e));
