import type * as React from "react";
import { CircleCheck, Info, OctagonAlert, TriangleAlert, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { BotaoIcone } from "./botao";

export type TomAviso = "info" | "good" | "warning" | "critical";

const TONS = {
  info: {
    icone: Info,
    caixa: "border-border bg-surface-2",
    tinta: "text-ink",
    filete: "var(--accent-line)",
  },
  good: {
    icone: CircleCheck,
    caixa: "border-transparent bg-good-soft",
    tinta: "text-good-ink",
    filete: "var(--good)",
  },
  warning: {
    icone: TriangleAlert,
    caixa: "border-transparent bg-warning-soft",
    tinta: "text-warning-ink",
    filete: "var(--warning)",
  },
  critical: {
    icone: OctagonAlert,
    caixa: "border-transparent bg-critical-soft",
    tinta: "text-critical-ink",
    filete: "var(--critical)",
  },
} as const;

/**
 * Mensagem de sistema. `warning` e `critical` interrompem a leitura de tela
 * (role="alert"); `info` e `good` so entram na fila (aria-live="polite").
 */
export function Aviso({
  tom = "info",
  titulo,
  children,
  acao,
  aoFechar,
  className,
}: {
  tom?: TomAviso;
  titulo: string;
  children?: React.ReactNode;
  acao?: React.ReactNode;
  aoFechar?: () => void;
  className?: string;
}) {
  const token = TONS[tom];
  const Icone = token.icone;
  const urgente = tom === "warning" || tom === "critical";

  return (
    <div
      role={urgente ? "alert" : "status"}
      aria-live={urgente ? undefined : "polite"}
      style={{ borderLeftColor: token.filete }}
      className={cn(
        "flex items-start gap-3 rounded-md border border-l-2 p-3",
        token.caixa,
        className,
      )}
    >
      <Icone aria-hidden="true" className={cn("mt-px size-4 shrink-0", token.tinta)} />

      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium break-words", token.tinta)}>{titulo}</p>
        {children ? (
          <div className="mt-1 text-sm text-ink-2 [&_p]:break-words">{children}</div>
        ) : null}
        {acao ? <div className="mt-3 flex flex-wrap gap-2">{acao}</div> : null}
      </div>

      {aoFechar ? (
        <BotaoIcone rotulo="Fechar aviso" tamanho="sm" onClick={aoFechar} className="-mt-1 -mr-1">
          <X />
        </BotaoIcone>
      ) : null}
    </div>
  );
}
