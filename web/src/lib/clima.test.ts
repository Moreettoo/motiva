import { describe, expect, it } from "vitest";

import {
  balancoSolo,
  completarPorRepeticao,
  lerDiario,
  mediaEntreAnos,
  montarJanela,
  resumir,
  type DiaClima,
} from "./clima";

function dia(data: string, v: Partial<DiaClima> = {}): DiaClima {
  return {
    data,
    temperaturaC: 24,
    temperaturaMinC: 17,
    temperaturaMaxC: 31,
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
          temperature_2m_min: [14, 14, 15],
          temperature_2m_max: [29, 29, 30],
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

  it("descarta o dia sem mínima ou máxima, que o modelo novo passou a exigir", () => {
    // A API de previsão devolve `past_days` com tudo nulo antes do que ela
    // guarda. É por esse descarte que pedir 92 dias e receber 63 é o caso
    // normal, e não erro.
    const dias = lerDiario(
      {
        daily: {
          time: ["2026-08-16", "2026-08-17"],
          temperature_2m_mean: [22, 24],
          temperature_2m_min: [null, 15],
          temperature_2m_max: [29, 30],
          relative_humidity_2m_mean: [70, 70],
          precipitation_sum: [0, 3],
          shortwave_radiation_sum: [18, 18],
          et0_fao_evapotranspiration: [4, 4],
        },
      },
      "observado",
    );

    expect(dias.map((d) => d.data)).toEqual(["2026-08-17"]);
    expect(dias[0].fonte).toBe("observado");
  });

  it("devolve lista vazia quando a resposta é de erro", () => {
    expect(lerDiario({ error: true, reason: "Too many concurrent requests" }, "historico")).toEqual([]);
  });
});

describe("resumir", () => {
  it("soma a chuva, faz média do resto e pega os extremos de verdade", () => {
    const r = resumir([
      dia("2026-08-16", { chuvaMm: 10, temperaturaC: 20, temperaturaMinC: 8, temperaturaMaxC: 26 }),
      dia("2026-08-17", { chuvaMm: 0, temperaturaC: 30, temperaturaMinC: 19, temperaturaMaxC: 38 }),
    ]);

    expect(r.dias).toBe(2);
    expect(r.precipitacaoTotalMm).toBe(10);
    expect(r.temperaturaMediaC).toBe(25);
    // Mínima e máxima são EXTREMOS do período, não médias: é assim que o
    // gerador do dataset as calculou, e trocar por média mudaria o significado
    // da feature entre o treino e a produção.
    expect(r.temperaturaMinC).toBe(8);
    expect(r.temperaturaMaxC).toBe(38);
  });

  it("conta dias com chuva pelo mesmo limiar do gerador: mais de 1 mm", () => {
    const r = resumir([
      dia("2026-08-16", { chuvaMm: 0 }),
      dia("2026-08-17", { chuvaMm: 0.8 }),
      dia("2026-08-18", { chuvaMm: 1.2 }),
      dia("2026-08-19", { chuvaMm: 40 }),
    ]);
    expect(r.diasComChuva).toBe(2);
  });

  it("escala o total de chuva com o tamanho da janela", () => {
    // É a conta que, feita errada, faz o modelo enxergar seca: passar o total
    // de 16 dias declarando 90 dias.
    const curta = resumir(Array.from({ length: 16 }, (_, i) => dia(datasFuturas[i])));
    const longa = resumir(Array.from({ length: 32 }, (_, i) => dia(datasFuturas[i % 40])));

    expect(curta.precipitacaoTotalMm).toBe(80);
    expect(longa.precipitacaoTotalMm).toBe(160);
    // A média não muda: é o total que carrega o tamanho da janela.
    expect(longa.temperaturaMediaC).toBe(curta.temperaturaMediaC);
  });

  it("recusa janela vazia em vez de devolver NaN", () => {
    expect(() => resumir([])).toThrow(/vazia/);
  });
});

describe("balancoSolo", () => {
  it("começa o balde em 60% da capacidade, como o gerador", () => {
    // Sem chuva e sem evapotranspiração o balde não se mexe, então o primeiro
    // dia mostra exatamente o ponto de partida. Se este número mudar, o
    // significado de `agua_solo_media_pct` muda junto e o treino deixa de valer.
    const { fracoes } = balancoSolo([dia("2026-08-16", { chuvaMm: 0, et0MmDia: 0 })], 60, 12);
    expect(fracoes[0]).toBeCloseTo(0.6, 10);
  });

  it("esvazia na seca e enche na chuva", () => {
    const seco = balancoSolo(
      Array.from({ length: 30 }, (_, i) => dia(datasFuturas[i % 40], { chuvaMm: 0, et0MmDia: 5 })),
      60,
      12,
    );
    const molhado = balancoSolo(
      Array.from({ length: 30 }, (_, i) => dia(datasFuturas[i % 40], { chuvaMm: 20, et0MmDia: 5 })),
      60,
      12,
    );

    expect(seco.fracoes[29]).toBeLessThan(0.1);
    expect(molhado.fracoes[29]).toBeGreaterThan(0.9);
  });

  it("só marca encharcado no terceiro dia seguido de balde cheio com chuva forte", () => {
    const dias = Array.from({ length: 5 }, (_, i) => dia(datasFuturas[i], { chuvaMm: 40, et0MmDia: 0.5 }));
    const { encharcado } = balancoSolo(dias, 40, 12);

    expect(encharcado.slice(0, 2)).toEqual([false, false]);
    expect(encharcado[4]).toBe(true);
  });

  it("gasta mais água com dossel alto: o Kc sobe com a altura inicial", () => {
    const dias = Array.from({ length: 20 }, (_, i) => dia(datasFuturas[i % 40], { chuvaMm: 1, et0MmDia: 4 }));
    const rasteiro = balancoSolo(dias, 60, 4).fracoes[19];
    const alto = balancoSolo(dias, 60, 45).fracoes[19];

    expect(alto).toBeLessThan(rasteiro);
  });

  it("não divide por zero quando a capacidade vem zerada", () => {
    const { fracoes } = balancoSolo([dia("2026-08-16")], 0, 12);
    expect(Number.isFinite(fracoes[0])).toBe(true);
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
    // de água no solo enxerga.
    expect(cheia.map((d) => d.chuvaMm)).toEqual([12, 0, 12, 0, 12]);
    expect(cheia[2].data).toBe(datasFuturas[2]);
  });
});

describe("montarJanela", () => {
  const previsao = Array.from({ length: 16 }, (_, i) => dia(datasFuturas[i]));
  const aquecimento = Array.from({ length: 63 }, (_, i) =>
    dia(`2026-07-${String((i % 30) + 1).padStart(2, "0")}`, { fonte: "observado" }),
  );

  it("não complementa nada quando a previsão já cobre o período", () => {
    const j = montarJanela({ aquecimento, previsao, historico: [], anos: [], total: 10, datas: datasFuturas });

    expect(j.dias).toHaveLength(10);
    expect(j.complemento).toBeNull();
    expect(j.diasPrevistos).toBe(10);
    // O aquecimento atravessa intacto: ele não é parte do período, mas o
    // balanço de água no solo depende dele.
    expect(j.aquecimento).toHaveLength(63);
  });

  it("emenda o histórico depois do último dia previsto, com as datas futuras", () => {
    const historico = Array.from({ length: 20 }, () => dia("2025-09-01", { fonte: "historico", temperaturaC: 18 }));
    const j = montarJanela({ aquecimento, previsao, historico, anos: [2025, 2024], total: 25, datas: datasFuturas });

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
      aquecimento,
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
