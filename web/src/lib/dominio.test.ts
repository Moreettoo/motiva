import { describe, expect, it } from "vitest";

import { erroFaltaEquipe } from "./dominio";

describe("erroFaltaEquipe", () => {
  it("bloqueia aprovar um agendamento sem equipe atribuída", () => {
    expect(erroFaltaEquipe(null, "aprovado")).toBe("Atribua uma equipe antes de aprovar.");
  });

  it("bloqueia concluir um agendamento sem equipe atribuída", () => {
    expect(erroFaltaEquipe(null, "executado")).toBe("Atribua uma equipe antes de marcar como executada.");
  });

  it("libera aprovar quando já há uma equipe atribuída", () => {
    expect(erroFaltaEquipe(7, "aprovado")).toBeNull();
  });

  it("libera concluir quando já há uma equipe atribuída", () => {
    expect(erroFaltaEquipe(7, "executado")).toBeNull();
  });
});
