/**
 * Vocabulario visual do dominio.
 *
 * Toda cor de risco, prioridade e status sai daqui. Nenhum componente escolhe
 * cor por conta propria — foi assim que os quatro niveis de risco ficaram
 * iguais no painel, no mapa, na agenda e no grafico.
 *
 * Regra da skill dataviz que vale em todo lugar: cor de status nunca aparece
 * sozinha. Todo uso vem com icone + rotulo, porque no tema claro `warning` e
 * `serious` ficam abaixo de 3:1 de proposito.
 */

import type { Especie, Risco, StatusAgendamento } from "./types";

/** Tom da `BarraProgresso` para cada risco. Fica aqui, e nao no componente,
 *  porque a tabela, o cartao e o painel da agenda pintavam a mesma barra a
 *  partir de tres copias deste mapa. Os valores sao os de `TomBarra`. */
export const TOM_BARRA_POR_RISCO = {
  critica: "critical",
  alta: "serious",
  media: "warning",
  baixa: "good",
} as const satisfies Record<Risco, string>;

export type TokenStatus = {
  rotulo: string;
  /** Cor solida da marca (barra, ponto, traco). */
  cor: string;
  /** Cor do texto — o passo legivel sobre a superficie e sobre o chip. */
  tinta: string;
  /** Fundo do chip. */
  fundo: string;
  /** Nome do icone em lucide-react. */
  icone: string;
  /** Frase curta que explica o nivel ao gestor. */
  descricao: string;
};

export const RISCO: Record<Risco, TokenStatus> = {
  critica: {
    rotulo: "Crítica",
    cor: "var(--critical)",
    tinta: "var(--critical-ink)",
    fundo: "var(--critical-soft)",
    icone: "OctagonAlert",
    descricao: "Já passou do limite ou passa em até 7 dias",
  },
  alta: {
    rotulo: "Alta",
    cor: "var(--serious)",
    tinta: "var(--serious-ink)",
    fundo: "var(--serious-soft)",
    icone: "TriangleAlert",
    descricao: "Passa do limite em 8 a 20 dias",
  },
  media: {
    rotulo: "Média",
    cor: "var(--warning)",
    tinta: "var(--warning-ink)",
    fundo: "var(--warning-soft)",
    icone: "Clock",
    descricao: "Passa do limite em 21 a 45 dias",
  },
  baixa: {
    rotulo: "Baixa",
    cor: "var(--good)",
    tinta: "var(--good-ink)",
    fundo: "var(--good-soft)",
    icone: "CircleCheck",
    descricao: "Mais de 45 dias de folga",
  },
};

/** Prioridade decidida pela LLM usa a mesma escala do risco calculado. */
export const PRIORIDADE = RISCO;

/** Ordem de urgencia — use sempre esta, nunca `sort()` alfabetico. */
export const ORDEM_RISCO: Risco[] = ["critica", "alta", "media", "baixa"];

export function ordemRisco(r: Risco | null | undefined): number {
  return r ? ORDEM_RISCO.indexOf(r) : ORDEM_RISCO.length;
}

/**
 * Pior risco de um conjunto — o que a rodovia inteira herda no cabecalho da
 * faixa. Lista vazia devolve `baixa`: sem trecho nao ha o que alarmar.
 */
export function piorRiscoDe(itens: readonly { risco: Risco }[]): Risco {
  let pior: Risco = "baixa";
  for (const item of itens) {
    if (ordemRisco(item.risco) < ordemRisco(pior)) pior = item.risco;
  }
  return pior;
}

export const STATUS: Record<StatusAgendamento, { rotulo: string; icone: string; tinta: string; fundo: string }> = {
  sugerido: { rotulo: "Sugerido", icone: "Sparkles", tinta: "var(--ink-2)", fundo: "var(--surface-3)" },
  aprovado: { rotulo: "Aprovado", icone: "CircleCheck", tinta: "var(--good-ink)", fundo: "var(--good-soft)" },
  executado: { rotulo: "Executado", icone: "Flag", tinta: "var(--ink-3)", fundo: "var(--surface-3)" },
  descartado: { rotulo: "Descartado", icone: "CircleSlash", tinta: "var(--ink-3)", fundo: "var(--surface-3)" },
};

export const ESPECIE: Record<Especie, { rotulo: string; nomeCientifico: string; nota: string }> = {
  braquiaria: {
    rotulo: "Braquiária",
    nomeCientifico: "Urochloa spp.",
    nota: "Cresce rápido no calor e na chuva. É a espécie que mais puxa a fila de roçada.",
  },
  batatais: {
    rotulo: "Batatais",
    nomeCientifico: "Paspalum notatum",
    nota: "Rasteira e resistente à seca. Crescimento lento, ciclo de roçada mais longo.",
  },
  esmeralda: {
    rotulo: "Esmeralda",
    nomeCientifico: "Zoysia japonica",
    nota: "Densa e de porte baixo. Usada onde o corte precisa ficar mais uniforme.",
  },
};

/** Cores de serie categoricas — atribuidas em ordem fixa, nunca cicladas.
 *  Validadas para ate 4 series adjacentes (barras, linhas, pilhas).
 *  Formas de todos-os-pares (dispersao, mapa) param em 3. */
export const SERIE = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"] as const;

export function corSerie(i: number): string {
  return SERIE[i] ?? "var(--ink-3)";
}

/** Rampa sequencial para magnitude continua (mapa de calor de ocupacao). */
export const SEQUENCIAL = [
  "var(--seq-1)",
  "var(--seq-2)",
  "var(--seq-3)",
  "var(--seq-4)",
  "var(--seq-5)",
  "var(--seq-6)",
] as const;

/**
 * Risco a partir do prazo. Mesma regra da view `ia.vw_trecho_status`, repetida
 * aqui porque o cliente precisa reclassificar ao simular datas.
 */
export function riscoPorPrazo(diasAteLimite: number | null | undefined): Risco {
  if (diasAteLimite == null) return "baixa";
  if (diasAteLimite <= 7) return "critica";
  if (diasAteLimite <= 20) return "alta";
  if (diasAteLimite <= 45) return "media";
  return "baixa";
}

/** Rotulo curto do prazo, incluindo o caso "ja passou". */
export function rotuloPrazo(dias: number | null | undefined): string {
  if (dias == null) return "sem crescimento";
  if (dias <= 0) return "acima do limite";
  if (dias === 1) return "1 dia";
  return `${dias} dias`;
}

/**
 * Prazo em frase inteira, para `aria-label` de marca de grafico e de regua.
 * O rotulo curto e para a tela; este e para quem ouve e nao tem a coluna ao
 * lado para dar contexto ao numero.
 */
export function textoPrazo(dias: number | null | undefined): string {
  if (dias == null) return "sem previsão de crescimento";
  if (dias <= 0) return "já acima do limite";
  return `${rotuloPrazo(dias)} até o limite`;
}

export const TIPO_PISTA_ICONE: Record<string, string> = {
  reta: "Minus",
  curva: "Spline",
  acesso: "GitFork",
  alca: "Redo2",
  "canteiro central": "Rows3",
  "faixa de dominio": "Fence",
};
