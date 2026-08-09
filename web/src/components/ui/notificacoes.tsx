"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CircleCheck, Info, OctagonAlert, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type TomNotificacao = "good" | "critical" | "info";

export type Notificacao = {
  tom: TomNotificacao;
  titulo: string;
  descricao?: string;
  /** Milissegundos até sumir sozinha. 0 mantém na tela até fechar na mão. */
  duracao?: number;
};

type NotificacaoNaFila = Notificacao & { id: number };

/* Cor de status nunca aparece sozinha: cada tom traz ícone e um rótulo textual
   (visível só para leitor de tela, porque o título já diz o resto). */
const TOM: Record<TomNotificacao, { icone: LucideIcon; tinta: string; filete: string; rotulo: string }> = {
  good: { icone: CircleCheck, tinta: "text-good-ink", filete: "bg-good", rotulo: "Sucesso" },
  critical: { icone: OctagonAlert, tinta: "text-critical-ink", filete: "bg-critical", rotulo: "Erro" },
  info: { icone: Info, tinta: "text-ink-2", filete: "bg-accent-line", rotulo: "Aviso" },
};

const DURACAO_PADRAO = 5000;
const MAXIMO = 4;

/* A pilha vai para o <body>: um ancestral com `transform` (qualquer bloco
   animado do shell) quebraria o `position: fixed` do container. */
const semAssinatura = () => () => {};
const verdadeiro = () => true;
const falso = () => false;

const Contexto = createContext<{ mostrar: (nota: Notificacao) => void } | null>(null);

export function useNotificacao() {
  const contexto = useContext(Contexto);
  if (!contexto) {
    throw new Error("useNotificacao() precisa estar dentro de <ProvedorNotificacoes>.");
  }
  return contexto;
}

export function ProvedorNotificacoes({ children }: { children: ReactNode }) {
  const [fila, setFila] = useState<NotificacaoNaFila[]>([]);
  const proximoId = useRef(0);
  const temporizadores = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const reduzido = useReducedMotion();

  const dispensar = useCallback((id: number) => {
    const temporizador = temporizadores.current.get(id);
    if (temporizador) clearTimeout(temporizador);
    temporizadores.current.delete(id);
    setFila((atual) => atual.filter((nota) => nota.id !== id));
  }, []);

  const mostrar = useCallback(
    (nota: Notificacao) => {
      const id = proximoId.current++;
      setFila((atual) => [...atual.slice(-(MAXIMO - 1)), { ...nota, id }]);

      const duracao = nota.duracao ?? DURACAO_PADRAO;
      if (duracao > 0) {
        temporizadores.current.set(
          id,
          setTimeout(() => dispensar(id), duracao),
        );
      }
    },
    [dispensar],
  );

  useEffect(() => {
    const pendentes = temporizadores.current;
    return () => {
      for (const temporizador of pendentes.values()) clearTimeout(temporizador);
      pendentes.clear();
    };
  }, []);

  const valor = useMemo(() => ({ mostrar }), [mostrar]);
  const montado = useSyncExternalStore(semAssinatura, verdadeiro, falso);

  const pilha = (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-end gap-2 px-4 sm:inset-x-auto sm:right-0 sm:w-96"
      style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <AnimatePresence initial={false}>
        {fila.map((nota) => {
          const { icone: Icone, tinta, filete, rotulo } = TOM[nota.tom];

          return (
            <motion.div
              key={nota.id}
              layout={!reduzido}
              initial={{ opacity: 0, x: 24, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: reduzido ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto relative w-full max-w-full overflow-hidden rounded-md border border-border bg-surface-2 shadow-md"
            >
              <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-0.5", filete)} />

              <div className="flex items-start gap-2.5 py-3 pr-2 pl-3.5">
                <Icone aria-hidden="true" className={cn("mt-px size-4 shrink-0", tinta)} />

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    <span className="sr-only">{rotulo}: </span>
                    {nota.titulo}
                  </p>
                  {nota.descricao && (
                    <p className="mt-0.5 text-xs break-words text-ink-2">{nota.descricao}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => dispensar(nota.id)}
                  aria-label="Fechar notificação"
                  className="-mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-ink-3 hover:bg-surface-3 hover:text-ink"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );

  return (
    <Contexto.Provider value={valor}>
      {children}
      {montado && createPortal(pilha, document.body)}
    </Contexto.Provider>
  );
}
