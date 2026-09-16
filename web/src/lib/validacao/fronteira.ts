import type { ClasseAltura } from "../types";

/**
 * Onde a previsao contínua do modelo cai em relacao a regua de tres classes da
 * Motiva.
 *
 * Puro de propriedade: `queries.ts` importa `server-only` e nao roda no vitest.
 * A conta que sustenta a frase mais forte da pagina -- "o modelo nao esta
 * errando a altura, esta errando a etiqueta" -- precisa de teste, entao ela
 * mora aqui e a consulta so busca as linhas.
 */

/** As fronteiras de `CLASSE_ALTURA` (`dominio.ts`): abaixo de 10 / 10 a 30 /
 *  acima de 30. Em um lugar so porque duas contas desta pasta somam contra
 *  elas. */
export const FRONTEIRAS_CM = [10, 30] as const;

export type ParBruto = {
  classe_inicial: ClasseAltura;
  classe_final_observada: ClasseAltura;
  altura_inicial_cm: number | string;
  q50_cm: number | string;
  q10_cm: number | string;
  q90_cm: number | string;
};

export type ParProjetado = {
  classeInicial: ClasseAltura;
  /** A caixa em que a equipe viu o trecho no FIM da semana. E contra ela que o
   *  acerto de altura e medido -- a de partida responde outra pergunta. */
  classeFinalObservada: ClasseAltura;
  alturaInicialCm: number;
  /** `altura_inicial_cm + q50_cm`: onde o modelo diz que a grama termina. */
  alturaFinalCm: number;
  /** Distancia, em cm, ate a fronteira de classe mais proxima. Sempre >= 0. */
  distanciaDaFronteiraCm: number;
  /** A fronteira a que essa distancia se refere. */
  fronteiraCm: number;
};

function num(v: number | string): number {
  return typeof v === "number" ? v : Number(v);
}

/** A fronteira de classe mais proxima de uma altura, e a que distancia. */
export function fronteiraMaisProxima(alturaCm: number): { fronteiraCm: number; distanciaCm: number } {
  let melhor: { fronteiraCm: number; distanciaCm: number } = {
    fronteiraCm: FRONTEIRAS_CM[0],
    distanciaCm: Number.POSITIVE_INFINITY,
  };
  for (const fronteira of FRONTEIRAS_CM) {
    const distancia = Math.abs(alturaCm - fronteira);
    if (distancia < melhor.distanciaCm) melhor = { fronteiraCm: fronteira, distanciaCm: distancia };
  }
  return melhor;
}

export function projetarPares(brutos: ParBruto[]): ParProjetado[] {
  return brutos.map((p) => {
    const alturaInicialCm = num(p.altura_inicial_cm);
    const alturaFinalCm = alturaInicialCm + num(p.q50_cm);
    const { fronteiraCm, distanciaCm } = fronteiraMaisProxima(alturaFinalCm);
    return {
      classeInicial: p.classe_inicial,
      classeFinalObservada: p.classe_final_observada,
      alturaInicialCm,
      alturaFinalCm,
      distanciaDaFronteiraCm: distanciaCm,
      fronteiraCm,
    };
  });
}

/**
 * A faixa de altura de cada caixa da regua da Motiva.
 *
 * Derivada de `FRONTEIRAS_CM` em vez de escrita a mao: sao os mesmos dois
 * numeros, e duas copias deles divergiriam no dia em que a regua mudasse.
 * A classe 3 nao tem teto -- ela e "acima de 30", nao um intervalo.
 */
export const BANDAS_CM: Record<ClasseAltura, readonly [number, number]> = {
  1: [0, FRONTEIRAS_CM[0]],
  2: [FRONTEIRAS_CM[0], FRONTEIRAS_CM[1]],
  3: [FRONTEIRAS_CM[1], Number.POSITIVE_INFINITY],
};

/** O quanto a altura prevista ficou FORA da banda daquela classe. Zero quando
 *  caiu dentro, inclusive nas bordas. */
export function distanciaDaBanda(alturaCm: number, classe: ClasseAltura): number {
  const [piso, teto] = BANDAS_CM[classe];
  if (alturaCm < piso) return piso - alturaCm;
  if (alturaCm > teto) return alturaCm - teto;
  return 0;
}

export type AcertoDeAltura = {
  n: number;
  /** Caiu dentro da faixa de altura que a equipe observou. */
  dentroDaBanda: number;
  /** Caiu dentro dela, ou a menos de `MARGEM_CM`. */
  dentroComMargem: number;
  foraDaMargem: number;
  medianaCm: number;
  mediaCm: number;
};

/**
 * Quanto o modelo acertou a ALTURA, e nao a etiqueta.
 *
 * A acuracia de classe pontua o modelo por uma regua de tres caixas, e uma
 * resposta a 0,7 mm da linha conta como erro inteiro. Esta conta pergunta a
 * outra coisa -- a altura que ele respondeu cabe onde a equipe viu o capim? --
 * e e a afirmacao mais forte que estes dados sustentam.
 *
 * Mede contra `classeFinalObservada`, nunca contra a de partida: a pergunta e
 * sobre onde o trecho FOI PARAR.
 */
export function resumirAcertoDeAltura(pares: ParProjetado[]): AcertoDeAltura {
  const distancias = pares
    .map((p) => distanciaDaBanda(p.alturaFinalCm, p.classeFinalObservada))
    .sort((a, b) => a - b);

  const n = distancias.length;
  if (n === 0) {
    return { n: 0, dentroDaBanda: 0, dentroComMargem: 0, foraDaMargem: 0, medianaCm: 0, mediaCm: 0 };
  }

  const dentroDaBanda = distancias.filter((d) => d === 0).length;
  const dentroComMargem = distancias.filter((d) => d <= MARGEM_CM).length;
  const meio = Math.floor(n / 2);

  return {
    n,
    dentroDaBanda,
    dentroComMargem,
    foraDaMargem: n - dentroComMargem,
    medianaCm: n % 2 ? distancias[meio] : (distancias[meio - 1] + distancias[meio]) / 2,
    mediaCm: distancias.reduce((s, d) => s + d, 0) / n,
  };
}

export type ResumoFronteira = {
  classeInicial: ClasseAltura;
  fronteiraCm: number;
  n: number;
  minCm: number;
  medianaCm: number;
  maxCm: number;
  /** Distancia da MEDIANA ate a fronteira, com sinal: negativa = abaixo dela. */
  medianaAteFronteiraCm: number;
  /** Quantos dos `n` caem a menos de `MARGEM_CM` da fronteira. */
  dentroDaMargem: number;
};

/** A margem em que "errou a etiqueta" e a leitura honesta do erro. 1,5 cm e a
 *  metade da menor classe util da regua, nao um numero escolhido pelo
 *  resultado. */
export const MARGEM_CM = 1.5;

function mediana(valores: number[]): number {
  const s = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2;
}

/**
 * Um resumo por classe de partida. A classe 1 e a que importa: e nela que os
 * 163 pares do Rodoanel se amontoam em cima da fronteira de 10 cm.
 */
export function resumirPorClasse(pares: ParProjetado[]): ResumoFronteira[] {
  const grupos = new Map<ClasseAltura, ParProjetado[]>();
  for (const p of pares) {
    const atual = grupos.get(p.classeInicial);
    if (atual) atual.push(p);
    else grupos.set(p.classeInicial, [p]);
  }

  return [...grupos.entries()]
    .map(([classeInicial, linhas]) => {
      const finais = linhas.map((l) => l.alturaFinalCm);
      const med = mediana(finais);
      // A fronteira do grupo e a mais proxima da MEDIANA, nao a mais votada
      // linha a linha: e sobre ela que a frase do resumo fala.
      const { fronteiraCm } = fronteiraMaisProxima(med);
      return {
        classeInicial,
        fronteiraCm,
        n: linhas.length,
        minCm: Math.min(...finais),
        medianaCm: med,
        maxCm: Math.max(...finais),
        medianaAteFronteiraCm: med - fronteiraCm,
        dentroDaMargem: linhas.filter((l) => Math.abs(l.alturaFinalCm - fronteiraCm) <= MARGEM_CM).length,
      };
    })
    .sort((a, b) => a.classeInicial - b.classeInicial);
}
