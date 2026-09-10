import type { Metadata } from "next";

import { exigirSessao } from "@/lib/auth/sessao";

import { FormularioDefinirSenha } from "./_componentes/formulario-definir-senha";

export const metadata: Metadata = { title: "Definir senha" };
export const dynamic = "force-dynamic";

export default async function PaginaDefinirSenha() {
  const sessao = await exigirSessao({ permitirSenhaProvisoria: true });
  return <FormularioDefinirSenha nome={sessao.nome} />;
}
