import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Lista sem resultado. Sempre tratado: uma tabela vazia sem moldura le como
 * falha de carregamento, e o gestor liga para o suporte por nada.
 */
export function EstadoVazio({
  icone,
  titulo,
  descricao,
  acao,
  className,
}: {
  icone?: React.ReactNode;
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-10 text-center",
        className,
      )}
    >
      {icone ? (
        <span
          aria-hidden="true"
          className="mb-3 inline-flex size-9 items-center justify-center rounded-md bg-surface-3 text-ink-3 [&_svg]:size-4"
        >
          {icone}
        </span>
      ) : null}

      <p className="max-w-[46ch] text-base font-medium text-ink break-words">{titulo}</p>

      {descricao ? (
        <p className="mt-1.5 max-w-[54ch] text-sm text-ink-3 break-words">{descricao}</p>
      ) : null}

      {acao ? <div className="mt-4 flex flex-wrap justify-center gap-2">{acao}</div> : null}
    </div>
  );
}
