import "server-only";

import { cache } from "react";

import { db } from "../supabase";
import type { NdviAnalise, Validacao } from "../types";
import { projetarPares, type ParBruto, type ParProjetado } from "./fronteira";

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

/**
 * Os pares da validacao ja projetados contra a regua de tres classes.
 *
 * Substituiu `distanciaFronteiraClasse1`, que fazia esta mesma consulta para
 * devolver UM numero. A pagina passou a mostrar a distribuicao inteira, e duas
 * consultas quase iguais sobre a mesma tabela e como as duas divergem.
 *
 * A conta mora em `fronteira.ts`, sem `server-only`, para ter teste: e ela que
 * sustenta a frase mais forte da pagina.
 */
export const paresDaValidacao = cache(async (vigente: Validacao): Promise<ParProjetado[]> => {
  const { data, error } = await db
    .from("validacao_pares")
    .select("classe_inicial, classe_final_observada, altura_inicial_cm, q10_cm, q50_cm, q90_cm")
    .eq("validacao_id", vigente.id)
    .eq("incluido", true);
  if (error) erro("os pares da validacao", error);
  return projetarPares(data as ParBruto[]);
});
