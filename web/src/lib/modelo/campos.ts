/**
 * A ponte entre o vocabulario do dominio e o vetor de 20 numeros que o modelo
 * espera.
 *
 * `arvores.ts` nao sabe o que e capim: ele percorre arvores. Este arquivo e que
 * sabe que "braquiaria" vira 1, que graus-dia da braquiaria contam a partir de
 * 15 °C e param em 35, que geada para ela e Tmin <= 2 °C, e ate onde o modelo
 * foi treinado.
 *
 * As contas aqui sao porte fiel de `clima.montar_features`, no Python -- e as
 * duas sao porte do preenchedor do notebook de calibracao. Se divergirem, a
 * mesma pergunta recebe respostas diferentes no lote e no simulador, que e o
 * jeito mais discreto de o painel mentir.
 */

import { resumir, type Balanco, type DiaClima } from "../clima";
import type { Especie } from "../types";
import {
  CAMPOS_ENTRADA,
  CATEGORIAS,
  FAIXAS_TREINO,
  preverBruto,
  type Intervalo,
} from "./arvores";

/* ------------------------------------------------------------------ *
 * Parametros por especie
 * ------------------------------------------------------------------ */

/**
 * Constantes que entram nas CONTAS das features, nao no modelo.
 *
 * Copiadas de `ESPECIES` em `gerador_v3_1_rebrota.py`, via `clima.py`. Elas
 * definem o que "graus-dia acumulados" e "geada" significam para cada capim, e
 * precisam bater com o gerador: mudar `tBase` aqui nao muda o modelo, muda o
 * SIGNIFICADO da feature que ele recebe, que e pior.
 *
 * `tBase` da braquiaria e 15 °C e nao 12 de proposito. O gerador v3.1 baixou a
 * base FISIOLOGICA para 12, mas manteve 15 na feature de graus-dia justamente
 * para nao invalidar o preenchedor. Os dois numeros convivem la, e aqui so o de
 * feature interessa.
 */
export type ParametrosEspecie = {
  /** Base dos graus-dia, em °C. */
  tBase: number;
  /** Teto dos graus-dia: temperatura acima disto nao acumula mais. */
  tOt2: number;
  /** Tmin em que o dia conta como geada para esta especie. */
  geadaC: number;
  /** Meses de floracao, 1 a 12. Vazio quando a especie nao floresce em altura. */
  floracaoMeses: readonly number[];
  /** Altura minima para a floracao empurrar o dossel, em cm. */
  floracaoHMinCm: number;
};

export const PARAMETROS_ESPECIE: Record<Especie, ParametrosEspecie> = {
  braquiaria: { tBase: 15, tOt2: 35, geadaC: 2, floracaoMeses: [2, 3, 4], floracaoHMinCm: 30 },
  esmeralda: { tBase: 12, tOt2: 32, geadaC: -2, floracaoMeses: [], floracaoHMinCm: 99 },
  batatais: { tBase: 13, tOt2: 33, geadaC: 0, floracaoMeses: [11, 12, 1, 2, 3], floracaoHMinCm: 10 },
};

/* ------------------------------------------------------------------ *
 * Codificacao da categorica
 * ------------------------------------------------------------------ */

/**
 * A especie vira o INDICE dela em `CATEGORIAS.especie`, e nada mais: e o que o
 * `OrdinalEncoder` do sklearn produz.
 *
 * Especie desconhecida devolve `NaN`, e nao zero. O encoder foi ajustado com
 * `unknown_value=nan`, entao o percurso a trata como valor FALTANTE. Cair em
 * `?? 0` -- o que o codigo do modelo antigo fazia com a UF -- transformaria um
 * capim que o modelo nunca viu em batatais, silenciosamente.
 */
export function codificarEspecie(especie: string): number {
  const i = CATEGORIAS.especie.indexOf(especie);
  return i < 0 ? Number.NaN : i;
}

export const ESPECIES_DO_MODELO = CATEGORIAS.especie;

/* ------------------------------------------------------------------ *
 * Montagem do vetor
 * ------------------------------------------------------------------ */

export type ContextoModelo = {
  especie: Especie;
  latitude: number;
  /** Altura no PRIMEIRO dia da janela. */
  alturaInicialCm: number;
  /** Dias desde a ultima roçada, no primeiro dia da janela. */
  diasDesdeRocada: number;
  /** Indice de fertilidade do solo, 0 a 1. Ver `lib/solo.ts`. */
  fertilidade: number;
  /** Agua disponivel na zona de raiz, em mm. Ver `lib/solo.ts`. */
  capacidadeMm: number;
  /** Serie diaria COMPLETA: aquecimento na frente, janela depois. */
  serie: readonly DiaClima[];
  /** Onde a janela comeca dentro de `serie`. */
  inicio: number;
  /** Quantos dias da janela entram nesta pergunta. */
  diasPeriodo: number;
  /** Balanco de agua rodado sobre `serie` inteira, com esta altura inicial. */
  balanco: Balanco;
};

/** Os 20 valores, na ordem de `CAMPOS_ENTRADA`. */
export function montarFeatures(ctx: ContextoModelo): number[] {
  const p = PARAMETROS_ESPECIE[ctx.especie];
  const fim = Math.min(ctx.inicio + ctx.diasPeriodo, ctx.serie.length);
  const dias = ctx.serie.slice(ctx.inicio, fim);
  const n = dias.length;

  if (n === 0) {
    throw new Error("A série de clima não cobre o período pedido.");
  }

  let grausDia = 0;
  let floracao = 0;
  let aguaSolo = 0;
  let encharcado = 0;

  for (let i = 0; i < n; i += 1) {
    const d = dias[i];
    grausDia += Math.max(Math.min(d.temperaturaC, p.tOt2) - p.tBase, 0);
    // O mes sai da data do dia, nao de "hoje": uma janela de 90 dias atravessa
    // a virada da estacao, e a floracao da braquiaria e de fevereiro a abril.
    const mes = Number(d.data.slice(5, 7));
    if (p.floracaoMeses.includes(mes) && ctx.alturaInicialCm > p.floracaoHMinCm) floracao += 1;
    aguaSolo += ctx.balanco.fracoes[ctx.inicio + i] ?? 0;
    if (ctx.balanco.encharcado[ctx.inicio + i]) encharcado += 1;
  }

  const r = resumir(dias);

  const valores: Record<string, number> = {
    especie: codificarEspecie(ctx.especie),
    dias_periodo: n,
    altura_inicial_cm: ctx.alturaInicialCm,
    dias_desde_rocada_inicio: ctx.diasDesdeRocada,
    temperatura_media_c: arredondar(r.temperaturaMediaC, 1),
    temperatura_min_c: arredondar(r.temperaturaMinC, 1),
    temperatura_max_c: arredondar(r.temperaturaMaxC, 1),
    graus_dia_acumulados: arredondar(grausDia, 1),
    umidade_media_pct: arredondar(r.umidadeMediaPct, 1),
    precipitacao_total_mm: arredondar(r.precipitacaoTotalMm, 1),
    dias_com_chuva: r.diasComChuva,
    et0_medio_mm_dia: arredondar(r.et0MedioMmDia, 2),
    radiacao_media_mj_m2: arredondar(r.radiacaoMediaMjM2, 1),
    agua_solo_media_pct: arredondar((aguaSolo / n) * 100, 1),
    capacidade_agua_solo_mm: ctx.capacidadeMm,
    fertilidade_solo: ctx.fertilidade,
    latitude: arredondar(ctx.latitude, 4),
    geadas_no_periodo: dias.filter((d) => d.temperaturaMinC <= p.geadaC).length,
    dias_encharcado: encharcado,
    dias_floracao: floracao,
  };

  return CAMPOS_ENTRADA.map((campo) => {
    const v = valores[campo];
    if (v === undefined) {
      throw new Error(
        `O modelo pede a feature "${campo}" e este arquivo não sabe montá-la. ` +
          `Rode 'python exportar_modelo.py' e acerte 'montarFeatures'.`,
      );
    }
    return v;
  });
}

/**
 * Arredonda como o preenchedor do Python arredonda.
 *
 * Nao e cosmetico: o lote grava features arredondadas e o modelo tem limiares
 * de bin muito juntos em algumas colunas. Duas casas de diferenca em
 * `et0_medio_mm_dia` podem cair em bins diferentes, e a mesma pergunta receber
 * respostas diferentes no lote e no simulador -- exatamente o que o teste de
 * paridade nao pega, porque ele compara o percurso e nao a montagem.
 */
function arredondar(v: number, casas: number): number {
  const f = 10 ** casas;
  return Math.round(v * f) / f;
}

/** Crescimento total em cm, em intervalo, para o periodo descrito no contexto. */
export function preverCrescimento(ctx: ContextoModelo): Intervalo {
  return preverBruto(montarFeatures(ctx));
}

/* ------------------------------------------------------------------ *
 * Ate onde o modelo foi treinado
 * ------------------------------------------------------------------ */

/**
 * Fora da faixa de treino o modelo nao erra com barulho: ele SATURA. Altura
 * inicial de 60, 80 ou 130 cm devolve praticamente o mesmo numero, porque todas
 * caem no ultimo bin. A resposta continua saindo com a mesma cara de certeza.
 *
 * Por isso as faixas sao dado de tela, e nao comentario: a pagina existe para
 * mostrar a IA funcionando, e mostrar onde ela para de funcionar e parte disso.
 */
export type Limite = {
  campo: string;
  rotulo: string;
  unidade: string;
  min: number;
  max: number;
  /** Grandeza que a pessoa digita inteira. So afeta FORMATACAO: evita escrever
   *  "7,0 dias" num campo que so aceita inteiro. */
  inteiro: boolean;
  /** A faixa e o que o modelo viu de verdade, ou as bordas dos bins (que ficam
   *  DENTRO do treino por uma margem desconhecida)? Ver `FAIXAS_TREINO`. */
  exata: boolean;
  /** Forma singular da unidade, quando ela flexiona. `cm` e `°` nao flexionam;
   *  `dias` sim, e sem isto a regua escreve "1 dias". Vem explicito e nao por
   *  tirar o "s" do fim porque o plural do portugues nem sempre e o "s" solto,
   *  o mesmo motivo pelo qual `fmt.contar` pede o irregular. */
  unidadeSingular?: string;
};

function limite(
  campo: string,
  rotulo: string,
  unidade: string,
  /** Só afeta como o número é escrito na tela — a faixa já vem pronta.
   *
   *  Houve aqui um `Math.ceil`/`Math.floor` sobre os limiares, e ele ESTREITAVA
   *  a verdade: os limiares de `dias_periodo` iam de 1,5 a 119,5, o
   *  arredondamento devolvia 2 e 119, e a tela passou a afirmar que o modelo
   *  nunca viu período de 1 dia. Viu. Limiar de bin é ponto médio entre valores
   *  observados, então 1,5 significa que 1 e 2 estão AMBOS no treino. A
   *  recuperação da faixa exata mudou para `exportar_modelo.py`, que tem os
   *  espaçamentos para provar quando ela é possível. */
  inteiro = false,
  unidadeSingular?: string,
): Limite {
  const faixa = FAIXAS_TREINO[campo];
  if (!faixa) {
    throw new Error(
      `O modelo exportado nao traz a faixa de treino de "${campo}". ` +
        `Rode 'python exportar_modelo.py' de novo.`,
    );
  }
  return {
    campo,
    rotulo,
    unidade,
    min: faixa.min,
    max: faixa.max,
    inteiro,
    exata: faixa.exata,
    unidadeSingular,
  };
}

/**
 * Os limites que o formulario deixa a pessoa cruzar.
 *
 * Isto e a faixa DE TREINO, nao a faixa que o formulario aceita. O formulario e
 * mais largo de proposito (ver `parametros.ts`): passar do treino e uma coisa
 * que a pagina deixa fazer e avisa, nao uma que ela impede.
 *
 * `dias` deixou de ser um deles na pratica. O modelo antigo viu periodos de 7 a
 * 120 dias e o campo aceitava de 1; o novo viu de 1 a 120, faixa EXATA, e a
 * ponta de baixo deixou de extrapolar. O limite continua declarado porque a
 * regua o desenha e porque um retreino pode estreitar a faixa de novo.
 */
export const LIMITES = {
  altura: limite("altura_inicial_cm", "Altura inicial", "cm"),
  dias: limite("dias_periodo", "Período", "dias", true, "dia"),
  rocada: limite("dias_desde_rocada_inicio", "Dias desde a roçada", "dias", true, "dia"),
  latitude: limite("latitude", "Latitude", "°"),
  fertilidade: limite("fertilidade_solo", "Fertilidade do solo", ""),
  capacidade: limite("capacidade_agua_solo_mm", "Água disponível no solo", "mm"),
} as const;

export type Extrapolacao = Limite & { valor: number; lado: "abaixo" | "acima" };

function fora(l: Limite, valor: number): Extrapolacao | null {
  if (valor < l.min) return { ...l, valor, lado: "abaixo" };
  if (valor > l.max) return { ...l, valor, lado: "acima" };
  return null;
}

/** Onde esta simulacao esta pedindo ao modelo algo que ele nunca viu. */
export function extrapolacoes(entrada: {
  alturaInicialCm: number;
  dias: number;
  diasDesdeRocada: number;
  latitude: number;
  fertilidade: number;
  capacidadeMm: number;
}): Extrapolacao[] {
  return [
    fora(LIMITES.altura, entrada.alturaInicialCm),
    fora(LIMITES.dias, entrada.dias),
    fora(LIMITES.rocada, entrada.diasDesdeRocada),
    fora(LIMITES.latitude, entrada.latitude),
    fora(LIMITES.fertilidade, entrada.fertilidade),
    fora(LIMITES.capacidade, entrada.capacidadeMm),
  ].filter((e): e is Extrapolacao => e !== null);
}

/** Posicao de um valor dentro da faixa de treino, de 0 a 1, para a barrinha da
 *  tela. Fora da faixa gruda em 0 ou 1, e o proprio ponto: e ali que o modelo
 *  para de distinguir. */
export function posicaoNaFaixa(l: Limite, valor: number): number {
  if (l.max === l.min) return 0.5;
  return Math.min(1, Math.max(0, (valor - l.min) / (l.max - l.min)));
}
