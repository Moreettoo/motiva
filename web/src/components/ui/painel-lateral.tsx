"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const LARGURAS = { sm: 380, md: 480, lg: 660 } as const;

const CURVA: [number, number, number, number] = [0.22, 1, 0.36, 1];

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focaveis(raiz: HTMLElement | null): HTMLElement[] {
  if (!raiz) return [];
  return Array.from(raiz.querySelectorAll<HTMLElement>(FOCAVEIS)).filter(
    (el) => !el.hasAttribute("inert") && el.offsetParent !== null,
  );
}

/* O portal só pode existir depois da hidratação (não há `document.body` no
   servidor). `useSyncExternalStore` resolve isso sem setState em efeito. */
const semAssinatura = () => () => {};
const verdadeiro = () => true;
const falso = () => false;

/** A folha de baixo e a gaveta lateral entram por eixos diferentes; o CSS troca
 *  no mesmo ponto do `sm:` do Tailwind, então o JS precisa do mesmo limiar. */
function useTelaLarga() {
  return useSyncExternalStore(
    (avisar) => {
      const consulta = window.matchMedia("(min-width: 40rem)");
      consulta.addEventListener("change", avisar);
      return () => consulta.removeEventListener("change", avisar);
    },
    () => window.matchMedia("(min-width: 40rem)").matches,
    () => true,
  );
}

export function PainelLateral({
  aberto,
  aoFechar,
  titulo,
  descricao,
  largura = "md",
  children,
  rodape,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: string;
  largura?: "sm" | "md" | "lg" | number;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  const id = useId();
  const idTitulo = `${id}-titulo`;
  const idDescricao = `${id}-descricao`;

  const reduzido = useReducedMotion();
  const telaLarga = useTelaLarga();
  const painel = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLElement | null>(null);
  const montado = useSyncExternalStore(semAssinatura, verdadeiro, falso);

  // Guarda quem abriu e devolve o foco ao fechar, sem isso o teclado volta
  // para o topo do documento e o gestor perde o lugar na tabela.
  useEffect(() => {
    if (!aberto) return;
    gatilho.current = document.activeElement as HTMLElement | null;

    const quadro = requestAnimationFrame(() => {
      const alvo = focaveis(painel.current)[0] ?? painel.current;
      alvo?.focus();
    });

    return () => {
      cancelAnimationFrame(quadro);
      gatilho.current?.focus?.();
    };
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [aberto]);

  const aoTeclar = useCallback(
    (evento: KeyboardEvent<HTMLDivElement>) => {
      if (evento.key === "Escape") {
        evento.stopPropagation();
        aoFechar();
        return;
      }
      if (evento.key !== "Tab") return;

      const alvos = focaveis(painel.current);
      if (alvos.length === 0) {
        evento.preventDefault();
        painel.current?.focus();
        return;
      }

      const primeiro = alvos[0];
      const ultimo = alvos[alvos.length - 1];
      const atual = document.activeElement;

      if (evento.shiftKey && (atual === primeiro || atual === painel.current)) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && atual === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    },
    [aoFechar],
  );

  if (!montado) return null;

  const px = typeof largura === "number" ? largura : LARGURAS[largura];
  const entrada = telaLarga ? { x: "100%", y: 0 } : { x: 0, y: "100%" };

  return createPortal(
    <AnimatePresence>
      {aberto && (
        <>
          <motion.div
            key="fundo"
            aria-hidden="true"
            onClick={aoFechar}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduzido ? 0 : 0.2 }}
            className="fixed inset-0 z-40 bg-bg/70 backdrop-blur-[2px]"
          />

          <motion.div
            key="painel"
            ref={painel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={idTitulo}
            aria-describedby={descricao ? idDescricao : undefined}
            tabIndex={-1}
            onKeyDown={aoTeclar}
            initial={entrada}
            animate={{ x: 0, y: 0 }}
            exit={entrada}
            transition={reduzido ? { duration: 0 } : { duration: 0.36, ease: CURVA }}
            style={{ "--largura-painel": `${px}px` } as CSSProperties}
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col overflow-hidden rounded-t-xl",
              "border-t border-border bg-surface shadow-lg",
              "sm:inset-y-0 sm:right-0 sm:left-auto sm:h-dvh sm:w-[var(--largura-painel)]",
              "sm:max-w-[calc(100vw-3rem)] sm:rounded-none sm:border-t-0 sm:border-l",
            )}
          >
            <div aria-hidden="true" className="h-0.5 w-full shrink-0 bg-accent-line" />

            <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-sm bg-border-strong sm:hidden" />

            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <h2 id={idTitulo} className="text-lg font-semibold text-ink">
                  {titulo}
                </h2>
                {descricao && (
                  <p id={idDescricao} className="mt-0.5 text-xs text-ink-3">
                    {descricao}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={aoFechar}
                aria-label="Fechar painel"
                className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-ink-3 hover:bg-surface-3 hover:text-ink"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 scroll-thin">
              {children}
            </div>

            {rodape && (
              <footer
                className="shrink-0 border-t border-border bg-surface-2 px-5 py-3"
                style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
              >
                {rodape}
              </footer>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
