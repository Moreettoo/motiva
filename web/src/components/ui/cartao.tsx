import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Superficie base do painel.
 *
 * Elevacao vem de borda + fundo, nunca de sombra: em uma tela com dezenas de
 * blocos, sombra vira ruido e o gestor perde a leitura de qual bloco esta vivo.
 */
export function Cartao({ className, children, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-lg border border-border bg-surface", className)}
      {...props}
    >
      {children}
    </section>
  );
}

type NivelTitulo = "h1" | "h2" | "h3" | "h4";

export function CartaoCabecalho({
  titulo,
  descricao,
  acoes,
  icone,
  como: Titulo = "h2",
  className,
}: {
  titulo: string;
  descricao?: string;
  acoes?: React.ReactNode;
  icone?: React.ReactNode;
  como?: NivelTitulo;
  className?: string;
}) {
  return (
    <header className={cn("flex items-start gap-3 p-5", className)}>
      {icone ? (
        <span
          aria-hidden="true"
          className="mt-px inline-flex shrink-0 text-ink-3 [&_svg]:size-4"
        >
          {icone}
        </span>
      ) : null}

      <div className="min-w-0 flex-1">
        <Titulo className="text-base font-medium break-words text-ink">{titulo}</Titulo>
        {descricao ? (
          <p className="mt-1 text-xs text-ink-3 break-words">{descricao}</p>
        ) : null}
      </div>

      {acoes ? (
        <div className="-my-1 flex shrink-0 items-center gap-2">{acoes}</div>
      ) : null}
    </header>
  );
}

/** Corpo. `pt-0` porque quase sempre segue um cabecalho; sobrescreva via className. */
export function CartaoCorpo({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("p-5 pt-0", className)} {...props}>
      {children}
    </div>
  );
}

export function CartaoRodape({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-5 py-3 text-xs text-ink-3",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
