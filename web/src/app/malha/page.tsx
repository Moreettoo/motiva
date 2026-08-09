import type { Metadata } from "next";

import { CabecalhoPagina, MetricaCabecalho } from "@/components/shell/cabecalho-pagina";
import { fmt, isoHoje } from "@/lib/format";
import { listarTrechos, listarZonasClima, trechosPorRodovia } from "@/lib/queries";
import { sum } from "@/lib/utils";

import { MalhaCliente } from "./_componentes/malha-cliente";

export const metadata: Metadata = { title: "Malha" };

/**
 * A malha responde "onde está o problema ao longo das rodovias".
 *
 * Toda a leitura acontece aqui, no servidor, em uma consulta só
 * (`vw_trecho_status`); o cliente recebe a lista pronta e só cuida de filtro,
 * seleção e visão — que vivem na URL para o gestor mandar o link à equipe.
 */
export default async function PaginaMalha() {
  const [trechos, porRodovia, zonas] = await Promise.all([
    listarTrechos(),
    trechosPorRodovia(),
    listarZonasClima(),
  ]);

  const kmMonitorados = sum(trechos.map((t) => Number(t.extensao_km) || 0));
  const criticos = trechos.filter((t) => t.risco === "critica").length;

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Malha"
        descricao="Onde a vegetação está perto do limite ao longo de cada rodovia — e quais trechos vizinhos cabem numa mesma saída de equipe."
        metricas={
          <>
            <MetricaCabecalho rotulo="Rodovias" valor={fmt.n(porRodovia.length)} />
            <MetricaCabecalho rotulo="Trechos" valor={fmt.n(trechos.length)} />
            <MetricaCabecalho rotulo="Monitorado" valor={fmt.d1(kmMonitorados)} unidade="km" />
            <MetricaCabecalho rotulo="Críticos" valor={fmt.n(criticos)} />
          </>
        }
      />

      {/* "Hoje" sai do servidor: o agrupamento por semana é calculado no
          cliente, e um relógio de máquina adiantado jogaria o trecho para a
          semana seguinte só no primeiro quadro. */}
      <MalhaCliente trechos={trechos} zonas={zonas} hoje={isoHoje()} />
    </div>
  );
}
