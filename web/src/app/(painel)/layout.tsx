import { redirect } from "next/navigation";

import { Shell } from "@/components/shell/shell";
import { rotaInicial } from "@/lib/auth/permissoes";
import { exigirSessao } from "@/lib/auth/sessao";

/**
 * Nada aqui pode ser pre-renderizado: o `analisar_lote.py` reescreve previsoes
 * e agendamentos todo dia por fora do app. Antes isto ficava no layout raiz;
 * saiu de la porque `/campo` precisa ser estatico para o service worker.
 */
export const dynamic = "force-dynamic";

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  // Guarda do casco. Cada pagina repete a sua (`exigirCargo`): layout nao
  // re-renderiza em toda navegacao, e a doc do Next manda checar perto do dado.
  const sessao = await exigirSessao();
  if (sessao.cargo === "rocador") redirect(rotaInicial(sessao.cargo));

  return <Shell>{children}</Shell>;
}
