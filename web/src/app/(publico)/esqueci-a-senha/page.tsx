import type { Metadata } from "next";

import { FormularioEsqueci } from "./_componentes/formulario-esqueci";

export const metadata: Metadata = { title: "Esqueci a senha" };

export default function PaginaEsqueciASenha() {
  return <FormularioEsqueci />;
}
