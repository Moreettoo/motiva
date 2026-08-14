"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

import { RISCO } from "@/lib/dominio";
import { IconeDominio } from "@/components/viz/legenda";
import { fmt } from "@/lib/format";

import type { ItemAgenda } from "../dados";
import type { EstadoArrasto } from "./usar-arrasto";

/* O sobrevoo vai para o <body>: o quadro tem overflow nos dois eixos — é o que
   faz o cabeçalho e a calha grudarem — então qualquer posicionamento interno
   seria recortado na primeira e na última linha. */
const semAssinatura = () => () => {};
const verdadeiro = () => true;
const falso = () => false;

export function Sobrevoo({ estado, item }: { estado: EstadoArrasto; item: ItemAgenda | null }) {
  const montado = useSyncExternalStore(semAssinatura, verdadeiro, falso);
  if (!montado) return null;

  const voando = estado.fase === "arrastando" ? estado : null;

  return createPortal(
    <AnimatePresence>
      {voando && item ? (
        <div
          aria-hidden="true"
          /* `pointer-events: none` é obrigatório: sem ele o `elementsFromPoint`
             devolveria o próprio sobrevoo e nunca acharia a célula embaixo. */
          className="pointer-events-none fixed top-0 left-0 z-50 w-52"
          style={{ transform: `translate3d(${voando.x - 80}px, ${voando.y - 18}px, 0)` }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1.03 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            style={{
              backgroundColor: RISCO[item.risco].fundo,
              color: RISCO[item.risco].tinta,
              borderColor: voando.recusa ? "var(--ink-3)" : RISCO[item.risco].cor,
            }}
            className="rounded-sm border-2 px-2 py-1.5 shadow-lg"
          >
            <p className="flex items-center gap-1.5 truncate text-2xs font-medium">
              <IconeDominio nome={RISCO[item.risco].icone} className="size-3.5 shrink-0" />
              {item.ag.trecho.rodovia}
            </p>
            <p className="tnum truncate font-mono text-2xs opacity-80">
              {fmt.km(item.km)}
            </p>
          </motion.div>

          {voando.recusa ? (
            <p className="mt-1 rounded-sm border border-border-strong bg-surface-2 px-2 py-1 text-2xs text-ink-2 shadow-md">
              {voando.recusa}
            </p>
          ) : null}
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
