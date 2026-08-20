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
  ROCADA_MAX,
} from "./parametros";

/** O resto do vetor de extrapolação, para os testes falarem de um campo só. */
const DENTRO = { diasDesdeRocada: 40, fertilidade: 0.35, capacidadeMm: 60 };

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
      diasDesdeRocada: Number(PADRAO.rocada),
      fertilidade: null,
      capacidadeMm: null,
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
    // Os limiares de `dias_periodo` vão de 1,5 a 119,5, de um em um. Limiar de
    // bin é PONTO MÉDIO entre valores distintos observados, então 1,5 prova que
    // 1 e 2 estão ambos no treino: o modelo v3.1 viu de 1 a 120 dias.
    //
    // Já houve aqui um `ceil`/`floor` sobre os limiares, que estreitava a faixa
    // em um dia nas duas pontas — e a tela passou a afirmar que o modelo nunca
    // tinha visto o período mínimo. Estas duas expectativas existem para essa
    // regressão não voltar em silêncio.
    expect(DIAS_TREINO_MIN).toBe(1);
    expect(DIAS_TREINO_MAX).toBe(120);
  });

  it("o campo do período agora coincide com o treino nas duas pontas", () => {
    // Mudou com o modelo v3.1: o gerador passou a sortear janelas de 1 dia, e
    // a extrapolação que existia de 1 a 6 dias acabou.
    expect(DIAS_MIN).toBe(DIAS_TREINO_MIN);
    expect(DIAS_MAX).toBe(DIAS_TREINO_MAX);

    expect(extrapolacoes({ ...DENTRO, alturaInicialCm: 12, dias: 1, latitude: -22 })).toHaveLength(0);
    expect(extrapolacoes({ ...DENTRO, alturaInicialCm: 12, dias: 120, latitude: -22 })).toHaveLength(0);
    expect(extrapolacoes({ ...DENTRO, alturaInicialCm: 12, dias: 45, latitude: -22 })).toHaveLength(0);
  });

  it("marca extrapolação quando os dias desde a roçada passam do treino", () => {
    // O campo aceita até um ano; o modelo viu até ~203 dias. Passar disso é
    // permitido e avisado, como a altura.
    const fora = extrapolacoes({ ...DENTRO, diasDesdeRocada: ROCADA_MAX, alturaInicialCm: 12, dias: 30, latitude: -22 });
    expect(fora.map((e) => e.campo)).toContain("dias_desde_rocada_inicio");
  });

  it("os dois campos de solo são opcionais e vazio quer dizer SoilGrids", () => {
    const automatico = interpretar({ lat: "-22", lon: "-47", altura: "10", dias: "20" });
    expect(automatico.pedido?.fertilidade).toBeNull();
    expect(automatico.pedido?.capacidadeMm).toBeNull();

    const manual = interpretar({ lat: "-22", lon: "-47", altura: "10", dias: "20", fert: "0,7", solo: "95" });
    expect(manual.pedido?.fertilidade).toBe(0.7);
    expect(manual.pedido?.capacidadeMm).toBe(95);
  });

  it("recusa fertilidade fora de 0 a 1 em vez de mandar para o modelo", () => {
    const r = interpretar({ lat: "-22", lon: "-47", altura: "10", dias: "20", fert: "3" });
    expect(r.pedido).toBeNull();
    expect(r.erros.fertilidade).toBeDefined();
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
