import { describe, expect, it } from "vitest";

import { classeAnelErro } from "./cartao-servico";

/**
 * A única lógica pura do cartão: qual classe de anel de erro ele veste.
 *
 * O que estes testes protegem não é a aritmética de paridade, é o INVARIANTE
 * que ela existe para cumprir: gerações consecutivas nunca produzem a mesma
 * classe. Uma animação CSS não reinicia quando a classe já está aplicada, então
 * uma segunda falha do mesmo cartão dentro dos 450 ms só pisca se o nome da
 * classe (e com ele o `animation-name`) mudar. Uma inversão de paridade passaria
 * numa leitura rápida e faria o anel deixar de reiniciar em silêncio.
 */
describe("classeAnelErro", () => {
  it("não veste anel sem erro", () => {
    expect(classeAnelErro(0)).toBeNull();
  });

  it("ignora geração negativa em vez de vestir a classe par", () => {
    // Ninguém decrementa a geração hoje; a guarda existe para que um
    // `?? 0` que virasse `?? -1` não acendesse um anel permanente.
    expect(classeAnelErro(-1)).toBeNull();
  });

  it("alterna as duas classes a cada geração", () => {
    expect(classeAnelErro(1)).toBe("anel-erro");
    expect(classeAnelErro(2)).toBe("anel-erro-alt");
    expect(classeAnelErro(3)).toBe("anel-erro");
    expect(classeAnelErro(4)).toBe("anel-erro-alt");
  });

  it("nunca repete a classe entre gerações consecutivas", () => {
    for (let geracao = 1; geracao <= 20; geracao += 1) {
      expect(classeAnelErro(geracao)).not.toBe(classeAnelErro(geracao + 1));
    }
  });
});
