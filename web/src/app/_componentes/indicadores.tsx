import { CalendarClock, OctagonAlert, Sprout, Waypoints } from "lucide-react";

import { Indicador, type DeltaIndicador } from "@/components/ui/indicador";
import { Minigrafico } from "@/components/viz/minigrafico";
import { fmt } from "@/lib/format";
import type { Painel } from "@/lib/types";

/**
 * A faixa de leitura do topo. Quatro mostradores, o número sempre com o maior
 * peso visual e o rótulo pequeno acima — a hierarquia vive no `Indicador`.
 */
export function Indicadores({
  painel,
  rodovias,
  kmEmRisco,
  serieCrescimento,
  deltaCrescimento,
}: {
  painel: Painel;
  rodovias: number;
  kmEmRisco: number;
  /** Crescimento médio diário da malha, para o minigráfico. */
  serieCrescimento: number[];
  deltaCrescimento?: DeltaIndicador;
}) {
  const criticos = painel.por_risco.critica;
  const acimaDoLimite = painel.trechos_acima_do_limite;

  return (
    <section>
      <h2 className="sr-only">Indicadores da malha</h2>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador
          indice={0}
          rotulo="Trechos críticos"
          valor={fmt.n(criticos)}
          icone={<OctagonAlert />}
          href="/malha?risco=critica"
          nota={
            criticos === 0
              ? "Nenhum trecho a 7 dias ou menos do limite."
              : `${fmt.km(kmEmRisco)} de faixa · ${acimaDoLimite === 1 ? "1 trecho já acima" : `${acimaDoLimite} trechos já acima`} do limite`
          }
        />

        <Indicador
          indice={1}
          rotulo="Roçadas em 7 dias"
          valor={fmt.n(painel.rocadas_proximos_7d)}
          icone={<CalendarClock />}
          href="/agenda"
          nota={`${fmt.n(painel.pendentes)} sugestões aguardando decisão · ${fmt.n(painel.aprovados)} já aprovadas`}
        />

        <Indicador
          indice={2}
          rotulo="Km monitorados"
          valor={fmt.d1(painel.km_monitorados)}
          unidade="km"
          icone={<Waypoints />}
          href="/malha"
          nota={`${fmt.n(painel.trechos_total)} trechos em ${fmt.n(rodovias)} rodovias`}
        />

        <Indicador
          indice={3}
          rotulo="Crescimento médio"
          valor={fmt.d3(painel.crescimento_medio_cm_dia)}
          unidade="cm/dia"
          icone={<Sprout />}
          delta={deltaCrescimento}
          nota={`Pico da malha em ${fmt.cmDia(painel.crescimento_maximo_cm_dia)}`}
          grafico={
            <Minigrafico
              pontos={serieCrescimento}
              rotulo="Crescimento médio diário da malha nos últimos 45 dias"
              largura={112}
            />
          }
        />
      </div>
    </section>
  );
}
