"use client";

import { OctagonAlert } from "lucide-react";

import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ehFimDeSemana, type ResumoDia } from "../dados";

export function MiniMapa({
  resumos,
  janela,
  aoEscolherSemana,
}: {
  resumos: ResumoDia[];
  /** Dias da semana visível, para marcar o intervalo no mapa. */
  janela: string[];
  aoEscolherSemana: (dia: string) => void;
}) {
  // Escala local: o dia mais cheio das quatro semanas vai à altura cheia. Uma
  // escala global sobre a capacidade instalada achataria tudo abaixo de 21%.
  const teto = Math.max(1, ...resumos.map((r) => r.comEquipe + r.semEquipe));
  const naJanela = new Set(janela);

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-end gap-px">
        {resumos.map((r) => {
          const total = r.comEquipe + r.semEquipe;
          const dentro = naJanela.has(r.dia);

          return (
            <button
              key={r.dia}
              type="button"
              onClick={() => aoEscolherSemana(r.dia)}
              aria-label={`${fmt.dataLonga(r.dia)}. ${fmt.contar(r.comEquipe, "serviço com turma", "serviços com turma")}, ${fmt.contar(r.semEquipe, "sem turma")}. Ir para esta semana.`}
              className={cn(
                "group relative flex h-10 flex-1 flex-col justify-end rounded-xs",
                ehFimDeSemana(r.dia) && "bg-surface-3",
                dentro && "bg-accent-soft",
              )}
            >
              {r.algumaExcedida ? (
                <OctagonAlert
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 mx-auto size-2.5 text-critical-ink"
                />
              ) : null}

              <span
                aria-hidden="true"
                style={{ transform: `scaleY(${r.semEquipe / teto})` }}
                className="block h-8 origin-bottom rounded-t-xs border border-border-strong bg-surface-3"
              />
              <span
                aria-hidden="true"
                style={{ transform: `scaleY(${r.comEquipe / teto})` }}
                className="block h-8 origin-bottom bg-ink-3"
              />
              <span className="mt-0.5 block h-px w-full bg-transparent group-hover:bg-accent-line" />
              <span className="sr-only">{fmt.n(total)}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-2xs text-ink-3">
        A altura é o número de serviços no dia; a parte clara ainda não tem equipe. O ícone marca
        dia com turma acima da capacidade. Clique para ir à semana.
      </p>
    </div>
  );
}
