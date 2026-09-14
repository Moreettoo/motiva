import "server-only";

import { cache } from "react";

import { lerPaginado } from "../paginar";
import { db } from "../supabase";
import type { Faixa, Levantamento } from "../types";
import { agruparImportacoes, agruparLevantamentos, type LevantamentoImportado, type LevantamentosAgrupados } from "./agrupar";

export type { LevantamentoImportado };

export type LevantamentosDoTrecho = LevantamentosAgrupados & { faixas: Faixa[] };

/**
 * O que a equipe da Motiva anotou num trecho, faixa por faixa, nas duas
 * caminhadas de campo -- a origem bruta que o cartão "Levantamento de campo"
 * (`trechos/_componentes/levantamento-campo.tsx`) mostra.
 *
 * `faixas` vem de `ia.faixas` (o vocabulário fixo das 12 faixas do
 * formulário unifilar, sempre as mesmas para todo trecho) e não depende de
 * `trechoId`; buscar as duas em paralelo é só isso, paralelismo -- não há
 * nenhuma junção entre elas no banco, `agruparLevantamentos` é quem cruza.
 */
export const levantamentosDoTrecho = cache(async (trechoId: number): Promise<LevantamentosDoTrecho> => {
  const [{ data: faixas, error: e1 }, { data: linhas, error: e2 }] = await Promise.all([
    db.from("faixas").select("*").order("ordem"),
    db.from("levantamentos").select("*").eq("trecho_id", trechoId).order("data").order("id"),
  ]);
  if (e1) throw new Error(`Falha ao ler as faixas: ${e1.message}`);
  if (e2) throw new Error(`Falha ao ler os levantamentos do trecho ${trechoId}: ${e2.message}`);

  return {
    faixas: (faixas ?? []) as Faixa[],
    ...agruparLevantamentos((linhas ?? []) as Levantamento[]),
  };
});

/**
 * Uma linha por RA-RET importado (não uma por trecho x faixa): a evidência,
 * no painel, de que existe um mecanismo permanente de entrada de dado, não
 * duas planilhas carregadas uma vez e esquecidas. `importar_levantamento.py
 * --gravar` traz cada levantamento novo da Motiva sozinho e sem duplicar
 * (idempotente, provado na Tarefa 13) -- essa parte É automática. RECONFERIR
 * a acurácia medida em `/validacao` contra o levantamento novo NÃO é: hoje
 * isso ainda pede um desenvolvedor apontar a janela nova e rodar consolidar/
 * validar/publicar à mão (`docs/operacao/importar-levantamento.md`, seção
 * 6). `agruparImportacoes` (`agrupar.ts`, ao lado) faz o agrupamento por
 * data e é onde isso é testado sem banco.
 */
export const levantamentosImportados = cache(async (): Promise<LevantamentoImportado[]> => {
  /* PAGINA. `ia.levantamentos` tem hoje 1.440 linhas em producao (2 datas x 60
     trechos x 12 faixas) e cresce 720 a cada RA-RET importado. A leitura sem
     `.range()` voltava HTTP 200, `error` nulo e `content-range: 0-999/*` --
     1.000 das 1.440 linhas, medido contra producao. O cartao entao mostrava a
     segunda data com 24 trechos e 280 linhas em vez de 60 e 720, contradizendo
     na tela o "60 trechos cada" do relatorio ao cliente.

     `.order("data").order("id")` e obrigatorio, nao enfeite: sem o desempate
     por `id` a ordem entre paginas nao e estavel e a paginacao pode repetir uma
     linha e perder outra. Ver `paginar.ts`. */
  const linhas = await lerPaginado("os levantamentos importados", async (de, ate) => {
    const { data, error } = await db
      .from("levantamentos")
      .select("data, arquivo_origem, trecho_id, importado_em")
      .order("data")
      .order("id")
      .range(de, ate);
    if (error) throw new Error(`Falha ao ler os levantamentos importados: ${error.message}`);
    return (data ?? []) as Pick<Levantamento, "data" | "arquivo_origem" | "trecho_id" | "importado_em">[];
  });
  return agruparImportacoes(linhas);
});
