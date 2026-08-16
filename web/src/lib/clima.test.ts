import { describe, expect, it } from "vitest";

import {
  agregar,
  completarPorRepeticao,
  lerDiario,
  mediaEntreAnos,
  montarJanela,
  type DiaClima,
} from "./clima";

function dia(data: string, v: Partial<DiaClima> = {}): DiaClima {
  return {
    data,
    temperaturaC: 24,
    umidadePct: 70,
    chuvaMm: 5,
    radiacaoMjM2: 17,
    et0MmDia: 4,
    fonte: "previsao",
    ...v,
  };
}

const datasFuturas = Array.from({ length: 40 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`);

describe("lerDiario", () => {
  it("descarta o dia que veio com variável nula em vez de virar zero", () => {
    const dias = lerDiario(
      {
        daily: {
          time: ["2026-08-16", "2026-08-17", "2026-08-18"],
          temperature_2m_mean: [22, null, 24],
          relative_humidity_2m_mean: [70, 70, 70],
          precipitation_sum: [0, 0, 3],
          shortwave_radiation_sum: [18, 18, 18],
          et0_fao_evapotranspiration: [4, 4, 4],
        },
      },
      "previsao",
    );

    // Zero não é "não sei": zero de radiação é noite polar e puxaria a média
    // para baixo fingindo medição.
    expect(dias.map((d) => d.data)).toEqual(["2026-08-16", "2026-08-18"]);
  });

  it("devolve lista vazia quando a resposta é de erro", () => {
    expect(lerDiario({ error: true, reason: "Too many concurrent requests" }, "historico")).toEqual([]);
  });
});

describe("agregar", () => {
  it("soma a chuva e faz média do resto", () => {
    const a = agregar([
      dia("2026-08-16", { chuvaMm: 10, temperaturaC: 20 }),
      dia("2026-08-17", { chuvaMm: 0, temperaturaC: 30 }),
    ]);

    expect(a.dias).toBe(2);
    expect(a.precipitacaoTotalMm).toBe(10);
    expect(a.precipitacaoMediaDiariaMm).toBe(5);
    expect(a.temperaturaMediaC).toBe(25);
  });

  it("escala o total de chuva com o tamanho da janela", () => {
    // É a conta que, feita errada, faz o modelo enxergar seca: passar o total
    // de 16 dias declarando 90 dias.
    const curta = agregar(Array.from({ length: 16 }, (_, i) => dia(datasFuturas[i])));
    const longa = agregar(Array.from({ length: 32 }, (_, i) => dia(datasFuturas[i % 40])));

    expect(curta.precipitacaoTotalMm).toBe(80);
    expect(longa.precipitacaoTotalMm).toBe(160);
    // A média diária não muda: é o total que carrega o tamanho da janela.
    expect(longa.precipitacaoMediaDiariaMm).toBe(curta.precipitacaoMediaDiariaMm);
  });

  it("calcula o balanço hídrico como chuva sobre et0 vezes dias", () => {
    const a = agregar([dia("2026-08-16", { chuvaMm: 8, et0MmDia: 4 }), dia("2026-08-17", { chuvaMm: 0, et0MmDia: 4 })]);
    expect(a.balancoHidrico).toBeCloseTo(8 / (4 * 2), 12);
  });

  it("usa 0,1 quando o et0 médio dá zero, para não dividir por zero", () => {
    const a = agregar([dia("2026-08-16", { et0MmDia: 0, chuvaMm: 1 })]);
    expect(a.et0MedioMmDia).toBe(0.1);
    expect(Number.isFinite(a.balancoHidrico)).toBe(true);
  });

  it("recusa janela vazia em vez de devolver NaN", () => {
    expect(() => agregar([])).toThrow(/vazia/);
  });
});

describe("mediaEntreAnos", () => {
  it("faz a média por posição e corta no ano mais curto", () => {
    const media = mediaEntreAnos([
      [dia("2025-08-16", { temperaturaC: 20 }), dia("2025-08-17", { temperaturaC: 20 }), dia("2025-08-18")],
      [dia("2024-08-16", { temperaturaC: 30 }), dia("2024-08-17", { temperaturaC: 24 })],
    ]);

    // Por posição e não por data: 29 de fevereiro desalinha o calendário entre
    // anos e casar por data deixaria buraco no meio da série.
    expect(media).toHaveLength(2);
    expect(media[0].temperaturaC).toBe(25);
    expect(media[1].temperaturaC).toBe(22);
    expect(media[0].fonte).toBe("historico");
  });

  it("devolve vazio quando nenhum ano trouxe dado", () => {
    expect(mediaEntreAnos([[], []])).toEqual([]);
  });
});

describe("completarPorRepeticao", () => {
  it("repete o ciclo e carimba as datas futuras", () => {
    const base = [dia("2026-08-16", { chuvaMm: 12 }), dia("2026-08-17", { chuvaMm: 0 })];
    const cheia = completarPorRepeticao(base, 5, datasFuturas);

    expect(cheia).toHaveLength(5);
    expect(cheia.slice(0, 2).map((d) => d.fonte)).toEqual(["previsao", "previsao"]);
    expect(cheia.slice(2).map((d) => d.fonte)).toEqual(["repeticao", "repeticao", "repeticao"]);
    // Cíclico e não chapado na média: preserva a dispersão, que o balanço
    // hídrico enxerga.
    expect(cheia.map((d) => d.chuvaMm)).toEqual([12, 0, 12, 0, 12]);
    expect(cheia[2].data).toBe(datasFuturas[2]);
  });
});

describe("montarJanela", () => {
  const previsao = Array.from({ length: 16 }, (_, i) => dia(datasFuturas[i]));

  it("não complementa nada quando a previsão já cobre o período", () => {
    const j = montarJanela({ previsao, historico: [], anos: [], total: 10, datas: datasFuturas });

    expect(j.dias).toHaveLength(10);
    expect(j.complemento).toBeNull();
    expect(j.diasPrevistos).toBe(10);
  });

  it("emenda o histórico depois do último dia previsto, com as datas futuras", () => {
    const historico = Array.from({ length: 20 }, () => dia("2025-09-01", { fonte: "historico", temperaturaC: 18 }));
    const j = montarJanela({ previsao, historico, anos: [2025, 2024], total: 25, datas: datasFuturas });

    expect(j.dias).toHaveLength(25);
    expect(j.diasPrevistos).toBe(16);
    expect(j.complemento).toBe("historico");
    expect(j.anos).toEqual([2025, 2024]);
    expect(j.dias[16].fonte).toBe("historico");
    // O histórico empresta os números, não o calendário.
    expect(j.dias[16].data).toBe(datasFuturas[16]);
  });

  it("cai para a repetição quando o histórico não cobre o que falta", () => {
    const j = montarJanela({
      previsao,
      historico: [dia("2025-09-01", { fonte: "historico" })],
      anos: [2025],
      total: 30,
      datas: datasFuturas,
      avisoDoComplemento: "O arquivo histórico recusou (429).",
    });

    expect(j.dias).toHaveLength(30);
    expect(j.complemento).toBe("repeticao");
    expect(j.anos).toEqual([]);
    expect(j.avisoDoComplemento).toMatch(/429/);
  });

  it("recusa montar sem nenhuma previsão em vez de inventar série", () => {
    expect(() => montarJanela({ previsao: [], historico: [], anos: [], total: 10, datas: datasFuturas })).toThrow(
      /sem nenhum dia/,
    );
  });
});
