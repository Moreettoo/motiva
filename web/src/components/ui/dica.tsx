"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

export type LadoDica = "cima" | "baixo" | "esquerda" | "direita";

/**
 * Dica de contexto — sem `title` nativo (não abre por teclado e não é estilizável).
 *
 * Limitação conhecida: o balão é posicionado com `position: absolute`, então um
 * ancestral com `overflow: hidden` (célula de tabela rolável, cartão com
 * `overflow-hidden`) o recorta. Nesses casos, use `overflow-visible` no
 * ancestral ou mova a Dica para fora da área recortada — não existe portal aqui
 * de propósito, porque o balão precisa acompanhar rolagem interna.
 */
const POSICAO: Record<LadoDica, string> = {
  cima: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
  baixo: "top-full left-1/2 -translate-x-1/2 mt-1.5",
  esquerda: "right-full top-1/2 -translate-y-1/2 mr-1.5",
  direita: "left-full top-1/2 -translate-y-1/2 ml-1.5",
};

const DESLOCAMENTO: Record<LadoDica, { x?: number; y?: number }> = {
  cima: { y: 4 },
  baixo: { y: -4 },
  esquerda: { x: 4 },
  direita: { x: -4 },
};

const ATRASO_MS = 140;

export function Dica({
  conteudo,
  lado = "cima",
  children,
}: {
  conteudo: ReactNode;
  lado?: LadoDica;
  children: ReactNode;
}) {
  const id = useId();
  const reduzido = useReducedMotion();
  const [sobre, setSobre] = useState(false);
  const [focado, setFocado] = useState(false);
  const [dispensado, setDispensado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const aberto = (sobre || focado) && !dispensado;

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") setDispensado(true);
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  function entrarComPonteiro() {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setSobre(true), ATRASO_MS);
  }

  function sairComPonteiro() {
    if (temporizador.current) clearTimeout(temporizador.current);
    setSobre(false);
    setDispensado(false);
  }

  const descricao = { "aria-describedby": id };
  const gatilho = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, descricao)
    : children;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={entrarComPonteiro}
      onMouseLeave={sairComPonteiro}
      onFocusCapture={() => {
        setDispensado(false);
        setFocado(true);
      }}
      onBlurCapture={() => {
        setFocado(false);
        setDispensado(false);
      }}
      {...(isValidElement(children) ? {} : descricao)}
    >
      {gatilho}

      <AnimatePresence>
        {aberto && (
          <motion.span
            key="dica"
            role="tooltip"
            id={id}
            initial={{ opacity: 0, ...DESLOCAMENTO[lado] }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduzido ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "pointer-events-none absolute z-50 w-max max-w-64 rounded-sm border border-border-strong",
              "bg-surface-2 px-2 py-1 text-2xs leading-4 text-ink shadow-md",
              POSICAO[lado],
            )}
          >
            {conteudo}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
