"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

export type OpcaoSegmentada<T extends string> = {
  valor: T;
  rotulo: string;
  icone?: ReactNode;
  contagem?: number;
};

/**
 * Alternador de visão. Padrão WAI-ARIA de `radiogroup`: a seta move o foco E a
 * seleção (seleção automática), porque cada opção troca a lista inteira e o
 * gestor navega com o teclado enquanto lê a tabela.
 */
export function Segmentado<T extends string>({
  opcoes,
  valor,
  aoMudar,
  tamanho = "md",
  rotulo,
  className,
}: {
  opcoes: OpcaoSegmentada<T>[];
  valor: T;
  aoMudar: (valor: T) => void;
  tamanho?: "sm" | "md";
  rotulo: string;
  className?: string;
}) {
  const idIndicador = useId();
  const reduzido = useReducedMotion();
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);

  function aoTeclar(evento: KeyboardEvent<HTMLButtonElement>, indice: number) {
    const total = opcoes.length;
    let alvo = -1;

    if (evento.key === "ArrowRight" || evento.key === "ArrowDown") alvo = (indice + 1) % total;
    else if (evento.key === "ArrowLeft" || evento.key === "ArrowUp") alvo = (indice - 1 + total) % total;
    else if (evento.key === "Home") alvo = 0;
    else if (evento.key === "End") alvo = total - 1;
    else return;

    evento.preventDefault();
    botoes.current[alvo]?.focus();
    aoMudar(opcoes[alvo].valor);
  }

  if (opcoes.length === 0) return null;

  return (
    <div
      role="radiogroup"
      aria-label={rotulo}
      aria-orientation="horizontal"
      className={cn(
        // p-1 (4px) não é decoração: é a folga exata que o anel de foco
        // (2px + 2px de offset) precisa para não ser cortado pelo overflow.
        "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-md border border-border bg-surface p-1 scroll-thin",
        className,
      )}
    >
      {opcoes.map((opcao, indice) => {
        const ativo = opcao.valor === valor;

        return (
          <button
            key={opcao.valor}
            ref={(el) => {
              botoes.current[indice] = el;
            }}
            type="button"
            role="radio"
            aria-checked={ativo}
            tabIndex={ativo ? 0 : -1}
            onClick={() => aoMudar(opcao.valor)}
            onKeyDown={(evento) => aoTeclar(evento, indice)}
            className={cn(
              "relative isolate inline-flex shrink-0 items-center gap-1.5 rounded-sm font-medium whitespace-nowrap",
              tamanho === "sm" ? "h-7 px-2 text-xs" : "h-8 px-3 text-sm",
              ativo ? "text-ink" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {ativo && (
              <motion.span
                layoutId={idIndicador}
                aria-hidden="true"
                transition={
                  reduzido ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 44, mass: 0.7 }
                }
                className="absolute inset-0 -z-10 rounded-sm border border-border-strong bg-surface-2"
              >
                {/* Filete de acento: o único lugar em que o limão aparece grande. */}
                <span className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-sm bg-accent-line" />
              </motion.span>
            )}

            {opcao.icone && (
              <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:size-4">
                {opcao.icone}
              </span>
            )}

            <span className="min-w-0 truncate">{opcao.rotulo}</span>

            {opcao.contagem != null && (
              <span className={cn("tnum text-2xs", ativo ? "text-ink-2" : "text-ink-3")}>
                {fmt.n(opcao.contagem)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
