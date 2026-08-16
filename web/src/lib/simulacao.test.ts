import { describe, expect, it } from "vitest";

import type { DiaClima, Janela } from "./clima";
import { diaQueCruza, simular, type PedidoSimulacao } from "./simulacao";

/** Clima de primavera paulista: quente, úmido, chuva moderada. */
function janela(total: number, v: Partial<DiaClima> = {}): Janela {
  const dias: DiaClima[] = Array.from({ length: total }, (_, i) => ({
    data: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10),
    temperaturaC: 24,
    umidadePct: 72,
    chuvaMm: 5,
    radiacaoMjM2: 17,
    et0MmDia: 3.6,
    fonte: "previsao",
    ...v,
  }));

  return { dias, diasPrevistos: Math.min(16, total), complemento: null, anos: [], avisoDoComplemento: null };
}

const base: PedidoSimulacao = {
  especie: "braquiaria",
  uf: "SP",
  latitude: -22.5,
  alturaInicialCm: 12,
  dias: 30,
  mes: 9,
};

describe("simular", () => {
  it("começa na altura digitada e entrega um ponto por dia", () => {
    const s = simular(base, janela(30));

    expect(s.pontos).toHaveLength(31); // dia 0 mais 30 dias
    expect(s.pontos[0].dia).toBe(0);
    expect(s.pontos[0].alturaCm).toBe(12);
    expect(s.alturaFinalCm).toBe(s.pontos[30].alturaCm);
  });

  it("cresce de forma monótona com clima favorável", () => {
    const s = simular(base, janela(60));

    for (let i = 1; i < s.pontos.length; i += 1) {
      expect(s.pontos[i].alturaCm).toBeGreaterThanOrEqual(s.pontos[i - 1].alturaCm);
    }
    expect(s.alturaFinalCm).toBeGreaterThan(12);
  });

  it("separa as três espécies na ordem que o domínio afirma", () => {
    // A nota de `dominio.ts` diz que a braquiária "é a espécie que mais puxa a
    // fila de roçada" e a esmeralda é "de porte baixo". Se o modelo portado
    // inverter isso, quebrou a permutação de colunas, e nenhum tipo pegaria.
    const alturas = (["braquiaria", "batatais", "esmeralda"] as const).map(
      (especie) => simular({ ...base, especie }, janela(30)).alturaFinalCm,
    );

    expect(alturas[0]).toBeGreaterThan(alturas[1]);
    expect(alturas[1]).toBeGreaterThan(alturas[2]);
  });

  it("responde à temperatura: frio quase não cresce", () => {
    const quente = simular(base, janela(30, { temperaturaC: 28 })).alturaFinalCm;
    const frio = simular(base, janela(30, { temperaturaC: 14 })).alturaFinalCm;

    expect(frio).toBeLessThan(quente);
  });

  it("responde à seca: sem chuva o crescimento despenca", () => {
    const chuvoso = simular(base, janela(30, { chuvaMm: 6 })).alturaFinalCm;
    const seco = simular(base, janela(30, { chuvaMm: 0 })).alturaFinalCm;

    expect(seco).toBeLessThan(chuvoso);
  });

  it("desacelera com a altura, em vez de crescer em linha reta", () => {
    // O modelo satura: braquiária vai de ~0,64 cm/dia a 10 cm para ~0,28 a
    // 50 cm. Uma reta aqui significaria que a altura inicial parou de entrar
    // na conta.
    const baixa = simular({ ...base, alturaInicialCm: 8 }, janela(30)).crescimentoCmDia;
    const alta = simular({ ...base, alturaInicialCm: 40 }, janela(30)).crescimentoCmDia;

    expect(alta).toBeLessThan(baixa);
  });

  it("usa a janela inteira do período, não só os dias previstos", () => {
    // Se a agregação parasse nos 16 dias de previsão, o total de chuva de 60
    // dias seria o de 16 e o modelo veria uma seca de mês e meio.
    const s = simular({ ...base, dias: 60 }, janela(60));
    expect(s.pontos).toHaveLength(61);
    expect(s.pontos[60].fonteClima).toBe("previsao");
  });

  it("marca a extrapolação quando a altura inicial passa do que o modelo viu", () => {
    const dentro = simular({ ...base, alturaInicialCm: 20 }, janela(30));
    const fora = simular({ ...base, alturaInicialCm: 90 }, janela(30));

    expect(dentro.extrapolacoes).toHaveLength(0);
    expect(fora.extrapolacoes.map((e) => e.campo)).toContain("altura_inicial_cm");
    expect(fora.extrapolacoes[0].lado).toBe("acima");
  });

  it("não estoura quando o período pedido é maior que a janela disponível", () => {
    const s = simular({ ...base, dias: 90 }, janela(40));
    expect(s.pontos).toHaveLength(41);
  });
});

describe("diaQueCruza", () => {
  it("acha o primeiro dia acima do limite", () => {
    const s = simular({ ...base, alturaInicialCm: 12, dias: 90 }, janela(90));
    const d = diaQueCruza(s, 30);

    expect(d).not.toBeNull();
    expect(s.pontos[d as number].alturaCm).toBeGreaterThanOrEqual(30);
    expect(s.pontos[(d as number) - 1].alturaCm).toBeLessThan(30);
  });

  it("devolve null quando a curva não chega lá no período, que é resposta, não falha", () => {
    const s = simular({ ...base, dias: 30 }, janela(30));
    expect(diaQueCruza(s, 500)).toBeNull();
  });
});
