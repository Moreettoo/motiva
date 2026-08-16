import { describe, expect, it } from "vitest";

import { parseData } from "@/lib/format";
import type { TrechoStatus } from "@/lib/types";

import { detectarAgrupamentos } from "./agrupamento";

/** Dois trechos vizinhos, mesma rodovia/UF/semana, sempre elegíveis para
 *  agrupamento, só o que muda por teste é data_sugerida/equipe_id. */
function trecho(overrides: Partial<TrechoStatus>): TrechoStatus {
  return {
    id: 1,
    rodovia: "BR-101",
    km_inicio: 10,
    km_fim: 15,
    extensao_km: 5,
    sentido: null,
    agendamento_origem: "ia",
    uf: "SP",
    latitude: 0,
    longitude: 0,
    especie: "braquiaria",
    altura_limite_cm: 30,
    tipo_pista: null,
    observacoes: null,
    altura_atual_cm: null,
    crescimento_cm_dia: null,
    dias_ate_limite: null,
    temperatura_media_c: null,
    chuva_total_mm: null,
    previsto_em: null,
    medido_em: null,
    altura_medida_cm: null,
    rocado_em: null,
    agendamento_id: null,
    data_sugerida: "2026-08-17",
    prioridade: "alta",
    justificativa: null,
    fatores: null,
    agendamento_status: "aprovado",
    equipe_id: 1,
    equipe_nome: "Equipe Alfa",
    ocupacao_pct: null,
    risco: "alta",
    ...overrides,
  };
}

const HOJE = parseData("2026-08-10");

describe("detectarAgrupamentos: resolvido", () => {
  it("marca resolvido quando os dois trechos já estão na mesma data e equipe", () => {
    const trechos = [
      trecho({ id: 1, km_inicio: 10, km_fim: 15 }),
      trecho({ id: 2, km_inicio: 20, km_fim: 25 }),
    ];

    const [grupo] = detectarAgrupamentos(trechos, HOJE);

    expect(grupo.resolvido).toEqual({ data: "2026-08-17", equipeNome: "Equipe Alfa" });
  });

  it("não marca resolvido quando as equipes são diferentes", () => {
    const trechos = [
      trecho({ id: 1, km_inicio: 10, km_fim: 15, equipe_id: 1, equipe_nome: "Equipe Alfa" }),
      trecho({ id: 2, km_inicio: 20, km_fim: 25, equipe_id: 2, equipe_nome: "Equipe Beta" }),
    ];

    const [grupo] = detectarAgrupamentos(trechos, HOJE);

    expect(grupo.resolvido).toBeNull();
  });

  it("não marca resolvido quando as datas são diferentes", () => {
    const trechos = [
      trecho({ id: 1, km_inicio: 10, km_fim: 15, data_sugerida: "2026-08-17" }),
      trecho({ id: 2, km_inicio: 20, km_fim: 25, data_sugerida: "2026-08-18" }),
    ];

    const [grupo] = detectarAgrupamentos(trechos, HOJE);

    expect(grupo.resolvido).toBeNull();
  });

  it("não marca resolvido quando um trecho ainda não tem equipe atribuída", () => {
    const trechos = [
      trecho({ id: 1, km_inicio: 10, km_fim: 15, equipe_id: 1, equipe_nome: "Equipe Alfa" }),
      trecho({ id: 2, km_inicio: 20, km_fim: 25, equipe_id: null, equipe_nome: null }),
    ];

    const [grupo] = detectarAgrupamentos(trechos, HOJE);

    expect(grupo.resolvido).toBeNull();
  });
});

describe("detectarAgrupamentos: ordenação", () => {
  it("mantém grupos pendentes antes dos resolvidos, mesmo com risco pior", () => {
    const resolvidoCritico = [
      trecho({
        id: 1,
        rodovia: "AA-000",
        km_inicio: 10,
        km_fim: 15,
        risco: "critica",
        equipe_id: 1,
        equipe_nome: "Equipe Alfa",
      }),
      trecho({
        id: 2,
        rodovia: "AA-000",
        km_inicio: 20,
        km_fim: 25,
        risco: "critica",
        equipe_id: 1,
        equipe_nome: "Equipe Alfa",
      }),
    ];
    const pendenteMenosUrgente = [
      trecho({
        id: 3,
        rodovia: "BB-000",
        km_inicio: 10,
        km_fim: 15,
        risco: "media",
        equipe_id: null,
        equipe_nome: null,
      }),
      trecho({
        id: 4,
        rodovia: "BB-000",
        km_inicio: 20,
        km_fim: 25,
        risco: "media",
        equipe_id: null,
        equipe_nome: null,
      }),
    ];

    const grupos = detectarAgrupamentos([...resolvidoCritico, ...pendenteMenosUrgente], HOJE);

    expect(grupos.map((g) => g.rodovia)).toEqual(["BB-000", "AA-000"]);
  });
});
