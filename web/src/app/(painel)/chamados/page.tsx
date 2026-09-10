import type { Metadata } from "next";

import { CabecalhoPagina, MetricaCabecalho } from "@/components/shell/cabecalho-pagina";
import { exigirCargo } from "@/lib/auth/sessao";
import { filaDeDecisao, listarChamados, obterChamado } from "@/lib/chamados/queries";
import { fmt, isoHoje } from "@/lib/format";
import { listarAgendamentos, listarEquipes, listarTrechos } from "@/lib/queries";

import { montarItens, type TrechoResumo } from "../agenda/_componentes/dados";
import { GestaoChamados } from "./_componentes/gestao-chamados";

export const metadata: Metadata = {
  title: "Chamados",
  description:
    "Ordens de roçada: o que a equipe executou, o que espera aprovação e o que pediu adiamento.",
};

export default async function PaginaChamados({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Chamado é decisão de gestão. Analista não tem o que decidir aqui, e Roçador
  // trabalha em `/campo`: os dois caem em `/sem-acesso` antes de qualquer leitura.
  const sessao = await exigirCargo("super_admin", "admin");
  const params = await searchParams;

  // `hoje` sai do servidor. Se cada cliente calculasse o seu, "atrasado" mudaria
  // de significado na virada do dia entre o que a fila conta e o que a lista pinta.
  const hoje = isoHoje();

  /* O instante do carregamento, também do servidor, e pelo mesmo motivo que
     `hoje`: "finalizado há 2 h" é a diferença entre dois relógios, e calculado
     no cliente o texto do SSR e o da hidratação divergiriam a cada virada de
     minuto. `hoje` não serve aqui porque é dia de calendário, e a fila de
     aprovação precisa ordenar dentro do mesmo dia. */
  const agora = new Date().toISOString();

  const chamadoAberto = typeof params.chamado === "string" ? Number(params.chamado) : null;

  /* A gaveta lê o chamado no SERVIDOR, pelo `?chamado=`. Eventos, fotos e o
     adiamento pendente chegam prontos com a página, então o link é
     compartilhável de verdade: quem abre vê o mesmo conteúdo, sem uma segunda
     ida ao banco depois da hidratação. */
  const [chamados, fila, equipes, trechos, agendamentos, detalhe] = await Promise.all([
    listarChamados(),
    filaDeDecisao(hoje),
    listarEquipes(),
    listarTrechos(),
    listarAgendamentos(),
    chamadoAberto && Number.isInteger(chamadoAberto)
      ? obterChamado(chamadoAberto)
      : Promise.resolve(null),
  ]);

  /* A gaveta "Novo chamado" é o `PainelNovaRocada` da agenda: um chamado nasce
     do gatilho quando o agendamento vira `aprovado` com equipe, então criar
     chamado É criar roçada, e uma segunda gaveta com os mesmos quatro campos
     seria uma segunda regra de negócio para manter igual. O preço é este
     preparo, que a agenda faz na página dela pelo mesmo motivo. */
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

  const itens = montarItens({ agendamentos, trechos: resumoTrechos, equipes, hoje });

  const esperando = fila.aguardando.length + fila.adiamentos.length;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Chamados"
        destaque
        metricas={
          <>
            <MetricaCabecalho
              rotulo="Aguardando você"
              valor={fmt.n(esperando)}
              unidade={esperando === 1 ? "decisão" : "decisões"}
            />
            <MetricaCabecalho
              rotulo="Atrasados"
              valor={fmt.n(fila.atrasados.length)}
              unidade={fila.atrasados.length === 1 ? "chamado" : "chamados"}
            />
          </>
        }
      />

      <GestaoChamados
        chamados={chamados}
        fila={fila}
        equipes={equipes}
        trechos={resumoTrechos}
        itens={itens}
        detalhe={detalhe}
        hoje={hoje}
        agora={agora}
        cargo={sessao.cargo}
      />
    </div>
  );
}
