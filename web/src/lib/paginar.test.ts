import { describe, expect, it } from "vitest";

import { PAGINA_POSTGREST, lerPaginado } from "./paginar";

/**
 * Um servidor PostgREST de mentira, com a unica caracteristica que importa:
 * ele NUNCA devolve mais que `db-max-rows` linhas por resposta, e nao avisa
 * nada quando corta. Toda a dificuldade do bug original esta nessa linha.
 */
function servidorQueCortaEmMil<T>(linhas: T[]) {
  const chamadas: [number, number][] = [];
  return {
    chamadas,
    buscar: async (de: number, ate: number) => {
      chamadas.push([de, ate]);
      const fim = Math.min(ate + 1, de + PAGINA_POSTGREST);
      return linhas.slice(de, fim);
    },
  };
}

const linhasDe = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));

describe("lerPaginado", () => {
  it("le tudo quando a tabela passa do teto de mil linhas do servidor", async () => {
    const srv = servidorQueCortaEmMil(linhasDe(1440));
    const lidas = await lerPaginado("teste", srv.buscar);

    // 1.440, nao 1.000: a leitura de uma pagina so era o bug.
    expect(lidas).toHaveLength(1440);
    expect(lidas.map((l) => l.id)).toEqual(linhasDe(1440).map((l) => l.id));
    expect(srv.chamadas).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("para na primeira pagina curta, sem pedir uma pagina vazia a toa", async () => {
    const srv = servidorQueCortaEmMil(linhasDe(300));
    expect(await lerPaginado("teste", srv.buscar)).toHaveLength(300);
    expect(srv.chamadas).toEqual([[0, 999]]);
  });

  it("tabela vazia devolve lista vazia com uma consulta so", async () => {
    const srv = servidorQueCortaEmMil<{ id: number }>([]);
    expect(await lerPaginado("teste", srv.buscar)).toEqual([]);
    expect(srv.chamadas).toHaveLength(1);
  });

  it("pede a pagina seguinte quando o total e multiplo exato da pagina", async () => {
    /* O caso de fronteira: 1.000 linhas exatas sao indistinguiveis de 1.000
       linhas cortadas, entao a unica resposta correta e perguntar de novo --
       um `break` em `lote.length <= PAGINA` perderia a segunda pagina de uma
       tabela de 2.000. */
    const srv = servidorQueCortaEmMil(linhasDe(2000));
    expect(await lerPaginado("teste", srv.buscar)).toHaveLength(2000);
    expect(srv.chamadas).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("levanta ao bater no teto de paginas, em vez de devolver leitura parcial", async () => {
    /* Nunca deve acontecer neste projeto (seriam 20.000 linhas numa consulta
       so), mas se acontecer o erro tem que APARECER: devolver as 20.000
       primeiras em silencio seria repetir, um zero acima, exatamente o defeito
       que este modulo existe para matar. */
    const srv = servidorQueCortaEmMil(linhasDe(21_000));
    await expect(lerPaginado("os levantamentos", srv.buscar)).rejects.toThrow(
      /os levantamentos: passou de 20000 linhas/,
    );
  });

  it("propaga o erro de quem busca, sem engolir nem continuar paginando", async () => {
    const chamadas: number[] = [];
    await expect(
      lerPaginado("teste", async (de) => {
        chamadas.push(de);
        throw new Error("Falha ao ler teste: relacao nao existe");
      }),
    ).rejects.toThrow("relacao nao existe");
    expect(chamadas).toEqual([0]);
  });
});
