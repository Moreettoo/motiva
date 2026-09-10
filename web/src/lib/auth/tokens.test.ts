import { describe, expect, it } from "vitest";

import { erroDaSenha, expirado, gerarToken, hashToken, prazo } from "./tokens";

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
