"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

import { NAVEGACAO, rotaAtiva } from "./barra-lateral";

/**
 * Barra inferior do celular. Substitui a lateral abaixo de 768px, onde 240px de
 * navegação fixa comeriam metade da tela útil.
 */
export function NavegacaoMovel() {
  const pathname = usePathname();
  const reduzido = useReducedMotion();

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* A grade sai do tamanho da lista, e não de uma classe fixa: `grid-cols-4`
          escrito na mão deixava o quinto item quebrar para uma segunda linha no
          dia em que a navegação crescesse. Vai por `style` porque o JIT do
          Tailwind não gera classe montada em tempo de execução. */}
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${NAVEGACAO.length}, minmax(0, 1fr))` }}
      >
        {NAVEGACAO.map((item) => {
          const ativo = rotaAtiva(pathname, item.href);
          const Icone = item.icone;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "relative flex min-h-11 flex-col items-center justify-center gap-1 px-1 py-2.5",
                  "transition-colors duration-150 ease-[var(--ease-out-quint)]",
                  ativo ? "text-ink" : "text-ink-3",
                )}
              >
                {ativo && (
                  <motion.span
                    layoutId="filete-movel"
                    aria-hidden="true"
                    transition={
                      reduzido
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 520, damping: 44, mass: 0.7 }
                    }
                    className="absolute inset-x-5 top-0 h-0.5 rounded-sm bg-accent-line"
                  />
                )}

                <Icone aria-hidden="true" className="size-5 shrink-0" />
                <span className={cn("max-w-full truncate text-2xs", ativo && "font-medium")}>
                  {item.rotulo}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
