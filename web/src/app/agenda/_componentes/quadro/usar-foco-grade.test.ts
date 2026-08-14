import { describe, expect, it } from "vitest";

import type { AgendamentoDetalhado, Equipe } from "@/lib/types";

import { montarGrade, montarItens, montarJanela, type Grade, type ItemAgenda } from "../dados";
import { decidirCartaoAtivo } from "./usar-foco-grade";

/* ---------- fábricas mínimas: só os campos que o modelo lê ---------- */

function equipe(parcial: Partial<Equipe> & { id: number }): Equipe {
  return {
    nome: `Turma ${parcial.id}`,
    base_uf: "SP",
    base_cidade: null,
    capacidade_km_dia: 6,
    ativo: true,
    ...parcial,
  } as Equipe;
}

function agendamento(p: { id: number; data: string; equipeId?: number | null }): AgendamentoDetalhado {
  const eq = p.equipeId == null ? null : { id: p.equipeId, nome: `Turma ${p.equipeId}`, base_uf: "SP" as const };
  return {
    id: p.id,
    trecho_id: p.id,
    previsao_id: null,
    data_sugerida: p.data,
    prioridade: "media",
    justificativa: "teste",
    fatores: null,
    status: "sugerido",
    modelo_usado: null,
    equipe_id: p.equipeId ?? null,
    atualizado_em: null,
    criado_em: "2026-08-01T00:00:00Z",
    trecho: {
      id: p.id,
      rodovia: `BR-${100 + p.id}`,
      km_inicio: 10,
      km_fim: 13,
      uf: "SP",
      sentido: null,
      especie: "braquiaria",
      tipo_pista: null,
      altura_limite_cm: 40,
      latitude: -22,
      longitude: -45,
    },
    equipe: eq,
    previsao: null,
  } as AgendamentoDetalhado;
}

const equipes = [equipe({ id: 1 })];
const hoje = "2026-08-13";
const janela = montarJanela(hoje);

function montar(ags: AgendamentoDetalhado[]): { grade: Grade; itens: ItemAgenda[] } {
  const itens = montarItens({ agendamentos: ags, trechos: [], equipes, hoje });
  return { grade: montarGrade({ itens, equipes, janela, hoje }), itens };
}

function porIdDe(itens: ItemAgenda[]): ReadonlyMap<number, ItemAgenda> {
  return new Map(itens.map((i) => [i.id, i]));
}

describe("decidirCartaoAtivo", () => {
  it("o cartão em voo sempre vence, mesmo com selecionado e anterior diferentes", () => {
    const { grade, itens } = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }),
    ]);
    expect(
      decidirCartaoAtivo({ anterior: 2, emVoo: 1, selecionado: 2, grade, porId: porIdDe(itens) }),
    ).toBe(1);
  });

  it("sem cartão em voo, o selecionado vence sobre o anterior", () => {
    const { grade, itens } = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }),
    ]);
    expect(
      decidirCartaoAtivo({ anterior: 1, emVoo: null, selecionado: 2, grade, porId: porIdDe(itens) }),
    ).toBe(2);
  });

  it("sem os dois, mantém o anterior (sticky) enquanto ele existir", () => {
    const { grade, itens } = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }),
    ]);
    expect(
      decidirCartaoAtivo({ anterior: 2, emVoo: null, selecionado: null, grade, porId: porIdDe(itens) }),
    ).toBe(2);
  });

  it("cai no padrão (primeiro da fila) quando o anterior sumiu da lista", () => {
    const { grade, itens } = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }),
    ]);
    // id 99 não existe mais (por exemplo, foi executado e saiu da lista).
    expect(
      decidirCartaoAtivo({ anterior: 99, emVoo: null, selecionado: null, grade, porId: porIdDe(itens) }),
    ).toBe(1);
  });

  it("cai no primeiro item da grade quando a fila está vazia", () => {
    const { grade, itens } = montar([agendamento({ id: 2, data: "2026-08-12", equipeId: 1 })]);
    expect(
      decidirCartaoAtivo({ anterior: null, emVoo: null, selecionado: null, grade, porId: porIdDe(itens) }),
    ).toBe(2);
  });

  it("devolve null quando não há nenhum item em lugar nenhum", () => {
    const { grade, itens } = montar([]);
    expect(
      decidirCartaoAtivo({ anterior: null, emVoo: null, selecionado: null, grade, porId: porIdDe(itens) }),
    ).toBeNull();
  });
});
