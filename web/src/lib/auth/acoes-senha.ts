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

/**
 * O aviso do correio sai do AMBIENTE, nunca do resultado do envio.
 *
 * No modo de teste do Resend (sem dominio verificado) a entrega so funciona para
 * o e-mail da propria conta, entao o envio falha para quase todo mundo. Um aviso
 * condicionado a essa falha aparecia so para quem TEM conta — e a tela, que
 * responde a mesma frase de proposito, virava o verificador de e-mails que ela
 * existe para nao ser. Medido em 10/09: com conta o painel mostrava tres avisos,
 * sem conta mostrava dois.
 */
function avisoDoCorreio(): string | null {
  const semChave = !process.env.RESEND_API_KEY;
  // Remetente em `resend.dev` e o sandbox compartilhado: nao ha dominio verificado.
  const remetenteDeTeste = /@resend\.dev/i.test(process.env.EMAIL_REMETENTE ?? "");
  if (!semChave && !remetenteDeTeste) return null;
  return "O serviço de e-mail está em modo de teste; se você não receber, peça a um administrador uma senha provisória.";
}

/** Sempre responde igual: nao revela se o e-mail tem conta. */
export async function solicitarRedefinicaoSenha(entrada: {
  email: string;
}): Promise<Resultado<{ aviso: string | null }>> {
  const email = entrada.email.trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, erro: "Informe um e-mail válido." };

  const { data: perfil } = await db.from("perfis").select("usuario_id, ativo").eq("email", email).maybeSingle();
  if (!perfil || !perfil.ativo) return { ok: true, dados: { aviso: avisoDoCorreio() } };

  // Um pedido a cada 5 minutos por conta: o resto e ruido de repeticao.
  const { data: recente } = await db
    .from("redefinicoes_senha")
    .select("criado_em")
    .eq("usuario_id", perfil.usuario_id)
    .gte("criado_em", new Date(Date.now() - 5 * 60_000).toISOString())
    .limit(1);
  if (recente && recente.length > 0) return { ok: true, dados: { aviso: avisoDoCorreio() } };

  const token = gerarToken();
  const expiraEm = prazo(REDEFINICAO_HORAS);
  await db.from("redefinicoes_senha").insert({
    usuario_id: perfil.usuario_id,
    token_hash: await hashToken(token),
    expira_em: expiraEm.toISOString(),
  });

  // O resultado do envio nao entra na resposta: ele depende do DESTINATARIO, e a
  // resposta desta action tem que depender so do ambiente. Ver `avisoDoCorreio`.
  await enviarEmail({
    para: email,
    assunto: "Redefinir sua senha do HighwAI",
    react: createElement(EmailRedefinirSenha, {
      link: urlDoApp(`/redefinir-senha/${token}`),
      validoAte: fmt.horaMin(expiraEm),
    }),
  });
  return { ok: true, dados: { aviso: avisoDoCorreio() } };
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
