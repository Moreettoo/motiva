import { describe, expect, it } from "vitest";

import type { AgendamentoDetalhado, Equipe } from "@/lib/types";

import { montarGrade, montarItens, montarJanela, type Grade } from "../dados";
import { decidirCartaoAtivo, idAtivoNoTrilho } from "./usar-foco-grade";

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
// Janela visível: 2026-08-10 (segunda) a 2026-08-16 (domingo).
const janela = montarJanela(hoje);

function montar(ags: AgendamentoDetalhado[]): Grade {
  const itens = montarItens({ agendamentos: ags, trechos: [], equipes, hoje });
  return montarGrade({ itens, equipes, janela, hoje });
}

describe("decidirCartaoAtivo", () => {
  it("o cartão em voo sempre vence, mesmo com selecionado e anterior diferentes", () => {
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }),
    ]);
    expect(decidirCartaoAtivo({ anterior: 2, emVoo: 1, selecionado: 2, grade })).toBe(1);
  });

  it("sem cartão em voo, o selecionado vence sobre o anterior", () => {
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }),
    ]);
    expect(decidirCartaoAtivo({ anterior: 1, emVoo: null, selecionado: 2, grade })).toBe(2);
  });

  it("sem os dois, mantém o anterior (sticky) enquanto ele existir", () => {
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }),
    ]);
    expect(decidirCartaoAtivo({ anterior: 2, emVoo: null, selecionado: null, grade })).toBe(2);
  });

  it("cai no padrão (primeiro da fila) quando o anterior sumiu da lista", () => {
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }),
    ]);
    // id 99 não existe mais (por exemplo, foi executado e saiu da lista).
    expect(decidirCartaoAtivo({ anterior: 99, emVoo: null, selecionado: null, grade })).toBe(1);
  });

  it("cai no primeiro item da grade quando a fila está vazia", () => {
    const grade = montar([agendamento({ id: 2, data: "2026-08-12", equipeId: 1 })]);
    expect(decidirCartaoAtivo({ anterior: null, emVoo: null, selecionado: null, grade })).toBe(2);
  });

  it("devolve null quando não há nenhum item em lugar nenhum", () => {
    const grade = montar([]);
    expect(decidirCartaoAtivo({ anterior: null, emVoo: null, selecionado: null, grade })).toBeNull();
  });

  it("não testa contra a lista inteira: um selecionado COM turma que sai da semana visível não trava a grade", () => {
    // Reproduz o bug: item 2 tem turma (não está em `grade.fila`), e sua
    // data (2026-08-12) está na janela VELHA. Simula a troca de semana
    // remontando a grade para uma janela em que esse item não aparece mais.
    const semanaVelha = montar([agendamento({ id: 2, data: "2026-08-12", equipeId: 1 })]);
    expect(decidirCartaoAtivo({ anterior: null, emVoo: null, selecionado: 2, grade: semanaVelha })).toBe(
      2,
    ); // existe na semana velha — ok.

    const itensProximaSemana = montarItens({
      agendamentos: [agendamento({ id: 3, data: "2026-08-20", equipeId: 1 })],
      trechos: [],
      equipes,
      hoje,
    });
    const semanaNova = montarGrade({
      itens: itensProximaSemana,
      equipes,
      janela: montarJanela("2026-08-20"),
      hoje,
    });
    // O id 2 (selecionado) não existe na grade nova — precisa cair no
    // padrão da grade nova (id 3), não ficar preso a um id fantasma.
    expect(decidirCartaoAtivo({ anterior: null, emVoo: null, selecionado: 2, grade: semanaNova })).toBe(
      3,
    );
  });
});

describe("idAtivoNoTrilho", () => {
  it("é null quando o id não está em voo/selecionado/etc.", () => {
    const grade = montar([agendamento({ id: 1, data: "2026-08-11" })]);
    expect(idAtivoNoTrilho(null, grade)).toBeNull();
  });

  it("mantém o id quando ele NÃO aparece nas propostas desta semana", () => {
    // data fora da janela visível (2026-08-10 a 2026-08-16): não vira proposta.
    const grade = montar([agendamento({ id: 1, data: "2026-09-01" })]);
    expect(idAtivoNoTrilho(1, grade)).toBe(1);
  });

  it("vira null quando o id É o gêmeo mostrado nas propostas desta semana", () => {
    const grade = montar([agendamento({ id: 1, data: "2026-08-11" })]);
    expect(idAtivoNoTrilho(1, grade)).toBeNull();
  });
});
