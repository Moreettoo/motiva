import { describe, expect, it } from "vitest";

import type { ClasseAltura } from "../types";
import { agruparImportacoes, agruparLevantamentos } from "./agrupar";

function linha(faixaCodigo: string, data: string, classe: ClasseAltura | null, arquivoOrigem = "planilha.xlsx") {
  return { faixa_codigo: faixaCodigo, data, classe, arquivo_origem: arquivoOrigem };
}

function linhaImportacao(data: string, trechoId: number, arquivoOrigem: string, importadoEm: string) {
  return { data, trecho_id: trechoId, arquivo_origem: arquivoOrigem, importado_em: importadoEm };
}

describe("agruparLevantamentos", () => {
  /* A garantia central do cartão de campo (Tarefa 18): um "X"/branco no
     formulário unifilar não pode virar a mesma coisa que uma medição real
     de Classe 1 na tela. Aqui na origem dos dados é onde dá pra provar isso
     sem depender de renderização nenhuma. */
  it("preserva classe null (marcado X ou em branco) distinta de uma classe 1 medida -- nunca colapsa as duas", () => {
    const r = agruparLevantamentos([
      linha("cant_lateral_externa", "2026-03-13", null),
      linha("cant_central_externa", "2026-03-13", 1),
    ]);
    expect(r.classes.cant_lateral_externa["2026-03-13"]).toBeNull();
    expect(r.classes.cant_central_externa["2026-03-13"]).toBe(1);
    expect(r.classes.cant_lateral_externa["2026-03-13"]).not.toBe(r.classes.cant_central_externa["2026-03-13"]);
  });

  it("uma linha com classe null ainda grava a chave da data -- diferente de uma faixa sem nenhuma linha", () => {
    const r = agruparLevantamentos([linha("cant_lateral_externa", "2026-03-13", null)]);
    expect(Object.keys(r.classes.cant_lateral_externa)).toEqual(["2026-03-13"]);
    expect(r.classes.cant_lateral_externa["2026-03-13"]).toBeNull();
    // "pista_externa" nunca apareceu numa linha: nem a chave da faixa existe.
    expect(r.classes.pista_externa).toBeUndefined();
  });

  it("agrupa por faixa e depois por data, com várias faixas e classes 1/2/3", () => {
    const r = agruparLevantamentos([
      linha("cant_lateral_externa", "2026-03-13", 2),
      linha("cant_lateral_externa", "2026-03-20", 3),
      linha("cant_central_externa", "2026-03-13", 1),
    ]);
    expect(r.classes).toEqual({
      cant_lateral_externa: { "2026-03-13": 2, "2026-03-20": 3 },
      cant_central_externa: { "2026-03-13": 1 },
    });
  });

  it("coleta as datas distintas, ordenadas cronologicamente", () => {
    const r = agruparLevantamentos([
      linha("a", "2026-03-20", 1),
      linha("b", "2026-03-13", 2),
      linha("c", "2026-03-13", 3),
    ]);
    expect(r.datas).toEqual(["2026-03-13", "2026-03-20"]);
  });

  it("guarda o arquivo de origem por data", () => {
    const r = agruparLevantamentos([
      linha("a", "2026-03-13", 1, "unifilar-2026-03-13.xlsx"),
      linha("b", "2026-03-20", 2, "unifilar-2026-03-20.xlsx"),
    ]);
    expect(r.arquivos).toEqual({
      "2026-03-13": "unifilar-2026-03-13.xlsx",
      "2026-03-20": "unifilar-2026-03-20.xlsx",
    });
  });

  it("sem nenhuma linha (trecho sem levantamento), devolve tudo vazio -- é o sinal que o cartão usa para se esconder", () => {
    expect(agruparLevantamentos([])).toEqual({ datas: [], classes: {}, arquivos: {} });
  });
});

describe("agruparImportacoes", () => {
  /* A garantia central do cartão "Levantamentos importados" (Tarefa 21): a
     tabela mostra um RA-RET por linha, nunca uma linha por trecho x faixa.
     Um `.length` ingênuo aqui contaria 720 "trechos" numa rodovia de 60. */
  it("agrupa por data -- várias linhas de trecho x faixa da MESMA data viram UMA linha de importação, não uma por linha", () => {
    const linhas = [];
    for (let trecho = 1; trecho <= 3; trecho++) {
      for (let faixa = 0; faixa < 12; faixa++) {
        linhas.push(linhaImportacao("2026-03-13", trecho, "RA-RET-ROÇ-LIMP-2026-03-13.xlsx", "2026-09-14T10:36:00Z"));
      }
    }
    expect(linhas).toHaveLength(36);
    const r = agruparImportacoes(linhas);
    expect(r).toHaveLength(1);
    expect(r[0].trechos).toBe(3); // trechos distintos, não as 36 linhas cruas.
  });

  it("conta trechos DISTINTOS (Set), não soma linhas -- o mesmo trecho repetido em várias faixas não infla a contagem", () => {
    const linhas = [
      linhaImportacao("2026-03-13", 7, "a.xlsx", "t1"),
      linhaImportacao("2026-03-13", 7, "a.xlsx", "t1"),
      linhaImportacao("2026-03-13", 8, "a.xlsx", "t1"),
    ];
    const r = agruparImportacoes(linhas);
    expect(r).toEqual([{ data: "2026-03-13", arquivo: "a.xlsx", trechos: 2, importado_em: "t1" }]);
  });

  it("duas datas viram duas linhas, cada uma com sua própria contagem de trechos -- o Set de uma data não vaza para a outra", () => {
    const linhas = [
      linhaImportacao("2026-03-13", 1, "RA-RET-ROÇ-LIMP-2026-03-13.xlsx", "2026-09-14T10:00:00Z"),
      linhaImportacao("2026-03-13", 2, "RA-RET-ROÇ-LIMP-2026-03-13.xlsx", "2026-09-14T10:00:00Z"),
      linhaImportacao("2026-03-20", 1, "RA-RET-ROÇ-LIMP-2026-03-20.xlsx", "2026-09-14T10:36:00Z"),
    ];
    const r = agruparImportacoes(linhas);
    expect(r).toEqual([
      { data: "2026-03-13", arquivo: "RA-RET-ROÇ-LIMP-2026-03-13.xlsx", trechos: 2, importado_em: "2026-09-14T10:00:00Z" },
      { data: "2026-03-20", arquivo: "RA-RET-ROÇ-LIMP-2026-03-20.xlsx", trechos: 1, importado_em: "2026-09-14T10:36:00Z" },
    ]);
    // o trecho 1 aparece nas duas importações: cada grupo conta 1 (o seu), nenhum conta 2 nem 0.
    expect(r[0].trechos).toBe(2);
    expect(r[1].trechos).toBe(1);
  });

  it("importado_em fica o mais recente do grupo, mesmo que a linha mais recente não seja a primeira lida", () => {
    const r = agruparImportacoes([
      linhaImportacao("2026-03-13", 1, "a.xlsx", "2026-09-14T09:00:00Z"),
      linhaImportacao("2026-03-13", 2, "a.xlsx", "2026-09-14T10:36:00Z"),
      linhaImportacao("2026-03-13", 3, "a.xlsx", "2026-09-14T09:30:00Z"),
    ]);
    expect(r).toEqual([{ data: "2026-03-13", arquivo: "a.xlsx", trechos: 3, importado_em: "2026-09-14T10:36:00Z" }]);
  });

  it("reproduz a escala real de produção: 1.440 linhas cruas (2 datas x 60 trechos x 12 faixas) viram exatamente 2 importações, 60 trechos cada -- não 1.440 linhas nem 1 grupo só", () => {
    const linhas: ReturnType<typeof linhaImportacao>[] = [];
    for (const [data, arquivo] of [
      ["2026-03-13", "RA-RET-ROÇ-LIMP-2026-03-13.xlsx"],
      ["2026-03-20", "RA-RET-ROÇ-LIMP-2026-03-20.xlsx"],
    ] as const) {
      for (let trecho = 1; trecho <= 60; trecho++) {
        for (let faixa = 0; faixa < 12; faixa++) {
          linhas.push(linhaImportacao(data, trecho, arquivo, "2026-09-14T10:36:00Z"));
        }
      }
    }
    expect(linhas).toHaveLength(1440);
    const r = agruparImportacoes(linhas);
    expect(r).toHaveLength(2);
    expect(r.map((g) => g.trechos)).toEqual([60, 60]);
    expect(r.map((g) => g.data)).toEqual(["2026-03-13", "2026-03-20"]);
    expect(r.map((g) => g.arquivo)).toEqual(["RA-RET-ROÇ-LIMP-2026-03-13.xlsx", "RA-RET-ROÇ-LIMP-2026-03-20.xlsx"]);
  });

  it("sem nenhuma linha, devolve lista vazia", () => {
    expect(agruparImportacoes([])).toEqual([]);
  });
});
