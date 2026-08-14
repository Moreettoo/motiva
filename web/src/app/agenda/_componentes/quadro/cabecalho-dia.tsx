"use client";

import { OctagonAlert } from "lucide-react";

import { fmt, parseData } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ehFimDeSemana, type ResumoDia } from "../dados";

export function CabecalhoDia({
  dia,
  hoje,
  resumo,
}: {
  dia: string;
  hoje: string;
  resumo: ResumoDia;
}) {
  const fds = ehFimDeSemana(dia);
  const ehHoje = dia === hoje;
  const passado = dia < hoje;

  return (
    <div
      aria-current={ehHoje ? "date" : undefined}
      className={cn(
        "sticky top-0 z-20 border-b border-l border-border bg-surface px-2 py-1.5",
        fds && "bg-surface-3",
        passado && "opacity-60",
      )}
    >
      <p className="flex items-baseline justify-between gap-1">
        <span
          className={cn(
            "truncate text-2xs tracking-widest uppercase",
            ehHoje ? "text-ink" : "text-ink-3",
          )}
        >
          {fmt.diaSemana(dia)}
        </span>
        <span
          className={cn(
            "tnum font-mono text-sm leading-none",
            ehHoje ? "font-semibold text-ink" : "text-ink-2",
          )}
        >
          {fmt.n(parseData(dia).getDate())}
        </span>
      </p>

      <p className="tnum mt-1 flex items-center gap-1 font-mono text-2xs text-ink-3">
        <span>{fmt.n(resumo.comEquipe)}</span>
        <span aria-hidden="true">·</span>
        <span className={resumo.semEquipe > 0 ? "text-ink-2" : undefined}>
          {fmt.n(resumo.semEquipe)} s/ turma
        </span>
        {resumo.algumaExcedida ? (
          <OctagonAlert aria-hidden="true" className="ml-auto size-3 shrink-0 text-critical-ink" />
        ) : null}
      </p>

      <span className="sr-only">
        {fmt.dataLonga(dia)}. {fmt.contar(resumo.comEquipe, "serviço com turma", "serviços com turma")},{" "}
        {fmt.contar(resumo.semEquipe, "sem turma")}.
        {resumo.algumaExcedida ? " Alguma turma está acima da capacidade." : ""}
        {ehHoje ? " Hoje." : ""}
      </span>

      {ehHoje ? (
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-accent-line" />
      ) : null}
    </div>
  );
}
