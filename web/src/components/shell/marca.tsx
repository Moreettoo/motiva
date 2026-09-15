import { cn } from "@/lib/utils";

/** O logo do HighwAI: a folha dupla de `docs/highwai-logo.webp`, gerada por `npm run icones`. */
export function Marca({
  tamanho = 22,
  comTexto = false,
  tamanhoTexto = "text-base",
  className,
}: {
  tamanho?: number;
  comTexto?: boolean;
  /** Classe Tailwind de tamanho de fonte do texto, independente do tamanho do icone. */
  tamanhoTexto?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icones/highwai-logo.png"
        alt=""
        width={tamanho}
        height={tamanho}
        className="shrink-0 object-contain"
      />

      {comTexto ? (
        <span className={cn("leading-none font-semibold tracking-tight text-ink", tamanhoTexto)}>
          HighwAI
        </span>
      ) : null}
    </span>
  );
}
