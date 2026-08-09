import Link from "next/link";
import { CalendarRange, OctagonAlert, Route, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ROTULO_PERIODO, type Janela, type Periodo } from "./dados";

/**
 * Faixa de leitura da janela escolhida. O rótulo fica pequeno e acima; o número
 * carrega o peso — é um mostrador de instrumento, não um cartão.
 */
export function ResumoJanela({
  periodo,
  janela,
  rocadas,
  km,
  equipesMobilizadas,
  equipesAtivas,
  criticosSemData,
}: {
  periodo: Periodo;
  janela: Janela;
  rocadas: number;
  km: number;
  equipesMobilizadas: number;
  equipesAtivas: number;
  criticosSemData: number;
}) {
  return (
    <section
      aria-label={`Resumo do período · ${ROTULO_PERIODO[periodo]}`}
      className="grid grid-cols-2 rounded-lg border border-border bg-surface lg:grid-cols-4"
    >
      <Numero
        rotulo="Roçadas planejadas"
        valor={fmt.n(rocadas)}
        nota={`${fmt.dataCurta(janela.inicio)} – ${fmt.dataCurta(janela.fim)}`}
        icone={CalendarRange}
      />

      <Numero
        rotulo="Km previstos"
        valor={fmt.d1(km)}
        unidade="km"
        nota="Soma da extensão dos trechos"
        icone={Route}
        className="border-l border-border"
      />

      <Numero
        rotulo="Equipes mobilizadas"
        valor={fmt.n(equipesMobilizadas)}
        unidade={`de ${fmt.n(equipesAtivas)}`}
        nota={
          equipesMobilizadas < equipesAtivas
            ? `${fmt.n(equipesAtivas - equipesMobilizadas)} sem serviço na janela`
            : "Todas com serviço na janela"
        }
        icone={Users}
        className="border-t border-border lg:border-t-0 lg:border-l"
      />

      <Numero
        rotulo="Críticos sem data"
        valor={fmt.n(criticosSemData)}
        nota={
          criticosSemData > 0
            ? "Trechos de risco crítico sem agendamento"
            : "Todo trecho crítico já tem data"
        }
        icone={OctagonAlert}
        alerta={criticosSemData > 0}
        href="/malha"
        className="border-t border-l border-border lg:border-t-0"
      />
    </section>
  );
}

function Numero({
  rotulo,
  valor,
  unidade,
  nota,
  icone: Icone,
  alerta,
  href,
  className,
}: {
  rotulo: string;
  valor: string;
  unidade?: string;
  nota: string;
  icone: LucideIcon;
  alerta?: boolean;
  href?: string;
  className?: string;
}) {
  const conteudo = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-2xs font-medium tracking-widest text-ink-3 uppercase">
          {rotulo}
        </span>
        <Icone
          aria-hidden="true"
          className={cn("size-4 shrink-0", alerta ? "text-critical-ink" : "text-ink-3")}
        />
      </div>

      <p className="mt-2 flex min-w-0 items-baseline gap-1.5">
        <span
          className={cn(
            "tnum truncate text-2xl leading-none font-semibold",
            alerta ? "text-critical-ink" : "text-ink",
          )}
        >
          {valor}
        </span>
        {unidade ? <span className="shrink-0 text-xs text-ink-3">{unidade}</span> : null}
      </p>

      <p className="mt-1.5 line-clamp-2 text-2xs text-ink-3">{nota}</p>
    </>
  );

  if (!href) return <div className={cn("min-w-0 p-4", className)}>{conteudo}</div>;

  return (
    <Link
      href={href}
      className={cn(
        "group relative min-w-0 overflow-hidden p-4",
        "transition-[background-color] duration-200 ease-[var(--ease-out-quint)] hover:bg-surface-2",
        className,
      )}
    >
      {conteudo}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-accent-line transition-transform duration-200 ease-[var(--ease-out-quint)] group-hover:scale-x-100 group-focus-visible:scale-x-100"
      />
    </Link>
  );
}
