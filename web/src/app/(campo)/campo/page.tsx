import type { Metadata } from "next";

import { AppCampo } from "./_componentes/app-campo";

export const metadata: Metadata = { title: "Campo · HighwAI" };

/* Estatica de proposito: nada de cookie, header ou banco aqui. E isso que permite
   o service worker guardar esta pagina e o app abrir a frio sem sinal. */
export default function PaginaCampo() {
  return <AppCampo />;
}
