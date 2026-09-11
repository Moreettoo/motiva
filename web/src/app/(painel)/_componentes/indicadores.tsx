import { CalendarClock, OctagonAlert, Waypoints } from "lucide-react";

import { Indicador, type DeltaIndicador } from "@/components/ui/indicador";
import { fmt } from "@/lib/format";
import type { Painel } from "@/lib/types";

import { CartaoCrescimento, type CrescimentoEspecieDado } from "./cartao-crescimento";

/**
 * A faixa de leitura do topo. Quatro mostradores, o número sempre com o maior
 * peso visual e o rótulo pequeno acima, a hierarquia vive no `Indicador`.
 */
export function Indicadores({
  painel,
  rodovias,
  kmEmRisco,
  serieCrescimento,
  deltaCrescimento,
  crescimentoPorEspecie,
}: {
  painel: Painel;
  rodovias: number;
  kmEmRisco: number;
  /** Crescimento médio diário da malha, para o minigráfico. */
  serieCrescimento: number[];
  deltaCrescimento?: DeltaIndicador;
  /** Mesma leitura, quebrada por espécie, o verso do card de crescimento. */
  crescimentoPorEspecie: CrescimentoEspecieDado[];
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
              : `Somam ${fmt.km(kmEmRisco)} · ${acimaDoLimite === 1 ? "1 trecho já acima" : `${acimaDoLimite} trechos já acima`} do limite`
          }
        />

        <Indicador
          indice={1}
          rotulo="Roçadas em 7 dias"
          valor={fmt.n(painel.rocadas_proximos_7d)}
          icone={<CalendarClock />}
          href="/agenda"
          /* "Na malha" e obrigatorio, nao enfeite: `pendentes` e `aprovados`
             contam a malha INTEIRA e o numero grande conta 7 dias. Sem o
             escopo escrito, a nota era lida como decomposicao do numero de
             cima e nao fechava a conta -- "18 + 16" embaixo de um "20". */
          nota={`Na malha: ${fmt.contar(painel.pendentes, "sugestão aguardando decisão", "sugestões aguardando decisão")} · ${fmt.contar(painel.aprovados, "aprovada", "aprovadas")}`}
        />

        <Indicador
          indice={2}
          rotulo="Km monitorados"
          valor={fmt.d1(painel.km_monitorados)}
          unidade="km"
          icone={<Waypoints />}
          href="/malha"
          nota={`${fmt.contar(painel.trechos_total, "trecho")} em ${fmt.contar(rodovias, "rodovia")}`}
        />

        <CartaoCrescimento
          indice={3}
          valorMalha={painel.crescimento_medio_cm_dia}
          picoMalha={painel.crescimento_maximo_cm_dia}
          serieMalha={serieCrescimento}
          deltaMalha={deltaCrescimento}
          especies={crescimentoPorEspecie}
        />
      </div>
    </section>
  );
}
