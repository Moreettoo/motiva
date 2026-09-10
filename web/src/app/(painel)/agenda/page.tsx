import type { Metadata } from "next";

import { CabecalhoPagina, MetricaCabecalho } from "@/components/shell/cabecalho-pagina";
import { exigirCargo } from "@/lib/auth/sessao";
import { AvisoSomenteLeitura } from "@/components/ui/aviso-somente-leitura";
import { podeEscrever } from "@/lib/auth/permissoes";
import { listarChamados } from "@/lib/chamados/queries";
import { fmt, isoHoje } from "@/lib/format";
import { listarAgendamentos, listarEquipes, listarTrechos } from "@/lib/queries";
import type { StatusChamado } from "@/lib/types";

import type { ChamadoDoItem, TrechoResumo } from "./_componentes/dados";
import { PlanejamentoAgenda } from "./_componentes/planejamento";

/** Os cinco estados NÃO TERMINAIS. Um chamado `concluido` ou `cancelado` não
 *  entra: o cartão dele já carrega o status do próprio agendamento
 *  (`executado`, `descartado`), e um chip "Concluído" ao lado de um cartão
 *  encerrado repetiria a mesma informação com outro vocabulário. */
const CHAMADOS_ABERTOS: StatusChamado[] = [
  "aberto",
  "em_andamento",
  "aguardando_aprovacao",
  "devolvido",
  "adiamento_solicitado",
];

export const metadata: Metadata = {
  title: "Agenda",
  description:
    "Quadro semanal arrastável de roçada: aloque equipes por dia, veja a capacidade da semana e o mapa dos próximos 28 dias.",
};

export default async function PaginaAgenda() {
  const sessao = await exigirCargo("super_admin", "admin", "analista");
  const escreve = podeEscrever(sessao.cargo);
  const [agendamentos, equipes, trechos, chamados] = await Promise.all([
    listarAgendamentos(),
    listarEquipes(),
    listarTrechos(),
    listarChamados({ status: CHAMADOS_ABERTOS }),
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

  /* Pares, e não um `Map`: a fronteira servidor→cliente serializa a prop, e um
     array de tuplas atravessa sem depender de o payload do RSC saber remontar
     `Map`. Quem constrói o mapa de verdade é `planejamento.tsx`, uma vez, em
     `useMemo`; aqui só o formato de transporte.
     Chaveado pelo AGENDAMENTO, não pelo trecho: é a chave que o cartão do
     quadro tem na mão (`item.id`), e a que a coluna `agendamento_id` do
     chamado torna única. */
  const chamadosPorAgendamento: [number, ChamadoDoItem][] = chamados.map((c) => [
    c.agendamento_id,
    { id: c.id, numero: c.numero, status: c.status },
  ]);

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

      <AvisoSomenteLeitura podeEscrever={escreve} />

      <PlanejamentoAgenda
        agendamentos={agendamentos}
        equipes={equipes}
        trechos={resumoTrechos}
        chamados={chamadosPorAgendamento}
        hoje={hoje}
        podeEscrever={escreve}
      />
    </div>
  );
}
