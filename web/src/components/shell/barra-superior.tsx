"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";

import { cn } from "@/lib/utils";

import { NAVEGACAO } from "./barra-lateral";
import { Marca } from "./marca";
import { PaletaComandos, type TrechoNaPaleta } from "./paleta-comandos";

/* Espaço não-separável: o atalho nunca pode quebrar em duas linhas. */
const ATALHO_MAC = "⌘\u00a0K";
const ATALHO_PADRAO = "Ctrl\u00a0K";

/* A tecla depende da plataforma, que só existe no cliente. Ler como store
   externo mantém a marcação do servidor neutra sem sincronizar nada em efeito:
   um "⌘" fixo no HTML viraria erro de hidratação no Windows. */
const semAssinatura = () => () => {};
const lerAtalho = () =>
  /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) ? ATALHO_MAC : ATALHO_PADRAO;
const atalhoNeutro = () => "";

/** `href: null` = o segmento aparece na trilha mas não é rota navegável.
 *  `/trechos/31` acumula `/trechos`, que nunca existiu como página: a lista de
 *  trechos vive em `/malha`. Sem isto a trilha oferece um link para o 404. */
type Migalha = { rotulo: string; href: string | null; atual: boolean };

function montarTrilha(pathname: string): Migalha[] {
  const segmentos = pathname.split("/").filter(Boolean);
  if (segmentos.length === 0) return [{ rotulo: "Painel", href: "/", atual: true }];

  const trilha: Migalha[] = [{ rotulo: "Painel", href: "/", atual: false }];
  let acumulado = "";

  segmentos.forEach((segmento, i) => {
    acumulado += `/${segmento}`;
    const daNavegacao = NAVEGACAO.find((item) => item.href === acumulado);
    const decodificado = decodeURIComponent(segmento);

    const rotulo =
      daNavegacao?.rotulo ??
      (/^\d+$/.test(decodificado)
        ? `#${decodificado}`
        : decodificado.charAt(0).toUpperCase() + decodificado.slice(1));

    // Só vira link o segmento que corresponde a uma rota de verdade.
    trilha.push({
      rotulo,
      href: daNavegacao ? acumulado : null,
      atual: i === segmentos.length - 1,
    });
  });

  return trilha;
}

export function BarraSuperior({
  trechos,
  carimbo,
}: {
  trechos: TrechoNaPaleta[];
  /** "Dados de …" — calculado no servidor. Chamar Date() aqui quebraria a hidratação. */
  carimbo?: string | null;
}) {
  const pathname = usePathname();
  const [paletaAberta, setPaletaAberta] = useState(false);
  const atalho = useSyncExternalStore(semAssinatura, lerAtalho, atalhoNeutro);

  const trilha = useMemo(() => montarTrilha(pathname), [pathname]);

  const abrir = useCallback(() => setPaletaAberta(true), []);
  const fechar = useCallback(() => setPaletaAberta(false), []);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border",
        "bg-bg/80 px-4 backdrop-blur-md sm:px-6 lg:px-8",
      )}
    >
      <Link href="/" aria-label="Solo — ir para o painel" className="shrink-0 rounded-md md:hidden">
        <Marca tamanho={20} comTexto />
      </Link>

      <nav aria-label="Trilha de navegação" className="hidden min-w-0 flex-1 md:block">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          {trilha.map((migalha, i) => (
            <li key={`${migalha.rotulo}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && (
                <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
              )}
              {migalha.atual ? (
                <span aria-current="page" className="truncate font-medium text-ink">
                  {migalha.rotulo}
                </span>
              ) : migalha.href == null ? (
                <span className="truncate text-ink-3">{migalha.rotulo}</span>
              ) : (
                <Link
                  href={migalha.href}
                  className="truncate text-ink-3 transition-colors duration-150 ease-[var(--ease-out-quint)] hover:text-ink"
                >
                  {migalha.rotulo}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        {carimbo ? (
          <span className="hidden items-baseline gap-2 lg:flex">
            <span className="text-2xs tracking-widest text-ink-3 uppercase">Dados de</span>
            <span className="tnum font-mono text-xs text-ink-2">{carimbo}</span>
          </span>
        ) : null}

        <button
          type="button"
          onClick={abrir}
          // Abaixo de `sm` o rótulo some e sobra só o ícone: sem o aria-label o
          // botão ficaria sem nome acessível no celular.
          aria-label="Buscar trecho"
          aria-haspopup="dialog"
          aria-expanded={paletaAberta}
          className={cn(
            "flex h-9 items-center gap-2 rounded-md border border-border bg-surface-2 pr-1.5 pl-3",
            "text-sm text-ink-3 transition-[border-color,color] duration-150 ease-[var(--ease-out-quint)]",
            "hover:border-border-strong hover:text-ink-2",
          )}
        >
          <Search aria-hidden="true" className="size-4 shrink-0" />
          <span className="hidden sm:inline">Buscar trecho</span>
          <kbd
            aria-hidden="true"
            className={cn(
              "ml-1 hidden rounded-sm border border-border bg-surface-3 px-1.5 py-0.5",
              "font-mono text-2xs text-ink-3 sm:inline-block",
              atalho ? "visible" : "invisible",
            )}
          >
            {atalho || ATALHO_MAC}
          </kbd>
        </button>
      </div>

      <PaletaComandos trechos={trechos} aberta={paletaAberta} aoAbrir={abrir} aoFechar={fechar} />
    </header>
  );
}
