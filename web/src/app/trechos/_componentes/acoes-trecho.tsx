"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowUpRight, Check, CircleSlash, Sparkles } from "lucide-react";

import { Botao } from "@/components/ui/botao";
import { useNotificacao } from "@/components/ui/notificacoes";
import { consultarAnalise, enfileirarAnaliseDoTrecho, mudarStatusAgendamento } from "@/lib/acoes";
import type { ExecucaoAnalise, StatusAgendamento } from "@/lib/types";
import { cn } from "@/lib/utils";

type Acao = "aprovar" | "descartar";

/** O runner do GitHub sobe, instala as dependencias e roda: ~40 s no caso de um
 *  trecho so. Consultar mais rapido que isso e so gastar chamada de API. */
const INTERVALO_MS = 5_000;

const ROTULO_SITUACAO: Record<string, string> = {
  queued: "Na fila do GitHub Actions…",
  in_progress: "Analisando o trecho…",
  completed: "Análise concluída.",
};

/**
 * Ações do cabeçalho do trecho.
 *
 * A reanálise não é mais síncrona: ela roda no GitHub Actions, porque o modelo
 * exige scikit-learn e não cabe numa função serverless. Aqui a gente enfileira,
 * acompanha por consulta periódica e revalida a tela quando termina — por isso
 * o botão nunca fica preso a uma transição de minutos.
 */
export function AcoesTrecho({
  trechoId,
  agendamentoId,
  statusAgendamento,
}: {
  trechoId: number;
  agendamentoId: number | null;
  statusAgendamento: StatusAgendamento | null;
}) {
  const { mostrar } = useNotificacao();
  const [pendente, iniciar] = useTransition();
  const [emCurso, setEmCurso] = useState<Acao | null>(null);

  const [enfileirando, setEnfileirando] = useState(false);
  const [execucao, setExecucao] = useState<ExecucaoAnalise | null>(null);
  const avisado = useRef(false);

  const emVoo = execucao != null && execucao.situacao !== "completed";

  // Consulta periódica enquanto a execução vive. O intervalo é recriado a cada
  // mudança de situação, então some sozinho quando ela termina.
  useEffect(() => {
    if (!emVoo || execucao == null) return;

    let ativo = true;
    const id = setInterval(async () => {
      const resultado = await consultarAnalise(execucao.id);
      if (!ativo) return;

      if (!resultado.ok) {
        setExecucao(null);
        mostrar({ tom: "critical", titulo: "Perdi o acompanhamento", descricao: resultado.erro, duracao: 0 });
        return;
      }
      setExecucao(resultado.dados);
    }, INTERVALO_MS);

    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, [emVoo, execucao, mostrar]);

  // Avisa uma vez só, no quadro em que a execução fecha.
  useEffect(() => {
    if (execucao == null || execucao.situacao !== "completed" || avisado.current) return;
    avisado.current = true;

    const deuCerto = execucao.desfecho === "success";
    mostrar({
      tom: deuCerto ? "good" : "critical",
      titulo: deuCerto ? "Trecho reanalisado" : "A reanálise falhou",
      descricao: deuCerto
        ? "A previsão e a decisão da IA foram atualizadas."
        : `A execução terminou como “${execucao.desfecho ?? "sem desfecho"}”. Veja o log no GitHub.`,
      duracao: deuCerto ? undefined : 0,
    });
  }, [execucao, mostrar]);

  const analisar = useCallback(() => {
    if (enfileirando || emVoo) return;

    setEnfileirando(true);
    avisado.current = false;

    void enfileirarAnaliseDoTrecho(trechoId).then((resultado) => {
      setEnfileirando(false);

      if (!resultado.ok) {
        mostrar({ tom: "critical", titulo: "Não consegui enfileirar", descricao: resultado.erro, duracao: 0 });
        return;
      }
      setExecucao(resultado.dados);
    });
  }, [enfileirando, emVoo, trechoId, mostrar]);

  function decidir(acao: Acao, status: StatusAgendamento) {
    if (agendamentoId == null) return;

    setEmCurso(acao);
    iniciar(async () => {
      const resultado = await mudarStatusAgendamento(agendamentoId, status);
      setEmCurso(null);

      if (resultado.ok) {
        mostrar({
          tom: "good",
          titulo: status === "aprovado" ? "Roçada aprovada" : "Sugestão descartada",
          descricao:
            status === "aprovado"
              ? "O agendamento entrou na fila da operação."
              : "O trecho volta para a fila sem data marcada.",
        });
      } else {
        mostrar({ tom: "critical", titulo: "Não foi possível salvar", descricao: resultado.erro, duracao: 0 });
      }
    });
  }

  const decidivel = agendamentoId != null && statusAgendamento === "sugerido";
  const ocupado = enfileirando || emVoo;
  const situacao = enfileirando
    ? "Enfileirando…"
    : execucao
      ? (ROTULO_SITUACAO[execucao.situacao] ?? execucao.situacao)
      : "";

  return (
    <>
      <div className="flex flex-col items-start gap-1.5">
        <Botao
          variante="secundario"
          iconeEsquerda={<Sparkles />}
          // `aria-disabled` em vez de `disabled`: o botão desabilitado perderia
          // o foco no clique, e a espera é de dezenas de segundos.
          aria-disabled={ocupado || undefined}
          aria-busy={ocupado || undefined}
          onClick={analisar}
          className={cn(ocupado && "sweep overflow-hidden opacity-70 aria-disabled:cursor-progress")}
        >
          {ocupado ? "Reanalisando…" : "Reanalisar trecho"}
        </Botao>

        {situacao ? (
          <p className="flex items-center gap-1.5 text-2xs text-ink-3">
            <span>{situacao}</span>
            {execucao ? (
              <a
                href={execucao.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 rounded-sm text-accent hover:underline"
              >
                ver execução
                <ArrowUpRight aria-hidden="true" className="size-3 shrink-0" />
              </a>
            ) : null}
          </p>
        ) : null}
      </div>

      <p aria-live="polite" className="sr-only">
        {situacao}
      </p>

      {decidivel ? (
        <>
          <Botao
            variante="perigo"
            iconeEsquerda={<CircleSlash />}
            carregando={pendente && emCurso === "descartar"}
            disabled={pendente && emCurso !== "descartar"}
            onClick={() => decidir("descartar", "descartado")}
          >
            Descartar sugestão
          </Botao>

          <Botao
            variante="primario"
            iconeEsquerda={<Check />}
            carregando={pendente && emCurso === "aprovar"}
            disabled={pendente && emCurso !== "aprovar"}
            onClick={() => decidir("aprovar", "aprovado")}
          >
            Aprovar roçada
          </Botao>
        </>
      ) : null}
    </>
  );
}
