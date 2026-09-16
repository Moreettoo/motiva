import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Uma tela da pagina.
 *
 * `min-h`, nunca `h`: a seccao ocupa a janela inteira quando cabe e CRESCE
 * quando nao cabe. Altura fixa cortaria o ultimo grafico num notebook baixo ou
 * com zoom de acessibilidade, e o encaixe (`proximity`, ver `globals.css`) sai
 * do caminho justamente nesse caso.
 *
 * `3.5rem` e a barra superior, que e `sticky top-0`.
 */
export function Secao({
  numero,
  titulo,
  descricao,
  children,
  primeira = false,
}: {
  numero?: string;
  titulo?: string;
  descricao?: string;
  children: ReactNode;
  primeira?: boolean;
}) {
  return (
    <section
      className={cn(
        "secao-encaixada flex min-h-[calc(100dvh-3.5rem)] min-w-0 flex-col justify-center gap-6 py-10",
        primeira && "pt-0",
      )}
    >
      {titulo ? (
        <div className="flex items-baseline gap-3">
          {numero ? (
            <span
              aria-hidden="true"
              className="tnum shrink-0 font-mono text-2xs tracking-widest"
              style={{ color: "var(--accent)" }}
            >
              {numero}
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-ink">{titulo}</h2>
            {descricao ? <p className="mt-0.5 text-sm text-ink-3">{descricao}</p> : null}
          </div>
        </div>
      ) : null}
      {children}
    </section>
  );
}
