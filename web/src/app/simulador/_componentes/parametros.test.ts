import { describe, expect, it } from "vitest";

import { extrapolacoes } from "@/lib/modelo/campos";

import {
  ALTURA_MAX,
  DIAS_MAX,
  DIAS_MIN,
  DIAS_TREINO_MAX,
  DIAS_TREINO_MIN,
  interpretar,
  PADRAO,
} from "./parametros";

describe("interpretar", () => {
  it("sem parâmetro nenhum: preenche o formulário e não roda simulação", () => {
    const r = interpretar({});

    expect(r.tentou).toBe(false);
    expect(r.pedido).toBeNull();
    expect(r.erros).toEqual({});
    expect(r.valores).toEqual(PADRAO);
  });

  it("com todos os parâmetros válidos: devolve o pedido", () => {
    const r = interpretar({
      especie: "esmeralda",
      lat: "-21.9",
      lon: "-47.1",
      altura: "8",
      dias: "30",
    });

    expect(r.erros).toEqual({});
    expect(r.pedido).toEqual({
      especie: "esmeralda",
      latitude: -21.9,
      longitude: -47.1,
      alturaCm: 8,
      dias: 30,
    });
  });

  it("aceita vírgula decimal, que é o que sai do teclado brasileiro", () => {
    const r = interpretar({ lat: "-22,53", lon: "-47,43", altura: "12,5", dias: "20" });

    expect(r.pedido?.latitude).toBe(-22.53);
    expect(r.pedido?.alturaCm).toBe(12.5);
  });

  it("recusa espécie que o modelo não conhece em vez de silenciosamente trocar", () => {
    const r = interpretar({ especie: "azevem", lat: "-22", lon: "-47", altura: "10", dias: "20" });

    expect(r.pedido).toBeNull();
    expect(r.erros.especie).toMatch(/batatais/);
  });

  it("recusa coordenada fora do Brasil", () => {
    const r = interpretar({ lat: "48.85", lon: "2.35", altura: "10", dias: "20" });

    expect(r.pedido).toBeNull();
    expect(r.erros.latitude).toMatch(/fora do Brasil/);
    expect(r.erros.longitude).toMatch(/fora do Brasil/);
  });

  it("aceita o período de 1 a 120 dias e recusa fora disso", () => {
    const curto = interpretar({ lat: "-22", lon: "-47", altura: "10", dias: String(DIAS_MIN - 1) });
    const longo = interpretar({ lat: "-22", lon: "-47", altura: "10", dias: String(DIAS_MAX + 1) });

    expect(DIAS_MIN).toBe(1);
    expect(DIAS_MAX).toBe(120);
    expect(curto.erros.dias).toBeDefined();
    expect(longo.erros.dias).toBeDefined();
    expect(interpretar({ lat: "-22", lon: "-47", altura: "10", dias: String(DIAS_MIN) }).pedido).not.toBeNull();
    expect(interpretar({ lat: "-22", lon: "-47", altura: "10", dias: String(DIAS_MAX) }).pedido).not.toBeNull();
  });

  it("a faixa de treino do período é a exata, recuperada dos limiares de bin", () => {
    // Os limiares de `dias_periodo` vão de 7,5 a 119,5, de um em um. Limiar de
    // bin é PONTO MÉDIO entre valores distintos observados, então 7,5 prova que
    // 7 e 8 estão ambos no treino: o modelo viu de 7 a 120 dias.
    //
    // Já houve aqui um `ceil`/`floor` sobre os limiares, que devolvia 8 e 119 —
    // e a tela passou a afirmar que o modelo nunca tinha visto período de 7
    // dias. Estas duas expectativas existem para essa regressão não voltar em
    // silêncio.
    expect(DIAS_TREINO_MIN).toBe(7);
    expect(DIAS_TREINO_MAX).toBe(120);
  });

  it("o campo é mais largo que o treino só na ponta de baixo", () => {
    expect(DIAS_MIN).toBeLessThan(DIAS_TREINO_MIN);
    // O teto do campo coincide com o do treino: pedir 120 dias não extrapola.
    expect(DIAS_MAX).toBe(DIAS_TREINO_MAX);

    expect(extrapolacoes({ alturaInicialCm: 12, dias: 3, latitude: -22 }).map((e) => e.campo)).toContain(
      "dias_periodo",
    );
    expect(extrapolacoes({ alturaInicialCm: 12, dias: 7, latitude: -22 })).toHaveLength(0);
    expect(extrapolacoes({ alturaInicialCm: 12, dias: 120, latitude: -22 })).toHaveLength(0);
    expect(extrapolacoes({ alturaInicialCm: 12, dias: 45, latitude: -22 })).toHaveLength(0);
  });

  it("deixa a altura passar da faixa de treino: é onde a saturação aparece", () => {
    const r = interpretar({ lat: "-22", lon: "-47", altura: "90", dias: "30" });

    expect(r.pedido?.alturaCm).toBe(90);
    expect(r.erros.altura).toBeUndefined();
  });

  it("mas recusa altura absurda", () => {
    const r = interpretar({ lat: "-22", lon: "-47", altura: String(ALTURA_MAX + 1), dias: "30" });
    expect(r.erros.altura).toBeDefined();
  });

  it("completa com o padrão o que a URL não trouxe, em vez de recusar", () => {
    // Um link compartilhado pode chegar cortado. Recusar seria a resposta mais
    // fácil e a pior: quem abriu veria erro em vez da simulação. O que veio é
    // validado, o que faltou cai no padrão, e o formulário mostra os dois.
    const r = interpretar({ lat: "-22.5" });

    expect(r.tentou).toBe(true);
    expect(r.pedido).not.toBeNull();
    expect(r.pedido?.latitude).toBe(-22.5);
    expect(r.pedido?.dias).toBe(Number(PADRAO.dias));
    expect(r.valores.latitude).toBe("-22.5");
  });

  it("mas recusa quando o parâmetro que veio é inválido", () => {
    const r = interpretar({ lat: "banana" });

    expect(r.tentou).toBe(true);
    expect(r.pedido).toBeNull();
    expect(r.erros.latitude).toBeDefined();
  });

  it("ignora repetição de parâmetro pegando o primeiro", () => {
    const r = interpretar({ lat: ["-22.5", "-90"], lon: "-47", altura: "10", dias: "20" });
    expect(r.pedido?.latitude).toBe(-22.5);
  });
});
