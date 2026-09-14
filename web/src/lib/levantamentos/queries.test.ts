import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O teste que faltava.
 *
 * `agrupar.test.ts` ja reproduzia as 1.440 linhas de producao -- mas EM
 * MEMORIA, entregues inteiras a `agruparImportacoes`. Sem o PostgREST no meio
 * nao havia como ele ver o corte: o servidor devolve HTTP 200, `error` nulo e
 * `content-range: 0-999/*`, e uma consulta truncada fica indistinguivel de uma
 * consulta que acabou. Este arquivo poe um servidor de mentira que CORTA em
 * mil no lugar do `db`, e mede o cartao ponta a ponta.
 *
 * `server-only` e mockado pelo mesmo motivo (e no mesmo molde) de
 * `supabase.test.ts`: nao e dependencia instalada, o Next a resolve por alias
 * do proprio bundler.
 */
vi.mock("server-only", () => ({}));

/** `db-max-rows` do projeto: o servidor nunca devolve mais que isto. */
const DB_MAX_ROWS = 1000;

const consultas: { tabela: string; de: number; ate: number; ordens: string[] }[] = [];
let tabelas: Record<string, Record<string, unknown>[]> = {};

/**
 * Dublê de `db` com o unico comportamento que importa aqui: ordena pelas
 * colunas pedidas, aplica o `.range()` se houver, e CORTA em `DB_MAX_ROWS`
 * linhas em qualquer caso -- silenciosamente, com `error: null`, como o
 * servidor de verdade.
 */
function consulta(tabela: string) {
  const ordens: string[] = [];
  let de = 0;
  let ate = Number.POSITIVE_INFINITY;

  const builder = {
    select: () => builder,
    eq: () => builder,
    order: (coluna: string) => {
      ordens.push(coluna);
      return builder;
    },
    range: (inicio: number, fim: number) => {
      de = inicio;
      ate = fim;
      return builder;
    },
    then: (ok: (r: { data: unknown[]; error: null }) => unknown, falha?: (e: unknown) => unknown) => {
      consultas.push({ tabela, de, ate, ordens: [...ordens] });
      const linhas = [...(tabelas[tabela] ?? [])].sort((a, b) => {
        for (const coluna of ordens) {
          const x = String(a[coluna]);
          const y = String(b[coluna]);
          if (x !== y) return x < y ? -1 : 1;
        }
        return 0;
      });
      const fim = Math.min(ate + 1, de + DB_MAX_ROWS, linhas.length);
      return Promise.resolve({ data: linhas.slice(de, fim), error: null }).then(ok, falha);
    },
  };
  return builder;
}

vi.mock("../supabase", () => ({ db: { from: (tabela: string) => consulta(tabela) } }));

/** As 1.440 linhas exatas de producao: 2 datas x 60 trechos x 12 faixas. */
function producao() {
  const linhas: Record<string, unknown>[] = [];
  let id = 1;
  for (const data of ["2026-03-13", "2026-03-20"]) {
    for (let trecho = 1; trecho <= 60; trecho += 1) {
      for (let faixa = 1; faixa <= 12; faixa += 1) {
        linhas.push({
          id: String(id++).padStart(5, "0"),
          data,
          arquivo_origem: `RA-RET-ROÇ-LIMP-${data}.xlsx`,
          trecho_id: trecho,
          importado_em: "2026-09-14T10:36:00+00:00",
        });
      }
    }
  }
  return linhas;
}

beforeEach(() => {
  consultas.length = 0;
  tabelas = { levantamentos: producao() };
  vi.resetModules();
});

describe("levantamentosImportados contra um PostgREST que corta em mil linhas", () => {
  it("mostra 60 trechos NAS DUAS datas, e nao 24 na segunda", async () => {
    /* O numero medido contra producao antes do conserto: a segunda data
       aparecia com 24 trechos (280 das 720 linhas), porque o corte em 1.000 cai
       no meio dela -- 720 linhas da primeira data + 280 da segunda. O cartao
       contradizia, na tela que vai ser demonstrada, o "60 trechos cada" da
       secao 7 do relatorio ao cliente. */
    const { levantamentosImportados } = await import("./queries");
    const importacoes = await levantamentosImportados();

    expect(importacoes).toHaveLength(2);
    expect(importacoes.map((i) => [i.data, i.trechos])).toEqual([
      ["2026-03-13", 60],
      ["2026-03-20", 60],
    ]);
  });

  it("pagina ate a pagina curta, ordenando por data E id", async () => {
    /* `.order("data")` sozinho nao define ordem total: com empate o servidor
       devolve na ordem fisica, que pode mudar entre as duas requisicoes -- uma
       linha repetiria numa pagina e outra sumiria. O desempate por `id` e o que
       torna a paginacao correta, nao so completa. */
    const { levantamentosImportados } = await import("./queries");
    await levantamentosImportados();

    expect(consultas).toEqual([
      { tabela: "levantamentos", de: 0, ate: 999, ordens: ["data", "id"] },
      { tabela: "levantamentos", de: 1000, ate: 1999, ordens: ["data", "id"] },
    ]);
  });

  it("uma importacao nova (2.160 linhas) continua saindo com 60 trechos em cada data", async () => {
    /* A tabela cresce 720 linhas por RA-RET importado. Uma leitura de pagina
       unica ficaria cada vez mais errada; a paginada nao muda de comportamento
       ao passar para a terceira pagina. */
    const extra = producao().slice(0, 720).map((l, i) => ({
      ...l,
      id: String(2000 + i),
      data: "2026-03-27",
      arquivo_origem: "RA-RET-ROÇ-LIMP-2026-03-27.xlsx",
    }));
    tabelas.levantamentos = [...tabelas.levantamentos, ...extra];

    const { levantamentosImportados } = await import("./queries");
    const importacoes = await levantamentosImportados();

    expect(importacoes.map((i) => [i.data, i.trechos])).toEqual([
      ["2026-03-13", 60],
      ["2026-03-20", 60],
      ["2026-03-27", 60],
    ]);
    expect(consultas).toHaveLength(3);
  });
});
