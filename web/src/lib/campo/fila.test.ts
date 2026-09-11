import { describe, expect, it } from "vitest";

import type { StatusChamado } from "@/lib/types";

import type { ChamadoCampo, ItemFila, TipoEventoCampo, TrechoCampo } from "./contratos";
import { agruparChamados, aplicarPendencias, esperaAntesDaTentativa, ordenarFila, podeTentarAgora, recusaPermanente, resumoPendencias } from "./fila";

const TRECHO: TrechoCampo = {
  id: 1, rodovia: "BR-101", km_inicio: 10, km_fim: 14, uf: "SP", sentido: "norte",
  especie: "braquiaria", altura_limite_cm: 50, latitude: -22.9, longitude: -47.1, observacoes: null,
};

function chamado(id: number, status: StatusChamado, data_sugerida: string, extra: Partial<ChamadoCampo> = {}): ChamadoCampo {
  return {
    id, numero: "2026-" + String(id).padStart(4, "0"), status, trecho: TRECHO, data_sugerida,
    prioridade: "media", justificativa: "cruza o limite em 12 dias",
    altura_inicial_cm: 32, altura_inicial_origem: "prevista", altura_final_cm: null,
    iniciado_em: null, finalizado_em: null, comentario_gestor: null, adiamento_pendente: null,
    atualizado_em: data_sugerida + "T09:00:00.000Z", ...extra,
  };
}

function item(evento_id: string, chamado_id: number, tipo: TipoEventoCampo, criado_em: string, extra: Partial<ItemFila> = {}): ItemFila {
  return {
    evento_id, chamado_id, tipo, payload: {}, ocorrido_em: criado_em,
    fotos: [], tentativas: 0, ultimo_erro: null, criado_em, ...extra,
  };
}

describe("ordenarFila", () => {
  it("ordena por criado_em, do mais antigo para o mais novo", () => {
    const fila = [
      item("c", 3, "iniciado", "2026-09-10T12:00:00.000Z"),
      item("a", 1, "iniciado", "2026-09-10T08:00:00.000Z"),
      item("b", 2, "iniciado", "2026-09-10T10:00:00.000Z"),
    ];
    expect(ordenarFila(fila).map((i) => i.evento_id)).toEqual(["a", "b", "c"]);
  });

  it("nao altera o arranjo recebido", () => {
    const fila = [item("b", 2, "iniciado", "2026-09-10T10:00:00.000Z"), item("a", 1, "iniciado", "2026-09-10T08:00:00.000Z")];
    ordenarFila(fila);
    expect(fila.map((i) => i.evento_id)).toEqual(["b", "a"]);
  });
});

describe("aplicarPendencias", () => {
  it("leva aberto + iniciado para em_andamento", () => {
    const saida = aplicarPendencias([chamado(1, "aberto", "2026-09-10")], [item("e1", 1, "iniciado", "2026-09-10T08:00:00.000Z")]);
    expect(saida[0].status).toBe("em_andamento");
  });

  it("leva em_andamento + finalizado para aguardando_aprovacao e guarda a altura final", () => {
    const saida = aplicarPendencias(
      [chamado(1, "em_andamento", "2026-09-10")],
      [item("e1", 1, "finalizado", "2026-09-10T11:00:00.000Z", { payload: { altura_final_cm: 8 } })],
    );
    expect(saida[0].status).toBe("aguardando_aprovacao");
    expect(saida[0].altura_final_cm).toBe(8);
  });

  it("leva aberto + adiamento_solicitado para adiamento_solicitado", () => {
    const saida = aplicarPendencias([chamado(1, "aberto", "2026-09-10")], [item("e1", 1, "adiamento_solicitado", "2026-09-10T08:00:00.000Z")]);
    expect(saida[0].status).toBe("adiamento_solicitado");
  });

  it("encadeia dois eventos do mesmo chamado na ordem da fila, nao na ordem do arranjo", () => {
    const saida = aplicarPendencias(
      [chamado(1, "aberto", "2026-09-10")],
      [
        item("e2", 1, "finalizado", "2026-09-10T11:00:00.000Z"),
        item("e1", 1, "iniciado", "2026-09-10T08:00:00.000Z"),
      ],
    );
    expect(saida[0].status).toBe("aguardando_aprovacao");
  });

  it("ignora item de chamado ausente e mantem o resto intacto", () => {
    const saida = aplicarPendencias(
      [chamado(1, "aberto", "2026-09-10"), chamado(2, "aberto", "2026-09-11")],
      [item("e1", 99, "iniciado", "2026-09-10T08:00:00.000Z")],
    );
    expect(saida.map((c) => [c.id, c.status])).toEqual([[1, "aberto"], [2, "aberto"]]);
  });

  it("nao mexe no status quando a transicao e invalida", () => {
    const saida = aplicarPendencias([chamado(1, "concluido", "2026-09-10")], [item("e1", 1, "iniciado", "2026-09-10T08:00:00.000Z")]);
    expect(saida[0].status).toBe("concluido");
  });

  it("nao altera os chamados recebidos", () => {
    const chamados = [chamado(1, "aberto", "2026-09-10")];
    aplicarPendencias(chamados, [item("e1", 1, "iniciado", "2026-09-10T08:00:00.000Z")]);
    expect(chamados[0].status).toBe("aberto");
  });
});

describe("resumoPendencias", () => {
  it("conta os itens e, separadamente, os que tem ultimo_erro", () => {
    const fila = [
      item("a", 1, "iniciado", "2026-09-10T08:00:00.000Z"),
      item("b", 2, "iniciado", "2026-09-10T09:00:00.000Z", { ultimo_erro: "falha de rede" }),
      item("c", 3, "iniciado", "2026-09-10T10:00:00.000Z", { ultimo_erro: "faltam as duas fotos" }),
    ];
    expect(resumoPendencias(fila)).toEqual({ total: 3, comErro: 2 });
  });

  it("fila vazia e zero em tudo", () => {
    expect(resumoPendencias([])).toEqual({ total: 0, comErro: 0 });
  });
});

describe("esperaAntesDaTentativa", () => {
  it("cresce ate o teto de 120 s e para la", () => {
    expect([0, 1, 2, 3, 4, 5].map((n) => esperaAntesDaTentativa(n))).toEqual([0, 2000, 8000, 30000, 120000, 120000]);
  });
});

describe("podeTentarAgora", () => {
  const criado = "2026-09-10T08:00:00.000Z";
  const t = (iso: string) => new Date(iso).getTime();

  it("item que nunca foi tentado sai na hora", () => {
    expect(podeTentarAgora(item("a", 1, "iniciado", criado), t("2026-09-10T08:00:00.000Z"))).toBe(true);
  });

  it("conta da ultima tentativa, nao da criacao", () => {
    /* Este e o defeito que existia: com `criado_em` como base, um item criado
       ha uma hora tinha `criado_em + 120 s` sempre no passado e era liberado na
       hora, por mais que acabasse de falhar — a espera exponencial nao existia. */
    const i = item("a", 1, "iniciado", criado, { tentativas: 4, ultima_tentativa_em: "2026-09-10T09:00:00.000Z" });
    expect(podeTentarAgora(i, t("2026-09-10T09:01:00.000Z"))).toBe(false);
    expect(podeTentarAgora(i, t("2026-09-10T09:02:00.000Z"))).toBe(true);
  });

  it("respeita a espera de cada degrau", () => {
    const i = (tentativas: number) => item("a", 1, "iniciado", criado, { tentativas, ultima_tentativa_em: criado });
    expect(podeTentarAgora(i(1), t("2026-09-10T08:00:01.000Z"))).toBe(false);
    expect(podeTentarAgora(i(1), t("2026-09-10T08:00:02.000Z"))).toBe(true);
    expect(podeTentarAgora(i(3), t("2026-09-10T08:00:29.000Z"))).toBe(false);
    expect(podeTentarAgora(i(3), t("2026-09-10T08:00:30.000Z"))).toBe(true);
  });

  /* Item enfileirado por uma versao anterior do app nao tem o campo. Tentar
     cedo demais e o erro seguro; travar a fila do dia seria o inseguro. */
  it("item antigo, sem ultima_tentativa_em, cai em criado_em", () => {
    const i = item("a", 1, "iniciado", criado, { tentativas: 1 });
    expect(podeTentarAgora(i, t("2026-09-10T08:00:01.000Z"))).toBe(false);
    expect(podeTentarAgora(i, t("2026-09-10T08:00:05.000Z"))).toBe(true);
  });
});

describe("agruparChamados", () => {
  const hoje = "2026-09-10";
  const chamados = [
    chamado(1, "aberto", "2026-09-10"),
    chamado(2, "em_andamento", "2026-09-08"),
    chamado(3, "aberto", "2026-09-12"),
    chamado(4, "aguardando_aprovacao", "2026-09-09"),
    chamado(5, "devolvido", "2026-09-07"),
    chamado(6, "concluido", "2026-09-06"),
    chamado(7, "cancelado", "2026-09-05"),
    chamado(8, "adiamento_solicitado", "2026-09-10"),
  ];

  it("separa por data e por status", () => {
    const g = agruparChamados(chamados, hoje);
    expect(g.hoje.map((c) => c.id)).toEqual([1]);
    expect(g.atrasados.map((c) => c.id)).toEqual([2]);
    expect(g.proximos.map((c) => c.id)).toEqual([3]);
    // 8 e `adiamento_solicitado`: a bola esta com o gestor, nao com a equipe.
    expect(g.aguardando.map((c) => c.id)).toEqual([5, 4, 8]);
    expect(g.recentes.map((c) => c.id)).toEqual([6, 7]);
  });

  /* Medido na malha de demonstracao: CH-2026-0008 (adiamento_solicitado, data
     vencida) saia em "Atrasados" com o chip "Crítica", lido como servico urgente
     largado. Nao ha o que a equipe faca — `acoesDisponiveis` devolve lista vazia
     para este status — e a tela de detalhe ja diz "Nada a fazer por enquanto". */
  it("adiamento pedido nao e trabalho da equipe, nem hoje nem atrasado", () => {
    const g = agruparChamados(
      [chamado(10, "adiamento_solicitado", hoje), chamado(11, "adiamento_solicitado", "2026-08-19")],
      hoje,
    );
    expect(g.hoje).toEqual([]);
    expect(g.atrasados).toEqual([]);
    expect(g.aguardando.map((c) => c.id)).toEqual([11, 10]);
  });

  it("status de espera manda sobre a data: aguardando de hoje nao cai em hoje", () => {
    const g = agruparChamados([chamado(9, "aguardando_aprovacao", hoje)], hoje);
    expect(g.hoje).toEqual([]);
    expect(g.aguardando.map((c) => c.id)).toEqual([9]);
  });

  it("os atrasados vem do mais antigo para o mais novo", () => {
    const g = agruparChamados([chamado(1, "aberto", "2026-09-02"), chamado(2, "aberto", "2026-08-30")], hoje);
    expect(g.atrasados.map((c) => c.id)).toEqual([2, 1]);
  });

  it("os concluidos recentes vem do mais recente para o mais antigo", () => {
    const g = agruparChamados(
      [
        chamado(1, "concluido", "2026-09-01", { atualizado_em: "2026-09-08T10:00:00.000Z" }),
        chamado(2, "concluido", "2026-09-02", { atualizado_em: "2026-09-09T10:00:00.000Z" }),
      ],
      hoje,
    );
    expect(g.recentes.map((c) => c.id)).toEqual([2, 1]);
  });

  it("lista vazia devolve os cinco grupos vazios", () => {
    expect(agruparChamados([], hoje)).toEqual({ hoje: [], atrasados: [], proximos: [], aguardando: [], recentes: [] });
  });
});

describe("recusaPermanente", () => {
  it("4xx de regra e definitivo: reenviar nao muda a resposta", () => {
    for (const status of [400, 403, 404, 409, 413, 415, 422]) {
      expect(recusaPermanente(status)).toBe(true);
    }
  });

  it("408 e 429 sao 4xx que pedem paciencia, nao correcao", () => {
    expect(recusaPermanente(408)).toBe(false);
    expect(recusaPermanente(429)).toBe(false);
  });

  it("5xx e transitorio: o servidor e que esta mal", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(recusaPermanente(status)).toBe(false);
    }
  });

  it("nada abaixo de 400 e recusa", () => {
    for (const status of [200, 201, 204, 304]) {
      expect(recusaPermanente(status)).toBe(false);
    }
  });
});
