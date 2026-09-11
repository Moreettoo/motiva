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

/**
 * So caminho interno que o cargo pode ver; qualquer outra coisa cai na rota
 * inicial.
 *
 * A checagem por TEXTO -- comeca com "/" e nao com "//" -- parecia bastar e nao
 * bastava. O parser de URL do navegador normaliza a barra invertida em barra e
 * ignora tabulacao e quebra de linha no comeco da autoridade, entao dois
 * caminhos passavam pela guarda antiga e saiam do dominio:
 *
 *     "/" + "\\" + "evil.com"     -> origem https://evil.com
 *     "/" + TAB + "/evil.com"    -> origem https://evil.com
 *
 * `podeVerRota` nao segura: para quem nao e rocador, rota desconhecida devolve
 * `true` de proposito. Entao bastava mandar ao gestor um link
 * `/entrar?proximo=/\evil.com`: ele digitava a senha no dominio VERDADEIRO, o
 * login funcionava, e o navegador o entregava numa pagina do atacante pedindo a
 * senha de novo -- sem nenhum motivo para desconfiar, porque ele acabou de
 * entrar com sucesso no endereco certo.
 *
 * Quem decide se e caminho interno agora e o mesmo parser que o navegador usa:
 * resolvemos contra uma origem de mentira e so aceitamos se a origem
 * sobreviveu. O que volta e o caminho ja normalizado.
 */
function destinoSeguro(proximo: string | null | undefined, cargo: Cargo): string {
  const padrao = rotaInicial(cargo);
  if (!proximo) return padrao;

  const BASE = "https://interno.invalid";
  let url: URL;
  try {
    url = new URL(proximo, BASE);
  } catch {
    return padrao;
  }
  if (url.origin !== BASE) return padrao;

  const caminho = url.pathname + url.search + url.hash;
  return podeVerRota(cargo, url.pathname) ? caminho : padrao;
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

  const { data: perfil, error: erroPerfil } = await db
    .from("perfis")
    .select("cargo, ativo, senha_provisoria")
    .eq("usuario_id", data.user.id)
    .maybeSingle();

  /* Sem esta separacao, "a leitura falhou" e "ativo = false" davam a MESMA
     resposta: a pessoa com a senha certa era deslogada e lia, em tom
     definitivo, que um administrador desativou a conta dela. Aqui nao ha
     signOut: a credencial esta certa, quem falhou foi o banco. */
  if (erroPerfil) {
    return { ok: false, erro: "Não foi possível confirmar seu acesso agora. Tente de novo em alguns segundos." };
  }

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
