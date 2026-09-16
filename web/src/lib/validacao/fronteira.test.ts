import { describe, expect, it } from "vitest";

import {
  FRONTEIRAS_CM,
  MARGEM_CM,
  distanciaDaBanda,
  fronteiraMaisProxima,
  projetarPares,
  resumirAcertoDeAltura,
  resumirPorClasse,
  type ParBruto,
} from "./fronteira";

/** O banco devolve `numeric` como STRING pelo PostgREST. Se a projecao
 *  concatenasse em vez de somar, "12" + "4.8" viraria 124,8 cm -- numero
 *  plausivel o bastante para passar despercebido num grafico. */
function par(classe: 1 | 2 | 3, inicial: number, q50: number, observada: 1 | 2 | 3 = classe): ParBruto {
  return {
    classe_inicial: classe,
    classe_final_observada: observada,
    altura_inicial_cm: String(inicial),
    q50_cm: String(q50),
    q10_cm: String(q50 - 1),
    q90_cm: String(q50 + 1),
  };
}

describe("fronteira de classe mais proxima", () => {
  it("escolhe a de 10 cm para uma altura baixa e a de 30 para uma alta", () => {
    expect(fronteiraMaisProxima(9.93)).toEqual({ fronteiraCm: 10, distanciaCm: expect.closeTo(0.07, 10) });
    expect(fronteiraMaisProxima(31.2).fronteiraCm).toBe(30);
  });

  it("no ponto exatamente no meio fica com a primeira, sem oscilar", () => {
    // 20 cm dista 10 das duas. Empate resolvido pela ordem, nao pelo acaso da
    // ordenacao: uma fronteira que troca entre renders trocaria a frase.
    expect(fronteiraMaisProxima(20).fronteiraCm).toBe(FRONTEIRAS_CM[0]);
  });
});

describe("projecao dos pares", () => {
  it("SOMA a altura inicial ao q50, mesmo vindo como string do PostgREST", () => {
    const [p] = projetarPares([par(1, 12, 4.8)]);
    expect(p.alturaFinalCm).toBeCloseTo(16.8, 10);
  });

  it("guarda a distancia ate a fronteira sempre positiva, dos dois lados", () => {
    const [abaixo, acima] = projetarPares([par(1, 9, 0.93), par(1, 9, 1.2)]);
    expect(abaixo.alturaFinalCm).toBeCloseTo(9.93, 10);
    expect(abaixo.distanciaDaFronteiraCm).toBeCloseTo(0.07, 10);
    expect(acima.alturaFinalCm).toBeCloseTo(10.2, 10);
    expect(acima.distanciaDaFronteiraCm).toBeCloseTo(0.2, 10);
  });
});

describe("resumo por classe de partida", () => {
  it("reproduz a forma do Rodoanel: classe 1 amontoada na fronteira de 10 cm", () => {
    // Os numeros sao os reais da validacao vigente (id 29): 163 pares partindo
    // da classe 1, previsoes finais entre 9,49 e 10,10, mediana 9,93.
    const pares = [
      par(1, 5, 4.49),
      par(1, 5, 4.93),
      par(1, 5, 5.1),
    ];
    const [c1] = resumirPorClasse(projetarPares(pares));

    expect(c1.classeInicial).toBe(1);
    expect(c1.fronteiraCm).toBe(10);
    expect(c1.n).toBe(3);
    expect(c1.minCm).toBeCloseTo(9.49, 10);
    expect(c1.medianaCm).toBeCloseTo(9.93, 10);
    expect(c1.maxCm).toBeCloseTo(10.1, 10);
    expect(c1.dentroDaMargem).toBe(3);
  });

  it("assina a distancia da mediana: negativa quando fica ABAIXO da fronteira", () => {
    // O sinal e a frase. "0,74 mm abaixo da linha" e uma coisa; "0,74 mm
    // acima" e a classe oposta, e a tela diria o contrario do que aconteceu.
    const [c1] = resumirPorClasse(projetarPares([par(1, 5, 4.926)]));
    expect(c1.medianaAteFronteiraCm).toBeCloseTo(-0.074, 10);
  });

  it("conta fora da margem quem esta longe da fronteira", () => {
    const [c2] = resumirPorClasse(projetarPares([par(2, 20, 4.32), par(2, 20, 4.11)]));
    expect(c2.classeInicial).toBe(2);
    // 24,3 cm dista 5,7 da fronteira de 30: bem fora de 1,5 cm.
    expect(c2.dentroDaMargem).toBe(0);
    expect(MARGEM_CM).toBe(1.5);
  });

  it("devolve as classes em ordem, e so as que existem", () => {
    const resumo = resumirPorClasse(projetarPares([par(3, 40, 5.5), par(1, 5, 4.9)]));
    expect(resumo.map((r) => r.classeInicial)).toEqual([1, 3]);
  });

  it("mediana de numero par de linhas e a media das duas do meio", () => {
    const [c1] = resumirPorClasse(projetarPares([par(1, 5, 4), par(1, 5, 5)]));
    expect(c1.medianaCm).toBeCloseTo(9.5, 10);
  });
});

describe("distancia ate a banda da classe observada", () => {
  it("e zero dentro da banda, dos dois lados e nas bordas", () => {
    expect(distanciaDaBanda(5, 1)).toBe(0);
    expect(distanciaDaBanda(0, 1)).toBe(0);
    expect(distanciaDaBanda(10, 1)).toBe(0);
    expect(distanciaDaBanda(20, 2)).toBe(0);
  });

  it("mede o quanto FALTOU ou o quanto PASSOU, sempre positiva", () => {
    expect(distanciaDaBanda(11.2, 1)).toBeCloseTo(1.2, 10);
    expect(distanciaDaBanda(8.5, 2)).toBeCloseTo(1.5, 10);
    expect(distanciaDaBanda(27, 3)).toBeCloseTo(3, 10);
  });

  it("a classe 3 nao tem teto: capim altissimo continua dentro dela", () => {
    // Sem isto uma previsao de 90 cm contaria como erro de 60 cm contra uma
    // classe cuja definicao e "acima de 30" -- a classe nao tem borda de cima.
    expect(distanciaDaBanda(90, 3)).toBe(0);
  });
});

describe("acerto de altura contra a banda observada", () => {
  it("separa quem caiu DENTRO de quem caiu perto", () => {
    const pares = projetarPares([
      par(1, 5, 4),      // 9,0 -> dentro da banda 1
      par(1, 5, 6.2),    // 11,2 -> fora por 1,2: dentro da margem
      par(1, 5, 8),      // 13,0 -> fora por 3,0: fora da margem
    ]);
    const r = resumirAcertoDeAltura(pares);

    expect(r.n).toBe(3);
    expect(r.dentroDaBanda).toBe(1);
    expect(r.dentroComMargem).toBe(2);
    expect(r.foraDaMargem).toBe(1);
  });

  it("usa a classe OBSERVADA, nao a de partida", () => {
    // O trecho comecou na classe 1 e a equipe o viu na 2 no fim da semana. A
    // previsao de 11 cm acertou a banda observada; medida contra a classe de
    // partida ela contaria como erro, e o numero descreveria outra pergunta.
    const [p] = projetarPares([par(1, 5, 6, 2)]);
    expect(p.classeFinalObservada).toBe(2);
    expect(resumirAcertoDeAltura([p]).dentroDaBanda).toBe(1);
  });

  it("resume a distancia com mediana e media", () => {
    // 9,0 · 9,0 · 11,5 contra a banda [0, 10]: distancias 0, 0 e 1,5.
    const pares = projetarPares([par(1, 5, 4), par(1, 5, 4), par(1, 5, 6.5)]);
    const r = resumirAcertoDeAltura(pares);
    expect(r.medianaCm).toBe(0);
    expect(r.mediaCm).toBeCloseTo(1.5 / 3, 10);
  });

  it("nao quebra com lista vazia", () => {
    const r = resumirAcertoDeAltura([]);
    expect(r).toMatchObject({ n: 0, dentroDaBanda: 0, dentroComMargem: 0, medianaCm: 0, mediaCm: 0 });
  });
});
