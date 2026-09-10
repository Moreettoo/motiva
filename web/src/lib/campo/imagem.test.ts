import { describe, expect, it } from "vitest";

import { dimensoesReduzidas } from "./imagem";

describe("dimensoesReduzidas", () => {
  it("reduz a paisagem pelo lado maior, guardando a proporcao", () => {
    expect(dimensoesReduzidas(4000, 3000)).toEqual({ largura: 1600, altura: 1200 });
  });

  it("reduz o retrato pelo lado maior, guardando a proporcao", () => {
    expect(dimensoesReduzidas(3000, 4000)).toEqual({ largura: 1200, altura: 1600 });
  });

  it("nao amplia foto pequena", () => {
    expect(dimensoesReduzidas(800, 600)).toEqual({ largura: 800, altura: 600 });
  });

  it("deixa passar a foto que ja esta exatamente no limite", () => {
    expect(dimensoesReduzidas(1600, 1600)).toEqual({ largura: 1600, altura: 1600 });
  });

  it("aceita outro lado maximo", () => {
    expect(dimensoesReduzidas(4000, 2000, 800)).toEqual({ largura: 800, altura: 400 });
  });

  it("arredonda o lado menor para inteiro", () => {
    expect(dimensoesReduzidas(4032, 3024)).toEqual({ largura: 1600, altura: 1200 });
    expect(dimensoesReduzidas(3000, 1777)).toEqual({ largura: 1600, altura: 948 });
  });
});
