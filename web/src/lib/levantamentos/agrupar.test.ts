import { describe, expect, it } from "vitest";

import type { ClasseAltura } from "../types";
import { agruparLevantamentos } from "./agrupar";

function linha(faixaCodigo: string, data: string, classe: ClasseAltura | null, arquivoOrigem = "planilha.xlsx") {
  return { faixa_codigo: faixaCodigo, data, classe, arquivo_origem: arquivoOrigem };
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
