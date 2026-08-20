/**
 * Vocabulario visual do dominio.
 *
 * Toda cor de risco, prioridade e status sai daqui. Nenhum componente escolhe
 * cor por conta propria, foi assim que os quatro niveis de risco ficaram
 * iguais no painel, no mapa, na agenda e no grafico.
 *
 * Regra da skill dataviz que vale em todo lugar: cor de status nunca aparece
 * sozinha. Todo uso vem com icone + rotulo, porque no tema claro `warning` e
 * `serious` ficam abaixo de 3:1 de proposito.
 */

import type { Especie, Regime, Risco, StatusAgendamento } from "./types";

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
  /** Cor do texto, o passo legivel sobre a superficie e sobre o chip. */
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

/** Ordem de urgencia: use sempre esta, nunca `sort()` alfabetico. */
export const ORDEM_RISCO: Risco[] = ["critica", "alta", "media", "baixa"];

export function ordemRisco(r: Risco | null | undefined): number {
  return r ? ORDEM_RISCO.indexOf(r) : ORDEM_RISCO.length;
}

/**
 * Pior risco de um conjunto, o que a rodovia inteira herda no cabecalho da
 * faixa. Lista vazia devolve `baixa`: sem trecho nao ha o que alarmar.
 */
export function piorRiscoDe(itens: readonly { risco: Risco }[]): Risco {
  let pior: Risco = "baixa";
  for (const item of itens) {
    if (ordemRisco(item.risco) < ordemRisco(pior)) pior = item.risco;
  }
  return pior;
}

/**
 * Regra: um agendamento só pode ser aprovado ou concluído com uma equipe
 * atribuída, equipe não é opcional em nenhuma das duas transições.
 *
 * Fica aqui, e não repetida em `acoes.ts` e nos componentes, porque as pontas
 * (a trava do servidor e o botão desabilitado na tela) precisam continuar de
 * acordo, como `riscoPorPrazo` já é, entre a view e o painel.
 */
export function erroFaltaEquipe(
  equipeId: number | null,
  status: "aprovado" | "executado",
): string | null {
  if (equipeId != null) return null;
  return status === "executado"
    ? "Atribua uma equipe antes de marcar como executada."
    : "Atribua uma equipe antes de aprovar.";
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

/**
 * Vocabulario do regime de manejo.
 *
 * `experimental` nao e enfeite de rotulo: em pasto o modelo esta respondendo
 * sobre um sistema que ele nao viu no treino, e toda superficie que mostrar o
 * numero tem obrigacao de dizer isso na mesma tela. Ver `REGIMES` em `types.ts`.
 *
 * `raizMm` e a FONTE do numero, e nao uma copia dele para a tela: `solo.ts` le
 * daqui. Mora neste arquivo, e nao la, porque `solo.ts` e `server-only` e o
 * formulario do simulador precisa do numero para escrever a dica do campo -- e
 * duas copias de 500/800 era exatamente o tipo de divergencia silenciosa que o
 * resto deste arquivo existe para evitar. Espelha `RAIZ_MM` em `solo.py`, e as
 * duas tem que continuar iguais: e a mesma pedotransferencia nos dois lados.
 *
 * Profundidade de raiz efetiva de gramineas, em mm. A FAO-56 da 0,5 a 1,0 m
 * para pastagem; faixa de dominio fica na ponta de baixo porque e solo
 * decapitado e compactado, e pasto no meio da faixa.
 */
export const REGIME: Record<
  Regime,
  { rotulo: string; nota: string; raizMm: number; experimental: boolean }
> = {
  faixa: {
    rotulo: "Faixa de domínio",
    nota:
      "Canteiro e talude de rodovia: solo decapitado na terraplenagem e compactado, " +
      "roçado por programa. É o domínio em que o modelo foi treinado.",
    raizMm: 500,
    experimental: false,
  },
  pasto: {
    rotulo: "Pastagem",
    nota:
      "Piquete pastejado: raiz mais funda, desfolha frequente e parcial. Experimental — " +
      "serve para confrontar o modelo com medição de campo, que em pasto se consegue.",
    raizMm: 800,
    experimental: true,
  },
};

/** Cores de serie categoricas: atribuidas em ordem fixa, nunca cicladas.
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

/**
 * A partir de quantos dias de folga um agendamento em aberto deixa de fazer
 * sentido. Espelha `LIMIAR_FECHAR_DIAS` em `analisar_lote.py`, e as duas
 * precisam continuar iguais, como a regra de risco entre a view e este arquivo.
 *
 * Por que 55 e não os 45 de `LIMIAR_DIAS` (o limiar de CRIAR): a banda de 10
 * dias entre criar e fechar é histerese. Com o mesmo número nas duas pontas, um
 * trecho oscilando entre 44 e 46 dias por causa de uma medição nova abriria e
 * fecharia agendamento todo dia.
 */
export const DIAS_FOLGA_DISPENSA = 55;

/**
 * O agendamento deste trecho ainda é necessário?
 *
 * `null` (nenhuma previsão) NÃO é dispensável, e este é o ponto da função. A
 * view carimba `risco = 'baixa'` quando `dias_ate_limite` é nulo, então testar
 * o risco trataria "trecho sobre o qual não se sabe nada" como "trecho
 * folgado", e mandaria descartar o agendamento justamente de quem não tem
 * previsão para justificar a decisão. A migração de 2026-08-14 e o
 * `analisar_lote.py` usam esta mesma guarda em SQL e em Python.
 */
export function dispensaAgendamento(diasAteLimite: number | null | undefined): boolean {
  return diasAteLimite != null && diasAteLimite > DIAS_FOLGA_DISPENSA;
}

/** Rotulo curto do prazo, incluindo o caso "ja passou". */
/**
 * Acima disto o prazo deixa de ser um número e vira "mais de um ano".
 *
 * `dias_ate_limite` só é uma varredura de verdade até 120 dias, o horizonte do
 * modelo; além dele o lote estende em linha pela taxa média (ver
 * `modelo.cruzamento`). Escrever "621 dias" sobre uma extrapolação linear de
 * uma esmeralda que cresce 0,03 cm/dia é precisão de mentira — e é o mesmo
 * defeito que este projeto já registrou uma vez, quando a agenda mostrava
 * 2.196 dias. O número CRU continua no banco, porque é dele que a regra de
 * fechar agendamento (> 55 dias) depende; o que muda é só como a tela o lê.
 */
export const PRAZO_LONGO_DEMAIS = 365;

export function rotuloPrazo(dias: number | null | undefined): string {
  if (dias == null) return "sem crescimento";
  if (dias <= 0) return "acima do limite";
  if (dias === 1) return "1 dia";
  if (dias > PRAZO_LONGO_DEMAIS) return "mais de 1 ano";
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

/**
 * Estado da altura contra o limite do trecho, o "quanto" do permitido ja foi
 * consumido.
 *
 * NAO e o risco acima: risco vem de `dias_ate_limite` (o prazo), este vem da
 * razao altura/limite. Sao eixos diferentes e um trecho pode estar folgado num e
 * apertado no outro, limite alto com crescimento rapido da ocupacao baixa e
 * prazo curto.
 */
export const ESTADO_ALTURA = {
  dentro: {
    rotulo: "Dentro do limite",
    cor: "var(--good)",
    tinta: "var(--good-ink)",
    icone: "CircleCheck",
  },
  perto: {
    rotulo: "Perto do limite",
    cor: "var(--warning)",
    tinta: "var(--warning-ink)",
    icone: "TriangleAlert",
  },
  acima: {
    rotulo: "Acima do limite",
    cor: "var(--critical)",
    tinta: "var(--critical-ink)",
    icone: "OctagonAlert",
  },
} as const;

export type ChaveEstadoAltura = keyof typeof ESTADO_ALTURA;

export type LeituraAltura = {
  alturaCm: number;
  limiteCm: number;
  /** Mesma conta de `ia.vw_trecho_status.ocupacao_pct`: altura sobre limite. */
  pct: number;
  /** Passou do limite de verdade. Exatamente no limite ja e `acima`, mas nao
   *  excede: a hachura marca o excedente, e ali nao ha excedente. */
  excedido: boolean;
  chave: ChaveEstadoAltura;
  token: (typeof ESTADO_ALTURA)[ChaveEstadoAltura];
};

/**
 * Leitura unica da altura para toda superficie que compara altura com limite:
 * medidor do trecho, balao da regua, balao do mapa.
 *
 * Devolve `null` quando falta previsao ou o limite nao e utilizavel, e a
 * ausencia de dado, que o painel mostra como "—" em vez de fingir zero.
 */
export function estadoDaAltura(
  alturaCm: number | string | null | undefined,
  limiteCm: number | string | null | undefined,
): LeituraAltura | null {
  if (alturaCm == null || limiteCm == null) return null;

  // `numeric` do Postgres chega como string pelo PostgREST.
  const altura = Number(alturaCm);
  const limite = Number(limiteCm);
  if (!Number.isFinite(altura) || !Number.isFinite(limite) || limite <= 0) return null;

  const pct = (altura / limite) * 100;
  const chave: ChaveEstadoAltura = pct >= 100 ? "acima" : pct >= 90 ? "perto" : "dentro";

  return { alturaCm: altura, limiteCm: limite, pct, excedido: altura > limite, chave, token: ESTADO_ALTURA[chave] };
}

export const TIPO_PISTA_ICONE: Record<string, string> = {
  reta: "Minus",
  curva: "Spline",
  acesso: "GitFork",
  alca: "Redo2",
  "canteiro central": "Rows3",
  "faixa de dominio": "Fence",
};
