import "server-only";

import { cache } from "react";

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
 * no painel, de que a acurácia medida em `/validacao` não é um número de uma
 * rodada só, mas um mecanismo permanente -- cada levantamento semanal novo
 * da Motiva volta a reconferir o modelo. `agruparImportacoes` (`agrupar.ts`,
 * ao lado) faz o agrupamento por data e é onde isso é testado sem banco.
 */
export const levantamentosImportados = cache(async (): Promise<LevantamentoImportado[]> => {
  const { data, error } = await db.from("levantamentos").select("data, arquivo_origem, trecho_id, importado_em").order("data");
  if (error) throw new Error(`Falha ao ler os levantamentos importados: ${error.message}`);
  return agruparImportacoes((data ?? []) as Pick<Levantamento, "data" | "arquivo_origem" | "trecho_id" | "importado_em">[]);
});
