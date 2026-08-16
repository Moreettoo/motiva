"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

export type LadoDica = "cima" | "baixo" | "esquerda" | "direita";

/**
 * Dica de contexto, sem `title` nativo (não abre por teclado e não é estilizável).
 *
 * Limitação conhecida: o balão é posicionado com `position: absolute`, então um
 * ancestral com `overflow: hidden` (célula de tabela rolável, cartão com
 * `overflow-hidden`) o recorta. Nesses casos, use `overflow-visible` no
 * ancestral ou mova a Dica para fora da área recortada, não existe portal aqui
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

/* "Já hidratou?": as três funções de `useSyncExternalStore`, fora do componente
   porque o hook compara referências e recriá-las reassinaria a store a cada
   render.

   `assinarMontagem` AVISA uma vez, em vez de ficar inerte como o
   `() => () => {}` de `painel-lateral.tsx`. O React já promete re-renderizar
   sozinho quando `getSnapshot()` difere do snapshot de servidor, então o aviso
   é cinto e suspensório, mas ele torna o commit uma consequência do nosso
   código em vez de uma consequência de detalhe interno do React, e custa uma
   microtarefa. Note que `setState` em efeito, a forma óbvia de fazer isto, o
   lint proíbe (`react-hooks/set-state-in-effect`).

   MICROTAREFA, e não `requestAnimationFrame`: rAF não dispara em aba oculta,
   medido, com `document.visibilityState === "hidden"` o quadro nunca chega,
   enquanto `setTimeout` e microtarefa chegam. Não é detalhe de bancada: uma
   página aberta em aba de segundo plano (clique do meio, sessão restaurada)
   ficaria sem ligar a descrição até alguém olhar para ela. O `vivo` cobre o
   desmonte, já que microtarefa não se cancela. */
function assinarMontagem(avisar: () => void) {
  let vivo = true;
  queueMicrotask(() => {
    if (vivo) avisar();
  });
  return () => {
    vivo = false;
  };
}
const jaMontado = () => true;
const aindaNao = () => false;

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
  /** Ver o bloco sobre a fronteira RSC, mais abaixo. */
  const montado = useSyncExternalStore(assinarMontagem, jaMontado, aindaNao);
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

  /* `children` vindo de um Server Component NÃO é um elemento durante o SSR: ele
     atravessa a fronteira RSC como referência preguiçosa e só vira elemento
     depois que o payload é desserializado no cliente. Medido nas duas pontas,
     nesta mesma linha: no servidor `isValidElement(children)` é FALSE e o
     `$$typeof` é `Symbol(react.lazy)`; no cliente é TRUE e
     `Symbol(react.transitional.element)`.

     Com a decisão tomada durante o render, isso MOVIA o `aria-describedby` de
     lugar entre as duas passadas, servidor no wrapper, cliente no filho, e o
     React acusava mismatch de hidratação. Quebrava só em `/trechos/[id]`, que
     é onde vivem as duas únicas Dicas dentro de Server Components
     (`faixa-identidade.tsx` e `medidor.tsx`); as outras cinco chamadas já estão
     em componentes `"use client"`, onde `children` é elemento nas duas passadas,
     e nunca quebraram.

     `montado` desempata: `false` no servidor E na primeira passada do cliente,
     então as duas produzem HTML idêntico e a hidratação casa. O atributo entra
     no commit seguinte, e nada se perde no caminho: o balão que ele descreve
     (`id={id}`) só existe no DOM enquanto `aberto`, de modo que antes da
     montagem o `aria-describedby` apontaria para um id inexistente de qualquer
     jeito.

     Quem produz `montado` é `assinarMontagem`, lá em cima, e o porquê de ele
     avisar em vez de ficar inerte está escrito junto dela.

     NÃO resolver isto pondo o atributo sempre no wrapper: ele é um `<span>` sem
     papel e sem foco, e quem precisa da descrição é o filho, que nestes casos
     carrega `tabIndex={0}` e às vezes `role="img"`. Seria trocar um aviso de
     hidratação por uma perda de acessibilidade silenciosa. */
  const descricao = montado ? { "aria-describedby": id } : {};
  const noFilho = montado && isValidElement(children);
  const gatilho = noFilho
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
      {...(noFilho ? {} : descricao)}
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
