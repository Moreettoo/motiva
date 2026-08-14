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

/** Quanto tempo o anel de erro fica no cartão revertido (spec §4, passo 3).
 *  Igual à duração da animação em `globals.css` — e é este número, não o CSS,
 *  que manda: sob `prefers-reduced-motion` o anel vira ESTADO estático
 *  (`animation: none`), então quem o apaga é sempre o temporizador daqui. */
const ANEL_ERRO_MS = 450;

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

  // Normalizada para a segunda-feira, não usada crua. `montarJanela` já abre na
  // segunda de qualquer âncora, então a GRADE ficava certa com um `?semana=`
  // apontando para uma quinta — mas duas outras coisas ficavam erradas: a
  // aritmética de `navegarSemana` (`âncora ± 7 dias`) andava de quinta em
  // quinta, e `aoNavegar` compara a âncora nova com a segunda-feira de hoje
  // para decidir se APAGA o parâmetro da URL. Com âncora fora da segunda essa
  // igualdade nunca casava: voltar para a semana corrente deixava `?semana=`
  // pendurado na URL e "Restaurar padrão" continuava oferecido sem nada para
  // restaurar. Normalizar aqui, na única leitura do valor, resolve os dois de
  // uma vez — e mantém a URL que a pessoa colou funcionando, só deixando de
  // tratá-la como canônica.
  const ancora = chaveDia(inicioDaSemana(semanaValida(semana) ? semana : hoje));

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

  // Passo 3 da reversão (spec §4): o cartão que voltou para a origem pisca um
  // anel `--critical`. O valor é a GERAÇÃO do erro, não um booleano, porque uma
  // animação CSS não reinicia com a classe já aplicada — a geração faz o cartão
  // alternar entre duas classes e o navegador reiniciar sem remontar nada (ver
  // `classeAnelErro`, em `cartao-servico.tsx`). Cada cartão recebe só o escalar.
  const [anelErroPorId, setAnelErroPorId] = useState<ReadonlyMap<number, number>>(new Map());

  // Dois temporizadores por id, com vidas diferentes: o desfazer mora no cartão
  // por 8 s (ver `registrarDesfazer`) e o anel por 450 ms. Mapas SEPARADOS de
  // propósito — num mapa só, um erro logo depois de uma alocação bem-sucedida
  // cancelaria o desfazer dela ao gravar sob a mesma chave. Sem cancelar no
  // desmonte, sair da Agenda dentro de qualquer das duas janelas dispara
  // `setState` num componente que já saiu da árvore.
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const timersAnel = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const mapas = [timers.current, timersAnel.current];
    return () => {
      for (const mapa of mapas) for (const t of mapa.values()) clearTimeout(t);
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

  // Passo 3 da reversão. Incrementa a geração do id e agenda o apagamento; um
  // erro novo no MESMO cartão cancela o temporizador anterior, então a janela de
  // 450 ms conta sempre a partir do último erro.
  const marcarErro = useCallback((id: number) => {
    setAnelErroPorId((atual) => new Map(atual).set(id, (atual.get(id) ?? 0) + 1));

    const anterior = timersAnel.current.get(id);
    if (anterior) clearTimeout(anterior);
    timersAnel.current.set(
      id,
      setTimeout(() => {
        timersAnel.current.delete(id);
        setAnelErroPorId((atual) => {
          if (!atual.has(id)) return atual; // sem isto, cada limpeza remonta a grade à toa
          const novo = new Map(atual);
          novo.delete(id);
          return novo;
        });
      }, ANEL_ERRO_MS),
    );
  }, []);

  /**
   * O caminho único de escrita da tela: aplica o otimista, chama a ação, e
   * fecha o desfecho (toast de sucesso opcional, toast de erro persistente,
   * anel de erro, fim do `salvando`).
   *
   * `aoSucesso` é o contrato que mudou. Antes, `executar` devolvia `void` e
   * engolia o resultado dentro da transição, então `alocar`/`devolver`
   * registravam o desfazer ANTES de saber se a escrita passou: numa recusa do
   * servidor o cartão voltava para o lugar antigo e mostrava um "Desfazer" ao
   * lado de um toast dizendo que nada foi salvo — um botão para desfazer o que
   * não aconteceu.
   *
   * É um callback e não um `Promise<boolean>` por duas razões. Uma:
   * `startTransition` descarta o valor de retorno da função async, então
   * devolver a promessa exigiria um `Promise` diferido só para atravessar a
   * transição. Duas: assim `registrarDesfazer` roda DENTRO da mesma transição,
   * e o botão aparece no mesmo commit em que o dado revalidado chega, em vez de
   * num render extra depois dele.
   *
   * Só o sucesso tem gancho. A falha é tratada aqui (toast + anel) porque é
   * igual para todas as seis chamadas — e é isso que faz um desfazer que FALHA
   * pintar o anel sem precisar de gancho nenhum: ele chama `executar` de novo,
   * sem `aoSucesso`, então não há laço.
   */
  const executar = useCallback(
    (
      ajuste: Ajuste,
      acao: () => Promise<Resposta>,
      id: number,
      aviso: Aviso | null,
      aoSucesso?: () => void,
    ) => {
      setSalvandoIds((atual) => new Set(atual).add(id));
      iniciar(async () => {
        ajustar(ajuste);

        /* A recusa que a ação DEVOLVE (`ok: false`) e a que ela LANÇA precisam
           terminar do mesmo jeito, e antes deste `try` só a primeira terminava.
           Uma Server Action lança quando a requisição nem chega a completar —
           rede caindo, servidor reiniciando, deploy no meio do caminho — e nesse
           caso não havia toast, não havia anel, e o `setSalvandoIds` de baixo
           nunca rodava: o cartão ficava preso em "salvando" PARA SEMPRE. E preso
           nesse estado ele não tem alça nem `onKeyDown` (ver `cartao-servico.tsx`,
           que os omite enquanto `salvando`), então não havia como pegá-lo de novo
           nem por mouse nem por teclado — irrecuperável sem recarregar a página.
           O `finally` é o que fecha essa porta; o `catch` é o que faz a falha
           contar a mesma história que a recusa devolvida. */
        try {
          const resultado = await acao();

          if (resultado.ok) {
            if (aviso) mostrar({ tom: "good", ...aviso });
            aoSucesso?.();
          } else {
            // Cor de status nunca aparece sozinha, e o anel É cor sozinha: um
            // retângulo `--critical` de 450 ms, sem ícone e sem rótulo. Quem
            // carrega ícone e rótulo é este toast — `tom: "critical"` já entra
            // com `OctagonAlert` e o rótulo "Erro" (ver `notificacoes.tsx`) —, e
            // ele é PERSISTENTE (`duracao: 0`), então sobrevive ao anel e não
            // depende de reflexo para ser lido. O anel não é o canal da
            // mensagem: é o LOCALIZADOR dela, a resposta a "qual dos ~130
            // cartões?", que o toast não tem como dar. Por isso os dois são
            // incondicionais e nascem juntos.
            mostrar({
              tom: "critical",
              titulo: "A alteração não foi salva",
              descricao: resultado.erro,
              duracao: 0,
            });
            marcarErro(id);
          }
        } catch {
          /* Mensagem própria, e não a do erro lançado: o que a exceção carrega
             aqui é texto de infraestrutura ("Failed to fetch", uma pilha do
             Next) que não diz ao gestor o que fazer. O desfecho é o mesmo da
             recusa devolvida — toast persistente com ícone e rótulo, mais o anel
             localizando o cartão —, e o otimista reverte igual quando a
             transição fecha. */
          mostrar({
            tom: "critical",
            titulo: "A alteração não foi salva",
            descricao: "A conexão com o servidor falhou. Confira a rede e tente de novo.",
            duracao: 0,
          });
          marcarErro(id);
        } finally {
          setSalvandoIds((atual) => {
            const novo = new Set(atual);
            novo.delete(id);
            return novo;
          });
        }
      });
    },
    [ajustar, mostrar, marcarErro],
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
  //
  // O desfazer é registrado no `aoSucesso` de `executar`, nunca ao lado dele: o
  // botão é o remédio para uma mudança que ACONTECEU. Antes ele nascia junto com
  // a chamada, então uma recusa do servidor devolvia o cartão para o lugar antigo
  // e ainda oferecia "Desfazer" ao lado do toast dizendo que nada foi salvo. O
  // preço é que o botão aparece uma ida ao servidor mais tarde — e é um preço
  // baixo: os 8 s passam a contar do momento em que a mudança está confirmada (o
  // gestor ganha a janela inteira, em vez de gastar parte dela esperando), a
  // confirmação que o olho acompanha continua sendo o movimento do cartão, que é
  // instantâneo, e durante essa espera o cartão está `salvando` — sem alça e sem
  // `onKeyDown` —, então não havia nada que um botão mais cedo permitisse fazer.
  const alocar = useCallback(
    (item: ItemAgenda, dia: string, equipe: Equipe) => {
      const anterior = { data: item.data, equipeId: item.equipeId };
      const equipeAnterior =
        anterior.equipeId != null ? (equipes.find((e) => e.id === anterior.equipeId) ?? null) : null;
      const ajusteAnterior: Ajuste = {
        id: item.id,
        data_sugerida: anterior.data,
        equipe: equipeAnterior
          ? { id: equipeAnterior.id, nome: equipeAnterior.nome, base_uf: equipeAnterior.base_uf }
          : null,
      };

      executar(
        {
          id: item.id,
          data_sugerida: dia,
          equipe: { id: equipe.id, nome: equipe.nome, base_uf: equipe.base_uf },
        },
        () => alocarAgendamento(item.id, dia, equipe.id),
        item.id,
        null, // silencioso — ver o comentário do tipo `Aviso`
        () =>
          registrarDesfazer(item.id, () =>
            // Sem `aoSucesso`: o desfazer não registra outro desfazer, então não
            // há laço. Se ELE falhar, o `else` de `executar` pinta o anel igual.
            executar(
              ajusteAnterior,
              () => desfazerAlocacao(item.id, anterior.data, anterior.equipeId),
              item.id,
              { titulo: "Alocação desfeita", descricao: item.ag.trecho.rodovia },
            ),
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
      const ajusteAnterior: Ajuste = {
        id: item.id,
        data_sugerida: anterior.data,
        equipe: equipeAnterior
          ? { id: equipeAnterior.id, nome: equipeAnterior.nome, base_uf: equipeAnterior.base_uf }
          : null,
      };

      executar(
        { id: item.id, equipe: null },
        () => devolverParaFila(item.id),
        item.id,
        null,
        () =>
          registrarDesfazer(item.id, () =>
            executar(
              ajusteAnterior,
              () => desfazerAlocacao(item.id, anterior.data, anterior.equipeId),
              item.id,
              { titulo: "Devolução desfeita", descricao: item.ag.trecho.rodovia },
            ),
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
        anelErroPorId={anelErroPorId}
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
