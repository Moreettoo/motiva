import type * as React from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

export type DeltaIndicador = {
  valor: string;
  direcao: "sobe" | "desce" | "estavel";
  /** true = a variacao e boa para a operacao; false = ruim; ausente = neutra. */
  bom?: boolean;
};

const SETAS = {
  sobe: ArrowUpRight,
  desce: ArrowDownRight,
  estavel: Minus,
} as const;

/** Leitura para quem nao ve a seta nem a cor. */
const DIRECAO_TEXTO = {
  sobe: "em alta",
  desce: "em queda",
  estavel: "estável",
} as const;

/** Exportado: o verso do card "Crescimento médio" reaproveita esta mesma leitura por espécie. */
export function Delta({ delta }: { delta: DeltaIndicador }) {
  const Seta = SETAS[delta.direcao];
  const tinta =
    delta.bom == null ? "text-ink-2" : delta.bom ? "text-good-ink" : "text-critical-ink";

  return (
    <p className={cn("mt-1.5 flex items-center gap-1 text-xs font-medium", tinta)}>
      <Seta aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="tnum truncate">{delta.valor}</span>
      <span className="sr-only">{DIRECAO_TEXTO[delta.direcao]}</span>
    </p>
  );
}

/**
 * Bloco de leitura do topo do painel.
 *
 * O numero vem primeiro na hierarquia visual; o rotulo fica pequeno, acima,
 * em maiusculas — le como mostrador de instrumento, nao como cartao de SaaS.
 */
export function Indicador({
  rotulo,
  valor,
  unidade,
  delta,
  icone,
  nota,
  grafico,
  href,
  indice = 0,
  className,
}: {
  rotulo: string;
  valor: string | number;
  unidade?: string;
  delta?: DeltaIndicador;
  icone?: React.ReactNode;
  nota?: string;
  grafico?: React.ReactNode;
  href?: string;
  indice?: number;
  className?: string;
}) {
  const conteudo = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-2xs font-medium tracking-wider text-ink-3 uppercase">
          {rotulo}
        </span>
        {icone ? (
          <span aria-hidden="true" className="shrink-0 text-ink-3 [&_svg]:size-4">
            {icone}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex min-w-0 items-baseline gap-1.5">
        <span className="tnum truncate text-2xl leading-none font-semibold text-ink">
          {valor}
        </span>
        {unidade ? (
          <span className="shrink-0 text-xs text-ink-3">{unidade}</span>
        ) : null}
      </div>

      {delta ? <Delta delta={delta} /> : null}
      {nota ? <p className="mt-1.5 line-clamp-2 text-xs text-ink-3">{nota}</p> : null}
      {grafico ? <div className="mt-3">{grafico}</div> : null}
    </>
  );

  const base = cn(
    "rise relative block overflow-hidden rounded-lg border border-border bg-surface p-4",
    className,
  );

  const estilo = { "--i": indice } as React.CSSProperties;

  if (!href) {
    return (
      <div className={base} style={estilo}>
        {conteudo}
      </div>
    );
  }

  return (
    <Link
      href={href}
      style={estilo}
      className={cn(
        base,
        "group transition-[background-color,border-color] duration-200 ease-[var(--ease-out-quint)] hover:border-border-strong hover:bg-surface-2",
      )}
    >
      {conteudo}
      {/* Filete de acento: so aparece no bloco vivo, e o unico limao grande da tela. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-accent-line transition-transform duration-200 ease-[var(--ease-out-quint)] group-hover:scale-x-100 group-focus-visible:scale-x-100"
      />
    </Link>
  );
}
