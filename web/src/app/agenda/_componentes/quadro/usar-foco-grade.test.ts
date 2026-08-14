import { describe, expect, it } from "vitest";

import type { AgendamentoDetalhado, Equipe } from "@/lib/types";

import { montarGrade, montarItens, montarJanela, type Grade } from "../dados";
import { decidirCartaoAtivo, idAtivoNoTrilho, idsDoQuadro, idsNasPropostas } from "./usar-foco-grade";

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

/** Nos testes, sem corte de exibição — a fila visível é a fila inteira. */
function decidir(
  grade: Grade,
  p: { anterior: number | null; emVoo: number | null; selecionado: number | null },
): number | null {
  return decidirCartaoAtivo({
    ...p,
    grade,
    filaVisivel: grade.fila,
    idsRenderizados: idsDoQuadro(grade.fila, grade),
  });
}

describe("decidirCartaoAtivo", () => {
  it("o cartão em voo sempre vence, mesmo com selecionado e anterior diferentes", () => {
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }),
    ]);
    expect(decidir(grade, { anterior: 2, emVoo: 1, selecionado: 2 })).toBe(1);
  });

  it("sem cartão em voo, o selecionado vence sobre o anterior", () => {
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }),
    ]);
    expect(decidir(grade, { anterior: 1, emVoo: null, selecionado: 2 })).toBe(2);
  });

  it("sem os dois, mantém o anterior (sticky) enquanto ele existir", () => {
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }),
    ]);
    expect(decidir(grade, { anterior: 2, emVoo: null, selecionado: null })).toBe(2);
  });

  it("cai no padrão (primeiro da fila) quando o anterior sumiu da lista", () => {
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }),
    ]);
    // id 99 não existe mais (por exemplo, foi executado e saiu da lista).
    expect(decidir(grade, { anterior: 99, emVoo: null, selecionado: null })).toBe(1);
  });

  it("cai no primeiro item da grade quando a fila está vazia", () => {
    const grade = montar([agendamento({ id: 2, data: "2026-08-12", equipeId: 1 })]);
    expect(decidir(grade, { anterior: null, emVoo: null, selecionado: null })).toBe(2);
  });

  it("devolve null quando não há nenhum item em lugar nenhum", () => {
    const grade = montar([]);
    expect(decidir(grade, { anterior: null, emVoo: null, selecionado: null })).toBeNull();
  });

  it("não testa contra a lista inteira: um selecionado COM turma que sai da semana visível não trava a grade", () => {
    // Reproduz o bug: item 2 tem turma (não está em `grade.fila`), e sua
    // data (2026-08-12) está na janela VELHA. Simula a troca de semana
    // remontando a grade para uma janela em que esse item não aparece mais.
    const semanaVelha = montar([agendamento({ id: 2, data: "2026-08-12", equipeId: 1 })]);
    expect(decidir(semanaVelha, { anterior: null, emVoo: null, selecionado: 2 })).toBe(2); // existe na semana velha — ok.

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
    expect(decidir(semanaNova, { anterior: null, emVoo: null, selecionado: 2 })).toBe(3);
  });

  it("um id além do corte de exibição do trilho, e fora da semana visível, não trava a grade", () => {
    // Simula o teto do trilho: `filaVisivel` só tem o id 2. O id 1 existe em
    // `grade.fila` mas está "além do teto" — e sua data (fora da janela
    // visível, 2026-08-10 a 2026-08-16) também não o coloca em
    // `grade.propostas`, então ele não tem cartão NENHUM montado na tela.
    const grade = montar([
      agendamento({ id: 1, data: "2026-09-01" }),
      agendamento({ id: 2, data: "2026-08-12" }),
    ]);
    const filaVisivel = [grade.fila.find((i) => i.id === 2)!];
    const idsRenderizados = idsDoQuadro(filaVisivel, grade);
    expect(
      decidirCartaoAtivo({
        anterior: 1,
        emVoo: null,
        selecionado: null,
        filaVisivel,
        grade,
        idsRenderizados,
      }),
    ).toBe(2); // cai no padrão (primeiro da fila VISÍVEL), não trava em tabIndex=-1.
  });

  it("um id além do corte do trilho, mas presente nas propostas desta semana, AINDA valida como ativo", () => {
    // Mesmo corte do teste acima, mas agora a data do id 1 (2026-08-11) CAI
    // na janela visível — ele tem um cartão de verdade na linha "Propostas
    // da IA", mesmo estando fora do corte de exibição do trilho.
    // `idsDoQuadro` precisa unir `grade.propostas`, não só `filaVisivel` e
    // as células, ou este id seria injustamente recusado como ativo.
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-08-12" }),
    ]);
    const filaVisivel = [grade.fila.find((i) => i.id === 2)!];
    const idsRenderizados = idsDoQuadro(filaVisivel, grade);
    expect(
      decidirCartaoAtivo({
        anterior: null,
        emVoo: 1,
        selecionado: null,
        filaVisivel,
        grade,
        idsRenderizados,
      }),
    ).toBe(1);
  });
});

describe("idAtivoNoTrilho", () => {
  it("é null quando o id não está em voo/selecionado/etc.", () => {
    expect(idAtivoNoTrilho(null, new Set())).toBeNull();
  });

  it("mantém o id quando ele NÃO aparece nas propostas desta semana", () => {
    // data fora da janela visível (2026-08-10 a 2026-08-16): não vira proposta.
    const grade = montar([agendamento({ id: 1, data: "2026-09-01" })]);
    expect(idAtivoNoTrilho(1, idsNasPropostas(grade))).toBe(1);
  });

  it("vira null quando o id É o gêmeo mostrado nas propostas desta semana", () => {
    const grade = montar([agendamento({ id: 1, data: "2026-08-11" })]);
    expect(idAtivoNoTrilho(1, idsNasPropostas(grade))).toBeNull();
  });
});
