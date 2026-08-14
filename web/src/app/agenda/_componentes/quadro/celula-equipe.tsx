"use client";

import { memo } from "react";

import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

import { HACHURA_EXCESSO, type Celula, type Ocupacao } from "../dados";

export const CelulaEquipe = memo(function CelulaEquipe({
  celula,
  equipeNome,
  previa,
  realcada,
  recusada,
  filhos,
}: {
  celula: Celula;
  equipeNome: string;
  /** Ocupação projetada enquanto um cartão paira; `null` fora do arrasto. */
  previa: Ocupacao | null;
  realcada: boolean;
  recusada: boolean;
  filhos: React.ReactNode;
}) {
  const leitura = previa ?? celula;
  const largura = Math.min(100, leitura.ocupacao);

  return (
    <div
      /* Célula que não aceita solta NÃO emite `data-celula`: se emitisse, o
         hit-test a encontraria e a recusa dependeria só de validação. */
      data-celula={celula.aceitaSolta ? celula.chave : undefined}
      className={cn(
        "quadro-celula relative flex min-w-0 flex-col gap-1 border-b border-l border-grid p-1.5",
        realcada && "ring-2 ring-accent ring-inset",
        recusada && "ring-2 ring-ink-3 ring-inset",
      )}
    >
      {leitura.excedida ? (
        <span
          aria-hidden="true"
          style={{ backgroundImage: HACHURA_EXCESSO }}
          className="pointer-events-none absolute inset-0"
        />
      ) : null}

      <ul className="relative flex min-w-0 flex-col gap-1">{filhos}</ul>

      {celula.capacidade > 0 && (leitura.km > 0 || realcada) ? (
        <p className="relative mt-auto flex items-center gap-1">
          <span
            aria-hidden="true"
            className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3"
          >
            <span
              className={cn(
                "block h-full origin-left rounded-full",
                "transition-transform duration-150 ease-[var(--ease-out-quint)]",
                leitura.excedida ? "bg-critical" : "bg-ink-3",
              )}
              style={{ transform: `scaleX(${largura / 100})` }}
            />
          </span>
          <span className="tnum shrink-0 font-mono text-2xs text-ink-3">
            {fmt.d1(leitura.km)}/{fmt.d1(celula.capacidade)}
          </span>
        </p>
      ) : null}

      <span className="sr-only">
        {equipeNome}, {fmt.dataLonga(celula.dia)}.{" "}
        {celula.itens.length === 0
          ? "Sem serviço."
          : `${fmt.contar(celula.itens.length, "serviço", "serviços")}, ${fmt.km(leitura.km)} de ${fmt.km(celula.capacidade)} no dia.`}
        {leitura.excedida ? " Acima da capacidade." : ""}
        {celula.aceitaSolta ? "" : " Não recebe serviço novo."}
      </span>
    </div>
  );
});
