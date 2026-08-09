"use client";

import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

export type AlinhamentoMenu = "esquerda" | "direita";

const ContextoMenu = createContext<{ fechar: (devolverFoco?: boolean) => void } | null>(null);

/**
 * Dropdown de ações. O balão é `absolute` dentro do gatilho — um ancestral com
 * `overflow: hidden` recorta o menu; use `overflow-visible` nesses casos.
 */
export function Menu({
  gatilho,
  children,
  alinhamento = "esquerda",
}: {
  gatilho: ReactNode;
  children: ReactNode;
  alinhamento?: AlinhamentoMenu;
}) {
  const id = useId();
  const idGatilho = `${id}-gatilho`;
  const idMenu = `${id}-menu`;

  const reduzido = useReducedMotion();
  // Aberto e ponta de entrada andam juntos: quem abre com ↑ precisa cair no
  // último item, e guardar isso em ref faria o efeito de foco ler valor velho.
  const [estado, setEstado] = useState<{ aberto: boolean; foco: "primeiro" | "ultimo" }>({
    aberto: false,
    foco: "primeiro",
  });
  const aberto = estado.aberto;
  const refRaiz = useRef<HTMLSpanElement>(null);
  const refMenu = useRef<HTMLDivElement>(null);

  // O gatilho é achado pelo id em vez de por ref: ele vem de fora e nem todo
  // componente encaminha `ref`. O id nós mesmos carimbamos, então sempre existe.
  const elementoGatilho = useCallback(() => document.getElementById(idGatilho), [idGatilho]);

  const itens = useCallback(() => {
    const raiz = refMenu.current;
    if (!raiz) return [] as HTMLElement[];
    return Array.from(raiz.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(
      (el) => el.getAttribute("aria-disabled") !== "true",
    );
  }, []);

  const fechar = useCallback(
    (devolverFoco = true) => {
      setEstado((atual) => ({ ...atual, aberto: false }));
      if (devolverFoco) elementoGatilho()?.focus();
    },
    [elementoGatilho],
  );

  useEffect(() => {
    if (!estado.aberto) return;
    const quadro = requestAnimationFrame(() => {
      const lista = itens();
      const alvo = estado.foco === "ultimo" ? lista[lista.length - 1] : lista[0];
      (alvo ?? refMenu.current)?.focus();
    });
    return () => cancelAnimationFrame(quadro);
  }, [estado, itens]);

  useEffect(() => {
    if (!aberto) return;

    function aoApontar(evento: PointerEvent) {
      const alvo = evento.target as Node;
      if (refRaiz.current?.contains(alvo)) return;
      setEstado((atual) => ({ ...atual, aberto: false }));
    }

    document.addEventListener("pointerdown", aoApontar, true);
    return () => document.removeEventListener("pointerdown", aoApontar, true);
  }, [aberto]);

  function abrir(foco: "primeiro" | "ultimo") {
    setEstado({ aberto: true, foco });
  }

  function aoTeclarGatilho(evento: KeyboardEvent<HTMLElement>) {
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      abrir("primeiro");
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      abrir("ultimo");
    } else if (evento.key === "Escape" && aberto) {
      evento.preventDefault();
      fechar();
    }
  }

  function aoTeclarMenu(evento: KeyboardEvent<HTMLDivElement>) {
    const lista = itens();
    const atual = lista.indexOf(document.activeElement as HTMLElement);

    switch (evento.key) {
      case "ArrowDown":
        evento.preventDefault();
        lista[(atual + 1) % lista.length]?.focus();
        break;
      case "ArrowUp":
        evento.preventDefault();
        lista[(atual - 1 + lista.length) % lista.length]?.focus();
        break;
      case "Home":
        evento.preventDefault();
        lista[0]?.focus();
        break;
      case "End":
        evento.preventDefault();
        lista[lista.length - 1]?.focus();
        break;
      case "Escape":
        evento.preventDefault();
        evento.stopPropagation();
        fechar();
        break;
      case "Tab":
        fechar(false);
        break;
    }
  }

  const originais = (isValidElement(gatilho) ? gatilho.props : {}) as {
    onClick?: (evento: MouseEvent<HTMLElement>) => void;
    onKeyDown?: (evento: KeyboardEvent<HTMLElement>) => void;
  };

  const propsGatilho = {
    id: idGatilho,
    "aria-haspopup": "menu" as const,
    "aria-expanded": aberto,
    "aria-controls": aberto ? idMenu : undefined,
    onClick: (evento: MouseEvent<HTMLElement>) => {
      originais.onClick?.(evento);
      if (evento.defaultPrevented) return;
      setEstado((atual) => ({ aberto: !atual.aberto, foco: "primeiro" }));
    },
    onKeyDown: (evento: KeyboardEvent<HTMLElement>) => {
      originais.onKeyDown?.(evento);
      if (evento.defaultPrevented) return;
      aoTeclarGatilho(evento);
    },
  };

  return (
    <span ref={refRaiz} className="relative inline-flex">
      {isValidElement(gatilho) ? (
        cloneElement(gatilho as ReactElement<Record<string, unknown>>, propsGatilho)
      ) : (
        <button type="button" {...propsGatilho} className="inline-flex items-center">
          {gatilho}
        </button>
      )}

      <AnimatePresence>
        {aberto && (
          <motion.div
            key="menu"
            ref={refMenu}
            id={idMenu}
            role="menu"
            aria-labelledby={idGatilho}
            aria-orientation="vertical"
            tabIndex={-1}
            onKeyDown={aoTeclarMenu}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: reduzido ? 0 : 0.15, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "absolute top-full z-40 mt-1 max-h-80 min-w-48 origin-top overflow-y-auto overscroll-contain rounded-md",
              "border border-border bg-surface-2 p-1 shadow-md scroll-thin",
              alinhamento === "direita" ? "right-0" : "left-0",
            )}
          >
            <ContextoMenu.Provider value={{ fechar }}>{children}</ContextoMenu.Provider>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

export function ItemMenu({
  icone,
  atalho,
  perigoso,
  desabilitado,
  aoEscolher,
  children,
}: {
  icone?: ReactNode;
  atalho?: string;
  perigoso?: boolean;
  desabilitado?: boolean;
  aoEscolher?: () => void;
  children: ReactNode;
}) {
  const contexto = useContext(ContextoMenu);

  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={desabilitado || undefined}
      onClick={() => {
        if (desabilitado) return;
        aoEscolher?.();
        contexto?.fechar();
      }}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-sm",
        desabilitado && "cursor-not-allowed opacity-50",
        perigoso
          ? "text-critical-ink hover:bg-critical-soft focus:bg-critical-soft"
          : "text-ink hover:bg-surface-3 focus:bg-surface-3",
      )}
    >
      {icone && (
        <span aria-hidden="true" className="inline-flex shrink-0 text-ink-3 [&>svg]:size-4">
          {icone}
        </span>
      )}

      <span className="min-w-0 flex-1 truncate">{children}</span>

      {atalho && (
        <span aria-hidden="true" className="shrink-0 font-mono text-2xs text-ink-3">
          {atalho}
        </span>
      )}
    </button>
  );
}

export function SeparadorMenu() {
  return <div role="separator" className="my-1 h-px bg-border" />;
}
