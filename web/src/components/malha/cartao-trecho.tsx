import type { CSSProperties } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { BarraProgresso } from "@/components/ui/barra-progresso";
import { Chip, ChipRisco, ChipStatus } from "@/components/ui/chip";
import { Leitura } from "@/components/ui/leitura";
import { ESPECIE, TOM_BARRA_POR_RISCO, rotuloPrazo } from "@/lib/dominio";
import { fmt, relativoEmDias } from "@/lib/format";
import type { TrechoStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Trecho em forma de cartão — para listas, busca e resultados filtrados.
 *
 * A régua continua sendo a leitura principal da malha; este cartão é o formato
 * de quando o trecho aparece fora do contexto da rodovia.
 */
export function CartaoTrecho({
  trecho,
  indice = 0,
  compacto = false,
  className,
}: {
  trecho: TrechoStatus;
  indice?: number;
  compacto?: boolean;
  className?: string;
}) {
  const limite = Number(trecho.altura_limite_cm);
  const atual = trecho.altura_atual_cm == null ? null : Number(trecho.altura_atual_cm);
  const especie = ESPECIE[trecho.especie];

  const meta = [especie?.rotulo, trecho.sentido, trecho.tipo_pista].filter(Boolean) as string[];

  return (
    <Link
      href={`/trechos/${trecho.id}`}
      style={{ "--i": indice } as CSSProperties}
      className={cn(
        "rise group relative block overflow-hidden rounded-lg border border-border bg-surface",
        "transition-[background-color,border-color] duration-200 ease-[var(--ease-out-quint)]",
        "hover:border-border-strong hover:bg-surface-2",
        compacto ? "p-3" : "p-5",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium text-ink">{trecho.rodovia}</p>
          <p className="tnum mt-0.5 font-mono text-xs text-ink-2">
            {fmt.faixaKm(Number(trecho.km_inicio), Number(trecho.km_fim))}
          </p>
        </div>

        <span className="shrink-0">
          <ChipRisco risco={trecho.risco} tamanho={compacto ? "sm" : "md"} />
        </span>
      </div>

      {!compacto ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <Chip tom="neutro">{trecho.uf}</Chip>
          {meta.length ? (
            <span className="min-w-0 truncate text-xs text-ink-3">{meta.join(" · ")}</span>
          ) : null}
        </div>
      ) : null}

      <div className={cn("flex items-start gap-6", compacto ? "mt-3" : "mt-4")}>
        <Leitura
          rotulo="Altura"
          valor={atual == null ? "—" : fmt.cm(atual)}
          nota={`limite ${fmt.cm(limite)}`}
          className="min-w-0 flex-1"
        />
        <Leitura
          rotulo="Prazo"
          valor={rotuloPrazo(trecho.dias_ate_limite)}
          nota={
            trecho.crescimento_cm_dia == null
              ? "sem previsão"
              : fmt.cmDia(Number(trecho.crescimento_cm_dia))
          }
          className="min-w-0 flex-1 text-right"
        />
      </div>

      {atual == null ? (
        <p className="mt-3 text-xs text-ink-3">
          Sem previsão de altura. Registre uma medição para este trecho.
        </p>
      ) : (
        <BarraProgresso
          className="mt-3"
          valor={atual}
          max={limite}
          marcaLimite={100}
          tom={TOM_BARRA_POR_RISCO[trecho.risco]}
          altura={compacto ? "fina" : "media"}
          mostrarValor
          rotulo={`Altura de ${fmt.cm(atual)} contra o limite de ${fmt.cm(limite)}`}
        />
      )}

      {!compacto && trecho.data_sugerida ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-ink-2">
            <CalendarClock aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
            <span className="truncate">
              Roçada em{" "}
              <span className="tnum font-mono text-ink">{fmt.dataMedia(trecho.data_sugerida)}</span>
              <span className="text-ink-3"> · {relativoEmDias(trecho.data_sugerida)}</span>
            </span>
          </span>

          {trecho.agendamento_status ? (
            <span className="ml-auto shrink-0">
              <ChipStatus status={trecho.agendamento_status} />
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Filete de acento: só aparece no cartão vivo. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-accent-line transition-transform duration-200 ease-[var(--ease-out-quint)] group-hover:scale-x-100 group-focus-visible:scale-x-100"
      />
    </Link>
  );
}
