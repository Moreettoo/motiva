import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * O numero como protagonista.
 *
 * A pagina inteira e feita de numeros com uma linha de contexto embaixo, entao
 * a forma mora aqui em vez de repetida em cada secao -- foi assim que o
 * `ResumoValidacao` antigo acabou com uma variacao propria do mesmo ladrilho.
 */
export function Ladrilho({
  rotulo,
  valor,
  unidade,
  nota,
  detalhe,
  destaque = false,
  className,
}: {
  rotulo: string;
  valor: ReactNode;
  unidade?: string;
  nota?: ReactNode;
  /** Numero exato, so no hover. Para o valor que a tela arredonda ou resume e
   *  que alguem, uma vez por ano, vai querer conferir na integra. */
  detalhe?: string;
  /** Ladrilho de topo: numero maior e superficie mais alta. */
  destaque?: boolean;
  className?: string;
}) {
  return (
    <div
      title={detalhe}
      className={cn(
        "flex min-w-0 flex-col rounded-lg border border-border p-4",
        destaque ? "bg-surface-2" : "bg-surface-2/60",
        className,
      )}
    >
      <span className="text-2xs tracking-widest text-ink-3 uppercase">{rotulo}</span>
      <span className="mt-2 flex min-w-0 items-baseline gap-1.5">
        <span
          className={cn(
            "tnum min-w-0 truncate font-mono leading-none font-semibold text-ink",
            destaque ? "text-3xl" : "text-xl",
          )}
        >
          {valor}
        </span>
        {unidade ? <span className="shrink-0 text-xs text-ink-3">{unidade}</span> : null}
      </span>
      {nota ? <span className="mt-2 text-xs leading-snug text-ink-2">{nota}</span> : null}
    </div>
  );
}

/** Cabecalho de ato: um numero romano discreto e o titulo. Divide a pagina em
 *  tres perguntas sem gastar um paragrafo em cada uma. */
export function Ato({
  numero,
  titulo,
  descricao,
}: {
  numero: string;
  titulo: string;
  descricao?: string;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span
        aria-hidden="true"
        className="tnum shrink-0 font-mono text-2xs tracking-widest"
        style={{ color: "var(--accent)" }}
      >
        {numero}
      </span>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-ink">{titulo}</h2>
        {descricao ? <p className="mt-0.5 text-sm text-ink-2">{descricao}</p> : null}
      </div>
    </div>
  );
}
