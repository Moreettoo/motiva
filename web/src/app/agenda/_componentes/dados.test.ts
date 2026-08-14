import { describe, expect, it } from "vitest";

import type { AgendamentoDetalhado, Equipe } from "@/lib/types";

import {
  chaveCelula,
  diasDeServico,
  fatiasEm,
  montarGrade,
  montarItens,
  montarJanela,
  ocupaDia,
  previaDoMovimento,
  resumo28,
  type ItemAgenda,
} from "./dados";

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

function agendamento(p: {
  id: number;
  data: string;
  equipeId?: number | null;
  kmInicio?: number;
  kmFim?: number;
  status?: AgendamentoDetalhado["status"];
}): AgendamentoDetalhado {
  const eq = p.equipeId == null ? null : { id: p.equipeId, nome: `Turma ${p.equipeId}`, base_uf: "SP" as const };
  return {
    id: p.id,
    trecho_id: p.id,
    previsao_id: null,
    data_sugerida: p.data,
    prioridade: "media",
    justificativa: "teste",
    fatores: null,
    status: p.status ?? "sugerido",
    modelo_usado: null,
    equipe_id: p.equipeId ?? null,
    atualizado_em: null,
    criado_em: "2026-08-01T00:00:00Z",
    trecho: {
      id: p.id,
      rodovia: `BR-${100 + p.id}`,
      km_inicio: p.kmInicio ?? 10,
      km_fim: p.kmFim ?? 13,
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

function itens(ags: AgendamentoDetalhado[], eqs: Equipe[], hoje = "2026-08-13"): ItemAgenda[] {
  return montarItens({ agendamentos: ags, trechos: [], equipes: eqs, hoje });
}

/* ---------- janela ---------- */

describe("montarJanela", () => {
  it("abre na segunda-feira da semana da âncora", () => {
    // 2026-08-13 é uma quinta-feira; a segunda da semana é 2026-08-10.
    const j = montarJanela("2026-08-13");
    expect(j.dias).toHaveLength(7);
    expect(j.inicio).toBe("2026-08-10");
    expect(j.fim).toBe("2026-08-16");
  });

  it("navega para a semana seguinte pela âncora, sem depender de hoje", () => {
    expect(montarJanela("2026-08-17").inicio).toBe("2026-08-17");
  });

  it("mantém a segunda-feira quando a âncora já é segunda", () => {
    expect(montarJanela("2026-08-10").inicio).toBe("2026-08-10");
  });
});

/* ---------- duração e fatias ---------- */

describe("diasDeServico", () => {
  it("arredonda para cima em dias inteiros", () => {
    // A turma mobiliza caminhão e sinalização por dia: meio dia ainda ocupa o dia.
    expect(diasDeServico(3, 6)).toBe(1);
    expect(diasDeServico(5, 4.5)).toBe(2);
    expect(diasDeServico(0, 6)).toBe(1);
  });
});

describe("fatiasEm", () => {
  it("reparte os km pelos dias que o serviço ocupa na turma de destino", () => {
    const eq = equipe({ id: 1, capacidade_km_dia: 4.5 });
    const [item] = itens([agendamento({ id: 1, data: "2026-08-13", kmInicio: 0, kmFim: 5 })], [eq]);

    const fatias = fatiasEm(item, "2026-08-13", eq);

    expect(fatias).toHaveLength(2);
    expect(fatias[0]).toMatchObject({ dia: "2026-08-13", equipeId: 1, km: 2.5 });
    expect(fatias[1]).toMatchObject({ dia: "2026-08-14", equipeId: 1, km: 2.5 });
  });

  it("recalcula a duração pela capacidade do destino, não pela da origem", () => {
    const lenta = equipe({ id: 1, capacidade_km_dia: 4.5 });
    const rapida = equipe({ id: 2, capacidade_km_dia: 11 });
    const [item] = itens([agendamento({ id: 1, data: "2026-08-13", kmInicio: 0, kmFim: 5, equipeId: 1 })], [lenta, rapida]);

    expect(fatiasEm(item, "2026-08-13", lenta)).toHaveLength(2);
    expect(fatiasEm(item, "2026-08-13", rapida)).toHaveLength(1);
  });
});

describe("ocupaDia", () => {
  it("conta o serviço iniciado antes da janela que ainda ocupa a turma", () => {
    const eq = equipe({ id: 1, capacidade_km_dia: 4.5 });
    const [item] = itens([agendamento({ id: 1, data: "2026-08-09", kmInicio: 0, kmFim: 5 })], [eq]);

    // Domingo 09 e segunda 10: o serviço de 2 dias atravessa a virada da janela.
    expect(ocupaDia(item, "2026-08-09")).toBe(true);
    expect(ocupaDia(item, "2026-08-10")).toBe(true);
    expect(ocupaDia(item, "2026-08-11")).toBe(false);
  });
});

/* ---------- grade ---------- */

describe("montarGrade", () => {
  const eqs = [equipe({ id: 1, capacidade_km_dia: 6 }), equipe({ id: 2, capacidade_km_dia: 11 })];
  const janela = montarJanela("2026-08-13");

  it("põe o serviço com equipe na célula e o sem equipe na fila e nas propostas", () => {
    const lista = itens(
      [
        agendamento({ id: 1, data: "2026-08-13", equipeId: 1 }),
        agendamento({ id: 2, data: "2026-08-13", equipeId: null }),
      ],
      eqs,
    );

    const g = montarGrade({ itens: lista, equipes: eqs, janela, hoje: "2026-08-13" });

    expect(g.porCelula.get(chaveCelula("2026-08-13", 1))?.itens.map((i) => i.id)).toEqual([1]);
    expect(g.fila.map((i) => i.id)).toEqual([2]);
    expect(g.propostas.get("2026-08-13")?.map((i) => i.id)).toEqual([2]);
  });

  it("aceita `aprovado` sem equipe na fila — são 10 no banco e sumiriam do quadro", () => {
    const lista = itens([agendamento({ id: 3, data: "2026-08-13", equipeId: null, status: "aprovado" })], eqs);
    const g = montarGrade({ itens: lista, equipes: eqs, janela, hoje: "2026-08-13" });
    expect(g.fila.map((i) => i.id)).toEqual([3]);
  });

  it("mantém a fila estável quando a semana muda", () => {
    const lista = itens([agendamento({ id: 4, data: "2026-09-20", equipeId: null })], eqs);
    const g = montarGrade({ itens: lista, equipes: eqs, janela, hoje: "2026-08-13" });
    // A data está a cinco semanas daqui: some das propostas, permanece na fila.
    expect(g.fila.map((i) => i.id)).toEqual([4]);
    expect(g.propostas.size).toBe(0);
  });

  it("marca a célula excedida e calcula a ocupação", () => {
    const lista = itens(
      [
        agendamento({ id: 1, data: "2026-08-13", equipeId: 1, kmInicio: 0, kmFim: 4 }),
        agendamento({ id: 2, data: "2026-08-13", equipeId: 1, kmInicio: 0, kmFim: 3 }),
      ],
      eqs,
    );

    const c = montarGrade({ itens: lista, equipes: eqs, janela, hoje: "2026-08-13" }).porCelula.get(
      chaveCelula("2026-08-13", 1),
    );

    expect(c?.km).toBeCloseTo(7);
    expect(c?.ocupacao).toBeCloseTo((7 / 6) * 100);
    expect(c?.excedida).toBe(true);
  });

  it("recusa solta em dia anterior a hoje", () => {
    const g = montarGrade({ itens: [], equipes: eqs, janela, hoje: "2026-08-13" });
    expect(g.porCelula.get(chaveCelula("2026-08-10", 1))?.aceitaSolta).toBe(false);
    expect(g.porCelula.get(chaveCelula("2026-08-13", 1))?.aceitaSolta).toBe(true);
    expect(g.porCelula.get(chaveCelula("2026-08-14", 1))?.aceitaSolta).toBe(true);
  });

  it("dá linha a turma desativada que tem serviço na semana, e só a ela", () => {
    const desativada = equipe({ id: 9, ativo: false });
    const outra = equipe({ id: 8, ativo: false });
    const lista = itens([agendamento({ id: 1, data: "2026-08-13", equipeId: 9 })], [...eqs, desativada, outra]);

    const g = montarGrade({ itens: lista, equipes: [...eqs, desativada, outra], janela, hoje: "2026-08-13" });

    expect(g.linhas.map((l) => l.equipe.id).sort()).toEqual([1, 2, 9]);
    // A turma desativada guarda o serviço mas não recebe serviço novo.
    expect(g.porCelula.get(chaveCelula("2026-08-14", 9))?.aceitaSolta).toBe(false);
  });

  it("gera uma célula por par dia × turma, mesmo vazia — toda célula é alvo", () => {
    const g = montarGrade({ itens: [], equipes: eqs, janela, hoje: "2026-08-13" });
    expect(g.porCelula.size).toBe(7 * 2);
    expect(g.linhas[0].celulas).toHaveLength(7);
  });
});

/* ---------- prévia ---------- */

describe("previaDoMovimento", () => {
  const eqs = [equipe({ id: 1, capacidade_km_dia: 6 }), equipe({ id: 2, capacidade_km_dia: 11 })];
  const janela = montarJanela("2026-08-13");

  it("tira da origem e põe no destino", () => {
    const lista = itens([agendamento({ id: 1, data: "2026-08-13", equipeId: 1, kmInicio: 0, kmFim: 3 })], eqs);
    const g = montarGrade({ itens: lista, equipes: eqs, janela, hoje: "2026-08-13" });

    const previa = previaDoMovimento(g, lista[0], chaveCelula("2026-08-14", 2), eqs);

    expect(previa.get(chaveCelula("2026-08-13", 1))?.km).toBeCloseTo(0);
    expect(previa.get(chaveCelula("2026-08-14", 2))?.km).toBeCloseTo(3);
  });

  it("devolve mapa vazio quando origem e destino são a mesma célula", () => {
    const lista = itens([agendamento({ id: 1, data: "2026-08-13", equipeId: 1 })], eqs);
    const g = montarGrade({ itens: lista, equipes: eqs, janela, hoje: "2026-08-13" });

    expect(previaDoMovimento(g, lista[0], chaveCelula("2026-08-13", 1), eqs).size).toBe(0);
  });

  it("mostra o excesso antes de soltar", () => {
    const lista = itens(
      [
        agendamento({ id: 1, data: "2026-08-13", equipeId: 1, kmInicio: 0, kmFim: 5 }),
        agendamento({ id: 2, data: "2026-08-14", equipeId: null, kmInicio: 0, kmFim: 4 }),
      ],
      eqs,
    );
    const g = montarGrade({ itens: lista, equipes: eqs, janela, hoje: "2026-08-13" });

    const previa = previaDoMovimento(g, lista[1], chaveCelula("2026-08-13", 1), eqs);

    expect(previa.get(chaveCelula("2026-08-13", 1))?.excedida).toBe(true);
  });
});

/* ---------- faixa de 28 dias ---------- */

describe("resumo28", () => {
  it("cobre 28 dias a partir da segunda-feira da âncora", () => {
    const r = resumo28([], "2026-08-13", []);
    expect(r).toHaveLength(28);
    expect(r[0].dia).toBe("2026-08-10");
    expect(r[27].dia).toBe("2026-09-06");
  });

  it("separa alocado de não alocado", () => {
    const eqs = [equipe({ id: 1 })];
    const lista = itens(
      [
        agendamento({ id: 1, data: "2026-08-12", equipeId: 1 }),
        agendamento({ id: 2, data: "2026-08-12", equipeId: null }),
        agendamento({ id: 3, data: "2026-08-12", equipeId: null }),
      ],
      eqs,
    );

    const dia = resumo28(lista, "2026-08-13", eqs).find((d) => d.dia === "2026-08-12");

    expect(dia).toMatchObject({ comEquipe: 1, semEquipe: 2 });
  });

  it("marca `algumaExcedida` quando uma turma passa da capacidade no dia, e só nesse dia", () => {
    const eqs = [equipe({ id: 1, capacidade_km_dia: 6 })];
    const lista = itens(
      [
        // 4 + 3 = 7km no dia 12, contra 6km/dia de capacidade: excede.
        agendamento({ id: 1, data: "2026-08-12", equipeId: 1, kmInicio: 0, kmFim: 4 }),
        agendamento({ id: 2, data: "2026-08-12", equipeId: 1, kmInicio: 0, kmFim: 3 }),
        // 3km no dia 13, dentro da capacidade: não excede.
        agendamento({ id: 3, data: "2026-08-13", equipeId: 1, kmInicio: 0, kmFim: 3 }),
      ],
      eqs,
    );

    const r = resumo28(lista, "2026-08-13", eqs);

    expect(r.find((d) => d.dia === "2026-08-12")?.algumaExcedida).toBe(true);
    expect(r.find((d) => d.dia === "2026-08-13")?.algumaExcedida).toBe(false);
  });
});

/* ---------- montarGrade e resumo28 têm que concordar sobre quem conta ---------- */

describe("equipesComLinha compartilhada entre montarGrade e resumo28", () => {
  it("equipe inativa com serviço na janela: grade da semana e faixa de 28 dias concordam sobre o dia excedido", () => {
    const inativa = equipe({ id: 9, ativo: false, capacidade_km_dia: 6 });
    const lista = itens(
      [
        // 4 + 3 = 7km no dia 13, contra 6km/dia: excede. `data` está dentro
        // da janela das duas chamadas — a equipe inativa qualifica nas duas.
        agendamento({ id: 1, data: "2026-08-13", equipeId: 9, kmInicio: 0, kmFim: 4 }),
        agendamento({ id: 2, data: "2026-08-13", equipeId: 9, kmInicio: 0, kmFim: 3 }),
      ],
      [inativa],
    );

    const janela = montarJanela("2026-08-13");
    const grade = montarGrade({ itens: lista, equipes: [inativa], janela, hoje: "2026-08-13" });
    const faixa = resumo28(lista, "2026-08-13", [inativa]);

    const diaGrade = grade.porDia.find((d) => d.dia === "2026-08-13")?.algumaExcedida;
    const diaFaixa = faixa.find((d) => d.dia === "2026-08-13")?.algumaExcedida;

    expect(diaGrade).toBe(true);
    expect(diaFaixa).toBe(true);
  });

  it("não conta equipe inativa sem NENHUM serviço dentro da janela de 28 dias, mesmo com fatia antiga vazando para dentro dela", () => {
    // As duas datas de início (08-08 e 08-09) ficam ANTES do início da janela
    // de 28 dias (08-10, a segunda-feira de "2026-08-13"). Só as FATIAS —
    // não os itens — alcançam o primeiro dia da janela.
    const inativa = equipe({ id: 9, ativo: false, capacidade_km_dia: 6 });
    const lista = itens(
      [
        // 13km / 6 por dia = 3 dias: 08-08, 08-09, 08-10 (~4,33km cada fatia).
        agendamento({ id: 1, data: "2026-08-08", equipeId: 9, kmInicio: 0, kmFim: 13 }),
        // 7km / 6 por dia = 2 dias: 08-09, 08-10 (3,5km cada fatia).
        agendamento({ id: 2, data: "2026-08-09", equipeId: 9, kmInicio: 0, kmFim: 7 }),
      ],
      [inativa],
    );

    // No dia 08-10 (primeiro dia da janela de 28), as duas fatias somam
    // ~7,83km contra 6km/dia de capacidade — excederia, SE a equipe contasse.
    // Mas nenhum dos dois itens tem `data` dentro da janela: a equipe
    // inativa não tem serviço "seu" ali, só sobra de serviço que já tinha
    // começado antes dela — e não ganharia linha nenhuma em `montarGrade`
    // para nenhuma semana que contenha esse dia.
    const faixa = resumo28(lista, "2026-08-13", [inativa]);

    expect(faixa.find((d) => d.dia === "2026-08-10")?.algumaExcedida).toBe(false);
  });
});
