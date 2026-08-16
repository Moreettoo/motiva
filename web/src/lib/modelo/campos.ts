/**
 * A ponte entre o vocabulario do dominio e o vetor de 13 numeros que o modelo
 * espera.
 *
 * `arvores.ts` nao sabe o que e capim: ele percorre arvores. Este arquivo e que
 * sabe que "braquiaria" vira 1, que a janela de clima vira sete agregados, e
 * ate onde o modelo foi treinado.
 */

import type { Especie, UF } from "../types";
import { CAMPOS_ENTRADA, FAIXAS_TREINO, MAPAS, preverBruto } from "./arvores";

/**
 * Clima agregado sobre uma janela de N dias.
 *
 * Os nomes e as contas espelham `buscar_clima` do `analisar_lote.py`, e a
 * distincao entre TOTAL e MEDIA nao e detalhe: `precipitacaoTotalMm` cresce com
 * o tamanho da janela e as medias nao. Passar o total de 16 dias declarando
 * `dias = 90` faz o modelo enxergar uma seca que nao existe.
 */
export type AgregadoClima = {
  dias: number;
  temperaturaMediaC: number;
  umidadeMediaPct: number;
  precipitacaoTotalMm: number;
  precipitacaoMediaDiariaMm: number;
  radiacaoMediaMjM2: number;
  et0MedioMmDia: number;
  /** chuva do periodo dividida por (et0 medio x dias). */
  balancoHidrico: number;
};

export type ContextoModelo = {
  especie: Especie;
  uf: UF;
  latitude: number;
  /** Mes do inicio do periodo, 1 a 12. */
  mes: number;
  alturaInicialCm: number;
  clima: AgregadoClima;
};

/**
 * Especie e UF viram numero pelo mapa gravado no treino.
 *
 * O `?? 0` copia o `MAPAS["uf"].get(uf, 0)` do `analisar_lote.py` e importa em
 * um caso real: o modelo viu cinco UFs (MG, MS, PR, RJ, SP) e o schema aceita
 * sete. Um ponto em RS ou SC cai em MG. Nao e acidente nem bug, e o mesmo
 * comportamento que a producao ja tem, e a tela avisa quando acontece.
 */
export function codificarEspecie(especie: Especie): number {
  return MAPAS.especie[especie as keyof typeof MAPAS.especie] ?? 0;
}

export function codificarUf(uf: UF): number {
  return MAPAS.uf[uf as keyof typeof MAPAS.uf] ?? 0;
}

/** A UF esta entre as que o modelo viu, ou vai cair no `?? 0`? */
export function ufConhecidaPeloModelo(uf: UF): boolean {
  return uf in MAPAS.uf;
}

export const UFS_DO_MODELO = Object.keys(MAPAS.uf) as UF[];

/** Crescimento medio em cm/dia para o periodo descrito pelo contexto. */
export function preverCrescimento(ctx: ContextoModelo): number {
  const valores: Record<string, number> = {
    latitude: ctx.latitude,
    dias_periodo: ctx.clima.dias,
    altura_inicial_cm: ctx.alturaInicialCm,
    temperatura_media_c: ctx.clima.temperaturaMediaC,
    umidade_media_pct: ctx.clima.umidadeMediaPct,
    precipitacao_total_mm: ctx.clima.precipitacaoTotalMm,
    precipitacao_media_diaria_mm: ctx.clima.precipitacaoMediaDiariaMm,
    radiacao_media_mj_m2: ctx.clima.radiacaoMediaMjM2,
    et0_medio_mm_dia: ctx.clima.et0MedioMmDia,
    balanco_hidrico_chuva_sobre_et0: ctx.clima.balancoHidrico,
    mes: ctx.mes,
    especie_cod: codificarEspecie(ctx.especie),
    uf_cod: codificarUf(ctx.uf),
  };

  return preverBruto(CAMPOS_ENTRADA.map((campo) => valores[campo]));
}

/* ------------------------------------------------------------------ *
 * Ate onde o modelo foi treinado
 * ------------------------------------------------------------------ */

/**
 * Fora da faixa de treino o modelo nao erra com barulho: ele SATURA. Altura
 * inicial de 50, 60 ou 80 cm devolve exatamente o mesmo numero, porque todas
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
   *  a verdade: os limiares de `dias_periodo` iam de 7,5 a 119,5, o
   *  arredondamento devolvia 8 e 119, e a tela passou a afirmar que o modelo
   *  nunca viu período de 7 dias. Viu. Limiar de bin é ponto médio entre
   *  valores observados, então 7,5 significa que 7 e 8 estão AMBOS no treino.
   *  A recuperação da faixa exata mudou para `exportar_modelo.py`, que tem os
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
 * Os tres limites que o formulario deixa a pessoa cruzar. Os outros dez campos
 * vem do Open-Meteo, e nao ha o que a pessoa faça a respeito deles.
 *
 * Isto e a faixa DE TREINO, nao a faixa que o formulario aceita. O formulario e
 * mais largo de proposito (ver `parametros.ts`): passar do treino e uma coisa
 * que a pagina deixa fazer e avisa, nao uma que ela impede.
 */
export const LIMITES = {
  altura: limite("altura_inicial_cm", "Altura inicial", "cm"),
  dias: limite("dias_periodo", "Período", "dias", true, "dia"),
  latitude: limite("latitude", "Latitude", "°"),
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
  latitude: number;
}): Extrapolacao[] {
  return [
    fora(LIMITES.altura, entrada.alturaInicialCm),
    fora(LIMITES.dias, entrada.dias),
    fora(LIMITES.latitude, entrada.latitude),
  ].filter((e): e is Extrapolacao => e !== null);
}

/** Posicao de um valor dentro da faixa de treino, de 0 a 1, para a barrinha da
 *  tela. Fora da faixa gruda em 0 ou 1, e o proprio ponto: e ali que o modelo
 *  para de distinguir. */
export function posicaoNaFaixa(l: Limite, valor: number): number {
  if (l.max === l.min) return 0.5;
  return Math.min(1, Math.max(0, (valor - l.min) / (l.max - l.min)));
}
