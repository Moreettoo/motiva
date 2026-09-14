import "server-only";

import { cache } from "react";

import { escolherCalibracao, type CalibracaoVigente, type LinhaCalibracao } from "./calibracao-regra";
import { db } from "./supabase";

/** O fator vigente para um ponto do mapa. Uma consulta por request, deduplicada pelo `cache()`. */
export const fatorVigente = cache(async (rodovia: string | null, especie: string): Promise<CalibracaoVigente> => {
  const { data, error } = await db
    .from("calibracoes")
    .select("fator, rodovia, especie, validacoes(n_pares_usados, executada_em)")
    .eq("ativo", true);
  if (error) throw new Error(`Falha ao ler as calibrações: ${error.message}`);
  return escolherCalibracao((data ?? []) as LinhaCalibracao[], rodovia, especie);
});
