import { describe, expect, it } from "vitest";

import { _comPrazo, dimensoesReduzidas } from "./imagem";

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

describe("o prazo do app para o GPS", () => {
  it("devolve a posicao quando ela chega a tempo", async () => {
    await expect(_comPrazo(Promise.resolve({ latitude: -22.9 }), 50)).resolves.toEqual({ latitude: -22.9 });
  });

  /* O caso que motivou tudo: o prompt de permissao do Android sem resposta.
     `getCurrentPosition` nao chama callback NENHUM — nem sucesso nem erro — e o
     `timeout` da propria API nao vale, porque ele so comeca depois da permissao
     concedida. Sem este prazo a tela fica em "Preparando a foto…" para sempre. */
  it("desiste quando a promessa nunca responde", async () => {
    await expect(_comPrazo(new Promise(() => {}), 20)).resolves.toBeNull();
  });

  it("trata rejeicao como sem posicao, e nao como erro da captura", async () => {
    await expect(_comPrazo(Promise.reject(new Error("negado")), 50)).resolves.toBeNull();
  });
});
