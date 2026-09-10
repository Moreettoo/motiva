import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { rotaInicial } from "@/lib/auth/permissoes";
import { obterSessao } from "@/lib/auth/sessao";

import { FormularioEntrar } from "./_componentes/formulario-entrar";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function PaginaEntrar({ searchParams }: { searchParams: Promise<{ proximo?: string }> }) {
  const sessao = await obterSessao();
  if (sessao) redirect(rotaInicial(sessao.cargo));
  const { proximo } = await searchParams;
  return <FormularioEntrar proximo={proximo ?? null} />;
}
