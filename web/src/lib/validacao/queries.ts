import "server-only";

import { cache } from "react";

import { db } from "../supabase";
import type { NdviAnalise, Validacao } from "../types";

function erro(contexto: string, e: { message: string } | null): never {
  throw new Error(`Falha ao ler ${contexto}: ${e?.message ?? "erro desconhecido"}`);
}

/** A validação que alimenta a calibração. `null` enquanto nenhuma foi gravada. */
export const validacaoVigente = cache(async (): Promise<Validacao | null> => {
  const { data, error } = await db.from("validacoes").select("*").eq("vigente", true).order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) erro("a validação vigente", error);
  return (data as Validacao) ?? null;
});

/** As rodadas de sensibilidade da mesma janela e rodovia, na ordem em que foram gravadas. */
export const validacoesSensibilidade = cache(async (vigente: Validacao): Promise<Validacao[]> => {
  const { data, error } = await db
    .from("validacoes")
    .select("*")
    .eq("rodovia", vigente.rodovia)
    .eq("janela_de", vigente.janela_de)
    .eq("vigente", false)
    .eq("observacoes", "sensibilidade")
    .order("id");
  if (error) erro("a sensibilidade da validação", error);
  return data as Validacao[];
});

/** A análise NDVI mais recente de cada data-alvo. */
export const ndviAnalises = cache(async (): Promise<NdviAnalise[]> => {
  const { data, error } = await db.from("ndvi_analises").select("*").order("executada_em", { ascending: false }).order("id", { ascending: false });
  if (error) erro("as análises de NDVI", error);
  const porAlvo = new Map<string, NdviAnalise>();
  for (const a of data as NdviAnalise[]) if (!porAlvo.has(a.data_alvo)) porAlvo.set(a.data_alvo, a);
  return [...porAlvo.values()].sort((a, b) => a.data_alvo.localeCompare(b.data_alvo));
});
