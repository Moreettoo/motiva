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

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const s = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2;
}

/** Onde a classe 1 vira classe 2 (`CLASSE_ALTURA`: "abaixo de 10 cm" / "de 10 a
 *  30 cm"). Vive aqui, e não em `dominio.ts`, porque só esta consulta soma
 *  contra ela — se um segundo lugar precisar, ela sobe para lá. */
const FRONTEIRA_CLASSE_1_2_CM = 10;

/**
 * A distância, em cm, entre a fronteira de 10 cm e a mediana das alturas
 * finais previstas (`altura_inicial_cm + q50_cm`) entre os pares que
 * partiram da classe 1 — o número que sustenta a frase de `Limitacoes` sobre
 * a régua cortar perto da previsão típica do modelo. `null` quando a
 * validação vigente não tem nenhum par partindo da classe 1 (não é o caso do
 * Rodoanel hoje, mas a função nunca assume isso de outra validação).
 */
export const distanciaFronteiraClasse1 = cache(async (vigente: Validacao): Promise<number | null> => {
  const { data, error } = await db
    .from("validacao_pares")
    .select("altura_inicial_cm, q50_cm")
    .eq("validacao_id", vigente.id)
    .eq("classe_inicial", 1)
    .eq("incluido", true);
  if (error) erro("a distância da fronteira de classe", error);
  const finais = (data as { altura_inicial_cm: number | string; q50_cm: number | string }[]).map(
    (p) => Number(p.altura_inicial_cm) + Number(p.q50_cm),
  );
  const medianaFinal = mediana(finais);
  return medianaFinal == null ? null : Math.abs(medianaFinal - FRONTEIRA_CLASSE_1_2_CM);
});
