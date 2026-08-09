import type { ComponentProps, ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

/* Módulo compartilhado de propósito: a leitura (página de servidor) monta a
   tabela direto, e só a página que ordena precisa ser cliente. */

export type Alinhamento = "esquerda" | "centro" | "direita";

const ALINHAMENTO: Record<Alinhamento, string> = {
  esquerda: "text-left",
  centro: "text-center",
  direita: "text-right",
};

const JUSTIFICA: Record<Alinhamento, string> = {
  esquerda: "justify-start",
  centro: "justify-center",
  direita: "justify-end",
};

/**
 * O cabeçalho gruda no topo do wrapper rolável. Para o `sticky` valer, o wrapper
 * precisa de altura limitada: passe `className="max-h-[60vh]"` (ou similar).
 */
export function Tabela({
  children,
  className,
  rotulo,
}: {
  children: ReactNode;
  className?: string;
  /** Nome acessível da tabela. Vira <caption> só para leitor de tela. */
  rotulo?: string;
}) {
  return (
    <div
      className={cn(
        "relative w-full overflow-auto overscroll-contain rounded-lg border border-border bg-surface scroll-thin",
        className,
      )}
    >
      <table className="w-full border-separate border-spacing-0 text-sm">
        {rotulo && <caption className="sr-only">{rotulo}</caption>}
        {children}
      </table>
    </div>
  );
}

export function TabelaCabecalho({ className, children, ...props }: ComponentProps<"thead">) {
  return (
    <thead {...props} className={cn("bg-surface-3", className)}>
      {children}
    </thead>
  );
}

export function TabelaCorpo({ className, children, ...props }: ComponentProps<"tbody">) {
  return (
    <tbody {...props} className={className}>
      {children}
    </tbody>
  );
}

export function TabelaLinha({
  className,
  selecionada,
  children,
  ...props
}: ComponentProps<"tr"> & { selecionada?: boolean }) {
  return (
    <tr
      {...props}
      aria-selected={selecionada || undefined}
      className={cn(
        "group/linha",
        selecionada ? "bg-accent-soft" : "hover:bg-surface-2",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TabelaCelula({
  alinhamento = "esquerda",
  numerica,
  className,
  children,
  ...props
}: ComponentProps<"td"> & { alinhamento?: Alinhamento; numerica?: boolean }) {
  return (
    <td
      {...props}
      className={cn(
        "border-b border-border px-3 py-2 align-middle text-ink",
        numerica ? "tnum text-right" : ALINHAMENTO[alinhamento],
        className,
      )}
    >
      {children}
    </td>
  );
}

/** `ordem` aceita as duas grafias: a curta do estado local e a do `aria-sort`. */
export type Ordem = "asc" | "desc" | "ascending" | "descending" | "none";

const ARIA_ORDEM: Record<Ordem, "ascending" | "descending" | "none"> = {
  asc: "ascending",
  ascending: "ascending",
  desc: "descending",
  descending: "descending",
  none: "none",
};

export function TabelaTitulo({
  alinhamento = "esquerda",
  numerica,
  ordenavel,
  ordem,
  aoOrdenar,
  className,
  children,
  ...props
}: Omit<ComponentProps<"th">, "scope"> & {
  alinhamento?: Alinhamento;
  numerica?: boolean;
  ordenavel?: boolean;
  ordem?: Ordem | null;
  aoOrdenar?: () => void;
}) {
  const alinha = numerica ? "direita" : alinhamento;
  const estado = ordenavel ? ARIA_ORDEM[ordem ?? "none"] : undefined;

  const base = cn(
    "sticky top-0 z-10 border-b border-border bg-surface-3",
    "text-2xs font-medium tracking-wider text-ink-3 uppercase",
    ALINHAMENTO[alinha],
    numerica && "tnum",
  );

  if (!ordenavel) {
    return (
      <th {...props} scope="col" className={cn(base, "px-3 py-2", className)}>
        {children}
      </th>
    );
  }

  const Icone = estado === "ascending" ? ArrowUp : estado === "descending" ? ArrowDown : ChevronsUpDown;

  return (
    <th {...props} scope="col" aria-sort={estado} className={cn(base, "p-0", className)}>
      <button
        type="button"
        onClick={aoOrdenar}
        className={cn(
          "group/ordem inline-flex w-full items-center gap-1 px-3 py-2 tracking-wider uppercase hover:text-ink",
          JUSTIFICA[alinha],
        )}
      >
        <span className="min-w-0 truncate">{children}</span>
        <Icone
          aria-hidden="true"
          className={cn(
            "size-3 shrink-0 transition-opacity duration-150",
            estado === "none"
              ? "opacity-0 group-hover/ordem:opacity-70 group-focus-visible/ordem:opacity-70"
              : "text-accent opacity-100",
          )}
        />
      </button>
    </th>
  );
}
