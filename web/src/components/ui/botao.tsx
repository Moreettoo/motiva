import type * as React from "react";
import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export type VarianteBotao = "primario" | "secundario" | "fantasma" | "perigo";
export type TamanhoBotao = "sm" | "md";

/** Hover e active AUMENTAM contraste — nunca clareiam para longe da tinta. */
const VARIANTES: Record<VarianteBotao, string> = {
  primario:
    "border border-transparent bg-accent text-accent-ink hover:bg-accent-hover active:bg-accent-hover",
  secundario:
    "border border-border bg-surface-2 text-ink hover:border-border-strong hover:bg-surface-3 active:bg-surface-3",
  fantasma:
    "border border-transparent bg-transparent text-ink-2 hover:bg-surface-3 hover:text-ink active:bg-surface-3",
  perigo:
    "border border-critical-soft bg-transparent text-critical-ink hover:border-critical hover:bg-critical-soft active:bg-critical-soft",
};

const TAMANHOS: Record<TamanhoBotao, string> = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-9 gap-2 px-4 text-sm",
};

/** So background-color, border-color, color e transform entram na transicao. */
const BASE =
  "relative inline-flex cursor-pointer select-none items-center justify-center rounded-md font-medium whitespace-nowrap " +
  "transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out-quint)] " +
  "active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0";

/**
 * As classes do botao sem o `<button>`.
 *
 * Existe para o caso do `<Link>` do Next, que precisa continuar sendo uma
 * ancora de verdade (clique do meio, "abrir em nova aba") mas tem que ler como
 * botao. Envolver o Link num `<Botao>` daria um botao dentro de uma ancora, que
 * e HTML invalido e quebra o foco de teclado.
 */
export function classesBotao(
  variante: VarianteBotao = "secundario",
  tamanho: TamanhoBotao = "md",
  className?: string,
): string {
  return cn(BASE, TAMANHOS[tamanho], VARIANTES[variante], className);
}

export function Botao({
  variante = "secundario",
  tamanho = "md",
  carregando = false,
  iconeEsquerda,
  iconeDireita,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & {
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  carregando?: boolean;
  iconeEsquerda?: React.ReactNode;
  iconeDireita?: React.ReactNode;
}) {
  return (
    <button
      type={type}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={cn(BASE, TAMANHOS[tamanho], VARIANTES[variante], className)}
      {...props}
    >
      {/* O rotulo continua no fluxo, so invisivel: a largura do botao nao pula
          quando a acao comeca. */}
      {carregando ? (
        <>
          <span
            aria-hidden="true"
            className="absolute inset-0 grid place-items-center"
          >
            <LoaderCircle className="size-4 animate-spin" />
          </span>
          <span className="sr-only">Carregando…</span>
        </>
      ) : null}

      <span
        className={cn(
          "inline-flex min-w-0 items-center",
          tamanho === "sm" ? "gap-1.5" : "gap-2",
          carregando && "opacity-0",
        )}
      >
        {iconeEsquerda ? (
          <span aria-hidden="true" className="inline-flex shrink-0 [&_svg]:size-4">
            {iconeEsquerda}
          </span>
        ) : null}
        {children != null ? <span className="truncate">{children}</span> : null}
        {iconeDireita ? (
          <span aria-hidden="true" className="inline-flex shrink-0 [&_svg]:size-4">
            {iconeDireita}
          </span>
        ) : null}
      </span>
    </button>
  );
}

const TAMANHOS_ICONE: Record<TamanhoBotao, string> = {
  sm: "size-8",
  md: "size-9",
};

export function BotaoIcone({
  rotulo,
  variante = "fantasma",
  tamanho = "md",
  className,
  children,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & {
  rotulo: string;
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  children: React.ReactNode;
}) {
  return (
    <button
      type={type}
      aria-label={rotulo}
      title={rotulo}
      className={cn(
        BASE,
        TAMANHOS_ICONE[tamanho],
        VARIANTES[variante],
        "px-0 [&_svg]:size-4",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="inline-flex">
        {children}
      </span>
    </button>
  );
}
