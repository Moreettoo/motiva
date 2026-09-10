import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import type { Resultado } from "../resultado";
import { db } from "../supabase";
import type { Cargo } from "../types";
import { clienteSessao } from "./servidor";

/**
 * A UNICA fonte de "quem esta pedindo".
 *
 * O proxy redireciona por conveniencia; a doc do Next 16 e explicita que ele
 * "should not be your only line of defense". Toda pagina chama `exigirCargo`
 * e toda Server Action chama `permitir`. Sem excecao: uma action sem guarda e
 * um POST publico que escreve com a chave secreta.
 */
export type Sessao = {
  usuarioId: string;
  email: string;
  nome: string;
  cargo: Cargo;
  /** Equipe que a pessoa lidera (`ia.equipes.lider_id`). So Rocador costuma ter. */
  equipeId: number | null;
  senhaProvisoria: boolean;
};

export const obterSessao = cache(async (): Promise<Sessao | null> => {
  const supabase = await clienteSessao();
  const { data, error } = await supabase.auth.getClaims();
  const usuarioId = data?.claims?.sub;
  if (error || !usuarioId) return null;

  // O cargo autoritativo e o do perfil, nao o do token: desativar alguem tem
  // que valer na proxima requisicao, e o token vive ate uma hora.
  const { data: perfil } = await db
    .from("perfis")
    .select("email, nome, cargo, ativo, senha_provisoria, equipes!equipes_lider_id_fkey ( id )")
    .eq("usuario_id", usuarioId)
    .maybeSingle();

  if (!perfil || !perfil.ativo) return null;

  const equipes = perfil.equipes as unknown as { id: number }[] | { id: number } | null;
  const equipe = Array.isArray(equipes) ? equipes[0] : equipes;

  return {
    usuarioId,
    email: perfil.email as string,
    nome: perfil.nome as string,
    cargo: perfil.cargo as Cargo,
    equipeId: equipe?.id ?? null,
    senhaProvisoria: Boolean(perfil.senha_provisoria),
  };
});

export async function exigirSessao(opcoes?: { permitirSenhaProvisoria?: boolean }): Promise<Sessao> {
  const sessao = await obterSessao();
  if (!sessao) redirect("/entrar");
  if (sessao.senhaProvisoria && !opcoes?.permitirSenhaProvisoria) redirect("/definir-senha");
  return sessao;
}

export async function exigirCargo(...cargos: Cargo[]): Promise<Sessao> {
  const sessao = await exigirSessao();
  if (!cargos.includes(sessao.cargo)) redirect("/sem-acesso");
  return sessao;
}

/** Versao para Server Action: nao redireciona, devolve o contrato `Resultado`. */
export async function permitir(...cargos: Cargo[]): Promise<Resultado<Sessao>> {
  const sessao = await obterSessao();
  if (!sessao) return { ok: false, erro: "Sua sessão expirou. Entre de novo." };
  if (!cargos.includes(sessao.cargo)) {
    return {
      ok: false,
      erro: sessao.cargo === "analista" ? "Seu acesso é somente leitura." : "Você não tem permissão para esta ação.",
    };
  }
  return { ok: true, dados: sessao };
}
