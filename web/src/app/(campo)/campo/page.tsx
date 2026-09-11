import type { Metadata } from "next";

import { AppCampo } from "./_componentes/app-campo";

/* So "Campo": o `template` de `app/layout.tsx` e que acrescenta " · HighwAI",
   como faz em toda outra pagina. Escrito por extenso aqui, o titulo saia
   "Campo · HighwAI · HighwAI" — na aba do navegador e, pior, no nome da janela
   do app instalado. */
export const metadata: Metadata = { title: "Campo" };

/* Estatica de proposito: nada de cookie, header ou banco aqui. E isso que permite
   o service worker guardar esta pagina e o app abrir a frio sem sinal. */
export default function PaginaCampo() {
  return <AppCampo />;
}
