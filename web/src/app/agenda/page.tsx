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
    risco: t.risco,
    dias_ate_limite: t.dias_ate_limite,
    ocupacao_pct: t.ocupacao_pct,
    altura_atual_cm: t.altura_atual_cm,
    altura_limite_cm: Number(t.altura_limite_cm),
    crescimento_cm_dia: t.crescimento_cm_dia,
  }));

  const emAberto = agendamentos.filter((a) => a.status === "sugerido" || a.status === "aprovado");
  const semEquipe = emAberto.filter((a) => a.equipe_id == null);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Agenda"
        destaque
        metricas={
          <>
            <MetricaCabecalho rotulo="Em aberto" valor={fmt.n(emAberto.length)} unidade="roçadas" />
            <MetricaCabecalho rotulo="Sem equipe" valor={fmt.n(semEquipe.length)} unidade="roçadas" />
            <MetricaCabecalho
              rotulo="Equipes ativas"
              valor={fmt.n(equipes.filter((e) => e.ativo).length)}
            />
          </>
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
