"use client";

import { useState, useTransition } from "react";
import { Check, CircleSlash, Sparkles } from "lucide-react";

import { Botao } from "@/components/ui/botao";
import { useNotificacao } from "@/components/ui/notificacoes";
import { analisarTrecho, mudarStatusAgendamento } from "@/lib/acoes";
import type { StatusAgendamento } from "@/lib/types";

type Acao = "analisar" | "aprovar" | "descartar";

/**
 * Ações do cabeçalho.
 *
 * A análise passa pelo backend Python (modelo .pkl + decisão da LLM) e pode
 * levar dezenas de segundos; por isso só o botão acionado entra em carregamento,
 * e os outros ficam desabilitados em vez de todos girarem juntos.
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

  function analisar() {
    setEmCurso("analisar");
    iniciar(async () => {
      const resultado = await analisarTrecho(trechoId);
      setEmCurso(null);

      if (resultado.ok) {
        mostrar({
          tom: "good",
          titulo: "Análise concluída",
          descricao: "A previsão e a decisão da IA foram atualizadas para este trecho.",
        });
      } else {
        mostrar({ tom: "critical", titulo: "A análise não rodou", descricao: resultado.erro, duracao: 0 });
      }
    });
  }

  function decidir(acao: Exclude<Acao, "analisar">, status: StatusAgendamento) {
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

  return (
    <>
      <Botao
        variante="secundario"
        iconeEsquerda={<Sparkles />}
        carregando={pendente && emCurso === "analisar"}
        disabled={pendente && emCurso !== "analisar"}
        onClick={analisar}
      >
        Analisar trecho
      </Botao>

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
