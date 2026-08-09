"use client";

import { useState, useTransition } from "react";
import { Radar } from "lucide-react";

import { Botao } from "@/components/ui/botao";
import { useNotificacao } from "@/components/ui/notificacoes";
import { analisarMalhaInteira } from "@/lib/acoes";

/** `/analisar-todos` devolve `{ total, resultados, erros }`. Só o que é usado aqui. */
type RespostaAnalise = { total?: unknown; erros?: unknown };

function contarTrechos(n: number): string {
  return n === 1 ? "1 trecho" : `${n} trechos`;
}

/**
 * Dispara a reanálise da malha inteira.
 *
 * É a operação mais cara do produto: o backend chama o modelo e depois a OpenAI
 * para cada trecho, e leva minutos. Por isso o botão fica preso ao estado da
 * transição — a Server Action só resolve quando o FastAPI responde — e o retorno
 * vai para a notificação, que já é uma região `aria-live`.
 */
export function BotaoAnalisarMalha({ trechos }: { trechos: number }) {
  const [analisando, iniciar] = useTransition();
  const [situacao, setSituacao] = useState("");
  const { mostrar } = useNotificacao();

  function analisar() {
    // `aria-disabled` em vez de `disabled`: o botão desabilitado perderia o foco
    // no clique, e a operação leva minutos — o teclado ficaria sem âncora.
    if (analisando) return;

    setSituacao(`Analisando ${contarTrechos(trechos)}…`);

    iniciar(async () => {
      const resultado = await analisarMalhaInteira();

      if (!resultado.ok) {
        setSituacao("A análise não terminou.");
        mostrar({
          tom: "critical",
          titulo: "A análise não terminou",
          descricao: resultado.erro,
          // Erro de infraestrutura fica na tela: some antes de ser lido é pior
          // do que não aparecer.
          duracao: 0,
        });
        return;
      }

      const dados = (resultado.dados ?? {}) as RespostaAnalise;
      const total = typeof dados.total === "number" ? dados.total : trechos;
      const falhas = Array.isArray(dados.erros) ? dados.erros.length : 0;

      setSituacao("Análise concluída.");
      mostrar({
        tom: falhas > 0 ? "info" : "good",
        titulo: `${contarTrechos(total)} reanalisados`,
        descricao:
          falhas > 0
            ? `${contarTrechos(falhas)} não puderam ser lidos e ficaram com a previsão anterior.`
            : "Previsões e sugestões de roçada atualizadas.",
      });
    });
  }

  return (
    <>
      <Botao
        variante="primario"
        onClick={analisar}
        aria-disabled={analisando || undefined}
        aria-busy={analisando || undefined}
        iconeEsquerda={<Radar />}
        className={
          analisando
            ? "sweep overflow-hidden opacity-70 aria-disabled:cursor-progress"
            : undefined
        }
      >
        {analisando ? "Analisando…" : "Analisar Malha"}
      </Botao>

      <p aria-live="polite" className="sr-only">
        {situacao}
      </p>
    </>
  );
}
