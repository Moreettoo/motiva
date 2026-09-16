import { describe, expect, it } from "vitest";

import { LARGURA_MINIMA_PCT, barrasDaProva } from "./prova-treino";

describe("barras da prova do treino", () => {
  it("poe o erro medido por ultimo, que e onde a leitura termina", () => {
    const barras = barrasDaProva(1.29);
    expect(barras.map((b) => b.chave)).toEqual(["troca", "faixa", "erro"]);
    expect(barras.at(-1)?.valorCm).toBeCloseTo(1.29, 10);
  });

  it("mede as tres na MESMA escala: a maior enche a barra", () => {
    const [troca, faixa] = barrasDaProva(1.29);
    expect(troca.larguraPct).toBe(100);
    // 10 de 30 e um terco. Escalas separadas por barra fariam o erro parecer
    // do tamanho da fronteira, que e o contrario do que o desenho diz.
    expect(faixa.larguraPct).toBeCloseTo(100 / 3, 10);
  });

  it("nunca deixa a barra do erro sumir", () => {
    // 0,02 cm em 30 da 0,07% -- sub-pixel em qualquer largura de tela. A barra
    // que a secao inteira existe para mostrar seria a unica invisivel.
    const erro = barrasDaProva(0.02).at(-1);
    expect(erro?.larguraPct).toBe(LARGURA_MINIMA_PCT);
    expect(erro?.valorCm).toBeCloseTo(0.02, 10);
  });

  it("o piso vale so para o erro: as fronteiras ficam na escala real", () => {
    const barras = barrasDaProva(0.02);
    expect(barras[1].larguraPct).toBeCloseTo(100 / 3, 10);
  });

  it("se um dia o erro passar da maior fronteira, a escala acompanha", () => {
    // Nao e hipotese ociosa: retreinar o modelo move este numero, e uma escala
    // presa em 30 cm desenharia uma barra de 140% estourando o cartao.
    const barras = barrasDaProva(42);
    expect(barras.at(-1)?.larguraPct).toBe(100);
    expect(barras[0].larguraPct).toBeCloseTo((30 / 42) * 100, 10);
  });

  it("destaca o erro, e so ele", () => {
    const barras = barrasDaProva(1.29);
    expect(barras.filter((b) => b.destaque).map((b) => b.chave)).toEqual(["erro"]);
  });
});
