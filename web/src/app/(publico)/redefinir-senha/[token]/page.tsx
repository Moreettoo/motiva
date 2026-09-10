import type { Metadata } from "next";

import { FormularioRedefinir } from "./_componentes/formulario-redefinir";

export const metadata: Metadata = { title: "Senha nova" };
export const dynamic = "force-dynamic";

/** Nao valida o token aqui: quem valida e a action, que precisa fazer isso de
 *  qualquer forma. Validar duas vezes so daria duas mensagens diferentes. */
export default async function PaginaRedefinirSenha({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <FormularioRedefinir token={token} />;
}
