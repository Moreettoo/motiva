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

              {/* Altura em porcentagem, não `scaleY`: as duas faixas são irmãs
                  de flex com a mesma base, e `transform` é só pintura — não
                  muda o tamanho de layout, então cada uma escalaria dentro da
                  própria caixa e sobraria um vão entre elas em todo dia que
                  não fosse o pico exato dos 28. Altura real empilha de
                  verdade. O arredondamento do topo mora no envoltório
                  (`overflow-hidden`), não numa das faixas: assim o canto
                  aparece sobre qualquer uma que toque o topo — a clara, a
                  escura, ou nenhuma, no dia zerado. */}
              <span
                aria-hidden="true"
                className="flex h-8 w-full flex-col justify-end overflow-hidden rounded-t-xs border border-border-strong"
              >
                <span
                  style={{ height: `${(r.semEquipe / teto) * 100}%` }}
                  className="block w-full shrink-0 bg-surface-3"
                />
                <span
                  style={{ height: `${(r.comEquipe / teto) * 100}%` }}
                  className="block w-full shrink-0 bg-ink-3"
                />
              </span>
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
