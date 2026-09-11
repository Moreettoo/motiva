"use server";

import { createElement } from "react";
import { revalidatePath } from "next/cache";

import { EmailConvite } from "@/emails/convite";

import { urlDoApp } from "../auth/links";
import { motivoParaNaoAlterar, podeConvidar } from "../auth/permissoes";
import { permitir } from "../auth/sessao";
import { gerarToken, hashToken, prazo } from "../auth/tokens";
import { CARGO } from "../dominio";
import { enviarEmail } from "../email/enviar";
import { fmt } from "../format";
import type { Resultado } from "../resultado";
import { db } from "../supabase";
import { CARGOS, type Cargo } from "../types";
import { contarSuperAdminsAtivos } from "./queries";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALIDADE_HORAS = Number(process.env.CONVITE_VALIDADE_DIAS ?? "7") * 24;

function revalidarUsuarios() {
  revalidatePath("/usuarios");
}

/** Gera token novo, grava o hash e manda o e-mail. Usado por criar e reenviar. */
async function emitirConvite(
  conviteId: string,
  destinatario: { email: string; cargo: Cargo; equipeNome: string | null; convidadorNome: string },
) {
  const token = gerarToken();
  const expiraEm = prazo(VALIDADE_HORAS);
  const { error } = await db
    .from("convites")
    .update({ token_hash: await hashToken(token), expira_em: expiraEm.toISOString() })
    .eq("id", conviteId);
  if (error) return { ok: false as const, erro: `Não foi possível gravar o convite: ${error.message}` };

  const link = urlDoApp(`/convite/${token}`);
  const envio = await enviarEmail({
    para: destinatario.email,
    assunto: "Você foi convidado para o HighwAI",
    react: createElement(EmailConvite, {
      nomeConvidador: destinatario.convidadorNome,
      cargoRotulo: CARGO[destinatario.cargo].rotulo,
      equipeNome: destinatario.equipeNome,
      link,
      validoAte: fmt.dataMedia(expiraEm),
    }),
  });
  if (envio.ok) await db.from("convites").update({ enviado_em: new Date().toISOString() }).eq("id", conviteId);

  return { ok: true as const, link, emailEnviado: envio.ok, aviso: envio.ok ? null : envio.erro };
}

export async function convidarUsuario(entrada: {
  email: string;
  cargo: Cargo;
  equipeId: number | null;
  substituirLider: boolean;
}): Promise<Resultado<{ id: string; link: string; emailEnviado: boolean; aviso: string | null }>> {
  const sessao = await permitir("super_admin", "admin");
  if (!sessao.ok) return sessao;

  const email = entrada.email.trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, erro: "Informe um e-mail válido." };
  if (!CARGOS.includes(entrada.cargo)) return { ok: false, erro: "Cargo inválido." };
  if (!podeConvidar(sessao.dados.cargo, entrada.cargo)) {
    return { ok: false, erro: "Só um Super Admin convida outro Super Admin." };
  }

  let equipeNome: string | null = null;
  if (entrada.cargo === "rocador") {
    if (entrada.equipeId == null) return { ok: false, erro: "Escolha a equipe que esta pessoa vai liderar." };
    const { data: equipe } = await db
      .from("equipes")
      .select("nome, ativo, lider:perfis!equipes_lider_id_fkey ( nome )")
      .eq("id", entrada.equipeId)
      .maybeSingle();
    if (!equipe || !equipe.ativo) return { ok: false, erro: "Equipe não encontrada ou desativada." };
    const lider = equipe.lider as unknown as { nome: string } | { nome: string }[] | null;
    const liderNome = Array.isArray(lider) ? lider[0]?.nome : lider?.nome;
    if (liderNome && !entrada.substituirLider) {
      return {
        ok: false,
        erro: `A ${equipe.nome} já tem líder (${liderNome}). Marque "substituir o líder atual" para continuar.`,
      };
    }
    equipeNome = equipe.nome as string;
  }

  const { data: existente } = await db.from("perfis").select("usuario_id").eq("email", email).maybeSingle();
  if (existente) return { ok: false, erro: "Já existe uma conta com este e-mail." };

  const { data: linha, error } = await db
    .from("convites")
    .insert({
      email,
      cargo: entrada.cargo,
      equipe_id: entrada.cargo === "rocador" ? entrada.equipeId : null,
      token_hash: `pendente-${crypto.randomUUID()}`, // substituido por emitirConvite logo abaixo
      expira_em: new Date().toISOString(),
      criado_por: sessao.dados.usuarioId,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // 23505: ux_convite_pendente_por_email.
    if (error.code === "23505") {
      return { ok: false, erro: "Já existe um convite pendente para este e-mail. Reenvie ou revogue aquele." };
    }
    return { ok: false, erro: `Não foi possível criar o convite: ${error.message}` };
  }
  if (!linha) return { ok: false, erro: "O convite não foi criado. Tente de novo." };

  const emissao = await emitirConvite(linha.id as string, {
    email,
    cargo: entrada.cargo,
    equipeNome,
    convidadorNome: sessao.dados.nome,
  });
  if (!emissao.ok) return emissao;

  revalidarUsuarios();
  return {
    ok: true,
    dados: {
      id: linha.id as string,
      link: emissao.link,
      emailEnviado: emissao.emailEnviado,
      aviso: emissao.aviso,
    },
  };
}

export async function reenviarConvite(
  id: string,
): Promise<Resultado<{ link: string; emailEnviado: boolean; aviso: string | null }>> {
  const sessao = await permitir("super_admin", "admin");
  if (!sessao.ok) return sessao;

  const { data: convite } = await db
    .from("convites")
    .select("id, email, cargo, aceito_em, revogado_em, equipe:equipes ( nome )")
    .eq("id", id)
    .maybeSingle();
  if (!convite || convite.aceito_em || convite.revogado_em) {
    return { ok: false, erro: "Este convite não está mais pendente." };
  }
  // A mesma trava de `convidarUsuario`, e pelo mesmo motivo: reenviar EMITE UM
  // TOKEN NOVO e devolve o link a quem clicou. Sem isto um Admin reenvia o
  // convite pendente de um Super Admin, copia o link da propria tela e aceita
  // no lugar dele -- virando Super Admin sem passar por nenhuma das travas de
  // `motivoParaNaoAlterar`.
  if (!podeConvidar(sessao.dados.cargo, convite.cargo as Cargo)) {
    return { ok: false, erro: "Só um Super Admin reenvia o convite de outro Super Admin." };
  }

  const equipe = convite.equipe as unknown as { nome: string } | { nome: string }[] | null;
  const emissao = await emitirConvite(convite.id as string, {
    email: convite.email as string,
    cargo: convite.cargo as Cargo,
    equipeNome: Array.isArray(equipe) ? (equipe[0]?.nome ?? null) : (equipe?.nome ?? null),
    convidadorNome: sessao.dados.nome,
  });
  if (!emissao.ok) return emissao;

  revalidarUsuarios();
  return { ok: true, dados: { link: emissao.link, emailEnviado: emissao.emailEnviado, aviso: emissao.aviso } };
}

export async function revogarConvite(id: string): Promise<Resultado> {
  const sessao = await permitir("super_admin", "admin");
  if (!sessao.ok) return sessao;

  const { data: convite } = await db.from("convites").select("cargo").eq("id", id).maybeSingle();
  if (!convite) return { ok: false, erro: "Este convite não está mais pendente." };
  if (!podeConvidar(sessao.dados.cargo, convite.cargo as Cargo)) {
    return { ok: false, erro: "Só um Super Admin revoga o convite de outro Super Admin." };
  }

  const { error } = await db
    .from("convites")
    .update({ revogado_em: new Date().toISOString() })
    .eq("id", id)
    .is("aceito_em", null);
  if (error) return { ok: false, erro: `Não foi possível revogar: ${error.message}` };

  revalidarUsuarios();
  return { ok: true, dados: undefined };
}

async function alvoDe(usuarioId: string) {
  const { data } = await db
    .from("perfis")
    .select("usuario_id, cargo, ativo")
    .eq("usuario_id", usuarioId)
    .maybeSingle();
  return data as { usuario_id: string; cargo: Cargo; ativo: boolean } | null;
}

export async function alterarCargo(usuarioId: string, cargo: Cargo): Promise<Resultado> {
  const sessao = await permitir("super_admin", "admin");
  if (!sessao.ok) return sessao;
  if (!CARGOS.includes(cargo)) return { ok: false, erro: "Cargo inválido." };

  const alvo = await alvoDe(usuarioId);
  if (!alvo) return { ok: false, erro: "Usuário não encontrado. Recarregue a página." };

  const motivo = motivoParaNaoAlterar({
    autorId: sessao.dados.usuarioId,
    autorCargo: sessao.dados.cargo,
    alvoId: alvo.usuario_id,
    alvoCargo: alvo.cargo,
    alvoAtivo: alvo.ativo,
    novoCargo: cargo,
    desativar: false,
    superAdminsAtivos: await contarSuperAdminsAtivos(),
  });
  if (motivo) return { ok: false, erro: motivo };

  // Quem deixa de ser Rocador deixa a equipe sem lider: um Admin nao lidera turma.
  if (alvo.cargo === "rocador" && cargo !== "rocador") {
    await db.from("equipes").update({ lider_id: null }).eq("lider_id", usuarioId);
  }

  const { error } = await db.from("perfis").update({ cargo }).eq("usuario_id", usuarioId);
  if (error) return { ok: false, erro: `Não foi possível alterar o cargo: ${error.message}` };
  const { error: erroAuth } = await db.auth.admin.updateUserById(usuarioId, { app_metadata: { cargo } });
  if (erroAuth) return { ok: false, erro: `O perfil mudou, mas o token não: ${erroAuth.message}. Tente de novo.` };

  revalidarUsuarios();
  return { ok: true, dados: undefined };
}

export async function alterarEquipeLiderada(
  usuarioId: string,
  equipeId: number | null,
  substituirLider: boolean,
): Promise<Resultado> {
  const sessao = await permitir("super_admin", "admin");
  if (!sessao.ok) return sessao;

  const alvo = await alvoDe(usuarioId);
  if (!alvo) return { ok: false, erro: "Usuário não encontrado. Recarregue a página." };
  if (alvo.cargo !== "rocador") return { ok: false, erro: "Só um Roçador lidera equipe." };

  if (equipeId != null) {
    const { data: equipe } = await db
      .from("equipes")
      .select("nome, ativo, lider_id")
      .eq("id", equipeId)
      .maybeSingle();
    if (!equipe || !equipe.ativo) return { ok: false, erro: "Equipe não encontrada ou desativada." };
    if (equipe.lider_id && equipe.lider_id !== usuarioId && !substituirLider) {
      return {
        ok: false,
        erro: `A ${equipe.nome} já tem líder. Marque "substituir o líder atual" para continuar.`,
      };
    }
  }

  // Solta a equipe anterior e assume a nova. Duas escritas simples: o UNIQUE de
  // `lider_id` garante que a pessoa nunca fica com duas.
  await db.from("equipes").update({ lider_id: null }).eq("lider_id", usuarioId);
  if (equipeId != null) {
    const { error } = await db.from("equipes").update({ lider_id: usuarioId }).eq("id", equipeId);
    if (error) return { ok: false, erro: `Não foi possível gravar a equipe: ${error.message}` };
  }

  revalidarUsuarios();
  return { ok: true, dados: undefined };
}

async function mudarAtivo(usuarioId: string, ativo: boolean): Promise<Resultado> {
  const sessao = await permitir("super_admin", "admin");
  if (!sessao.ok) return sessao;

  const alvo = await alvoDe(usuarioId);
  if (!alvo) return { ok: false, erro: "Usuário não encontrado. Recarregue a página." };

  const motivo = motivoParaNaoAlterar({
    autorId: sessao.dados.usuarioId,
    autorCargo: sessao.dados.cargo,
    alvoId: alvo.usuario_id,
    alvoCargo: alvo.cargo,
    alvoAtivo: alvo.ativo,
    novoCargo: null,
    desativar: !ativo,
    superAdminsAtivos: await contarSuperAdminsAtivos(),
  });
  if (motivo) return { ok: false, erro: motivo };

  // `ban_duration` bloqueia login novo; a sessao viva morre na proxima requisicao
  // porque `obterSessao` le `ativo`. "876000h" sao 100 anos; "none" desfaz.
  const { error: erroAuth } = await db.auth.admin.updateUserById(usuarioId, {
    ban_duration: ativo ? "none" : "876000h",
  });
  if (erroAuth) {
    return { ok: false, erro: `Não foi possível ${ativo ? "reativar" : "desativar"} no Auth: ${erroAuth.message}` };
  }

  const agora = new Date().toISOString();
  const { error } = await db
    .from("perfis")
    .update(
      ativo
        ? { ativo: true, desativado_em: null, desativado_por: null }
        : { ativo: false, desativado_em: agora, desativado_por: sessao.dados.usuarioId },
    )
    .eq("usuario_id", usuarioId);
  if (error) return { ok: false, erro: `Não foi possível gravar o perfil: ${error.message}` };

  if (!ativo) await db.from("equipes").update({ lider_id: null }).eq("lider_id", usuarioId);

  revalidarUsuarios();
  return { ok: true, dados: undefined };
}

export async function desativarUsuario(usuarioId: string): Promise<Resultado> {
  return mudarAtivo(usuarioId, false);
}

export async function reativarUsuario(usuarioId: string): Promise<Resultado> {
  return mudarAtivo(usuarioId, true);
}
