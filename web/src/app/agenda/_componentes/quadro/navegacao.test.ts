import { describe, expect, it } from "vitest";

import type { Equipe } from "@/lib/types";

import { chaveCelula, montarGrade, montarJanela, type Grade } from "../dados";
import { alvoNaBordaDaSemana, proximoAlvo, realinharAlvo } from "./navegacao";

function equipe(id: number, nome: string): Equipe {
  return {
    id, nome, base_uf: "SP", base_cidade: null, capacidade_km_dia: 6, ativo: true,
  } as Equipe;
}

// Duas turmas, ordenadas por base_uf e depois nome: "Alfa" antes de "Beta".
const equipes = [equipe(1, "Alfa"), equipe(2, "Beta")];
const grade: Grade = montarGrade({
  itens: [],
  equipes,
  janela: montarJanela("2026-08-13"),
  hoje: "2026-08-13",
});

describe("proximoAlvo", () => {
  it("anda de dia com esquerda e direita", () => {
    expect(proximoAlvo(grade, chaveCelula("2026-08-12", 1), "direita")).toEqual({
      tipo: "alvo",
      alvo: chaveCelula("2026-08-13", 1),
    });
    expect(proximoAlvo(grade, chaveCelula("2026-08-12", 1), "esquerda")).toEqual({
      tipo: "alvo",
      alvo: chaveCelula("2026-08-11", 1),
    });
  });

  it("anda de turma com cima e baixo", () => {
    expect(proximoAlvo(grade, chaveCelula("2026-08-12", 1), "baixo")).toEqual({
      tipo: "alvo",
      alvo: chaveCelula("2026-08-12", 2),
    });
  });

  it("para na borda de baixo em vez de dar a volta", () => {
    // Dar a volta faria o gestor perder de vista onde o cartão está.
    expect(proximoAlvo(grade, chaveCelula("2026-08-12", 2), "baixo")).toEqual({
      tipo: "borda",
      alvo: chaveCelula("2026-08-12", 2),
    });
  });

  it("sai do trilho para o primeiro dia da semana", () => {
    expect(proximoAlvo(grade, "fila", "direita")).toEqual({
      tipo: "alvo",
      alvo: chaveCelula("2026-08-10", 1),
    });
  });

  it("volta para o trilho pela esquerda no primeiro dia", () => {
    expect(proximoAlvo(grade, chaveCelula("2026-08-10", 1), "esquerda")).toEqual({
      tipo: "alvo",
      alvo: "fila",
    });
  });

  it("pede a semana seguinte ao passar do último dia", () => {
    expect(proximoAlvo(grade, chaveCelula("2026-08-16", 1), "direita")).toEqual({
      tipo: "semana",
      delta: 1,
    });
  });

  it("não sai do trilho pelo eixo vertical", () => {
    expect(proximoAlvo(grade, "fila", "baixo")).toEqual({ tipo: "borda", alvo: "fila" });
  });

  it("para na borda em vez de ir para o trilho quando ele não está disponível", () => {
    // Doca colapsada abaixo de `lg`: o trilho existe no DOM mas está `inert`.
    expect(proximoAlvo(grade, chaveCelula("2026-08-10", 1), "esquerda", false)).toEqual({
      tipo: "borda",
      alvo: chaveCelula("2026-08-10", 1),
    });
  });

  it("continua indo para o trilho quando disponível é omitido (coluna, padrão true)", () => {
    expect(proximoAlvo(grade, chaveCelula("2026-08-10", 1), "esquerda")).toEqual({
      tipo: "alvo",
      alvo: "fila",
    });
  });
});

describe("realinharAlvo", () => {
  it("desloca o mesmo dia da semana e a mesma turma", () => {
    expect(realinharAlvo(chaveCelula("2026-08-12", 1), 1)).toBe(chaveCelula("2026-08-19", 1));
    expect(realinharAlvo(chaveCelula("2026-08-12", 1), -1)).toBe(chaveCelula("2026-08-05", 1));
  });

  it("preserva a turma mesmo quando a semana muda de mês", () => {
    expect(realinharAlvo(chaveCelula("2026-08-31", 2), 1)).toBe(chaveCelula("2026-09-07", 2));
  });

  it("não desloca o trilho — ele existe em qualquer semana", () => {
    expect(realinharAlvo("fila", 1)).toBe("fila");
    expect(realinharAlvo("fila", -1)).toBe("fila");
  });
});

describe("alvoNaBordaDaSemana", () => {
  // A janela de `grade` é 2026-08-10 (segunda) a 2026-08-16 (domingo).
  it("pousa no primeiro dia da semana nova indo para a direita — um dia, não uma semana", () => {
    expect(alvoNaBordaDaSemana(grade, chaveCelula("2026-08-16", 1), 1)).toBe(
      chaveCelula("2026-08-17", 1),
    );
  });

  it("pousa no último dia da semana anterior indo para a esquerda", () => {
    expect(alvoNaBordaDaSemana(grade, chaveCelula("2026-08-10", 1), -1)).toBe(
      chaveCelula("2026-08-09", 1),
    );
  });

  it("preserva a turma", () => {
    expect(alvoNaBordaDaSemana(grade, chaveCelula("2026-08-16", 2), 1)).toBe(
      chaveCelula("2026-08-17", 2),
    );
  });

  it("não desloca o trilho", () => {
    expect(alvoNaBordaDaSemana(grade, "fila", 1)).toBe("fila");
  });
});
