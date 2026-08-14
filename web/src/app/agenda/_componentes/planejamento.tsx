"use client";

import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from "nuqs";

import { useNotificacao } from "@/components/ui/notificacoes";
import {
  alocarAgendamento,
  atribuirEquipe,
  desfazerAlocacao,
  devolverParaFila,
  mudarStatusAgendamento,
  remarcarAgendamento,
} from "@/lib/acoes";
import { fmt, inicioDaSemana, parseData } from "@/lib/format";
import {
  STATUS_AGENDAMENTO,
  type AgendamentoDetalhado,
  type Equipe,
  type StatusAgendamento,
  type UF,
} from "@/lib/types";

import { Controles } from "./controles";
import {
  chaveDia,
  contarAtrasados,
  montarGrade,
  montarItens,
  montarJanela,
  resolverEquipeFoco,
  resumo28,
  semanaDoAtrasoMaisAntigo,
  type ItemAgenda,
  type TrechoResumo,
} from "./dados";
import { PainelAgendamento } from "./painel-agendamento";
import { QuadroSemana } from "./quadro/quadro-semana";
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

/** `null` = silencioso: o movimento do cartão já é a confirmação e a região
 *  `aria-live` do quadro narra o desfecho — dois canais contando o mesmo
 *  evento é ruído. O toast de ERRO (em `executar`) continua incondicional. */
type Aviso = { titulo: string; descricao?: string };

/** `?semana=` é entrada de URL, não confiável. Lixo de formato (`abc`) faz
 *  `parseData` devolver `Invalid Date`; uma data que só PARECE real (29/02 fora
 *  de bissexto, dia 31 num mês de 30) o JS normaliza em silêncio para outro
 *  dia — por isso o teste de ida-e-volta via `chaveDia`, não só `Number.isNaN`. */
function semanaValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseData(s);
  return !Number.isNaN(d.getTime()) && chaveDia(d) === s;
}

export function PlanejamentoAgenda({
  agendamentos,
  equipes,
  trechos,
  hoje,
}: {
  agendamentos: AgendamentoDetalhado[];
  equipes: Equipe[];
  trechos: TrechoResumo[];
  hoje: string;
}) {
  const [status, setStatus] = useQueryState(
    "status",
    parseAsArrayOf(parseAsStringLiteral(STATUS_AGENDAMENTO)).withDefault(STATUS_PADRAO),
  );
  const [equipe, setEquipe] = useQueryState("equipe", parseAsString.withDefault(""));
  const [selecionado, setSelecionado] = useQueryState("ag", parseAsInteger);
  const [semana, setSemana] = useQueryState("semana", parseAsString.withDefault(""));

  const ancora = semanaValida(semana) ? semana : chaveDia(inicioDaSemana(hoje));

  const { mostrar } = useNotificacao();
  const [, iniciar] = useTransition();

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

  // Substitui o `pendente` global de antes: com ~62 serviços na fila, travar a
  // tela inteira a cada solta seria sentido em todo arrasto. Um id por vez.
  const [salvandoIds, setSalvandoIds] = useState<ReadonlySet<number>>(new Set());
  const [desfazerPorId, setDesfazerPorId] = useState<ReadonlyMap<number, () => void>>(new Map());

  // O desfazer mora no cartão por 8s (ver `registrarDesfazer`). Sem cancelar o
  // timer no desmonte, sair da Agenda dentro da janela dispara `setState` num
  // componente que já saiu da árvore.
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const mapa = timers.current;
    return () => {
      for (const t of mapa.values()) clearTimeout(t);
    };
  }, []);

  const limparDesfazer = useCallback((id: number) => {
    setDesfazerPorId((atual) => {
      if (!atual.has(id)) return atual; // sem isto, cada limpeza remonta a grade à toa
      const novo = new Map(atual);
      novo.delete(id);
      return novo;
    });
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const registrarDesfazer = useCallback(
    (id: number, acao: () => void) => {
      limparDesfazer(id); // cancela um desfazer anterior do MESMO item, se houver
      setDesfazerPorId((atual) => new Map(atual).set(id, acao));
      timers.current.set(
        id,
        setTimeout(() => limparDesfazer(id), 8000),
      );
    },
    [limparDesfazer],
  );

  const executar = useCallback(
    (ajuste: Ajuste, acao: () => Promise<Resposta>, id: number, aviso: Aviso | null) => {
      setSalvandoIds((atual) => new Set(atual).add(id));
      iniciar(async () => {
        ajustar(ajuste);
        const resultado = await acao();

        if (resultado.ok) {
          if (aviso) mostrar({ tom: "good", ...aviso });
        } else {
          mostrar({
            tom: "critical",
            titulo: "A alteração não foi salva",
            descricao: resultado.erro,
            duracao: 0,
          });
        }

        setSalvandoIds((atual) => {
          const novo = new Set(atual);
          novo.delete(id);
          return novo;
        });
      });
    },
    [ajustar, mostrar],
  );

  const itens = useMemo(
    () => montarItens({ agendamentos: lista, trechos, equipes, hoje }),
    [lista, trechos, equipes, hoje],
  );

  const janela = useMemo(() => montarJanela(ancora), [ancora]);
  const diasDaJanela = useMemo(() => new Set(janela.dias), [janela]);

  /**
   * A REGRA dos dois grupos de números desta tela. Leia antes de trocar a fonte
   * de qualquer um deles — depois desta linha convivem números que seguem o
   * filtro de status e números que não seguem, na mesma faixa, e as duas
   * escolhas são deliberadas.
   *
   * SEGUE O FILTRO (`visiveis`) todo número que o gestor pode CONFERIR contando
   * cartões no quadro. Grade, cabeçalho do dia, mini-mapa de 28 dias e a faixa
   * `ResumoJanela` são recortes do MESMO conjunto exibidos lado a lado; se um
   * contasse `itens` e o outro `visiveis`, com o filtro em "aprovado" a tela
   * mostraria dois números diferentes para o mesmo dia a centímetros de
   * distância — que é a contradição que `dados.tsx` existe para impedir.
   *
   * NÃO SEGUE O FILTRO (`itens`/`trechos`) todo número que ALERTA sobre algo
   * fora da visão atual: vencidos (`totalAtrasados`, `semanaAtraso`) e críticos
   * sem agendamento (`criticosSemData`). O filtro escolhe o que olhar e não pode
   * decidir se o problema EXISTE. Nenhum dos dois é conferível contando cartões,
   * então não há contradição possível: o de vencidos NAVEGA para a semana do
   * problema — e `irParaAtrasados` liga os status necessários antes, cumprindo a
   * promessa — e o de críticos leva para `/malha`, outra página.
   *
   * `porStatusNaMalha` fica de fora do filtro por um terceiro motivo, que não é
   * "alerta": ele descreve o CONJUNTO QUE O PRÓPRIO FILTRO GOVERNA. Aplicar o
   * filtro nele seria contar o resultado do próprio botão.
   */

  // O filtro de equipe deixou de ESCONDER: filtrar removeria células que
  // precisam existir como destino de solta. `equipeFoco` (abaixo) é o
  // destaque visual que ocupa o lugar do filtro — ver `QuadroSemana`.
  const visiveis = useMemo(
    () => itens.filter((item) => status.includes(item.status)),
    [itens, status],
  );

  const equipeFoco = useMemo(() => resolverEquipeFoco(equipe, equipes), [equipe, equipes]);

  // Grupo "alerta" da regra acima: `itens`, nunca `visiveis`. Um serviço
  // vencido que já tem equipe não passa pelo trilho nem pela janela de 28
  // dias — o filtro não pode decidir se esse alerta existe.
  const totalAtrasados = useMemo(() => contarAtrasados(itens), [itens]);
  const semanaAtraso = useMemo(() => semanaDoAtrasoMaisAntigo(itens), [itens]);

  const grade = useMemo(
    () => montarGrade({ itens: visiveis, equipes, janela, hoje }),
    [visiveis, equipes, janela, hoje],
  );

  // Grupo "conferível": a MESMA fonte da grade. O mini-mapa fica logo ACIMA do
  // quadro, e a coluna de um dia é lida junto com o cabeçalho daquele mesmo dia
  // (`grade.porDia`, em `cabecalho-dia.tsx`) — com `itens`, o filtro em
  // "aprovado" punha dois números diferentes para o mesmo dia a centímetros um
  // do outro. Passar `visiveis` também alinha `equipesComLinha`: quem ganha
  // linha na grade e quem entra no alerta de excesso dos 28 dias passa a ser
  // decidido sobre o mesmo conjunto.
  const resumo28dias = useMemo(
    () => resumo28(visiveis, ancora, equipes),
    [visiveis, ancora, equipes],
  );

  // Idem: a faixa `ResumoJanela` resume a semana que o quadro DESENHA, então
  // "Roçadas planejadas" e "Km previstos" saem de `visiveis`.
  const naJanela = useMemo(
    () => visiveis.filter((item) => diasDaJanela.has(item.data)),
    [visiveis, diasDaJanela],
  );

  const planejadas = useMemo(
    () => naJanela.filter((item) => item.status === "sugerido" || item.status === "aprovado"),
    [naJanela],
  );

  // O escopo do filtro, não o da semana. Contava só `diasDaJanela` e descrevia
  // um conjunto que o botão não governa: o filtro alimenta `visiveis`, e
  // `visiveis` alimenta também o TRILHO (todos os ~62 sem turma, de todo o
  // horizonte) e os 28 dias do mini-mapa. Desmarcar "sugerido" tirava dezenas de
  // cartões do trilho enquanto o chip ao lado dizia "6". `controles.tsx` diz
  // "toda a malha" em texto visível e no nome acessível de cada botão, porque um
  // número com escopo diferente do resto da tela não se deduz — se deduziria
  // "nesta semana", que é exatamente o erro que esta contagem veio consertar.
  const porStatusNaMalha = useMemo(() => {
    const contagem = { sugerido: 0, aprovado: 0, executado: 0, descartado: 0 } as Record<
      StatusAgendamento,
      number
    >;
    for (const item of itens) contagem[item.status] += 1;
    return contagem;
  }, [itens]);

  // Grupo "alerta" da regra acima: trecho crítico sem NENHUM agendamento em
  // aberto é fato do mundo, não da visão filtrada.
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
    semana !== "" ||
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

    executar({ id: item.id, status: novo }, () => mudarStatusAgendamento(item.id, novo), item.id, {
      titulo: rotulos[novo],
      descricao: `${item.ag.trecho.rodovia} · ${fmt.dataMedia(item.data)}`,
    });
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
      item.id,
      {
        titulo: novaEquipe ? "Equipe atribuída" : "Equipe removida",
        descricao: novaEquipe ? `${novaEquipe.nome} · ${item.ag.trecho.rodovia}` : item.ag.trecho.rodovia,
      },
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

    executar({ id: item.id, data_sugerida: data }, () => remarcarAgendamento(item.id, data), item.id, {
      titulo: "Roçada remarcada",
      descricao: `${item.ag.trecho.rodovia} · ${fmt.dataMedia(data)}`,
    });
  }

  // Arrastar de uma turma para outra e desfazer precisa devolver a equipe
  // ANTERIOR, não `null`: com `null` fixo, a tela perderia a turma enquanto
  // `desfazerAlocacao` restaura a antiga no banco — tela e banco divergiriam
  // até o próximo `revalidatePath`.
  const alocar = useCallback(
    (item: ItemAgenda, dia: string, equipe: Equipe) => {
      const anterior = { data: item.data, equipeId: item.equipeId };
      const equipeAnterior =
        anterior.equipeId != null ? (equipes.find((e) => e.id === anterior.equipeId) ?? null) : null;

      executar(
        {
          id: item.id,
          data_sugerida: dia,
          equipe: { id: equipe.id, nome: equipe.nome, base_uf: equipe.base_uf },
        },
        () => alocarAgendamento(item.id, dia, equipe.id),
        item.id,
        null, // silencioso — ver o comentário do tipo `Aviso`
      );

      registrarDesfazer(item.id, () =>
        executar(
          {
            id: item.id,
            data_sugerida: anterior.data,
            equipe: equipeAnterior
              ? { id: equipeAnterior.id, nome: equipeAnterior.nome, base_uf: equipeAnterior.base_uf }
              : null,
          },
          () => desfazerAlocacao(item.id, anterior.data, anterior.equipeId),
          item.id,
          { titulo: "Alocação desfeita", descricao: item.ag.trecho.rodovia },
        ),
      );
    },
    [equipes, executar, registrarDesfazer],
  );

  const devolver = useCallback(
    (item: ItemAgenda) => {
      const anterior = { data: item.data, equipeId: item.equipeId };
      const equipeAnterior =
        anterior.equipeId != null ? (equipes.find((e) => e.id === anterior.equipeId) ?? null) : null;

      executar({ id: item.id, equipe: null }, () => devolverParaFila(item.id), item.id, null);

      registrarDesfazer(item.id, () =>
        executar(
          {
            id: item.id,
            data_sugerida: anterior.data,
            equipe: equipeAnterior
              ? { id: equipeAnterior.id, nome: equipeAnterior.nome, base_uf: equipeAnterior.base_uf }
              : null,
          },
          () => desfazerAlocacao(item.id, anterior.data, anterior.equipeId),
          item.id,
          { titulo: "Devolução desfeita", descricao: item.ag.trecho.rodovia },
        ),
      );
    },
    [equipes, executar, registrarDesfazer],
  );

  const aoNavegar = useCallback(
    (nova: string) => setSemana(nova === chaveDia(inicioDaSemana(hoje)) ? null : nova),
    [setSemana, hoje],
  );

  // "Atrasado" só existe em `sugerido`/`aprovado` (ver `dados.tsx`), e o
  // contador vem da malha INTEIRA, não do filtro de status ativo — de
  // propósito, para o filtro não decidir se o alerta existe (ver a REGRA dos
  // dois grupos, acima). Mas isso cria uma promessa que o
  // clique precisa cumprir: garantir os dois status no filtro antes de
  // navegar, ou a semana de destino pode não ter o cartão que motivou o
  // clique — o mesmo defeito do eixo tempo, só que no eixo status.
  const irParaAtrasados = useCallback(() => {
    if (!semanaAtraso) return;
    const necessarios: StatusAgendamento[] = ["sugerido", "aprovado"];
    const faltando = necessarios.filter((s) => !status.includes(s));
    if (faltando.length > 0) setStatus([...status, ...faltando]);
    aoNavegar(semanaAtraso);
  }, [semanaAtraso, status, setStatus, aoNavegar]);

  const aoSelecionar = useCallback((id: number) => setSelecionado(id), [setSelecionado]);

  function restaurar() {
    setSemana(null);
    setStatus(null);
    setEquipe(null);
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Controles
        status={status}
        aoMudarStatus={(valor) => setStatus(valor)}
        equipe={equipe}
        aoMudarEquipe={(valor) => setEquipe(valor || null)}
        equipes={equipes}
        porStatusNaMalha={porStatusNaMalha}
        alterado={alterado}
        aoRestaurar={restaurar}
      />

      <ResumoJanela
        janela={janela}
        rocadas={planejadas.length}
        km={planejadas.reduce((total, item) => total + item.km, 0)}
        equipesMobilizadas={mobilizadas}
        equipesAtivas={equipes.filter((e) => e.ativo).length}
        criticosSemData={criticosSemData}
      />

      <QuadroSemana
        grade={grade}
        itens={itens}
        equipes={equipes}
        hoje={hoje}
        semana={ancora}
        equipeFoco={equipeFoco}
        totalAtrasados={totalAtrasados}
        semanaAtraso={semanaAtraso}
        selecionado={selecionado}
        salvandoIds={salvandoIds}
        desfazerPorId={desfazerPorId}
        resumo28dias={resumo28dias}
        aoNavegar={aoNavegar}
        aoIrParaAtrasados={irParaAtrasados}
        aoSelecionar={aoSelecionar}
        aoAlocar={alocar}
        aoDevolver={devolver}
      />

      <PainelAgendamento
        agendamento={emFoco}
        trecho={emFoco ? trechos.find((t) => t.id === emFoco.ag.trecho.id) : undefined}
        equipes={equipes}
        pendente={emFoco != null && salvandoIds.has(emFoco.id)}
        aoFechar={() => setSelecionado(null)}
        aoMudarStatus={mudarStatus}
        aoAtribuir={atribuir}
        aoRemarcar={remarcar}
      />
    </div>
  );
}
