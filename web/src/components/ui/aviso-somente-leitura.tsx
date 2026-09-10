import { Eye } from "lucide-react";

/** Uma frase, no topo da tela, para o Analista saber por que nao ha botoes. */
export function AvisoSomenteLeitura({ podeEscrever }: { podeEscrever: boolean }) {
  if (podeEscrever) return null;
  return (
    <p className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-ink-2">
      <Eye aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
      Acesso somente leitura: você vê tudo, mas as ações ficam com Admin e Super Admin.
    </p>
  );
}
