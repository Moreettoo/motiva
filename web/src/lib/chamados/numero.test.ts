import { describe, expect, it } from "vitest";

import { diasDeAtraso, estaAtrasado, formatarNumero } from "./numero";

describe("formatarNumero", () => {
  it("quatro dígitos com zeros à esquerda", () => {
    expect(formatarNumero(2026, 7)).toBe("CH-2026-0007");
    expect(formatarNumero(2026, 12345)).toBe("CH-2026-12345");
  });
});

describe("atraso", () => {
  it("conta dias corridos depois da data prevista", () => {
    expect(diasDeAtraso("2026-09-10", "2026-09-13")).toBe(3);
    expect(diasDeAtraso("2026-09-13", "2026-09-13")).toBe(0);
    expect(diasDeAtraso("2026-09-20", "2026-09-13")).toBe(-7);
  });
  it("só aberto vencido é atrasado", () => {
    expect(estaAtrasado("aberto", "2026-09-10", "2026-09-13")).toBe(true);
    expect(estaAtrasado("aberto", "2026-09-13", "2026-09-13")).toBe(false);
    expect(estaAtrasado("em_andamento", "2026-09-10", "2026-09-13")).toBe(false);
    expect(estaAtrasado("concluido", "2026-09-10", "2026-09-13")).toBe(false);
  });
});
