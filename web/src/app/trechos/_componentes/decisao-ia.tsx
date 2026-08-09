import { Bot, CalendarClock, Cpu, Quote, Sparkles, Users } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo, CartaoRodape } from "@/components/ui/cartao";
import { Chip, ChipRisco, ChipStatus } from "@/components/ui/chip";
import { EstadoVazio } from "@/components/ui/vazio";
import { fmt, parseData, relativoEmDias } from "@/lib/format";
import type { AgendamentoDetalhado, TrechoStatus } from "@/lib/types";

/**
 * O bloco que explica a decisão.
 *
 * A divisão de trabalho entre as duas IAs é o diferencial do produto, então ela
 * aparece escrita: o número de crescimento é do modelo estatístico, a data e a
 * prioridade são do modelo de linguagem lendo as observações do trecho.
 */
export function DecisaoIa({
  agendamento,
  trecho,
  hojeIso,
}: {
  agendamento: AgendamentoDetalhado | null;
  trecho: TrechoStatus;
  hojeIso: string;
}) {
  const crescimento = trecho.crescimento_cm_dia == null ? null : Number(trecho.crescimento_cm_dia);
  const observacoes = trecho.observacoes?.trim() || null;

  if (!agendamento) {
    return (
      <Cartao>
        <CartaoCabecalho
          como="h2"
          icone={<Sparkles />}
          titulo="A decisão da IA"
          descricao="Data sugerida, prioridade e a justificativa escrita para o gestor."
        />
        <CartaoCorpo>
          <EstadoVazio
            icone={<Bot />}
            titulo="Nenhuma decisão para este trecho"
            descricao={
              "A análise em lote só chama o modelo de linguagem para trechos a menos de 45 dias do limite. " +
              "Use “Analisar Trecho” no topo da página para forçar uma decisão agora."
            }
          />
        </CartaoCorpo>
      </Cartao>
    );
  }

  const fatores = (agendamento.fatores ?? []).filter((f) => f.trim().length > 0);

  return (
    <Cartao>
      <CartaoCabecalho
        como="h2"
        icone={<Sparkles />}
        titulo="A decisão da IA"
        descricao="Data sugerida, prioridade e a justificativa escrita para o gestor."
        acoes={<ChipStatus status={agendamento.status} />}
      />

      <CartaoCorpo className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,17rem)_1fr] lg:gap-8">
        <div className="min-w-0">
          {/* Filete de acento: o único limão grande da tela marca o número vivo. */}
          <span aria-hidden="true" className="block h-0.5 w-10 rounded-sm bg-accent-line" />

          <p className="mt-3 text-2xs font-medium tracking-widest text-ink-3 uppercase">
            Data sugerida
          </p>
          <p className="tnum mt-1.5 font-mono text-2xl leading-none font-semibold text-ink">
            {fmt.dataMedia(agendamento.data_sugerida)}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
            <CalendarClock aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
            <span className="truncate">{fmt.dataLonga(agendamento.data_sugerida)}</span>
            <span className="text-ink-3">
              · {relativoEmDias(agendamento.data_sugerida, parseData(hojeIso))}
            </span>
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-3">Prioridade</span>
            <ChipRisco risco={agendamento.prioridade} />
          </div>

          {agendamento.equipe ? (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-2">
              <Users aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
              <span className="min-w-0 truncate">
                {agendamento.equipe.nome} · {agendamento.equipe.base_uf}
              </span>
            </p>
          ) : (
            <p className="mt-3 text-xs text-ink-3">Nenhuma equipe atribuída ainda.</p>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          <div>
            <h3 className="text-2xs font-medium tracking-widest text-ink-3 uppercase">
              Justificativa
            </h3>
            <p className="mt-2 max-w-prose text-base leading-relaxed break-words text-ink">
              {agendamento.justificativa}
            </p>
          </div>

          {fatores.length ? (
            <div>
              <h3 className="text-2xs font-medium tracking-widest text-ink-3 uppercase">
                Fatores considerados
              </h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {fatores.map((fator) => (
                  <li key={fator} className="min-w-0">
                    <Chip tom="neutro">{fator}</Chip>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-md border border-border bg-surface-3 p-3">
            <h3 className="flex items-center gap-1.5 text-xs font-medium text-ink">
              <Cpu aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
              Quem decidiu o quê
            </h3>
            <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-ink-2">
              O ritmo de crescimento{" "}
              {crescimento == null ? (
                "usado nesta conta"
              ) : (
                <span className="tnum font-mono text-ink">{fmt.cmDia(crescimento)}</span>
              )}{" "}
              veio do modelo de regressão treinado no histórico do trecho — clima, espécie, UF e mês.
              A data e a prioridade vieram do modelo de linguagem, que recebeu esse número pronto e
              leu as observações do trecho. O modelo de linguagem não recalcula o crescimento.
            </p>
          </div>

          {observacoes ? (
            <figure className="min-w-0">
              <h3 className="flex items-center gap-1.5 text-2xs font-medium tracking-widest text-ink-3 uppercase">
                <Quote aria-hidden="true" className="size-3 shrink-0" />
                Observações do trecho
              </h3>
              <blockquote className="mt-2 border-l-2 border-border-strong pl-3 text-sm leading-relaxed break-words text-ink-2 italic">
                “{observacoes}”
              </blockquote>
              <figcaption className="mt-1.5 text-2xs text-ink-3">
                Texto livre cadastrado pela operação — é exatamente o que o modelo de linguagem leu.
              </figcaption>
            </figure>
          ) : (
            <p className="text-xs text-ink-3">
              Este trecho não tem observações cadastradas, então a decisão saiu só dos números.
            </p>
          )}
        </div>
      </CartaoCorpo>

      <CartaoRodape>
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Bot aria-hidden="true" className="size-3.5 shrink-0" />
          Decidido por{" "}
          <span className="truncate font-mono text-ink-2">
            {agendamento.modelo_usado ?? "modelo não registrado"}
          </span>
        </span>
        <span className="tnum">em {fmt.dataMedia(agendamento.criado_em)}</span>
        {agendamento.atualizado_em && agendamento.atualizado_em !== agendamento.criado_em ? (
          <span className="tnum">atualizado em {fmt.dataMedia(agendamento.atualizado_em)}</span>
        ) : null}
      </CartaoRodape>
    </Cartao>
  );
}
