import type { Metadata } from "next";

import { CabecalhoPagina, MetricaCabecalho } from "@/components/shell/cabecalho-pagina";
import { fmt, isoHoje } from "@/lib/format";
import { cargaDasEquipes, listarAgendamentos, listarEquipes, listarTrechos } from "@/lib/queries";

import type { CargaEquipe, TrechoResumo } from "./_componentes/dados";
import { PlanejamentoAgenda } from "./_componentes/planejamento";

export const metadata: Metadata = {
  title: "Agenda",
  description:
    "Plano de roçada das próximas semanas: linha do tempo por equipe, carga diária e fila de decisão.",
};

export default async function PaginaAgenda() {
  const [agendamentos, equipes, carga, trechos] = await Promise.all([
    listarAgendamentos(),
    listarEquipes(),
    cargaDasEquipes(),
    listarTrechos(),
  ]);

  // `hoje` sai do servidor: se cada cliente calculasse o seu, o "hoje" da régua
  // divergiria do carimbo do banco na virada do dia e a hidratação quebraria.
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

  const cargas: CargaEquipe[] = carga.map((c) => ({
    equipeId: c.equipe.id,
    ocupacao: c.ocupacao,
    km: c.km,
    agendamentos: c.agendamentos,
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
        cargas={cargas}
        hoje={hoje}
      />
    </div>
  );
}
