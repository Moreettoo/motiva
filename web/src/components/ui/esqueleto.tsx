import { cn } from "@/lib/utils";

/** Pulso de opacidade. `prefers-reduced-motion` ja neutraliza em globals.css. */
export function Esqueleto({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-sm bg-surface-3", className)}
    />
  );
}

/** Larguras irregulares — bloco uniforme nao le como texto. */
const LARGURAS = ["w-full", "w-11/12", "w-10/12", "w-9/12"];

export function EsqueletoTexto({ linhas = 3 }: { linhas?: number }) {
  return (
    <div aria-hidden="true" className="space-y-2">
      {Array.from({ length: Math.max(1, linhas) }, (_, i) => (
        <Esqueleto
          key={i}
          className={cn("h-3", i === linhas - 1 ? "w-7/12" : LARGURAS[i % LARGURAS.length])}
        />
      ))}
    </div>
  );
}

export function EsqueletoCartao() {
  return (
    <div
      role="status"
      aria-label="Carregando…"
      className="rounded-lg border border-border bg-surface p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <Esqueleto className="h-3 w-32" />
        <Esqueleto className="size-4 rounded-sm" />
      </div>
      <Esqueleto className="mt-4 h-8 w-24" />
      <div className="mt-4">
        <EsqueletoTexto linhas={2} />
      </div>
      <Esqueleto className="mt-4 h-1 w-full" />
    </div>
  );
}
