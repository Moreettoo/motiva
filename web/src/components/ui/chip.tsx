import type * as React from "react";

import { IconeDominio } from "@/components/viz/legenda";
import { RISCO, STATUS } from "@/lib/dominio";
import type { Risco, StatusAgendamento } from "@/lib/types";
import { cn } from "@/lib/utils";

export type TomChip = "neutro" | "acento" | "good" | "warning" | "serious" | "critical";

const TONS: Record<TomChip, string> = {
  neutro: "border-border bg-surface-3 text-ink-2",
  acento: "border-transparent bg-accent-soft text-accent",
  good: "border-transparent bg-good-soft text-good-ink",
  warning: "border-transparent bg-warning-soft text-warning-ink",
  serious: "border-transparent bg-serious-soft text-serious-ink",
  critical: "border-transparent bg-critical-soft text-critical-ink",
};

const BASE_CHIP =
  "inline-flex max-w-full items-center gap-1.5 rounded-full border font-medium whitespace-nowrap";

const TAMANHOS_CHIP = {
  sm: "h-5 px-1.5 text-2xs [&_svg]:size-3",
  md: "h-6 px-2 text-xs [&_svg]:size-3.5",
} as const;

export function Chip({
  tom = "neutro",
  tamanho = "md",
  icone,
  children,
  className,
}: {
  tom?: TomChip;
  tamanho?: "sm" | "md";
  icone?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn(BASE_CHIP, TAMANHOS_CHIP[tamanho], TONS[tom], className)}>
      {icone ? (
        <span aria-hidden="true" className="inline-flex shrink-0">
          {icone}
        </span>
      ) : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * Nivel de risco. Cor NUNCA sozinha: no tema claro `warning` e `serious` ficam
 * abaixo de 3:1 de proposito, e o par icone + rotulo e a mitigacao.
 */
export function ChipRisco({ risco, tamanho = "md" }: { risco: Risco; tamanho?: "sm" | "md" }) {
  const token = RISCO[risco];

  return (
    <span
      className={cn(BASE_CHIP, TAMANHOS_CHIP[tamanho], "border-transparent")}
      style={{ color: token.tinta, backgroundColor: token.fundo }}
      title={token.descricao}
    >
      <IconeDominio nome={token.icone} />
      <span className="truncate">{token.rotulo}</span>
    </span>
  );
}

export function ChipStatus({ status }: { status: StatusAgendamento }) {
  const token = STATUS[status];

  return (
    <span
      className={cn(BASE_CHIP, TAMANHOS_CHIP.md, "border-transparent")}
      style={{ color: token.tinta, backgroundColor: token.fundo }}
    >
      <IconeDominio nome={token.icone} />
      <span className="truncate">{token.rotulo}</span>
    </span>
  );
}
