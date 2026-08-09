"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/** Distância da marca e respiro mínimo contra a borda do container. */
const FOLGA = 10;
const BORDA = 6;

/** Posição padrão em CSS — igual ao cálculo em px, então o primeiro quadro não pula. */
const TRANSFORMA_PADRAO = `translate(-50%, calc(-100% - ${FOLGA}px))`;

/**
 * Chrome do balão de dado, sem posicionamento.
 *
 * A régua de km e o mapa da malha posicionam o balão por conta própria (um
 * ancora em `bottom-full`, o outro em coordenada de pixel), mas a superfície
 * tem que ser a mesma dos gráficos — três caixas de dado com bordas diferentes
 * na mesma tela leem como três componentes distintos.
 */
export const CLASSE_BALAO = "rounded-md border border-border-strong bg-surface-2 p-3 shadow-md";

/** Largura fixa do balão, em px. É número porque quem posiciona precisa dela na
 *  conta do `clamp` contra a borda do container, não só no CSS. */
export const LARGURA_BALAO = 236;

/**
 * Balão posicionado em coordenada de pixel dentro do container do gráfico.
 *
 * Não recebe foco e é `aria-hidden`: quem carrega o valor para leitor de tela é
 * o `aria-label` da própria marca (que é focalizável) e a visão de tabela. Um
 * balão que segue o ponteiro em `aria-live` viraria enxurrada de anúncios.
 *
 * O elemento precisa estar dentro de um ancestral `position: relative` que
 * represente a área do gráfico — é dele que sai o limite para o flip.
 */
export function DicaGrafico({
  x,
  y,
  visivel,
  children,
}: {
  x: number;
  y: number;
  visivel: boolean;
  children: ReactNode;
}) {
  const referencia = useRef<HTMLDivElement>(null);
  const reduzido = useReducedMotion();
  const [ajuste, setAjuste] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = referencia.current;
    const pai = el?.parentElement;

    if (!el || !pai || !visivel) {
      setAjuste((atual) => (atual === null ? atual : null));
      return;
    }

    const l = el.offsetWidth;
    const a = el.offsetHeight;
    const limiteX = pai.clientWidth;
    const limiteY = pai.clientHeight;

    // Vira para baixo quando não sobra altura acima da marca.
    const paraBaixo = y - a - FOLGA < BORDA;
    let esquerda = x - l / 2;
    let topo = paraBaixo ? y + FOLGA : y - a - FOLGA;

    esquerda = Math.min(Math.max(esquerda, BORDA), Math.max(BORDA, limiteX - l - BORDA));
    topo = Math.min(Math.max(topo, BORDA), Math.max(BORDA, limiteY - a - BORDA));

    const nx = Math.round(esquerda - x);
    const ny = Math.round(topo - y);

    // Comparar antes de gravar: um objeto novo a cada passagem realimentaria o efeito.
    setAjuste((atual) => (atual && atual.x === nx && atual.y === ny ? atual : { x: nx, y: ny }));
  }, [visivel, x, y]);

  return (
    <AnimatePresence>
      {visivel ? (
        <motion.div
          ref={referencia}
          key="dica-grafico"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduzido ? 0 : 0.14, ease: [0.22, 1, 0.36, 1] }}
          style={{
            left: x,
            top: y,
            transform: ajuste ? `translate(${ajuste.x}px, ${ajuste.y}px)` : TRANSFORMA_PADRAO,
          }}
          className="pointer-events-none absolute z-30 w-max max-w-64 rounded-md border border-border-strong bg-surface-2 px-2.5 py-2 text-xs text-ink shadow-md"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Cabeçalho do balão — o valor de X (data, faixa de km, categoria). */
export function DicaTitulo({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 border-b border-border pb-1.5 text-2xs font-medium tracking-wider text-ink-3 uppercase">
      {children}
    </p>
  );
}

/**
 * Linha do balão. A chave da série é um traço curto na cor da entidade; o
 * rótulo fica em tinta secundária e o VALOR é o elemento forte — aqui o leitor
 * já sabe qual série é e quer o número.
 */
export function DicaLinha({
  cor,
  rotulo,
  valor,
}: {
  cor?: string;
  rotulo: string;
  valor: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {cor ? (
        <span
          aria-hidden="true"
          className="h-0.5 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: cor }}
        />
      ) : null}
      <span className="min-w-0 flex-1 truncate text-ink-2">{rotulo}</span>
      <span className="tnum shrink-0 font-mono font-medium text-ink">{valor}</span>
    </div>
  );
}
