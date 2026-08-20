/**
 * A curva de crescimento, o miolo do simulador.
 *
 * Puro de proposito: recebe a janela de clima e o solo ja montados e devolve a
 * curva. Nao busca nada, nao le banco, nao chama LLM. E o unico jeito de testar
 * a conta que importa sem depender do Open-Meteo estar de pe.
 */

import { balancoSolo, type DiaClima, type FonteDia, type Janela } from "./clima";
import type { Intervalo } from "./modelo/arvores";
import { extrapolacoes, preverCrescimento, type Extrapolacao } from "./modelo/campos";
import type { Especie } from "./types";

export type PedidoSimulacao = {
  especie: Especie;
  latitude: number;
  alturaInicialCm: number;
  /** Quantos dias deixar crescendo. */
  dias: number;
  /** Dias desde a ultima roçada, hoje. Fase da curva de rebrota. */
  diasDesdeRocada: number;
  /** Indice de fertilidade do solo, 0 a 1. */
  fertilidade: number;
  /** Agua disponivel na zona de raiz, em mm. */
  capacidadeMm: number;
};

export type PontoCurva = {
  /** 0 e o dia de hoje, com a altura que a pessoa digitou. */
  dia: number;
  data: string;
  /** Altura pela mediana do modelo. */
  alturaCm: number;
  /** Altura no cenario pessimista de crescimento (q10). */
  alturaMinCm: number;
  /** Altura no cenario otimista (q90). */
  alturaMaxCm: number;
  /** Crescimento TOTAL em cm que o modelo preve para um periodo deste tamanho. */
  crescimento: Intervalo;
  fonteClima: FonteDia | null;
};

export type Simulacao = {
  pontos: PontoCurva[];
  alturaInicialCm: number;
  alturaFinalCm: number;
  /** Crescimento do periodo inteiro, em intervalo. E a saida direta do modelo. */
  crescimento: Intervalo;
  /** Ritmo medio do periodo, em cm/dia. Derivado, para comparar com a malha. */
  crescimentoCmDia: number;
  /** Media do balde de agua no solo no periodo, de 0 a 100. */
  aguaSoloMediaPct: number;
  janela: Janela;
  extrapolacoes: Extrapolacao[];
};

/**
 * Altura ao fim de `d` dias, para cada `d` de 1 ate o pedido.
 *
 * A conta e `altura_inicial + crescimento(d)`, com `crescimento(d)` vindo do
 * modelo com `dias_periodo = d` e o clima agregado sobre os PRIMEIROS d dias da
 * janela. O modelo responde os CENTIMETROS DO PERIODO, nao cm/dia -- e por isso
 * nao ha multiplicacao nenhuma aqui, ao contrario da versao anterior.
 *
 * Por que nao iterar dia a dia atualizando a altura. `dias_periodo` e feature
 * de treino e o alvo do modelo e o crescimento DAQUELE periodo: perguntar
 * "quanto cresce em d dias" e usa-lo como ele foi ensinado. Iterar exigiria
 * `dias_periodo = 1` cem vezes e contaria a saturacao duas vezes: uma pela
 * altura que sobe, outra pelo periodo que se alonga.
 *
 * A curva entorta porque as duas coisas entortam: a taxa cai com a altura e
 * muda com o tamanho do periodo, e a estacao vira dentro de uma janela de tres
 * meses. Nao e reta, e nao deveria ser. Ela tambem nao e garantidamente
 * monotona -- o modelo pode responder um pouco menos para 86 dias do que para
 * 85 -- e a curva NAO e alisada: as quedas medidas ficam na casa de 0,01 cm, e
 * esconder o que o modelo respondeu para a tela ficar bonita seria a tela
 * mentir sobre o modelo.
 *
 * O balanco de agua no solo roda UMA vez, sobre a serie inteira (aquecimento
 * mais janela), porque ele nao depende do tamanho do periodo perguntado -- so
 * da altura inicial, pelo Kc.
 */
export function simular(pedido: PedidoSimulacao, janela: Janela): Simulacao {
  const total = Math.min(pedido.dias, janela.dias.length);

  if (total < 1) {
    throw new Error("A simulação precisa de pelo menos um dia de clima.");
  }

  const serie: DiaClima[] = [...janela.aquecimento, ...janela.dias];
  const inicio = janela.aquecimento.length;
  const balanco = balancoSolo(serie, pedido.capacidadeMm, pedido.alturaInicialCm);

  const contexto = {
    especie: pedido.especie,
    latitude: pedido.latitude,
    alturaInicialCm: pedido.alturaInicialCm,
    diasDesdeRocada: pedido.diasDesdeRocada,
    fertilidade: pedido.fertilidade,
    capacidadeMm: pedido.capacidadeMm,
    serie,
    inicio,
    balanco,
  };

  const pontos: PontoCurva[] = [
    {
      dia: 0,
      data: janela.dias[0].data,
      alturaCm: pedido.alturaInicialCm,
      alturaMinCm: pedido.alturaInicialCm,
      alturaMaxCm: pedido.alturaInicialCm,
      crescimento: { q10: 0, q50: 0, q90: 0 },
      fonteClima: null,
    },
  ];

  for (let d = 1; d <= total; d += 1) {
    const crescimento = preverCrescimento({ ...contexto, diasPeriodo: d });

    pontos.push({
      dia: d,
      data: janela.dias[d - 1].data,
      alturaCm: pedido.alturaInicialCm + crescimento.q50,
      alturaMinCm: pedido.alturaInicialCm + crescimento.q10,
      alturaMaxCm: pedido.alturaInicialCm + crescimento.q90,
      crescimento,
      fonteClima: janela.dias[d - 1].fonte,
    });
  }

  const fim = pontos[pontos.length - 1];

  let agua = 0;
  for (let i = 0; i < total; i += 1) agua += balanco.fracoes[inicio + i] ?? 0;

  return {
    pontos,
    alturaInicialCm: pedido.alturaInicialCm,
    alturaFinalCm: fim.alturaCm,
    crescimento: fim.crescimento,
    crescimentoCmDia: fim.crescimento.q50 / total,
    aguaSoloMediaPct: (agua / total) * 100,
    janela,
    extrapolacoes: extrapolacoes({
      alturaInicialCm: pedido.alturaInicialCm,
      dias: pedido.dias,
      diasDesdeRocada: pedido.diasDesdeRocada,
      latitude: pedido.latitude,
      fertilidade: pedido.fertilidade,
      capacidadeMm: pedido.capacidadeMm,
    }),
  };
}

/** Em que dia a curva de um dos cenarios cruza uma altura limite. */
type Cenario = "min" | "mediana" | "max";

function alturaDe(p: PontoCurva, cenario: Cenario): number {
  if (cenario === "min") return p.alturaMinCm;
  if (cenario === "max") return p.alturaMaxCm;
  return p.alturaCm;
}

/**
 * Em que dia a curva cruza uma altura limite.
 *
 * Devolve `null` quando nao cruza dentro do periodo simulado, que e uma
 * resposta, nao uma falha: "nesse ritmo, em 90 dias ainda nao chega".
 */
export function diaQueCruza(
  sim: Simulacao,
  limiteCm: number,
  cenario: Cenario = "mediana",
): number | null {
  const ponto = sim.pontos.find((p) => alturaDe(p, cenario) >= limiteCm);
  return ponto ? ponto.dia : null;
}

/**
 * Entre que dias o trecho cruza o limite, pelo intervalo do modelo.
 *
 * E aqui que os quantis viram informacao de gestor. "+5,6 a +9,7 cm" nao ajuda
 * ninguem a marcar equipe; "cruza entre 28 e 61 dias" ajuda. Mais crescimento
 * cruza mais CEDO, entao o cenario otimista (q90) da a ponta de baixo -- as
 * pontas trocam de papel de proposito.
 *
 * A mesma conta existe em `modelo.banda_de_cruzamento`, no lote.
 */
export function bandaQueCruza(
  sim: Simulacao,
  limiteCm: number,
): { cedo: number | null; mediana: number | null; tarde: number | null } {
  return {
    cedo: diaQueCruza(sim, limiteCm, "max"),
    mediana: diaQueCruza(sim, limiteCm, "mediana"),
    tarde: diaQueCruza(sim, limiteCm, "min"),
  };
}
