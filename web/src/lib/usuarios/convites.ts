import "server-only";

import { expirado, hashToken } from "../auth/tokens";
import { db } from "../supabase";
import { COLUNAS_CONVITE, type Convite } from "../types";

export type SituacaoConvite = "valido" | "expirado" | "revogado" | "aceito" | "inexistente";

/** O banco so conhece o hash: o token inteiro existe apenas no link. */
export async function buscarConvitePorToken(token: string): Promise<{
  situacao: SituacaoConvite;
  convite: Convite | null;
  equipeNome: string | null;
  convidadorNome: string | null;
}> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return { situacao: "inexistente", convite: null, equipeNome: null, convidadorNome: null };
  }

  const { data } = await db
    .from("convites")
    .select(
      `${COLUNAS_CONVITE}, equipe:equipes ( nome ), convidador:perfis!convites_criado_por_fkey ( nome )`,
    )
    .eq("token_hash", await hashToken(token))
    .maybeSingle();

  if (!data) return { situacao: "inexistente", convite: null, equipeNome: null, convidadorNome: null };

  const linha = data as unknown as Convite & {
    equipe: { nome: string } | null;
    convidador: { nome: string } | null;
  };
  const situacao: SituacaoConvite = linha.aceito_em
    ? "aceito"
    : linha.revogado_em
      ? "revogado"
      : expirado(linha.expira_em)
        ? "expirado"
        : "valido";

  return {
    situacao,
    convite: linha,
    equipeNome: linha.equipe?.nome ?? null,
    convidadorNome: linha.convidador?.nome ?? null,
  };
}
