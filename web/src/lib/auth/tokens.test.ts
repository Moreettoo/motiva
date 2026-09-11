import { describe, expect, it } from "vitest";

import { diasDeValidade, erroDaSenha, expirado, gerarToken, hashToken, prazo } from "./tokens";

describe("gerarToken", () => {
  it("tem 43 caracteres seguros para URL e não repete", () => {
    const a = gerarToken();
    const b = gerarToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
});

describe("hashToken", () => {
  it("é determinístico, hex de 64 caracteres, e não devolve o próprio token", async () => {
    const h1 = await hashToken("abc");
    const h2 = await hashToken("abc");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashToken("abd")).not.toBe(h1);
  });
});

describe("prazo e expirado", () => {
  const agora = new Date("2026-09-10T12:00:00Z");
  it("7 dias à frente ainda vale; um segundo depois do prazo, não", () => {
    const limite = prazo(7 * 24, agora);
    expect(limite.toISOString()).toBe("2026-09-17T12:00:00.000Z");
    expect(expirado(limite, new Date("2026-09-17T11:59:59Z"))).toBe(false);
    expect(expirado(limite, new Date("2026-09-17T12:00:00Z"))).toBe(true);
  });
});

describe("erroDaSenha", () => {
  it("exige 10 caracteres com letra e número", () => {
    expect(erroDaSenha("curta1")).toMatch(/10 caracteres/);
    expect(erroDaSenha("semnumeroaqui")).toMatch(/letras e números/);
    expect(erroDaSenha("1234567890")).toMatch(/letras e números/);
    expect(erroDaSenha("rodovia-2026")).toBeNull();
  });
});

describe("diasDeValidade", () => {
  it("um numero positivo vale, inclusive como texto", () => {
    expect(diasDeValidade("7")).toBe(7);
    expect(diasDeValidade("1")).toBe(1);
    expect(diasDeValidade("30")).toBe(30);
  });

  it("variavel presente e VAZIA cai no padrao, e nao em zero", () => {
    // `Number("")` e 0, e com zero todo convite nasce vencido.
    expect(diasDeValidade("")).toBe(7);
    expect(diasDeValidade("   ")).toBe(7);
  });

  it("ausente, texto, zero e negativo caem no padrao", () => {
    expect(diasDeValidade(undefined)).toBe(7);
    expect(diasDeValidade("sete")).toBe(7);
    expect(diasDeValidade("0")).toBe(7);
    expect(diasDeValidade("-3")).toBe(7);
  });
});
