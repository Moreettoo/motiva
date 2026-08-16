/**
 * A curva de crescimento, o miolo do simulador.
 *
 * Puro de proposito: recebe a janela de clima ja montada e devolve a curva.
 * Nao busca nada, nao le banco, nao chama LLM. E o unico jeito de testar a
 * conta que importa sem depender do Open-Meteo estar de pe.
 */

import type { DiaClima, FonteDia, Janela } from "./clima";
import { agregar } from "./clima";
import { extrapolacoes, preverCrescimento, type Extrapolacao } from "./modelo/campos";
import type { Especie, UF } from "./types";

export type PedidoSimulacao = {
  especie: Especie;
  uf: UF;
  latitude: number;
  alturaInicialCm: number;
  /** Quantos dias deixar crescendo. */
  dias: number;
  /** Mes do inicio, 1 a 12. */
  mes: number;
};

export type PontoCurva = {
  /** 0 e o dia de hoje, com a altura que a pessoa digitou. */
  dia: number;
  data: string;
  alturaCm: number;
  /** cm/dia que o modelo preve para um periodo DESTE tamanho. */
  crescimentoCmDia: number;
  fonteClima: FonteDia | null;
};

export type Simulacao = {
  pontos: PontoCurva[];
  alturaInicialCm: number;
  alturaFinalCm: number;
  crescimentoTotalCm: number;
  /** cm/dia que o modelo preve para o periodo inteiro. */
  crescimentoCmDia: number;
  janela: Janela;
  extrapolacoes: Extrapolacao[];
};

/**
 * Altura ao fim de `d` dias, para cada `d` de 1 ate o pedido.
 *
 * A conta e `altura_inicial + cm_dia(d) x d`, com `cm_dia(d)` vindo do modelo
 * com `dias_periodo = d` e o clima agregado sobre os PRIMEIROS d dias da janela.
 *
 * Por que nao iterar dia a dia atualizando a altura. `dias_periodo` e feature de
 * treino e o alvo do modelo e o crescimento medio DAQUELE periodo: perguntar
 * "quanto cresce em d dias" e usa-lo como ele foi ensinado. Iterar exigiria
 * `dias_periodo = 1`, quatro vezes abaixo do menor periodo que ele viu, e
 * contaria a saturacao duas vezes: uma pela altura que sobe, outra pelo
 * periodo que se alonga.
 *
 * A curva entorta porque as duas coisas entortam: a taxa cai com a altura
 * (braquiaria vai de 0,64 cm/dia a 10 cm para 0,28 a 50 cm) e cai com o
 * tamanho do periodo. Nao e reta, e nao deveria ser.
 *
 * Nos primeiros seis dias `dias_periodo` fica abaixo do que o modelo viu (o
 * menor periodo do treino e ~7 dias) e ele responde com o bin de baixo, ou
 * seja: o inicio da curva e o comportamento de uma janela de uma semana. E
 * aceitavel porque o formulario nao deixa pedir menos de 7 dias, esses pontos
 * so existem para a linha ter comeco.
 */
export function simular(pedido: PedidoSimulacao, janela: Janela): Simulacao {
  const total = Math.min(pedido.dias, janela.dias.length);

  if (total < 1) {
    throw new Error("A simulação precisa de pelo menos um dia de clima.");
  }

  const pontos: PontoCurva[] = [
    {
      dia: 0,
      data: janela.dias[0].data,
      alturaCm: pedido.alturaInicialCm,
      crescimentoCmDia: 0,
      fonteClima: null,
    },
  ];

  const acumulado: DiaClima[] = [];

  for (let d = 1; d <= total; d += 1) {
    acumulado.push(janela.dias[d - 1]);

    const crescimentoCmDia = preverCrescimento({
      especie: pedido.especie,
      uf: pedido.uf,
      latitude: pedido.latitude,
      mes: pedido.mes,
      alturaInicialCm: pedido.alturaInicialCm,
      clima: agregar(acumulado),
    });

    pontos.push({
      dia: d,
      data: janela.dias[d - 1].data,
      alturaCm: pedido.alturaInicialCm + crescimentoCmDia * d,
      crescimentoCmDia,
      fonteClima: janela.dias[d - 1].fonte,
    });
  }

  const fim = pontos[pontos.length - 1];

  return {
    pontos,
    alturaInicialCm: pedido.alturaInicialCm,
    alturaFinalCm: fim.alturaCm,
    crescimentoTotalCm: fim.alturaCm - pedido.alturaInicialCm,
    crescimentoCmDia: fim.crescimentoCmDia,
    janela,
    extrapolacoes: extrapolacoes({
      alturaInicialCm: pedido.alturaInicialCm,
      dias: pedido.dias,
      latitude: pedido.latitude,
    }),
  };
}

/**
 * Em que dia a curva cruza uma altura limite.
 *
 * Devolve `null` quando nao cruza dentro do periodo simulado, que e uma
 * resposta, nao uma falha: "nesse ritmo, em 90 dias ainda nao chega".
 */
export function diaQueCruza(sim: Simulacao, limiteCm: number): number | null {
  const ponto = sim.pontos.find((p) => p.alturaCm >= limiteCm);
  return ponto ? ponto.dia : null;
}
