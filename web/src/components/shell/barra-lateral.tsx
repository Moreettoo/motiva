"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { CalendarRange, LayoutDashboard, MessageSquareText, Waypoints } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Dica } from "@/components/ui/dica";
import { cn } from "@/lib/utils";

import { AlternadorTema } from "./alternador-tema";
import { Marca } from "./marca";

export type ItemNavegacao = {
  href: string;
  rotulo: string;
  icone: LucideIcon;
  /** Frase curta que a Dica mostra quando a lateral está colapsada. */
  descricao: string;
};

/** Fonte única da navegação do produto: a lateral, a barra inferior do celular
 *  e a seção "Ir para" da paleta leem esta mesma lista. */
export const NAVEGACAO: ItemNavegacao[] = [
  { href: "/", rotulo: "Painel", icone: LayoutDashboard, descricao: "Visão geral da malha" },
  { href: "/malha", rotulo: "Malha", icone: Waypoints, descricao: "Trechos por rodovia, em régua de km" },
  { href: "/agenda", rotulo: "Agenda", icone: CalendarRange, descricao: "Roçadas sugeridas e aprovadas" },
  { href: "/copiloto", rotulo: "Copiloto", icone: MessageSquareText, descricao: "Perguntas em português sobre a malha" },
];

export function rotaAtiva(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/* A lateral colapsa por CSS (o rótulo some em `lg`), mas a Dica só deve existir
   quando ela está de fato colapsada — senão o balão apareceria em cima de um
   rótulo já visível. Daí a leitura do mesmo limiar em JS.
   As três funções vivem no módulo: `useSyncExternalStore` reassina quando a
   identidade de `subscribe` muda, e a lateral re-renderiza a cada navegação. */
const CONSULTA_LG = "(min-width: 64rem)";

const assinarLg = (avisar: () => void) => {
  const consulta = window.matchMedia(CONSULTA_LG);
  consulta.addEventListener("change", avisar);
  return () => consulta.removeEventListener("change", avisar);
};
const lerLg = () => window.matchMedia(CONSULTA_LG).matches;
const lgNoServidor = () => true;

function useExpandida() {
  return useSyncExternalStore(assinarLg, lerLg, lgNoServidor);
}

export function BarraLateral({ ultimaAnalise }: { ultimaAnalise?: string | null }) {
  const pathname = usePathname();
  const expandida = useExpandida();
  const reduzido = useReducedMotion();

  return (
    <aside
      aria-label="Navegação principal"
      className={cn(
        // `self-start` garante o sticky: sem ele o item de flex é esticado pela
        // altura da coluna de conteúdo e a lateral rola junto com a página.
        "sticky top-0 z-20 hidden h-dvh shrink-0 flex-col self-start border-r border-border bg-surface",
        "md:flex md:w-16 lg:w-60",
      )}
    >
      <div className="flex h-14 shrink-0 items-center border-b border-border px-3 lg:px-4">
        <Link
          href="/"
          aria-label="Solo — ir para o painel"
          className="flex min-w-0 items-center gap-2.5 rounded-md py-1"
        >
          <Marca tamanho={22} />
          <span className="hidden min-w-0 lg:block">
            <span className="block truncate text-sm leading-none font-semibold tracking-tight text-ink">
              Solo
            </span>
            <span className="mt-1 block truncate text-2xs leading-none tracking-widest text-ink-3 uppercase">
              Motiva
            </span>
          </span>
        </Link>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-4 scroll-thin">
        <p className="mb-2 hidden px-2 text-2xs tracking-widest text-ink-3 uppercase lg:block">
          Operação
        </p>

        <ul className="flex flex-col gap-1">
          {NAVEGACAO.map((item) => {
            const ativo = rotaAtiva(pathname, item.href);
            const Icone = item.icone;

            const link = (
              <Link
                href={item.href}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "relative flex size-10 items-center justify-center gap-3 rounded-md text-sm",
                  "transition-[background-color,color] duration-150 ease-[var(--ease-out-quint)]",
                  "lg:w-full lg:justify-start lg:px-3",
                  ativo
                    ? "bg-surface-2 font-medium text-ink"
                    : "text-ink-2 hover:bg-surface-3 hover:text-ink",
                )}
              >
                {ativo && (
                  <motion.div
                    layoutId="filete-ativo"
                    aria-hidden="true"
                    transition={
                      reduzido
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 520, damping: 44, mass: 0.7 }
                    }
                    className="absolute inset-y-1.5 left-0 w-0.5 rounded-sm bg-accent-line"
                  />
                )}

                <Icone aria-hidden="true" className="size-4 shrink-0" />
                <span className="hidden min-w-0 truncate lg:block">{item.rotulo}</span>
              </Link>
            );

            return (
              <li key={item.href} className="flex justify-center lg:block">
                {expandida ? (
                  link
                ) : (
                  <Dica conteudo={item.rotulo} lado="direita">
                    {link}
                  </Dica>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <RodapeLateral ultimaAnalise={ultimaAnalise} />
    </aside>
  );
}

function RodapeLateral({ ultimaAnalise }: { ultimaAnalise?: string | null }) {
  return (
    <div className="shrink-0 border-t border-border px-2 py-3 lg:px-3">
      {ultimaAnalise ? (
        <BlocoUltimaAnalise carimbo={ultimaAnalise} />
      ) : null}

      <div className="flex items-center justify-center lg:justify-between">
        <span className="hidden text-2xs tracking-widest text-ink-3 uppercase lg:block">
          Tema
        </span>
        <AlternadorTema />
      </div>
    </div>
  );
}

function BlocoUltimaAnalise({ carimbo }: { carimbo: string }) {
  return (
    <>
      {/* Expandida: o carimbo por extenso. Colapsada: só o ponto de acento, com
          o texto na Dica — 64px não comportam a data. */}
      <div className="mb-3 hidden rounded-md border border-border bg-surface-2 px-2.5 py-2 lg:block">
        <span className="block text-2xs leading-none tracking-widest text-ink-3 uppercase">
          Última análise
        </span>
        <span className="tnum mt-1.5 block font-mono text-xs leading-none text-ink">{carimbo}</span>
      </div>

      <div className="mb-3 flex justify-center lg:hidden">
        <Dica conteudo={`Última análise: ${carimbo}`} lado="direita">
          <span className="inline-flex size-6 items-center justify-center">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-accent-line" />
            <span className="sr-only">Última análise: {carimbo}</span>
          </span>
        </Dica>
      </div>
    </>
  );
}
