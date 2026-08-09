import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Cabeçalho de tela. Todas as páginas passam por aqui, então o espaçamento e a
 * hierarquia do título ficam decididos em um lugar só.
 */
export function CabecalhoPagina({
  titulo,
  descricao,
  acoes,
  metricas,
  className,
}: {
  titulo: string;
  descricao?: string;
  acoes?: React.ReactNode;
  /** Faixa de números à direita do título — use `MetricaCabecalho`. */
  metricas?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-5 border-b border-border pb-5",
        "lg:flex-row lg:items-end lg:justify-between lg:gap-8",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-ink">{titulo}</h1>
        {descricao ? (
          <p className="mt-1.5 max-w-prose text-sm text-ink-2">{descricao}</p>
        ) : null}
      </div>

      {metricas || acoes ? (
        <div className="flex shrink-0 flex-wrap items-end gap-x-8 gap-y-4">
          {metricas ? (
            <div className="flex flex-wrap items-end gap-x-8 gap-y-4">{metricas}</div>
          ) : null}
          {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
        </div>
      ) : null}
    </header>
  );
}

/**
 * Número solto da faixa do cabeçalho. O rótulo vem pequeno e em maiúsculas
 * ACIMA do valor — o número é quem carrega o peso visual.
 */
export function MetricaCabecalho({
  rotulo,
  valor,
  unidade,
  className,
}: {
  rotulo: string;
  valor: string | number;
  unidade?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <span className="block text-2xs tracking-widest text-ink-3 uppercase">{rotulo}</span>
      <span className="mt-1 flex items-baseline gap-1.5">
        <span className="tnum truncate text-lg leading-none font-semibold text-ink">{valor}</span>
        {unidade ? <span className="shrink-0 text-xs text-ink-3">{unidade}</span> : null}
      </span>
    </div>
  );
}
