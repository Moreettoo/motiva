"use server";

import { redirect } from "next/navigation";

import type { Resultado } from "../resultado";
import { db } from "../supabase";
import type { Cargo } from "../types";
import { podeVerRota, rotaInicial } from "./permissoes";
import { clienteSessao } from "./servidor";
import { obterSessao } from "./sessao";
import { erroDaSenha } from "./tokens";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** So caminho interno que o cargo pode ver; qualquer outra coisa cai na rota inicial. */
function destinoSeguro(proximo: string | null | undefined, cargo: Cargo): string {
  if (proximo && proximo.startsWith("/") && !proximo.startsWith("//") && podeVerRota(cargo, proximo)) return proximo;
  return rotaInicial(cargo);
}

export async function entrar(entrada: {
  email: string;
  senha: string;
  proximo?: string | null;
}): Promise<Resultado<{ destino: string }>> {
  const email = entrada.email.trim().toLowerCase();
  if (!EMAIL.test(email) || entrada.senha.length === 0) return { ok: false, erro: "Informe e-mail e senha." };

  const supabase = await clienteSessao();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: entrada.senha });
  // Uma mensagem so para "nao existe" e "senha errada": nao confirmar quem tem conta.
  if (error || !data.user) return { ok: false, erro: "E-mail ou senha não conferem." };

  const { data: perfil } = await db
    .from("perfis")
    .select("cargo, ativo, senha_provisoria")
    .eq("usuario_id", data.user.id)
    .maybeSingle();

  if (!perfil || !perfil.ativo) {
    await supabase.auth.signOut();
    return { ok: false, erro: "Esta conta está desativada. Fale com um administrador." };
  }

  await db.from("perfis").update({ ultimo_acesso_em: new Date().toISOString() }).eq("usuario_id", data.user.id);

  const cargo = perfil.cargo as Cargo;
  if (perfil.senha_provisoria) return { ok: true, dados: { destino: "/definir-senha" } };
  return { ok: true, dados: { destino: destinoSeguro(entrada.proximo, cargo) } };
}

export async function sair(): Promise<never> {
  const supabase = await clienteSessao();
  await supabase.auth.signOut();
  redirect("/entrar");
}

/** Troca da senha provisoria (primeiro Super Admin, ou qualquer conta marcada). */
export async function definirSenha(entrada: { senha: string; confirmacao: string }): Promise<Resultado<{ destino: string }>> {
  const sessao = await obterSessao();
  if (!sessao) return { ok: false, erro: "Sua sessão expirou. Entre de novo." };

  const erro = erroDaSenha(entrada.senha);
  if (erro) return { ok: false, erro };
  if (entrada.senha !== entrada.confirmacao) return { ok: false, erro: "As duas senhas não são iguais." };

  const supabase = await clienteSessao();
  const { error } = await supabase.auth.updateUser({ password: entrada.senha });
  if (error) return { ok: false, erro: `Não foi possível gravar a senha: ${error.message}` };

  await db.from("perfis").update({ senha_provisoria: false }).eq("usuario_id", sessao.usuarioId);
  return { ok: true, dados: { destino: rotaInicial(sessao.cargo) } };
}
