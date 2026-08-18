import { describe, expect, it } from "vitest";

import { erroFaltaEquipe, rotuloPrazo } from "./dominio";

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

describe("rotuloPrazo", () => {
  it("não escreve precisão que a extrapolação não tem", () => {
    // Acima de 120 dias `dias_ate_limite` é extensão linear, não varredura do
    // modelo. "621 dias" prometeria precisão de dia sobre uma reta — é o mesmo
    // defeito dos "2.196 dias" que a agenda já mostrou uma vez.
    expect(rotuloPrazo(366)).toBe("mais de 1 ano");
    expect(rotuloPrazo(621)).toBe("mais de 1 ano");
    expect(rotuloPrazo(365)).toBe("365 dias");
  });

  it("distingue os três casos que não são um número de dias", () => {
    expect(rotuloPrazo(null)).toBe("sem crescimento");
    expect(rotuloPrazo(0)).toBe("acima do limite");
    expect(rotuloPrazo(1)).toBe("1 dia");
  });
});
