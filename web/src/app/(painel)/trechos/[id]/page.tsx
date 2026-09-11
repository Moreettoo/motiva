import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AvisoSomenteLeitura } from "@/components/ui/aviso-somente-leitura";
import { CabecalhoPagina, MetricaCabecalho } from "@/components/shell/cabecalho-pagina";
import { exigirCargo } from "@/lib/auth/sessao";
import { podeEscrever } from "@/lib/auth/permissoes";
import { obterChamado } from "@/lib/chamados/queries";
import { rotuloPrazo } from "@/lib/dominio";
import { fmt, isoHoje } from "@/lib/format";
import {
  agendamentosDoTrecho,
  execucoesDoTrecho,
  listarEquipes,
  listarTrechos,
  medicoesDoTrecho,
  obterTrecho,
  previsoesDoTrecho,
} from "@/lib/queries";
import type { TrechoStatus } from "@/lib/types";

import { AcoesTrecho } from "../_componentes/acoes-trecho";
import { ChamadoDoTrecho } from "../_componentes/chamado-do-trecho";
import { DecisaoIa } from "../_componentes/decisao-ia";
import { EstadoAtual } from "../_componentes/estado-atual";
import { FaixaIdentidade } from "../_componentes/faixa-identidade";
import { GraficoAltura } from "../_componentes/grafico-altura";
import { HistoricoTrecho } from "../_componentes/historico-trecho";
import { RegistrarMedicao } from "../_componentes/registrar-medicao";
import { TrechosVizinhos } from "../_componentes/trechos-vizinhos";

/** Sem a casa decimal quando o km é redondo: "km 88–91" é como a operação fala. */
function kmCurto(v: number): string {
  return Number.isInteger(v) ? fmt.n(v) : fmt.d1(v);
}

function tituloCurto(trecho: TrechoStatus): string {
  return `${trecho.rodovia} km ${kmCurto(Number(trecho.km_inicio))}–${kmCurto(Number(trecho.km_fim))}`;
}

function lerId(id: string): number | null {
  const numero = Number(id);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const trechoId = lerId(id);
  if (trechoId == null) return { title: "Trecho não encontrado" };

  const trecho = await obterTrecho(trechoId);
  if (!trecho) return { title: "Trecho não encontrado" };

  return {
    title: tituloCurto(trecho),
    description: `Altura da vegetação, previsão de crescimento e decisão de roçada do trecho ${tituloCurto(trecho)}.`,
  };
}

export default async function PaginaTrecho({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirCargo("super_admin", "admin", "analista");
  const escreve = podeEscrever(sessao.cargo);
  const { id } = await params;
  const trechoId = lerId(id);
  if (trechoId == null) notFound();

  const trecho = await obterTrecho(trechoId);
  if (!trecho) notFound();

  const [medicoes, previsoes, agendamentos, execucoes, equipes, todosOsTrechos] = await Promise.all([
    medicoesDoTrecho(trechoId),
    previsoesDoTrecho(trechoId),
    agendamentosDoTrecho(trechoId),
    execucoesDoTrecho(trechoId),
    listarEquipes(),
    listarTrechos(),
  ]);

  const hojeIso = isoHoje();
  const agendamentoAtual = agendamentos[0] ?? null;

  /* Depois do `Promise.all`, e não dentro dele: o id do chamado vem da VIEW
     (`chamado_id`, coluna que a Fase 2 acrescentou), que só chega com o
     `obterTrecho` acima. Uma consulta em série, e só quando há chamado — a
     alternativa seria buscar por `agendamento_id` em paralelo e descartar o
     resultado nos trechos sem ordem de serviço aberta, que é a maioria. */
  const chamadoAtual = trecho.chamado_id == null ? null : await obterChamado(trecho.chamado_id);
  // A UF faz parte da identidade da faixa: a quilometragem reinicia na divisa, então a mesma
  // designação cobre faixas de km distintas em estados diferentes (a BR-381 vai do km 20 ao 66 em
  // SP e do km 550 ao 900 em MG). Sem a UF, a régua esticaria por centenas de km vazios e os
  // "vizinhos" listados estariam a 500 km daqui.
  const daRodovia = todosOsTrechos.filter((t) => t.rodovia === trecho.rodovia && t.uf === trecho.uf);

  const altura = trecho.altura_atual_cm == null ? null : Number(trecho.altura_atual_cm);
  const crescimento = trecho.crescimento_cm_dia == null ? null : Number(trecho.crescimento_cm_dia);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/malha"
          className="inline-flex items-center gap-1.5 rounded-sm text-xs text-ink-3 transition-colors duration-150 ease-[var(--ease-out-quint)] hover:text-ink"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5 shrink-0" />
          Todos os trechos
        </Link>

        <CabecalhoPagina
          className="mt-3"
          titulo={trecho.rodovia}
          /* A promessa do subtítulo tem de bater com o card lá embaixo: numa
             roçada marcada na mão não houve IA nenhuma decidindo a data, e o
             card já diz isso, o topo da página não pode prometer o contrário. */
          descricao={
            agendamentoAtual?.origem === "manual"
              ? "Por que esta roçada foi marcada na mão, e o que sustenta a decisão."
              : "Por que a IA decidiu esta data, e o que sustenta a decisão."
          }
          metricas={
            <>
              <MetricaCabecalho
                rotulo="Altura atual"
                valor={altura == null ? "—" : fmt.d1(altura)}
                unidade="cm"
              />
              <MetricaCabecalho rotulo="Prazo" valor={rotuloPrazo(trecho.dias_ate_limite)} />
              <MetricaCabecalho
                rotulo="Crescimento"
                valor={crescimento == null ? "—" : fmt.d3(crescimento)}
                unidade="cm/dia"
              />
            </>
          }
          acoes={
            <AcoesTrecho
              trechoId={trecho.id}
              agendamentoId={agendamentoAtual?.id ?? null}
              statusAgendamento={agendamentoAtual?.status ?? null}
              podeEscrever={escreve}
            />
          }
        />
      </div>

      <AvisoSomenteLeitura podeEscrever={escreve} />

      <FaixaIdentidade trecho={trecho} />

      <EstadoAtual trecho={trecho} previsoes={previsoes} hojeIso={hojeIso} />

      <GraficoAltura
        medicoes={medicoes}
        execucoes={execucoes}
        limiteCm={Number(trecho.altura_limite_cm)}
        crescimentoCmDia={crescimento}
        alturaAtualCm={altura}
        hojeIso={hojeIso}
      />

      <DecisaoIa agendamento={agendamentoAtual} trecho={trecho} hojeIso={hojeIso} podeEscrever={escreve} />

      {/* Depois de `DecisaoIa`, e não antes: a ordem na página é a ordem dos
          fatos — primeiro por que esta roçada foi marcada, depois em que pé
          está a execução dela. */}
      {chamadoAtual ? <ChamadoDoTrecho chamado={chamadoAtual} hojeIso={hojeIso} /> : null}

      {/* Sem "Registrar medição" o historico fica sozinho na linha: uma coluna
          de 2fr com o vazio ao lado seria um buraco, nao uma escolha. */}
      <div
        className={
          escreve
            ? "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
            : "grid grid-cols-1 gap-6"
        }
      >
        <HistoricoTrecho
          execucoes={execucoes}
          anteriores={agendamentos.slice(1)}
          equipes={equipes}
        />
        {escreve ? <RegistrarMedicao trechoId={trecho.id} hojeIso={hojeIso} /> : null}
      </div>

      <TrechosVizinhos trecho={trecho} daRodovia={daRodovia} />
    </div>
  );
}
