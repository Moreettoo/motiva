import type { Metadata } from "next";

import { CabecalhoPagina, MetricaCabecalho } from "@/components/shell/cabecalho-pagina";
import { fmt, isoHoje } from "@/lib/format";
import { listarAgendamentos, listarEquipes, listarTrechos } from "@/lib/queries";

import type { TrechoResumo } from "./_componentes/dados";
import { PlanejamentoAgenda } from "./_componentes/planejamento";

export const metadata: Metadata = {
  title: "Agenda",
  description:
    "Quadro semanal arrastável de roçada: aloque equipes por dia, veja a capacidade da semana e o mapa dos próximos 28 dias.",
};

export default async function PaginaAgenda() {
  const [agendamentos, equipes, trechos] = await Promise.all([
    listarAgendamentos(),
    listarEquipes(),
    listarTrechos(),
  ]);

  // `hoje` sai do servidor: se cada cliente calculasse o seu, o "hoje" do
  // quadro divergiria do carimbo do banco na virada do dia e a hidratação quebraria.
  const hoje = isoHoje();

  const resumoTrechos: TrechoResumo[] = trechos.map((t) => ({
    id: t.id,
    rodovia: t.rodovia,
    km_inicio: Number(t.km_inicio),
    km_fim: Number(t.km_fim),
    uf: t.uf,
    sentido: t.sentido,
    risco: t.risco,
    dias_ate_limite: t.dias_ate_limite,
    ocupacao_pct: t.ocupacao_pct,
    altura_atual_cm: t.altura_atual_cm,
    altura_limite_cm: Number(t.altura_limite_cm),
    crescimento_cm_dia: t.crescimento_cm_dia,
  }));

  /* UM número no cabeçalho, e eram três.
     "Em aberto" repetia a soma dos chips de status, que agora vivem no menu de
     filtro do quadro com a contagem de cada um. "Equipes ativas" repetia as
     linhas da grade, que estão desenhadas dez centímetros abaixo.
     "Sem equipe" sobrou porque é o único que descreve o TRABALHO desta tela:
     quantas roçadas ainda esperam uma decisão de dia e equipe. É também o
     número do selo da fila de decisão, e os dois saem da mesma conta. */
  const semEquipe = agendamentos.filter(
    (a) => (a.status === "sugerido" || a.status === "aprovado") && a.equipe_id == null,
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Agenda"
        destaque
        metricas={
          <MetricaCabecalho
            rotulo="Esperando decisão"
            valor={fmt.n(semEquipe.length)}
            unidade="roçadas"
          />
        }
      />

      <PlanejamentoAgenda
        agendamentos={agendamentos}
        equipes={equipes}
        trechos={resumoTrechos}
        hoje={hoje}
      />
    </div>
  );
}
