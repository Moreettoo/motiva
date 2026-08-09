"use client";

import { useCallback, useMemo, useOptimistic, useTransition } from "react";
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from "nuqs";

import { Aviso } from "@/components/ui/aviso";
import { useNotificacao } from "@/components/ui/notificacoes";
import { atribuirEquipe, mudarStatusAgendamento, remarcarAgendamento } from "@/lib/acoes";
import { fmt } from "@/lib/format";
import {
  STATUS_AGENDAMENTO,
  type AgendamentoDetalhado,
  type Equipe,
  type StatusAgendamento,
  type UF,
} from "@/lib/types";

import { Controles } from "./controles";
import {
  PERIODOS,
  PERIODO_PADRAO,
  combinaEquipe,
  montarItens,
  montarJanela,
  montarRaias,
  ordenarPorUrgencia,
  type CargaEquipe,
  type ItemAgenda,
  type Periodo,
  type TrechoResumo,
} from "./dados";
import { FilaDecisao } from "./fila-decisao";
import { LinhaDoTempo } from "./linha-do-tempo";
import { PainelAgendamento } from "./painel-agendamento";
import { ResumoJanela } from "./resumo";

const STATUS_PADRAO: StatusAgendamento[] = ["sugerido", "aprovado"];

/** Só o que a tela precisa ler da resposta das Server Actions. */
type Resposta = { ok: true; dados: unknown } | { ok: false; erro: string };

type Ajuste = {
  id: number;
  status?: StatusAgendamento;
  data_sugerida?: string;
  /** `undefined` não mexe na equipe; `null` remove. */
  equipe?: { id: number; nome: string; base_uf: UF } | null;
};

export function PlanejamentoAgenda({
  agendamentos,
  equipes,
  trechos,
  cargas,
  hoje,
}: {
  agendamentos: AgendamentoDetalhado[];
  equipes: Equipe[];
  trechos: TrechoResumo[];
  cargas: CargaEquipe[];
  hoje: string;
}) {
  const [periodo, setPeriodo] = useQueryState(
    "periodo",
    parseAsStringLiteral(PERIODOS).withDefault(PERIODO_PADRAO),
  );
  const [status, setStatus] = useQueryState(
    "status",
    parseAsArrayOf(parseAsStringLiteral(STATUS_AGENDAMENTO)).withDefault(STATUS_PADRAO),
  );
  const [equipe, setEquipe] = useQueryState("equipe", parseAsString.withDefault(""));
  const [selecionado, setSelecionado] = useQueryState("ag", parseAsInteger);

  const { mostrar } = useNotificacao();
  const [pendente, iniciar] = useTransition();

  const [lista, ajustar] = useOptimistic(
    agendamentos,
    (atual: AgendamentoDetalhado[], ajuste: Ajuste) =>
      atual.map((a) =>
        a.id !== ajuste.id
          ? a
          : {
              ...a,
              status: ajuste.status ?? a.status,
              data_sugerida: ajuste.data_sugerida ?? a.data_sugerida,
              ...(ajuste.equipe !== undefined
                ? { equipe: ajuste.equipe, equipe_id: ajuste.equipe?.id ?? null }
                : {}),
            },
      ),
  );

  const executar = useCallback(
    (ajuste: Ajuste, acao: () => Promise<Resposta>, titulo: string, descricao?: string) => {
      iniciar(async () => {
        ajustar(ajuste);
        const resultado = await acao();

        if (resultado.ok) mostrar({ tom: "good", titulo, descricao });
        else
          mostrar({
            tom: "critical",
            titulo: "A alteração não foi salva",
            descricao: resultado.erro,
            duracao: 0,
          });
      });
    },
    [ajustar, mostrar],
  );

  const itens = useMemo(
    () => montarItens({ agendamentos: lista, trechos, equipes, hoje }),
    [lista, trechos, equipes, hoje],
  );

  const janela = useMemo(() => montarJanela(periodo, hoje), [periodo, hoje]);
  const diasDaJanela = useMemo(() => new Set(janela.dias), [janela]);

  const visiveis = useMemo(
    () => itens.filter((item) => status.includes(item.status) && combinaEquipe(item, equipe)),
    [itens, status, equipe],
  );

  const raias = useMemo(
    () => montarRaias({ itens: visiveis, equipes, janela, filtroEquipe: equipe, cargas }),
    [visiveis, equipes, janela, equipe, cargas],
  );

  const naJanela = useMemo(
    () => visiveis.filter((item) => diasDaJanela.has(item.data)),
    [visiveis, diasDaJanela],
  );

  const planejadas = useMemo(
    () => naJanela.filter((item) => item.status === "sugerido" || item.status === "aprovado"),
    [naJanela],
  );

  const fila = useMemo(
    () =>
      itens
        .filter(
          (item) => item.status === "sugerido" && item.equipeId == null && item.data <= janela.fim,
        )
        .sort(ordenarPorUrgencia),
    [itens, janela.fim],
  );

  const porStatus = useMemo(() => {
    const contagem = { sugerido: 0, aprovado: 0, executado: 0, descartado: 0 } as Record<
      StatusAgendamento,
      number
    >;
    for (const item of itens) {
      if (combinaEquipe(item, equipe) && diasDaJanela.has(item.data)) contagem[item.status] += 1;
    }
    return contagem;
  }, [itens, equipe, diasDaJanela]);

  const porPeriodo = useMemo(() => {
    const contagem = { semana: 0, quinzena: 0, mes: 0 } as Record<Periodo, number>;
    for (const p of PERIODOS) {
      const dias = new Set(montarJanela(p, hoje).dias);
      contagem[p] = visiveis.filter((item) => dias.has(item.data)).length;
    }
    return contagem;
  }, [visiveis, hoje]);

  const vencidas = useMemo(() => itens.filter((item) => item.atrasado), [itens]);
  const sobrecarregadas = raias.filter((r) => r.diasExcedidos.length > 0);
  const criticosSemData = useMemo(() => {
    const comAgendamentoAberto = new Set(
      itens
        .filter((item) => item.status === "sugerido" || item.status === "aprovado")
        .map((item) => item.ag.trecho.id),
    );
    return trechos.filter((t) => t.risco === "critica" && !comAgendamentoAberto.has(t.id)).length;
  }, [itens, trechos]);

  const emFoco = useMemo(
    () => itens.find((item) => item.id === selecionado) ?? null,
    [itens, selecionado],
  );

  const mobilizadas = new Set(
    planejadas.map((item) => item.equipeId).filter((id) => id != null),
  ).size;

  const alterado =
    periodo !== PERIODO_PADRAO ||
    equipe !== "" ||
    status.length !== STATUS_PADRAO.length ||
    STATUS_PADRAO.some((s) => !status.includes(s));

  function mudarStatus(item: ItemAgenda, novo: StatusAgendamento) {
    const rotulos: Record<StatusAgendamento, string> = {
      sugerido: "Sugestão reaberta",
      aprovado: "Roçada aprovada",
      executado: "Roçada marcada como executada",
      descartado: "Sugestão descartada",
    };

    executar(
      { id: item.id, status: novo },
      () => mudarStatusAgendamento(item.id, novo),
      rotulos[novo],
      `${item.ag.trecho.rodovia} · ${fmt.dataMedia(item.data)}`,
    );
  }

  function atribuir(item: ItemAgenda, novaEquipe: Equipe | null) {
    executar(
      {
        id: item.id,
        equipe: novaEquipe
          ? { id: novaEquipe.id, nome: novaEquipe.nome, base_uf: novaEquipe.base_uf }
          : null,
      },
      () => atribuirEquipe(item.id, novaEquipe?.id ?? null),
      novaEquipe ? "Equipe atribuída" : "Equipe removida",
      novaEquipe ? `${novaEquipe.nome} · ${item.ag.trecho.rodovia}` : item.ag.trecho.rodovia,
    );
  }

  function remarcar(item: ItemAgenda, data: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      mostrar({
        tom: "critical",
        titulo: "Data inválida",
        descricao: "Escolha um dia no calendário antes de remarcar.",
      });
      return;
    }

    executar(
      { id: item.id, data_sugerida: data },
      () => remarcarAgendamento(item.id, data),
      "Roçada remarcada",
      `${item.ag.trecho.rodovia} · ${fmt.dataMedia(data)}`,
    );
  }

  function restaurar() {
    setPeriodo(null);
    setStatus(null);
    setEquipe(null);
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Controles
        periodo={periodo}
        aoMudarPeriodo={(valor) => setPeriodo(valor)}
        status={status}
        aoMudarStatus={(valor) => setStatus(valor)}
        equipe={equipe}
        aoMudarEquipe={(valor) => setEquipe(valor || null)}
        equipes={equipes}
        porStatus={porStatus}
        porPeriodo={porPeriodo}
        alterado={alterado}
        aoRestaurar={restaurar}
      />

      <ResumoJanela
        periodo={periodo}
        janela={janela}
        rocadas={planejadas.length}
        km={planejadas.reduce((total, item) => total + item.km, 0)}
        equipesMobilizadas={mobilizadas}
        equipesAtivas={equipes.filter((e) => e.ativo).length}
        criticosSemData={criticosSemData}
      />

      {vencidas.length > 0 || sobrecarregadas.length > 0 ? (
        <div className="flex flex-col gap-3">
          {vencidas.length > 0 ? (
            <Aviso
              tom="warning"
              titulo={
                vencidas.length === 1
                  ? "1 roçada em aberto está com a data vencida"
                  : `${fmt.n(vencidas.length)} roçadas em aberto estão com a data vencida`
              }
            >
              <p>
                A data sugerida já passou e o serviço continua em aberto. Remarque na fila de
                decisão ou aprove para a equipe entrar em campo.
              </p>
            </Aviso>
          ) : null}

          {sobrecarregadas.length > 0 ? (
            <Aviso
              tom="critical"
              titulo={
                sobrecarregadas.length === 1
                  ? "1 equipe tem dia acima da capacidade"
                  : `${fmt.n(sobrecarregadas.length)} equipes têm dia acima da capacidade`
              }
            >
              <p>
                {sobrecarregadas
                  .map((r) => `${r.equipe?.nome ?? "Sem equipe"} (${fmt.n(r.diasExcedidos.length)})`)
                  .join(", ")}
                . O dia estourado aparece hachurado na régua. Remarque um dos serviços ou passe para
                outra equipe.
              </p>
            </Aviso>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <LinhaDoTempo
            raias={raias}
            janela={janela}
            periodo={periodo}
            hoje={hoje}
            selecionado={selecionado}
            aoSelecionar={(id) => setSelecionado(id)}
            mostrandoEncerrados={status.includes("executado") || status.includes("descartado")}
          />
        </div>

        <FilaDecisao
          itens={fila}
          equipes={equipes}
          hoje={hoje}
          pendente={pendente}
          aoAbrir={(id) => setSelecionado(id)}
          aoAprovar={(item) => mudarStatus(item, "aprovado")}
          aoAtribuir={atribuir}
          aoRemarcar={remarcar}
          aoDescartar={(item) => mudarStatus(item, "descartado")}
        />
      </div>

      <PainelAgendamento
        agendamento={emFoco}
        trecho={emFoco ? trechos.find((t) => t.id === emFoco.ag.trecho.id) : undefined}
        equipes={equipes}
        pendente={pendente}
        aoFechar={() => setSelecionado(null)}
        aoMudarStatus={mudarStatus}
        aoAtribuir={atribuir}
        aoRemarcar={remarcar}
      />
    </div>
  );
}
