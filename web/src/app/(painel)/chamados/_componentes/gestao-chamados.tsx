"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryState, useQueryStates } from "nuqs";
import { CalendarPlus } from "lucide-react";

import { Botao } from "@/components/ui/botao";
import { useNotificacao } from "@/components/ui/notificacoes";
import {
  aprovarChamado,
  cancelarChamado,
  decidirAdiamento,
  devolverChamado,
  encerrarAdministrativamente,
  informarAlturaInicial,
} from "@/lib/chamados/acoes";
import { criarRocadaManual } from "@/lib/acoes";
import { somarDias } from "@/lib/format";
import { STATUS_CHAMADO, type Cargo, type ChamadoDetalhado, type Equipe, type StatusChamado } from "@/lib/types";

import { chaveDia, type ItemAgenda, type TrechoResumo } from "../../agenda/_componentes/dados";
import { PainelNovaRocada, type EntradaNovaRocada } from "../../agenda/_componentes/painel-nova-rocada";
import {
  BarraFiltros,
  FILTROS_VAZIOS,
  filtrarChamados,
  montarIndiceBusca,
  paramAte,
  paramBusca,
  paramChamado,
  paramDe,
  paramEquipe,
  paramNova,
  paramRodovia,
  paramStatus,
  rodoviasDe,
  temFiltro,
  type FiltrosChamados,
} from "./filtros";
import { FilaDecisao, type BlocoDaFila, type Fila } from "./fila-decisao";
import { ListaChamados } from "./lista-chamados";
import { PainelChamado, type DetalheChamado } from "./painel-chamado";

/** Só o que a tela precisa ler da resposta das Server Actions. */
type Resposta = { ok: true; dados: unknown } | { ok: false; erro: string };

/**
 * O orquestrador de `/chamados`: lê os filtros da URL, aplica-os sobre a lista
 * que o servidor mandou e encaminha cada decisão para a sua Server Action.
 *
 * Não há estado otimista aqui, e é decisão, não esquecimento. As transições do
 * chamado acontecem dentro de funções SQL que fazem mais do que trocar uma
 * coluna — aprovar insere execução e medição e dispara reanálise — e pintar o
 * chip novo antes de o banco confirmar mostraria "Concluído" numa tela onde
 * a execução pode não ter nascido. O `router.refresh()` traz o estado real.
 */
export function GestaoChamados({
  chamados,
  fila,
  equipes,
  trechos,
  itens,
  detalhe,
  hoje,
  agora,
  cargo,
}: {
  chamados: ChamadoDetalhado[];
  fila: Fila;
  equipes: Equipe[];
  trechos: TrechoResumo[];
  itens: ItemAgenda[];
  detalhe: DetalheChamado | null;
  hoje: string;
  agora: string;
  cargo: Cargo;
}) {
  const [filtros, setFiltros] = useQueryStates({
    status: paramStatus,
    equipeId: paramEquipe,
    rodovia: paramRodovia,
    de: paramDe,
    ate: paramAte,
    busca: paramBusca,
  });

  const [chamadoAberto, setChamadoAberto] = useQueryState("chamado", paramChamado);
  const [criandoRocada, setCriandoRocada] = useQueryState("nova", paramNova);

  const { mostrar } = useNotificacao();
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  /* A recusa da criação fica NA GAVETA, além do toast: a gaveta continua
     aberta com o formulário preenchido, e mandar a pessoa ler o motivo num
     canto oposto da tela enquanto o formulário está na frente dela é jogar a
     mensagem no lugar errado. Mesma decisão da agenda. */
  const [erroNova, setErroNova] = useState<string | null>(null);

  const indice = useMemo(() => montarIndiceBusca(chamados), [chamados]);
  const rodovias = useMemo(() => rodoviasDe(chamados), [chamados]);

  const contagemStatus = useMemo(() => {
    const contagem = Object.fromEntries(STATUS_CHAMADO.map((s) => [s, 0])) as Record<StatusChamado, number>;
    for (const c of chamados) contagem[c.status] += 1;
    return contagem;
  }, [chamados]);

  const nomePorEquipe = useMemo(() => new Map(equipes.map((e) => [e.id, e.nome])), [equipes]);
  const nomeDaEquipe = useCallback(
    (id: number) => nomePorEquipe.get(id) ?? `equipe ${id}`,
    [nomePorEquipe],
  );

  const visiveis = useMemo(() => filtrarChamados(chamados, filtros, indice), [chamados, filtros, indice]);

  /**
   * O caminho único de toda decisão: transição, toast e recarga do servidor.
   *
   * A recusa que a action DEVOLVE (`ok: false`) e a que ela LANÇA terminam do
   * mesmo jeito. Uma Server Action lança quando a requisição nem completa —
   * rede caindo, deploy no meio — e sem o `catch` o botão ficaria girando para
   * sempre, sem toast e sem explicação.
   */
  const executar = useCallback(
    (acao: () => Promise<Resposta>, titulo: string, descricao?: (dados: unknown) => string | undefined) => {
      iniciar(async () => {
        try {
          const resultado = await acao();
          if (resultado.ok) {
            mostrar({ tom: "good", titulo, descricao: descricao?.(resultado.dados) });
            router.refresh();
          } else {
            mostrar({ tom: "critical", titulo: "A decisão não foi registrada", descricao: resultado.erro, duracao: 0 });
          }
        } catch {
          mostrar({
            tom: "critical",
            titulo: "A decisão não foi registrada",
            descricao: "A conexão com o servidor falhou. Confira a rede e tente de novo.",
            duracao: 0,
          });
        }
      });
    },
    [mostrar, router],
  );

  function verTodos(bloco: BlocoDaFila) {
    if (bloco === "aguardando") {
      void setFiltros({ ...FILTROS_VAZIOS, status: ["aguardando_aprovacao"] });
      return;
    }
    if (bloco === "adiamentos") {
      void setFiltros({ ...FILTROS_VAZIOS, status: ["adiamento_solicitado"] });
      return;
    }
    /* Atrasado não é status, é `aberto` com a data já vencida: sem o recorte de
       data, "ver todos" mandaria para uma lista com os abertos em dia junto,
       e a contagem do bloco não bateria com o que a lista mostra. O teto é
       ONTEM porque o filtro de data é inclusivo e hoje ainda não atrasou. */
    void setFiltros({
      ...FILTROS_VAZIOS,
      status: ["aberto"],
      ate: chaveDia(somarDias(hoje, -1)),
    });
  }

  function criar(entrada: EntradaNovaRocada) {
    setErroNova(null);
    iniciar(async () => {
      try {
        const resultado = await criarRocadaManual(entrada);
        if (resultado.ok) {
          void setCriandoRocada(null);
          mostrar({
            tom: "good",
            titulo: "Roçada criada",
            descricao: "O chamado nasce junto e já aparece na lista.",
          });
          router.refresh();
        } else {
          setErroNova(resultado.erro);
          mostrar({ tom: "critical", titulo: "A roçada não foi criada", descricao: resultado.erro, duracao: 0 });
        }
      } catch {
        const erro = "A conexão com o servidor falhou. Confira a rede e tente de novo.";
        setErroNova(erro);
        mostrar({ tom: "critical", titulo: "A roçada não foi criada", descricao: erro, duracao: 0 });
      }
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <FilaDecisao
        fila={fila}
        hoje={hoje}
        agora={agora}
        chamadoAberto={chamadoAberto}
        aoAbrir={(id) => void setChamadoAberto(id)}
        aoVerTodos={verTodos}
      />

      <BarraFiltros
        filtros={filtros}
        aoMudar={(parcial) => void setFiltros(parcial)}
        aoLimpar={() => void setFiltros(FILTROS_VAZIOS)}
        equipes={equipes}
        rodovias={rodovias}
        contagemStatus={contagemStatus}
        visiveis={visiveis.length}
        total={chamados.length}
        acao={
          <Botao variante="primario" iconeEsquerda={<CalendarPlus />} onClick={() => void setCriandoRocada(true)}>
            Novo chamado
          </Botao>
        }
      />

      <ListaChamados
        chamados={visiveis}
        hoje={hoje}
        agora={agora}
        chamadoAberto={chamadoAberto}
        filtrada={temFiltro(filtros as FiltrosChamados)}
        aoAbrir={(id) => void setChamadoAberto(id)}
        aoLimpar={() => void setFiltros(FILTROS_VAZIOS)}
      />

      <PainelChamado
        detalhe={detalhe}
        aberto={chamadoAberto != null}
        aoFechar={() => void setChamadoAberto(null)}
        cargo={cargo}
        hoje={hoje}
        agora={agora}
        pendente={pendente}
        nomeDaEquipe={nomeDaEquipe}
        aoAprovar={(e) =>
          detalhe &&
          executar(
            () => aprovarChamado({ chamadoId: detalhe.id, ...e }),
            "Roçada aprovada",
            (dados) => (dados as { reanalise: string | null }).reanalise ?? undefined,
          )
        }
        aoDevolver={(e) =>
          detalhe && executar(() => devolverChamado({ chamadoId: detalhe.id, ...e }), "Devolvido para a equipe")
        }
        aoDecidirAdiamento={(e) =>
          detalhe?.adiamento_pendente &&
          executar(
            () => decidirAdiamento({ adiamentoId: detalhe.adiamento_pendente!.id, ...e }),
            e.aceito ? "Adiamento aceito" : "Adiamento recusado",
          )
        }
        aoEncerrar={(e) =>
          detalhe &&
          executar(
            () => encerrarAdministrativamente({ chamadoId: detalhe.id, ...e }),
            "Chamado encerrado",
            () => "Registrado como concluído sem evidência de campo.",
          )
        }
        aoCancelar={(e) =>
          detalhe && executar(() => cancelarChamado({ chamadoId: detalhe.id, ...e }), "Chamado cancelado")
        }
        aoInformarAltura={(alturaCm) =>
          detalhe && executar(() => informarAlturaInicial({ chamadoId: detalhe.id, alturaCm }), "Altura registrada")
        }
      />

      {/* O botão "Novo chamado" abre a MESMA gaveta da agenda. Um chamado nasce
          do gatilho quando o agendamento vira `aprovado` com equipe: criar
          chamado É criar roçada, e uma segunda gaveta seria uma segunda cópia
          da regra de "um agendamento aberto por trecho" para manter igual. */}
      <PainelNovaRocada
        aberta={criandoRocada}
        aoFechar={() => {
          void setCriandoRocada(null);
          setErroNova(null);
        }}
        trechos={trechos}
        equipes={equipes}
        itens={itens}
        hoje={hoje}
        pendente={pendente}
        erroServidor={erroNova}
        aoCriar={criar}
      />
    </div>
  );
}
