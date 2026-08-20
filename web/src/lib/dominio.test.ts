import { describe, expect, it } from "vitest";

import { erroFaltaEquipe, REGIME, rotuloPrazo } from "./dominio";
import { REGIMES, REGIME_PADRAO } from "./types";

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

describe("REGIME", () => {
  it("tem vocabulário para todo regime que existe", () => {
    // Um regime novo em `types.ts` sem entrada aqui derrubaria a tela do
    // simulador em `REGIME[pedido.regime].rotulo`, e não no build.
    for (const r of REGIMES) expect(REGIME[r]?.rotulo).toBeTruthy();
  });

  it("fixa as profundidades de raiz que o `solo.py` também usa", () => {
    // Estes dois números são a única diferença física entre os regimes no
    // pipeline de solo, e existem em dois idiomas: aqui e em `RAIZ_MM`, no
    // `solo.py`. Mudar um sem o outro faz o mesmo ponto ter dois solos — o lote
    // diário calcularia um balde e o simulador outro.
    expect(REGIME.faixa.raizMm).toBe(500);
    expect(REGIME.pasto.raizMm).toBe(800);
  });

  it("marca como experimental exatamente o que o modelo não viu no treino", () => {
    // O padrão nunca pode ser experimental: um link sem `regime` cai nele.
    expect(REGIME[REGIME_PADRAO].experimental).toBe(false);
    expect(REGIME.pasto.experimental).toBe(true);
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
