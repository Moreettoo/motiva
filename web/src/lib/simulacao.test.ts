import { describe, expect, it } from "vitest";

import type { DiaClima, Janela } from "./clima";
import { bandaQueCruza, diaQueCruza, simular, type PedidoSimulacao } from "./simulacao";

/** Clima de primavera paulista: quente, úmido, chuva moderada. */
function janela(total: number, v: Partial<DiaClima> = {}): Janela {
  const monta = (n: number, mes: number, fonte: DiaClima["fonte"]): DiaClima[] =>
    Array.from({ length: n }, (_, i) => ({
      data: new Date(Date.UTC(2026, mes, 1 + i)).toISOString().slice(0, 10),
      temperaturaC: 24,
      temperaturaMinC: 17,
      temperaturaMaxC: 31,
      umidadePct: 72,
      chuvaMm: 5,
      radiacaoMjM2: 17,
      et0MmDia: 3.6,
      fonte,
      ...v,
    }));

  return {
    // Sessenta e três dias de aquecimento é o que a API entrega na prática.
    // Sem eles o balde de água no solo começaria no chute e
    // `agua_solo_media_pct` — que move o crescimento em mais de 100% — sairia
    // do valor inicial em vez do estado real do solo.
    aquecimento: monta(63, 6, "observado"),
    dias: monta(total, 8, "previsao"),
    diasPrevistos: Math.min(16, total),
    complemento: null,
    anos: [],
    avisoDoComplemento: null,
  };
}

const base: PedidoSimulacao = {
  especie: "braquiaria",
  latitude: -22.5,
  alturaInicialCm: 12,
  dias: 30,
  diasDesdeRocada: 40,
  fertilidade: 0.35,
  capacidadeMm: 60,
};

describe("simular", () => {
  it("começa na altura digitada e entrega um ponto por dia", () => {
    const s = simular(base, janela(30));

    expect(s.pontos).toHaveLength(31); // dia 0 mais 30 dias
    expect(s.pontos[0].dia).toBe(0);
    expect(s.pontos[0].alturaCm).toBe(12);
    expect(s.alturaFinalCm).toBe(s.pontos[30].alturaCm);
  });

  it("devolve o crescimento em intervalo, sempre ordenado", () => {
    // É o que o modelo novo trouxe e o antigo não tinha: q10 <= q50 <= q90.
    // Os três modelos de quantil são independentes e podem se cruzar; se a
    // ordenação sumir de `preverBruto`, a faixa da curva sai invertida.
    const s = simular(base, janela(45));

    expect(s.crescimento.q10).toBeLessThanOrEqual(s.crescimento.q50);
    expect(s.crescimento.q50).toBeLessThanOrEqual(s.crescimento.q90);
    for (const p of s.pontos) {
      expect(p.alturaMinCm).toBeLessThanOrEqual(p.alturaCm);
      expect(p.alturaCm).toBeLessThanOrEqual(p.alturaMaxCm);
    }
  });

  it("cresce com clima favorável", () => {
    const s = simular(base, janela(60));
    expect(s.alturaFinalCm).toBeGreaterThan(12);
    expect(s.crescimentoCmDia).toBeGreaterThan(0);
  });

  it("separa as três espécies na ordem que o domínio afirma", () => {
    // A nota de `dominio.ts` diz que a braquiária "é a espécie que mais puxa a
    // fila de roçada" e a esmeralda é "de porte baixo". Se o modelo portado
    // inverter isso, quebrou a codificação da categórica, e nenhum tipo pegaria.
    const alturas = (["braquiaria", "batatais", "esmeralda"] as const).map(
      (especie) => simular({ ...base, especie }, janela(30)).alturaFinalCm,
    );

    expect(alturas[0]).toBeGreaterThan(alturas[1]);
    expect(alturas[1]).toBeGreaterThan(alturas[2]);
  });

  it("responde à temperatura: frio quase não cresce", () => {
    const quente = simular(base, janela(30, { temperaturaC: 28, temperaturaMaxC: 34 })).alturaFinalCm;
    const frio = simular(base, janela(30, { temperaturaC: 14, temperaturaMaxC: 20 })).alturaFinalCm;

    expect(frio).toBeLessThan(quente);
  });

  it("responde à seca: sem chuva o crescimento despenca", () => {
    const chuvoso = simular(base, janela(30, { chuvaMm: 6 })).alturaFinalCm;
    const seco = simular(base, janela(30, { chuvaMm: 0 })).alturaFinalCm;

    expect(seco).toBeLessThan(chuvoso);
  });

  it("desacelera com a altura, em vez de crescer em linha reta", () => {
    // O modelo satura perto do teto do sítio. Uma reta aqui significaria que a
    // altura inicial parou de entrar na conta.
    const baixa = simular({ ...base, alturaInicialCm: 8 }, janela(30)).crescimentoCmDia;
    const alta = simular({ ...base, alturaInicialCm: 45 }, janela(30)).crescimentoCmDia;

    expect(alta).toBeLessThan(baixa);
  });

  it("enxerga a fase da rebrota: recém-roçado cresce diferente de maduro", () => {
    // `dias_desde_rocada_inicio` é a feature nova que o modelo v3.1 trouxe, e
    // ela existe porque a rebrota tem três fases. Se a curva não distinguir
    // dia 2 de dia 120, o campo do formulário está sendo ignorado no caminho.
    const recem = simular({ ...base, diasDesdeRocada: 2 }, janela(30)).crescimento.q50;
    const maduro = simular({ ...base, diasDesdeRocada: 120 }, janela(30)).crescimento.q50;

    expect(recem).not.toBeCloseTo(maduro, 2);
  });

  it("responde à fertilidade do solo, que é o que mais move o resultado", () => {
    const pobre = simular({ ...base, fertilidade: 0.15 }, janela(30)).crescimento.q50;
    const rico = simular({ ...base, fertilidade: 0.85 }, janela(30)).crescimento.q50;

    expect(rico).toBeGreaterThan(pobre);
  });

  it("usa a janela inteira do período, não só os dias previstos", () => {
    // Se a agregação parasse nos 16 dias de previsão, o total de chuva de 60
    // dias seria o de 16 e o modelo veria uma seca de mês e meio.
    const s = simular({ ...base, dias: 60 }, janela(60));
    expect(s.pontos).toHaveLength(61);
    expect(s.pontos[60].fonteClima).toBe("previsao");
  });

  it("mede a água no solo no período, e não no aquecimento", () => {
    const s = simular(base, janela(30));
    expect(s.aguaSoloMediaPct).toBeGreaterThan(0);
    expect(s.aguaSoloMediaPct).toBeLessThanOrEqual(100);
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

describe("bandaQueCruza", () => {
  it("cruza mais cedo no cenário otimista de crescimento", () => {
    // As pontas trocam de papel de propósito: mais crescimento (q90) cruza o
    // limite ANTES. Inverter isso na tela diria ao gestor que o pior caso é o
    // mais folgado.
    const s = simular({ ...base, alturaInicialCm: 12, dias: 90 }, janela(90));
    const { cedo, mediana, tarde } = bandaQueCruza(s, 30);

    expect(cedo).not.toBeNull();
    expect(cedo as number).toBeLessThanOrEqual(mediana as number);
    if (tarde != null) expect(mediana as number).toBeLessThanOrEqual(tarde);
  });
});
