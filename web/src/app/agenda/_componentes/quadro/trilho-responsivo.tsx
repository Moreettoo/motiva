"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ChevronUp } from "lucide-react";

import { Botao } from "@/components/ui/botao";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { ItemAgenda } from "../dados";
import { TrilhoFila } from "./trilho-fila";
import type { CargaArrasto } from "./usar-arrasto";

/** Mesmo limiar que `barra-lateral.tsx` já consulta (`CONSULTA_LG`): abaixo
 *  dele a lateral vira `NavegacaoMovel` e o trilho perde a coluna própria —
 *  é o mesmo ponto de corte, não um novo. */
const CONSULTA_LARGO = "(min-width: 64rem)";

const assinarLargo = (avisar: () => void) => {
  const consulta = window.matchMedia(CONSULTA_LARGO);
  consulta.addEventListener("change", avisar);
  return () => consulta.removeEventListener("change", avisar);
};
const lerLargo = () => window.matchMedia(CONSULTA_LARGO).matches;
const largoNoServidor = () => true;

/** `true` abaixo de `lg` — só em JS, via `matchMedia`, nunca `@container`:
 *  é exatamente o limiar em que `NavegacaoMovel` passa a existir, e só o
 *  JS sabe disso para reservar a folga de baixo por ela. */
export function useTrilhoEstreito(): boolean {
  return !useSyncExternalStore(assinarLargo, lerLargo, largoNoServidor);
}

const semAssinatura = () => () => {};
const verdadeiro = () => true;
const falso = () => false;

/** O portal só existe depois da hidratação — mesmo padrão de
 *  `painel-lateral.tsx`/`notificacoes.tsx`. */
function useMontado(): boolean {
  return useSyncExternalStore(semAssinatura, verdadeiro, falso);
}

type PropsTrilho = {
  itens: ItemAgenda[];
  total: number;
  expandido: boolean;
  aoExpandir: () => void;
  janelaFim: string;
  realcado: boolean;
  idEmVoo: number | null;
  idAtivo: number | null;
  selecionado: number | null;
  salvandoIds: ReadonlySet<number>;
  anelErroPorId: ReadonlyMap<number, number>;
  aoPegar: (e: React.PointerEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoTeclar: (e: React.KeyboardEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoAbrir: (id: number) => void;
  engolirClique: (e: React.MouseEvent) => void;
  refCartao: (id: number) => (no: HTMLElement | null) => void;
  aoFocar: (id: number) => () => void;
};

/**
 * O trilho da fila, com duas montagens — a troca é de ONDE ele entra no DOM,
 * nunca de QUEM ele é: por baixo continua sendo o mesmo `<TrilhoFila>`, com
 * as mesmas props, em coluna (`lg` e acima) ou em doca fixa portada para
 * `<body>` (abaixo de `lg`, onde `sticky` não entrega "sempre visível" numa
 * página que empilha cabeçalho, controles e faixa de 28 dias antes do
 * quadro — ver a spec, §7).
 *
 * Colapsada, a doca guarda a lista com `inert`: só a altura zerada
 * (`max-h-0`) deixaria 62 cartões focáveis fora da tela, alcançáveis por Tab
 * mesmo invisíveis.
 */
export function TrilhoResponsivo({
  docaAberta,
  aoAlternarDoca,
  ...props
}: PropsTrilho & {
  /** Estado de abertura da doca no estreito. Não é o mesmo flag de
   *  `expandido`/`aoExpandir` (que é a paginação do teto de 25 cartões,
   *  independente de largura) — a doca pode abrir mostrando só os 25 de
   *  sempre; são dois eixos diferentes. */
  docaAberta: boolean;
  aoAlternarDoca: () => void;
}) {
  const estreito = useTrilhoEstreito();
  const montado = useMontado();

  if (!estreito) {
    return (
      <div className="w-60 shrink-0 overflow-y-auto scroll-thin max-h-[min(78vh,760px)]">
        <TrilhoFila {...props} />
      </div>
    );
  }

  // Antes da hidratação `document.body` não é um alvo de portal válido — sem
  // isto o servidor tentaria (e falharia) renderizar a doca de dentro do
  // fluxo normal, só para o cliente trocar por um portal no primeiro efeito.
  if (!montado) return null;

  return createPortal(
    <div
      /* `pointer-events-none` aqui, `-auto` nos dois filhos: a caixa vai até
         `bottom: 0` em largura cheia (o botão da doca precisa poder encostar
         no chão), mas o espaço VAZIO abaixo do botão não deveria capturar
         toque nenhum — é exatamente onde `NavegacaoMovel` (abaixo de `md`,
         `z-30`) vive. Sem `pointer-events-none` aqui, este container
         transparente em `z-[35]` cobria a faixa inferior inteira e engolia
         os quatro links da navegação principal.
         A folga de 4.5rem (altura da `NavegacaoMovel`) só se aplica abaixo
         de `md` — o mesmo ponto de corte de `NavegacaoMovel` (`md:hidden`),
         não o de `useTrilhoEstreito` (`lg`). Entre `md` e `lg` a doca ainda
         aparece, mas sem navegação inferior para reservar espaço — era o
         desalinhamento que sobrava vão à toa; `shell.tsx` já resolveu o
         mesmo caso do lado do `<main>` (`md:pb-8`). */
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[35] flex flex-col items-stretch px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] max-md:pb-[calc(4.5rem+env(safe-area-inset-bottom)+0.5rem)]"
    >
      <Botao
        variante="secundario"
        className="pointer-events-auto w-full justify-between shadow-lg"
        iconeDireita={
          <ChevronUp
            aria-hidden="true"
            className={cn("transition-transform duration-150 ease-[var(--ease-out-quint)]", docaAberta && "rotate-180")}
          />
        }
        aria-expanded={docaAberta}
        aria-controls="doca-fila-conteudo"
        onClick={aoAlternarDoca}
      >
        Fila de decisão · {fmt.n(props.total)}
      </Botao>

      <div
        id="doca-fila-conteudo"
        inert={!docaAberta}
        className={cn(
          "pointer-events-auto mt-2 min-h-0 overflow-hidden rounded-lg border border-border shadow-lg",
          "transition-[max-height] duration-200 ease-[var(--ease-out-quint)]",
          docaAberta ? "max-h-[60vh] overflow-y-auto scroll-thin" : "max-h-0 border-transparent",
        )}
      >
        <TrilhoFila {...props} />
      </div>
    </div>,
    document.body,
  );
}
