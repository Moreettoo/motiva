import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { rotaInicial } from "@/lib/auth/permissoes";
import { obterSessao } from "@/lib/auth/sessao";

import { FormularioEsqueci } from "./_componentes/formulario-esqueci";

export const metadata: Metadata = { title: "Esqueci a senha" };
export const dynamic = "force-dynamic";

export default async function PaginaEsqueciASenha() {
  // A guarda mora aqui, e nao no proxy, pelo mesmo motivo de `/entrar`:
  // `obterSessao` le o PERFIL, e o proxy so tem o token — que sobrevive a
  // desativacao da conta e fechava um ciclo de redirecionamento. Ver `proxy.ts`.
  const sessao = await obterSessao();
  if (sessao) redirect(rotaInicial(sessao.cargo));
  return <FormularioEsqueci />;
}
