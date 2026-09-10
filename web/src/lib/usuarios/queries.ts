import "server-only";

import { cache } from "react";

import { db } from "../supabase";
import type { Convite, Perfil } from "../types";

/* Leitura lança (o `error.tsx` da rota trata); escrita devolve `Resultado`. */
function erro(contexto: string, e: { message: string } | null): never {
  throw new Error(`Falha ao ler ${contexto}: ${e?.message ?? "erro desconhecido"}`);
}

export const listarPerfis = cache(
  async (): Promise<(Perfil & { equipe_liderada: { id: number; nome: string } | null })[]> => {
    const { data, error } = await db
      .from("perfis")
      .select("*, equipe_liderada:equipes!equipes_lider_id_fkey ( id, nome )")
      .order("ativo", { ascending: false })
      .order("nome");
    if (error) erro("os usuários", error);
    return (data ?? []).map((p) => {
      const eq = p.equipe_liderada as unknown as
        | { id: number; nome: string }[]
        | { id: number; nome: string }
        | null;
      return { ...(p as unknown as Perfil), equipe_liderada: Array.isArray(eq) ? (eq[0] ?? null) : eq };
    });
  },
);

export const listarConvitesPendentes = cache(
  async (): Promise<(Convite & { convidador_nome: string; equipe_nome: string | null })[]> => {
    const { data, error } = await db
      .from("convites")
      .select("*, convidador:perfis!convites_criado_por_fkey ( nome ), equipe:equipes ( nome )")
      .is("aceito_em", null)
      .is("revogado_em", null)
      .order("criado_em", { ascending: false });
    if (error) erro("os convites", error);
    return (data ?? []).map((c) => {
      const linha = c as unknown as Convite & {
        convidador: { nome: string } | null;
        equipe: { nome: string } | null;
      };
      return {
        ...linha,
        convidador_nome: linha.convidador?.nome ?? "—",
        equipe_nome: linha.equipe?.nome ?? null,
      };
    });
  },
);

export const contarSuperAdminsAtivos = cache(async (): Promise<number> => {
  const { count, error } = await db
    .from("perfis")
    .select("usuario_id", { count: "exact", head: true })
    .eq("cargo", "super_admin")
    .eq("ativo", true);
  if (error) erro("os super admins", error);
  return count ?? 0;
});

export const equipesParaConvite = cache(
  async (): Promise<{ id: number; nome: string; lider_nome: string | null }[]> => {
    const { data, error } = await db
      .from("equipes")
      .select("id, nome, lider:perfis!equipes_lider_id_fkey ( nome )")
      .eq("ativo", true)
      .order("nome");
    if (error) erro("as equipes", error);
    return (data ?? []).map((e) => {
      const lider = e.lider as unknown as { nome: string } | { nome: string }[] | null;
      const nome = Array.isArray(lider) ? lider[0]?.nome : lider?.nome;
      return { id: e.id as number, nome: e.nome as string, lider_nome: nome ?? null };
    });
  },
);
