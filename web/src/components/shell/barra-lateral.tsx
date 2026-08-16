"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import {
  CalendarRange,
  FlaskConical,
  LayoutDashboard,
  MessageSquareText,
  Waypoints,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Dica } from "@/components/ui/dica";
import { cn } from "@/lib/utils";

import { AlternadorTema } from "./alternador-tema";
import { Marca } from "./marca";

/**
 * Dois grupos, e não um rótulo "Operação" cobrindo tudo. O simulador não é
 * ferramenta de operação: ele não escreve no banco, não agenda nada e existe
 * para explicar o sistema. Misturá-lo com Agenda e Malha faria a lateral
 * prometer uma coisa que a página não é.
 */
export const GRUPOS = [
  { chave: "operacao", rotulo: "Operação" },
  { chave: "laboratorio", rotulo: "Laboratório" },
] as const;

export type GrupoNavegacao = (typeof GRUPOS)[number]["chave"];

export type ItemNavegacao = {
  href: string;
  rotulo: string;
  icone: LucideIcon;
  /** Frase curta que a Dica mostra quando a lateral está colapsada. */
  descricao: string;
  grupo: GrupoNavegacao;
};

/** Fonte única da navegação do produto: a lateral, a barra inferior do celular
 *  e a seção "Ir para" da paleta leem esta mesma lista. */
export const NAVEGACAO: ItemNavegacao[] = [
  { href: "/", rotulo: "Painel", icone: LayoutDashboard, descricao: "Visão geral da malha", grupo: "operacao" },
  { href: "/malha", rotulo: "Malha", icone: Waypoints, descricao: "Trechos por rodovia, em régua de km", grupo: "operacao" },
  { href: "/agenda", rotulo: "Agenda", icone: CalendarRange, descricao: "Roçadas sugeridas e aprovadas", grupo: "operacao" },
  { href: "/copiloto", rotulo: "Copiloto", icone: MessageSquareText, descricao: "Perguntas em português sobre a malha", grupo: "operacao" },
  { href: "/simulador", rotulo: "Simulador", icone: FlaskConical, descricao: "Crescimento previsto em um ponto qualquer", grupo: "laboratorio" },
];

export function rotaAtiva(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/* A lateral colapsa por CSS (o rótulo some em `lg`), mas a Dica só deve existir
   quando ela está de fato colapsada, senão o balão apareceria em cima de um
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
  const larguraGrande = useExpandida();
  const reduzido = useReducedMotion();
  // Preferência manual: sobrepõe o breakpoint quando a pessoa clica no ícone da
  // marca. Não persiste, o Shell nunca remonta entre navegações internas
  // (fica fora do slot de `children`), então o estado sobrevive à troca de
  // tela; só volta ao automático num recarregamento de página.
  const [colapsadaManual, setColapsadaManual] = useState(false);

  const expandida = larguraGrande && !colapsadaManual;

  return (
    <aside
      aria-label="Navegação principal"
      className={cn(
        // `self-start` garante o sticky: sem ele o item de flex é esticado pela
        // altura da coluna de conteúdo e a lateral rola junto com a página.
        "sticky top-0 z-20 hidden h-dvh shrink-0 flex-col self-start border-r border-border bg-surface",
        // A largura é a única coisa que anima fora do transform/opacity padrão:
        // não dá pra fingir com transform, porque o conteúdo ao lado precisa
        // fluir de verdade. `duration-150` já cobre hover; aqui o deslocamento é
        // bem maior (176px), por isso um pouco mais de tempo.
        "transition-[width] duration-200 ease-[var(--ease-out-quint)]",
        "md:flex md:w-16 lg:w-60",
        colapsadaManual && "lg:w-16",
      )}
    >
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-3 lg:px-4">
        <button
          type="button"
          onClick={() => setColapsadaManual((valor) => !valor)}
          aria-expanded={expandida}
          aria-controls="navegacao-lateral"
          aria-label={expandida ? "Recolher navegação" : "Expandir navegação"}
          title={expandida ? "Recolher navegação" : "Expandir navegação"}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md p-1.5 text-ink",
            "transition-[background-color] duration-150 ease-[var(--ease-out-quint)] hover:bg-surface-3",
          )}
        >
          <Marca tamanho={22} />
        </button>

        <Link
          href="/"
          aria-label="HighwAI: ir para o painel"
          className={cn("min-w-0 rounded-md py-1", expandida ? "fade block" : "hidden")}
        >
          <span className="brilho-marca relative block overflow-hidden truncate text-sm leading-none font-semibold tracking-tight text-ink">
            HighwAI
          </span>
        </Link>
      </div>

      <nav id="navegacao-lateral" className="min-h-0 flex-1 overflow-y-auto px-2 py-4 scroll-thin">
        {GRUPOS.map((grupo, indice) => {
          const itens = NAVEGACAO.filter((item) => item.grupo === grupo.chave);
          if (itens.length === 0) return null;

          return (
            <div
              key={grupo.chave}
              className={cn(
                indice > 0 && "mt-4",
                // Colapsada o título some, e sem ele os dois grupos correriam
                // juntos como uma lista só. O filete devolve a separação.
                indice > 0 && !expandida && "border-t border-border pt-4",
              )}
            >
              <p
                className={cn(
                  "mb-2 px-2 text-2xs tracking-widest text-ink-3 uppercase",
                  expandida ? "fade block" : "hidden",
                )}
              >
                {grupo.rotulo}
              </p>

              <ul className="flex flex-col gap-1">
                {itens.map((item) => (
                  <ItemLateral
                    key={item.href}
                    item={item}
                    ativo={rotaAtiva(pathname, item.href)}
                    expandida={expandida}
                    reduzido={Boolean(reduzido)}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <RodapeLateral ultimaAnalise={ultimaAnalise} expandida={expandida} />
    </aside>
  );
}

function ItemLateral({
  item,
  ativo,
  expandida,
  reduzido,
}: {
  item: ItemNavegacao;
  ativo: boolean;
  expandida: boolean;
  reduzido: boolean;
}) {
  const Icone = item.icone;

  const link = (
    <Link
      href={item.href}
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "relative flex size-10 items-center gap-3 rounded-md text-sm",
        "transition-[background-color,color] duration-150 ease-[var(--ease-out-quint)]",
        expandida ? "w-full justify-start px-3" : "justify-center",
        ativo ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-3 hover:text-ink",
      )}
    >
      {ativo && (
        <motion.div
          layoutId="filete-ativo"
          aria-hidden="true"
          transition={
            reduzido ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 44, mass: 0.7 }
          }
          className="absolute inset-y-1.5 left-0 w-0.5 rounded-sm bg-accent-line"
        />
      )}

      <Icone aria-hidden="true" className="size-4 shrink-0" />
      <span className={cn("min-w-0 truncate", expandida ? "fade block" : "hidden")}>
        {item.rotulo}
      </span>
    </Link>
  );

  return (
    <li className={expandida ? "block" : "flex justify-center"}>
      {expandida ? (
        link
      ) : (
        <Dica conteudo={item.rotulo} lado="direita">
          {link}
        </Dica>
      )}
    </li>
  );
}

function RodapeLateral({
  ultimaAnalise,
  expandida,
}: {
  ultimaAnalise?: string | null;
  expandida: boolean;
}) {
  return (
    <div className="shrink-0 border-t border-border px-2 py-3 lg:px-3">
      {ultimaAnalise ? (
        <BlocoUltimaAnalise carimbo={ultimaAnalise} expandida={expandida} />
      ) : null}

      <div className={cn("flex items-center", expandida ? "justify-between" : "justify-center")}>
        <span
          className={cn(
            "text-2xs tracking-widest text-ink-3 uppercase",
            expandida ? "fade block" : "hidden",
          )}
        >
          Tema
        </span>
        <AlternadorTema />
      </div>
    </div>
  );
}

function BlocoUltimaAnalise({ carimbo, expandida }: { carimbo: string; expandida: boolean }) {
  // Expandida: o carimbo por extenso. Colapsada: só o ponto de acento, com o
  // texto na Dica, 64px não comportam a data.
  if (expandida) {
    return (
      <div className="fade mb-3 rounded-md border border-border bg-surface-2 px-2.5 py-2">
        <span className="block text-2xs leading-none tracking-widest text-ink-3 uppercase">
          Última análise
        </span>
        <span className="tnum mt-1.5 block font-mono text-xs leading-none text-ink">{carimbo}</span>
      </div>
    );
  }

  return (
    <div className="mb-3 flex justify-center">
      <Dica conteudo={`Última análise: ${carimbo}`} lado="direita">
        <span className="inline-flex size-6 items-center justify-center">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-accent-line" />
          <span className="sr-only">Última análise: {carimbo}</span>
        </span>
      </Dica>
    </div>
  );
}
