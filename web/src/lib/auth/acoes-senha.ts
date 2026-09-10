"use server";

import { createElement } from "react";

import { EmailRedefinirSenha } from "@/emails/redefinir-senha";

import { enviarEmail } from "../email/enviar";
import { fmt } from "../format";
import type { Resultado } from "../resultado";
import { db } from "../supabase";
import type { Cargo } from "../types";
import { urlDoApp } from "./links";
import { rotaInicial } from "./permissoes";
import { clienteSessao } from "./servidor";
import { erroDaSenha, expirado, gerarToken, hashToken, prazo } from "./tokens";

/**
 * Redefinicao de senha por link, fluxo nosso: o Supabase nunca envia e-mail.
 * Fica separado de `acoes.ts` (entrar, sair, definir senha) porque estas duas
 * actions sao PUBLICAS — quem as chama nao tem sessao, por definicao.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REDEFINICAO_HORAS = 1;

/** Sempre responde igual: nao revela se o e-mail tem conta. */
export async function solicitarRedefinicaoSenha(entrada: {
  email: string;
}): Promise<Resultado<{ aviso: string | null }>> {
  const email = entrada.email.trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, erro: "Informe um e-mail válido." };

  const { data: perfil } = await db.from("perfis").select("usuario_id, ativo").eq("email", email).maybeSingle();
  if (!perfil || !perfil.ativo) return { ok: true, dados: { aviso: null } };

  // Um pedido a cada 5 minutos por conta: o resto e ruido de repeticao.
  const { data: recente } = await db
    .from("redefinicoes_senha")
    .select("criado_em")
    .eq("usuario_id", perfil.usuario_id)
    .gte("criado_em", new Date(Date.now() - 5 * 60_000).toISOString())
    .limit(1);
  if (recente && recente.length > 0) return { ok: true, dados: { aviso: null } };

  const token = gerarToken();
  const expiraEm = prazo(REDEFINICAO_HORAS);
  await db.from("redefinicoes_senha").insert({
    usuario_id: perfil.usuario_id,
    token_hash: await hashToken(token),
    expira_em: expiraEm.toISOString(),
  });

  const envio = await enviarEmail({
    para: email,
    assunto: "Redefinir sua senha do HighwAI",
    react: createElement(EmailRedefinirSenha, {
      link: urlDoApp(`/redefinir-senha/${token}`),
      validoAte: fmt.horaMin(expiraEm),
    }),
  });
  // Em modo de teste do Resend o envio falha para quase todo mundo; a tela diz isso
  // sem dizer se a conta existe: o aviso e sobre o correio, nao sobre a conta.
  return {
    ok: true,
    dados: {
      aviso: envio.ok
        ? null
        : "O serviço de e-mail está em modo de teste; se você não receber, peça a um administrador uma senha provisória.",
    },
  };
}

export async function redefinirSenha(entrada: {
  token: string;
  senha: string;
  confirmacao: string;
}): Promise<Resultado<{ destino: string }>> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(entrada.token)) {
    return { ok: false, erro: "Link inválido. Peça um novo em 'Esqueci a senha'." };
  }
  const erro = erroDaSenha(entrada.senha);
  if (erro) return { ok: false, erro };
  if (entrada.senha !== entrada.confirmacao) return { ok: false, erro: "As duas senhas não são iguais." };

  const { data: pedido } = await db
    .from("redefinicoes_senha")
    .select("id, usuario_id, expira_em, usada_em")
    .eq("token_hash", await hashToken(entrada.token))
    .maybeSingle();
  if (!pedido || pedido.usada_em || expirado(pedido.expira_em)) {
    return { ok: false, erro: "Este link não vale mais. Peça um novo em 'Esqueci a senha'." };
  }

  const { data: perfil } = await db
    .from("perfis")
    .select("email, cargo, ativo")
    .eq("usuario_id", pedido.usuario_id)
    .maybeSingle();
  if (!perfil || !perfil.ativo) return { ok: false, erro: "Esta conta está desativada." };

  const { error } = await db.auth.admin.updateUserById(pedido.usuario_id, { password: entrada.senha });
  if (error) return { ok: false, erro: `Não foi possível gravar a senha: ${error.message}` };

  await db.from("redefinicoes_senha").update({ usada_em: new Date().toISOString() }).eq("id", pedido.id);
  await db.from("perfis").update({ senha_provisoria: false }).eq("usuario_id", pedido.usuario_id);

  const supabase = await clienteSessao();
  await supabase.auth.signInWithPassword({ email: perfil.email as string, password: entrada.senha });
  return { ok: true, dados: { destino: rotaInicial(perfil.cargo as Cargo) } };
}
