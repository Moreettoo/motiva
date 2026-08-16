import { describe, expect, it } from "vitest";

import type { AgendamentoDetalhado, Equipe } from "@/lib/types";

import {
  agendamentosAbertosPorTrecho,
  chaveCelula,
  contarAtrasados,
  diasDeServico,
  fatiasEm,
  idDoGrupo,
  destaqueVisivel,
  linhaDestacada,
  montarGrade,
  montarItens,
  montarJanela,
  ocupaDia,
  previaDeNovoServico,
  previaDoMovimento,
  resolverEquipeFoco,
  resumo28,
  semanaDoAtrasoMaisAntigo,
  type ItemAgenda,
} from "./dados";

/* ---------- fábricas mínimas: só os campos que o modelo lê ---------- */

function equipe(parcial: Partial<Equipe> & { id: number }): Equipe {
  return {
    nome: `Equipe ${parcial.id}`,
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
  /** Por padrão o trecho é o do próprio id; explícito só quando o teste precisa
   *  de dois agendamentos no MESMO trecho. */
  trechoId?: number;
  origem?: AgendamentoDetalhado["origem"];
  /** Vira a `previsao` do agendamento, o caminho reserva de `dispensavel` e de
   *  `riscoDoItem` quando a lista de trechos não traz o trecho. */
  diasAteLimite?: number;
}): AgendamentoDetalhado {
  const eq = p.equipeId == null ? null : { id: p.equipeId, nome: `Equipe ${p.equipeId}`, base_uf: "SP" as const };
  const trechoId = p.trechoId ?? p.id;
  return {
    id: p.id,
    trecho_id: trechoId,
    previsao_id: null,
    data_sugerida: p.data,
    prioridade: "media",
    justificativa: "teste",
    fatores: null,
    status: p.status ?? "sugerido",
    origem: p.origem ?? "ia",
    modelo_usado: null,
    equipe_id: p.equipeId ?? null,
    atualizado_em: null,
    criado_em: "2026-08-01T00:00:00Z",
    trecho: {
      id: trechoId,
      rodovia: `BR-${100 + trechoId}`,
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
    previsao:
      p.diasAteLimite == null
        ? null
        : {
            crescimento_cm_dia: 0.5,
            altura_atual_cm: 12,
            dias_ate_limite: p.diasAteLimite,
            chuva_total_mm: null,
            temperatura_media_c: null,
          },
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

/* ---------- chaves ---------- */

describe("idDoGrupo", () => {
  it("não usa pipe, para o id servir como seletor CSS sem escapar", () => {
    // A chave de MEMÓRIA usa pipe; a de DOM não pode, senão qualquer
    // `querySelector("#" + id)` futuro precisaria de `CSS.escape`, e quem
    // escrever esse seletor daqui a seis meses não vai lembrar.
    expect(chaveCelula("2026-08-13", 7)).toBe("2026-08-13|7");
    expect(idDoGrupo("2026-08-13", 7)).toBe("grupo-2026-08-13-7");
    expect(idDoGrupo("2026-08-13", 7)).not.toContain("|");
  });

  it("distingue dias e equipes diferentes", () => {
    // Colisão aqui daria a duas células o MESMO rótulo acessível, e o segundo
    // grupo herdaria o nome do primeiro sem quebrar nada visível.
    const chaves = new Set([
      idDoGrupo("2026-08-13", 7),
      idDoGrupo("2026-08-13", 8),
      idDoGrupo("2026-08-14", 7),
    ]);
    expect(chaves.size).toBe(3);
  });
});

/* ---------- duração e fatias ---------- */

describe("diasDeServico", () => {
  it("arredonda para cima em dias inteiros", () => {
    // A equipe mobiliza caminhão e sinalização por dia: meio dia ainda ocupa o dia.
    expect(diasDeServico(3, 6)).toBe(1);
    expect(diasDeServico(5, 4.5)).toBe(2);
    expect(diasDeServico(0, 6)).toBe(1);
  });
});

describe("fatiasEm", () => {
  it("reparte os km pelos dias que o serviço ocupa na equipe de destino", () => {
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
  it("conta o serviço iniciado antes da janela que ainda ocupa a equipe", () => {
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

  it("põe o serviço com equipe na célula e o sem equipe SÓ na fila", () => {
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

    // "Só na fila" é o ponto do teste, não um detalhe dele. O serviço 2 tem data
    // DENTRO da janela e nenhuma equipe: era exatamente esse o caso que ganhava
    // um segundo cartão na linha "Propostas da IA" e aparecia duas vezes na
    // mesma tela. Nenhuma célula pode conhecê-lo.
    for (const celula of g.porCelula.values()) {
      expect(celula.itens.map((i) => i.id)).not.toContain(2);
      expect(celula.continuacoes.map((i) => i.id)).not.toContain(2);
    }
  });

  it("aceita `aprovado` sem equipe na fila: são 10 no banco e sumiriam do quadro", () => {
    const lista = itens([agendamento({ id: 3, data: "2026-08-13", equipeId: null, status: "aprovado" })], eqs);
    const g = montarGrade({ itens: lista, equipes: eqs, janela, hoje: "2026-08-13" });
    expect(g.fila.map((i) => i.id)).toEqual([3]);
  });

  it("mantém a fila estável quando a semana muda", () => {
    const lista = itens([agendamento({ id: 4, data: "2026-09-20", equipeId: null })], eqs);
    const g = montarGrade({ itens: lista, equipes: eqs, janela, hoje: "2026-08-13" });
    // A data está a cinco semanas daqui e a fila não é recorte de semana: um
    // backlog que encolhe quando você olha para outra semana não é um backlog.
    expect(g.fila.map((i) => i.id)).toEqual([4]);
  });

  it("não conta serviço sem equipe no cabeçalho do dia", () => {
    const lista = itens(
      [
        agendamento({ id: 1, data: "2026-08-13", equipeId: 1 }),
        agendamento({ id: 2, data: "2026-08-13", equipeId: null }),
      ],
      eqs,
    );

    const g = montarGrade({ itens: lista, equipes: eqs, janela, hoje: "2026-08-13" });
    const coluna = g.porDia.find((d) => d.dia === "2026-08-13");

    // `comEquipe` conta 1, e não 2: o cabeçalho só promete o que a coluna
    // abaixo dele desenha. O serviço 2 está na fila, e a fila fica fora da
    // coluna: ver `ResumoColuna`, em `dados.tsx`.
    expect(coluna?.comEquipe).toBe(1);
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

  it("dá linha a equipe desativada que tem serviço na semana, e só a ela", () => {
    const desativada = equipe({ id: 9, ativo: false });
    const outra = equipe({ id: 8, ativo: false });
    const lista = itens([agendamento({ id: 1, data: "2026-08-13", equipeId: 9 })], [...eqs, desativada, outra]);

    const g = montarGrade({ itens: lista, equipes: [...eqs, desativada, outra], janela, hoje: "2026-08-13" });

    expect(g.linhas.map((l) => l.equipe.id).sort()).toEqual([1, 2, 9]);
    // A equipe desativada guarda o serviço mas não recebe serviço novo.
    expect(g.porCelula.get(chaveCelula("2026-08-14", 9))?.aceitaSolta).toBe(false);
  });

  it("gera uma célula por par dia × equipe, mesmo vazia: toda célula é alvo", () => {
    const g = montarGrade({ itens: [], equipes: eqs, janela, hoje: "2026-08-13" });
    expect(g.porCelula.size).toBe(7 * 2);
    expect(g.linhas[0].celulas).toHaveLength(7);
  });
});

/* ---------- o dia de continuação ---------- */

describe("montarGrade: continuações", () => {
  const lenta = equipe({ id: 1, capacidade_km_dia: 4.5 });
  const janela = montarJanela("2026-08-13");

  it("o dia seguinte de um serviço de 2 dias tem carga sem cartão, e sabe de quem é", () => {
    // 5km na equipe de 4,5km/dia = 2 dias, 2,5km em cada.
    const lista = itens(
      [agendamento({ id: 1, data: "2026-08-13", equipeId: 1, kmInicio: 0, kmFim: 5 })],
      [lenta],
    );
    const g = montarGrade({ itens: lista, equipes: [lenta], janela, hoje: "2026-08-13" });

    const inicio = g.porCelula.get(chaveCelula("2026-08-13", 1));
    const seguinte = g.porCelula.get(chaveCelula("2026-08-14", 1));

    // O cartão desenha SÓ no dia de início; o dia seguinte herda km.
    expect(inicio?.itens.map((i) => i.id)).toEqual([1]);
    expect(inicio?.continuacoes).toEqual([]);
    expect(seguinte?.itens).toEqual([]);
    expect(seguinte?.km).toBeCloseTo(2.5);
    // Sem esta lista o rótulo falado dessa célula dizia "Sem serviço." com a
    // barra mostrando 2,5/4,5, km sem dono.
    expect(seguinte?.continuacoes.map((i) => i.id)).toEqual([1]);
  });

  it("serviço de um dia só não deixa continuação em nenhuma célula", () => {
    const lista = itens([agendamento({ id: 1, data: "2026-08-13", equipeId: 1, kmInicio: 0, kmFim: 3 })], [lenta]);
    const g = montarGrade({ itens: lista, equipes: [lenta], janela, hoje: "2026-08-13" });

    expect([...g.porCelula.values()].every((c) => c.continuacoes.length === 0)).toBe(true);
  });

  it("serviço iniciado FORA da janela nomeia a continuação que caiu dentro dela", () => {
    // 08-09 é domingo, um dia antes do início da janela (08-10): a célula do
    // dia de início não existe, e a de continuação é o único lugar que mostra
    // esse km.
    const lista = itens(
      [agendamento({ id: 1, data: "2026-08-09", equipeId: 1, kmInicio: 0, kmFim: 5 })],
      [lenta],
    );
    const g = montarGrade({ itens: lista, equipes: [lenta], janela, hoje: "2026-08-13" });

    const primeiro = g.porCelula.get(chaveCelula("2026-08-10", 1));
    expect(primeiro?.itens).toEqual([]);
    expect(primeiro?.km).toBeCloseTo(2.5);
    expect(primeiro?.continuacoes.map((i) => i.id)).toEqual([1]);
  });

  it("célula sem cartão pode passar da capacidade: era a frase 'Sem serviço. Acima da capacidade.'", () => {
    // Dois serviços de 5km na mesma equipe de 4,5km/dia: cada um deposita 2,5km
    // no dia seguinte, e 5,0 > 4,5. A célula excede sem ter um único cartão.
    const lista = itens(
      [
        agendamento({ id: 1, data: "2026-08-13", equipeId: 1, kmInicio: 0, kmFim: 5 }),
        agendamento({ id: 2, data: "2026-08-13", equipeId: 1, kmInicio: 0, kmFim: 5 }),
      ],
      [lenta],
    );
    const g = montarGrade({ itens: lista, equipes: [lenta], janela, hoje: "2026-08-13" });

    const seguinte = g.porCelula.get(chaveCelula("2026-08-14", 1));

    expect(seguinte?.itens).toEqual([]);
    expect(seguinte?.excedida).toBe(true);
    expect(seguinte?.continuacoes.map((i) => i.id)).toEqual([1, 2]);
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

  it("marca `algumaExcedida` quando uma equipe passa da capacidade no dia, e só nesse dia", () => {
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
        // da janela das duas chamadas, a equipe inativa qualifica nas duas.
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
    // de 28 dias (08-10, a segunda-feira de "2026-08-13"). Só as FATIAS,
    // não os itens, alcançam o primeiro dia da janela.
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
    // ~7,83km contra 6km/dia de capacidade: excederia, SE a equipe contasse.
    // Mas nenhum dos dois itens tem `data` dentro da janela: a equipe
    // inativa não tem serviço "seu" ali, só sobra de serviço que já tinha
    // começado antes dela, e não ganharia linha nenhuma em `montarGrade`
    // para nenhuma semana que contenha esse dia.
    const faixa = resumo28(lista, "2026-08-13", [inativa]);

    expect(faixa.find((d) => d.dia === "2026-08-10")?.algumaExcedida).toBe(false);
  });
});

/* ---------- destaque de equipe ---------- */

describe("resolverEquipeFoco", () => {
  const eqs = [equipe({ id: 1 }), equipe({ id: 2, ativo: false })];

  it("sem valor na URL, não há destaque", () => {
    expect(resolverEquipeFoco("", eqs)).toBeNull();
  });

  it("resolve o id quando o valor bate com uma equipe existente", () => {
    expect(resolverEquipeFoco("1", eqs)).toBe(1);
  });

  it("equipe desativada ainda resolve: quem decide se ela aparece na semana é a grade", () => {
    expect(resolverEquipeFoco("2", eqs)).toBe(2);
  });

  it("um valor de uma versão anterior do seletor ('sem') degrada para 'sem destaque'", () => {
    expect(resolverEquipeFoco("sem", eqs)).toBeNull();
  });

  it("um id que não existe mais degrada para 'sem destaque', sem lançar", () => {
    expect(resolverEquipeFoco("999", eqs)).toBeNull();
  });
});

describe("linhaDestacada", () => {
  const eqs = [equipe({ id: 1, capacidade_km_dia: 6 }), equipe({ id: 2, capacidade_km_dia: 6 })];
  const janela = montarJanela("2026-08-13");
  const lista = itens([agendamento({ id: 1, data: "2026-08-13", equipeId: 1 })], eqs);
  const grade = montarGrade({ itens: lista, equipes: eqs, janela, hoje: "2026-08-13" });

  /* Substituiu `linhaAtenuada`, e a inversão é a correção de um defeito
     MEDIDO, não uma troca de nome. O destaque marcava as OUTRAS linhas com uma
     veladura preta a 3%, e veladura preta não produz sinal no tema escuro em
     alfa nenhum: medida, a diferença entre linha atenuada e normal é 1,007:1 a
     3% e 1,030:1 a 20%. No claro ela produz sinal, mas já a 6% derruba `ink-3`
     para 4,37:1, abaixo do piso. Não existe alfa simultaneamente legal e
     visível: o mecanismo é incapaz, não mal calibrado.
     A saída é marcar a linha ESCOLHIDA com matiz (`--accent`, 4,82:1 no claro
     e 12,31:1 no escuro sobre a superfície) em vez de apagar as outras com
     luminância. Ver `LinhaTurma`. */

  it("sem equipe em foco, nenhuma linha se destaca", () => {
    expect(linhaDestacada(1, null)).toBe(false);
    expect(linhaDestacada(2, null)).toBe(false);
  });

  it("com equipe em foco, só a linha DELA se destaca", () => {
    expect(linhaDestacada(1, 1)).toBe(true);
    expect(linhaDestacada(2, 1)).toBe(false);
  });

  it("equipe em foco sem NENHUMA linha na semana visível: nada se destaca", () => {
    // id 999 não existe em `grade.linhas`, o caso de um link salvo apontando
    // para uma equipe desativada sem serviço aberto na semana. Nenhuma linha
    // casa o id, então o destaque simplesmente não aparece; é `destaqueVisivel`
    // que conta essa história para quem usa leitor de tela.
    expect(grade.linhas.some((l) => linhaDestacada(l.equipe.id, 999))).toBe(false);
    expect(destaqueVisivel(999, grade.linhas)).toBe(false);
  });

  it("destaqueVisivel diz se a equipe em foco aparece na semana", () => {
    // A pergunta que a região viva precisa responder, e que NÃO é
    // "alguma linha está destacada": com uma linha só, e ela sendo a em foco,
    // o destaque está na tela e o anúncio não pode dizer que a equipe não tem
    // serviço na semana.
    expect(destaqueVisivel(null, grade.linhas)).toBe(false);
    expect(destaqueVisivel(1, grade.linhas)).toBe(true);
    expect(destaqueVisivel(2, grade.linhas)).toBe(true);
    expect(destaqueVisivel(999, grade.linhas)).toBe(false);
  });
});

/* ---------- roçadas vencidas ---------- */

describe("contarAtrasados", () => {
  it("conta vencidos com OU sem equipe atribuída", () => {
    const eqs = [equipe({ id: 1 })];
    const lista = itens(
      [
        agendamento({ id: 1, data: "2026-08-01", equipeId: 1 }), // vencido, com equipe
        agendamento({ id: 2, data: "2026-08-01" }), // vencido, sem equipe
        agendamento({ id: 3, data: "2026-08-20" }), // no futuro
      ],
      eqs,
      "2026-08-13",
    );

    expect(contarAtrasados(lista)).toBe(2);
  });

  it("não conta executado nem descartado, mesmo com data no passado", () => {
    const lista = itens(
      [
        agendamento({ id: 1, data: "2026-08-01", status: "executado" }),
        agendamento({ id: 2, data: "2026-08-01", status: "descartado" }),
      ],
      [],
      "2026-08-13",
    );

    expect(contarAtrasados(lista)).toBe(0);
  });
});

describe("semanaDoAtrasoMaisAntigo", () => {
  it("null sem nenhum atrasado", () => {
    const lista = itens([agendamento({ id: 1, data: "2026-08-20" })], [], "2026-08-13");
    expect(semanaDoAtrasoMaisAntigo(lista)).toBeNull();
  });

  it("segunda-feira da semana do atrasado com a data MAIS ANTIGA, não do mais recente", () => {
    const lista = itens(
      [
        agendamento({ id: 1, data: "2026-07-30" }), // quinta, semana de 2026-07-27
        agendamento({ id: 2, data: "2026-08-05" }), // vencido também, mas mais recente
      ],
      [],
      "2026-08-13",
    );

    expect(semanaDoAtrasoMaisAntigo(lista)).toBe("2026-07-27");
  });
});

/* ---------- roçada manual ---------- */

describe("montarItens · origem manual", () => {
  it("carimba `manual` a partir de `origem`", () => {
    const [daIa, naMao] = itens(
      [
        agendamento({ id: 1, data: "2026-08-20" }),
        agendamento({ id: 2, data: "2026-08-20", origem: "manual" }),
      ],
      [],
    );

    expect(daIa.manual).toBe(false);
    expect(naMao.manual).toBe(true);
  });

  it("NUNCA marca uma roçada manual como dispensável, por folgado que esteja o trecho", () => {
    // 200 dias de folga passa com sobra de `DIAS_FOLGA_DISPENSA` (55), e é o
    // caso TÍPICO da roçada manual, não o excepcional: agenda-se na mão
    // justamente quando o modelo não vê necessidade.
    const [daIa, naMao] = itens(
      [
        agendamento({ id: 1, data: "2026-08-20", diasAteLimite: 200 }),
        agendamento({ id: 2, data: "2026-08-20", diasAteLimite: 200, origem: "manual" }),
      ],
      [],
    );

    expect(daIa.dispensavel).toBe(true);
    expect(naMao.dispensavel).toBe(false);
  });
});

describe("agendamentosAbertosPorTrecho", () => {
  it("mapeia trecho para a data do agendamento aberto", () => {
    const mapa = agendamentosAbertosPorTrecho(
      itens(
        [
          agendamento({ id: 1, data: "2026-08-12" }),
          agendamento({ id: 2, data: "2026-08-18", status: "aprovado" }),
        ],
        [],
      ),
    );

    expect(mapa.get(1)).toBe("2026-08-12");
    expect(mapa.get(2)).toBe("2026-08-18");
  });

  it("ignora executado e descartado: o trecho volta a aceitar roçada nova", () => {
    const mapa = agendamentosAbertosPorTrecho(
      itens(
        [
          agendamento({ id: 1, data: "2026-08-12", status: "executado" }),
          agendamento({ id: 2, data: "2026-08-12", status: "descartado" }),
        ],
        [],
      ),
    );

    expect(mapa.size).toBe(0);
  });

  it("com dois abertos no mesmo trecho, o mais ANTIGO vence", () => {
    // Estado que o índice único parcial do banco não deixa nascer; o desempate
    // existe para o texto do seletor não depender da ordem da consulta.
    const mapa = agendamentosAbertosPorTrecho(
      itens(
        [
          agendamento({ id: 9, data: "2026-08-25", trechoId: 7 }),
          agendamento({ id: 8, data: "2026-08-11", trechoId: 7 }),
        ],
        [],
      ),
    );

    expect(mapa.get(7)).toBe("2026-08-11");
  });
});

describe("previaDeNovoServico", () => {
  const eq = equipe({ id: 1, capacidade_km_dia: 6 });

  // Um serviço de 3 km já alocado nesta equipe em 12/08.
  const jaNaAgenda = itens([agendamento({ id: 1, data: "2026-08-12", equipeId: 1 })], [eq]);

  it("soma a carga que a equipe JÁ tem no dia, e não só o serviço novo", () => {
    const previa = previaDeNovoServico({ itens: jaNaAgenda, equipe: eq, dia: "2026-08-12", km: 3 });

    expect(previa.diasServico).toBe(1);
    expect(previa.dias).toHaveLength(1);
    expect(previa.dias[0].km).toBeCloseTo(6);
    expect(previa.dias[0].capacidade).toBe(6);
    expect(previa.dias[0].excedida).toBe(false); // exatamente na capacidade não excede
  });

  it("acusa excesso quando a soma passa da capacidade", () => {
    const previa = previaDeNovoServico({ itens: jaNaAgenda, equipe: eq, dia: "2026-08-12", km: 4 });

    expect(previa.dias[0].km).toBeCloseTo(7);
    expect(previa.dias[0].excedida).toBe(true);
  });

  it("espalha o km pelos dias de um serviço longo, dia a dia", () => {
    // 9 km a 6 km/dia = 2 dias, 4,5 km em cada. O primeiro dia herda os 3 km
    // que já estavam lá; o segundo começa limpo.
    const previa = previaDeNovoServico({ itens: jaNaAgenda, equipe: eq, dia: "2026-08-12", km: 9 });

    expect(previa.diasServico).toBe(2);
    expect(previa.dias.map((d) => d.dia)).toEqual(["2026-08-12", "2026-08-13"]);
    expect(previa.dias[0].km).toBeCloseTo(7.5);
    expect(previa.dias[0].excedida).toBe(true);
    expect(previa.dias[1].km).toBeCloseTo(4.5);
    expect(previa.dias[1].excedida).toBe(false);
  });

  it("enxerga carga fora da semana visível: a grade não serviria aqui", () => {
    // A `Grade` só cobre 7 dias; agendar para daqui a três semanas é o caso
    // normal desta gaveta, e a prévia não pode ficar muda nele.
    const longe = itens([agendamento({ id: 1, data: "2026-09-15", equipeId: 1 })], [eq]);
    const previa = previaDeNovoServico({ itens: longe, equipe: eq, dia: "2026-09-15", km: 4 });

    expect(previa.dias[0].km).toBeCloseTo(7);
    expect(previa.dias[0].excedida).toBe(true);
  });

  it("ignora serviço de outra equipe e serviço já encerrado", () => {
    const ruido = itens(
      [
        agendamento({ id: 1, data: "2026-08-12", equipeId: 2 }),
        agendamento({ id: 2, data: "2026-08-12", equipeId: 1, status: "executado" }),
      ],
      [eq, equipe({ id: 2, capacidade_km_dia: 6 })],
    );

    const previa = previaDeNovoServico({ itens: ruido, equipe: eq, dia: "2026-08-12", km: 3 });
    expect(previa.dias[0].km).toBeCloseTo(3);
  });
});
