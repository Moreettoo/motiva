"use server";

import type { Resultado } from "../resultado";
import { db } from "../supabase";
import { buscarConvitePorToken } from "../usuarios/convites";
import { rotaInicial } from "./permissoes";
import { clienteSessao } from "./servidor";
import { erroDaSenha } from "./tokens";

/**
 * O aceite do convite mora em arquivo proprio, e nao em `acoes.ts` junto de
 * entrar/sair: e a unica action publica que CRIA usuario, e o par
 * token + `admin.createUser` nao tem nada a ver com a sessao de quem ja entrou.
 */
export async function aceitarConvite(entrada: {
  token: string;
  nome: string;
  senha: string;
  confirmacao: string;
}): Promise<Resultado<{ destino: string }>> {
  const achado = await buscarConvitePorToken(entrada.token);
  if (achado.situacao !== "valido" || !achado.convite) {
    const motivo: Record<string, string> = {
      expirado: "Este convite expirou. Peça um novo a quem convidou você.",
      revogado: "Este convite foi cancelado.",
      aceito: "Este convite já foi usado. Entre com sua senha.",
      inexistente: "Convite não encontrado. Confira o link do e-mail.",
    };
    return { ok: false, erro: motivo[achado.situacao] };
  }

  const nome = entrada.nome.trim().replace(/\s+/g, " ");
  if (nome.length < 2 || nome.length > 120) return { ok: false, erro: "Escreva seu nome como a equipe conhece você." };
  const erroSenha = erroDaSenha(entrada.senha);
  if (erroSenha) return { ok: false, erro: erroSenha };
  if (entrada.senha !== entrada.confirmacao) return { ok: false, erro: "As duas senhas não são iguais." };

  const convite = achado.convite;
  const { data: criado, error } = await db.auth.admin.createUser({
    email: convite.email,
    password: entrada.senha,
    email_confirm: true,
    app_metadata: { cargo: convite.cargo },
    user_metadata: { nome },
  });
  if (error || !criado.user) {
    if (error?.message.toLowerCase().includes("already")) {
      return { ok: false, erro: "Já existe uma conta com este e-mail. Entre com sua senha." };
    }
    return { ok: false, erro: `Não foi possível criar a conta: ${error?.message ?? "erro desconhecido"}` };
  }

  const { error: erroPerfil } = await db.from("perfis").insert({
    usuario_id: criado.user.id,
    nome,
    email: convite.email,
    cargo: convite.cargo,
    convidado_por: convite.criado_por,
  });
  if (erroPerfil) {
    return {
      ok: false,
      erro: `A conta foi criada mas o perfil não: ${erroPerfil.message}. Fale com um administrador.`,
    };
  }

  if (convite.cargo === "rocador" && convite.equipe_id != null) {
    // Substitui o lider anterior, se houver: quem convidou ja confirmou isso.
    await db.from("equipes").update({ lider_id: criado.user.id }).eq("id", convite.equipe_id);
  }

  await db
    .from("convites")
    .update({ aceito_em: new Date().toISOString(), usuario_id: criado.user.id })
    .eq("id", convite.id);

  const supabase = await clienteSessao();
  await supabase.auth.signInWithPassword({ email: convite.email, password: entrada.senha });
  return { ok: true, dados: { destino: rotaInicial(convite.cargo) } };
}
