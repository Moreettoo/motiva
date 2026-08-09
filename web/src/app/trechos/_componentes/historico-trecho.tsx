import { CalendarClock, Scissors, Sparkles } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo, CartaoRodape } from "@/components/ui/cartao";
import { ChipRisco, ChipStatus } from "@/components/ui/chip";
import {
  Tabela,
  TabelaCabecalho,
  TabelaCelula,
  TabelaCorpo,
  TabelaLinha,
  TabelaTitulo,
} from "@/components/ui/tabela";
import { EstadoVazio } from "@/components/ui/vazio";
import { fmt } from "@/lib/format";
import type { AgendamentoDetalhado, Equipe, Execucao } from "@/lib/types";
import { sum } from "@/lib/utils";

export function HistoricoTrecho({
  execucoes,
  anteriores,
  equipes,
}: {
  execucoes: Execucao[];
  /** Agendamentos que não são o mais recente — o atual já está no bloco da decisão. */
  anteriores: AgendamentoDetalhado[];
  equipes: Equipe[];
}) {
  const nomePorEquipe = new Map(equipes.map((e) => [e.id, e.nome]));

  const kmTotal = sum(execucoes.map((e) => Number(e.km_rocados) || 0));
  const custoTotal = sum(execucoes.map((e) => Number(e.custo_reais) || 0));

  return (
    <Cartao>
      <CartaoCabecalho
        como="h2"
        icone={<Scissors />}
        titulo="Histórico do trecho"
        descricao="Roçadas executadas e as decisões anteriores da IA."
      />

      <CartaoCorpo className="space-y-6">
        {execucoes.length === 0 ? (
          <EstadoVazio
            icone={<Scissors />}
            titulo="Nenhuma roçada registrada"
            descricao="Quando a equipe fechar uma execução neste trecho, ela aparece aqui com altura antes e depois."
          />
        ) : (
          <Tabela rotulo="Roçadas executadas neste trecho" className="max-h-96">
            <TabelaCabecalho>
              <tr>
                <TabelaTitulo>Data</TabelaTitulo>
                <TabelaTitulo>Equipe</TabelaTitulo>
                <TabelaTitulo numerica>Km roçados</TabelaTitulo>
                <TabelaTitulo numerica>Antes (cm)</TabelaTitulo>
                <TabelaTitulo numerica>Depois (cm)</TabelaTitulo>
                <TabelaTitulo numerica>Custo</TabelaTitulo>
              </tr>
            </TabelaCabecalho>

            <TabelaCorpo>
              {execucoes.map((execucao) => (
                <TabelaLinha key={execucao.id}>
                  <TabelaCelula className="tnum font-mono whitespace-nowrap">
                    {fmt.dataMedia(execucao.data_execucao)}
                  </TabelaCelula>
                  <TabelaCelula className="max-w-56">
                    <span className="block truncate">
                      {execucao.equipe_id == null
                        ? "—"
                        : (nomePorEquipe.get(execucao.equipe_id) ?? `Equipe ${execucao.equipe_id}`)}
                    </span>
                  </TabelaCelula>
                  <TabelaCelula numerica className="font-mono">
                    {fmt.d1(Number(execucao.km_rocados))}
                  </TabelaCelula>
                  <TabelaCelula numerica className="font-mono">
                    {execucao.altura_antes_cm == null ? "—" : fmt.d1(Number(execucao.altura_antes_cm))}
                  </TabelaCelula>
                  <TabelaCelula numerica className="font-mono">
                    {execucao.altura_depois_cm == null ? "—" : fmt.d1(Number(execucao.altura_depois_cm))}
                  </TabelaCelula>
                  <TabelaCelula numerica className="font-mono">
                    {execucao.custo_reais == null ? "—" : fmt.brl(Number(execucao.custo_reais))}
                  </TabelaCelula>
                </TabelaLinha>
              ))}
            </TabelaCorpo>
          </Tabela>
        )}

        <section aria-labelledby="titulo-agendamentos-anteriores">
          <h3
            id="titulo-agendamentos-anteriores"
            className="flex items-center gap-1.5 text-2xs font-medium tracking-widest text-ink-3 uppercase"
          >
            <Sparkles aria-hidden="true" className="size-3 shrink-0" />
            Decisões anteriores da IA
          </h3>

          {anteriores.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">
              Nenhuma decisão anterior — esta é a primeira análise deste trecho.
            </p>
          ) : (
            <ol className="mt-3 space-y-3 border-l border-border pl-4">
              {anteriores.map((agendamento) => (
                <li key={agendamento.id} className="relative min-w-0">
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 -left-[21px] size-2 rounded-full border-2 border-surface bg-border-strong"
                  />

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="tnum inline-flex items-center gap-1.5 font-mono text-sm text-ink">
                      <CalendarClock aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
                      {fmt.dataMedia(agendamento.data_sugerida)}
                    </span>
                    <ChipStatus status={agendamento.status} />
                    <ChipRisco risco={agendamento.prioridade} tamanho="sm" />
                    <span className="tnum text-2xs text-ink-3">
                      decidido em {fmt.dataMedia(agendamento.criado_em)}
                    </span>
                  </div>

                  <p className="mt-1 line-clamp-2 text-xs break-words text-ink-2">
                    {agendamento.justificativa}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </CartaoCorpo>

      {execucoes.length ? (
        <CartaoRodape>
          <span>
            <span className="tnum font-mono text-ink-2">{fmt.n(execucoes.length)}</span> roçadas
          </span>
          <span>
            <span className="tnum font-mono text-ink-2">{fmt.km(kmTotal)}</span> roçados
          </span>
          <span>
            <span className="tnum font-mono text-ink-2">{fmt.brl(custoTotal)}</span> de custo
          </span>
        </CartaoRodape>
      ) : null}
    </Cartao>
  );
}
