"use client";

import { useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { Check, ChevronDown, CircleCheck, OctagonAlert, Users, X } from "lucide-react";

import { Botao } from "@/components/ui/botao";
import { Campo, Entrada, Selecao } from "@/components/ui/campo";
import { Chip, ChipRisco } from "@/components/ui/chip";
import { useNotificacao } from "@/components/ui/notificacoes";
import { EstadoVazio } from "@/components/ui/vazio";
import { aprovarAgendamento, mudarStatusAgendamento, type Resultado } from "@/lib/acoes";
import { fmt, relativoEmDias } from "@/lib/format";
import type { Equipe, Risco } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ItemDecisao = {
  /** Id do agendamento: é ele que muda de status, não o trecho. */
  id: number;
  trechoId: number;
  rodovia: string;
  uf: string;
  kmInicio: number;
  kmFim: number;
  sentido: string | null;
  /** Prioridade decidida pela LLM. Usa a mesma escala visual do risco. */
  prioridade: Risco;
  diasAteLimite: number | null;
  dataSugerida: string;
  justificativa: string;
  fatores: string[];
  crescimentoCmDia: number | null;
  alturaAtualCm: number | null;
  alturaLimiteCm: number;
  equipe: string | null;
  equipeId: number | null;
};

type Decisao = "aprovado" | "descartado";

function Prazo({ dias }: { dias: number | null }) {
  const semPrevisao = dias == null;
  const vencido = !semPrevisao && dias <= 0;
  const magnitude = semPrevisao ? 0 : Math.abs(dias);

  return (
    <div className="min-w-0">
      <span className="block text-2xs tracking-widest text-ink-3 uppercase">Prazo</span>

      <span
        className={cn(
          "tnum mt-1.5 block font-mono text-2xl leading-none font-semibold",
          vencido ? "text-critical-ink" : "text-ink",
        )}
      >
        {semPrevisao ? "—" : fmt.n(magnitude)}
      </span>

      <span className="mt-1.5 flex items-center gap-1 text-2xs text-ink-3">
        {vencido ? <OctagonAlert aria-hidden="true" className="size-3 shrink-0" /> : null}
        {semPrevisao
          ? "sem previsão"
          : vencido
            ? magnitude === 1
              ? "dia acima do limite"
              : "dias acima do limite"
            : dias === 1
              ? "dia até o limite"
              : "dias até o limite"}
      </span>
    </div>
  );
}

/**
 * Ajuste inline de data e equipe, aberto ao clicar em "Aprovar Roçada".
 *
 * A sugestão da IA vira só o ponto de partida (a data já chega preenchida):
 * o gestor pode confirmar como está, trocar a data, ou já escolher a equipe
 * aqui em vez de precisar abrir a agenda depois.
 */
function PainelAprovar({
  equipes,
  data,
  equipeId,
  carregando,
  aoMudarData,
  aoMudarEquipe,
  aoConfirmar,
  aoCancelar,
}: {
  equipes: Equipe[];
  data: string;
  equipeId: number | null;
  carregando: boolean;
  aoMudarData: (data: string) => void;
  aoMudarEquipe: (equipeId: number | null) => void;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  return (
    <form
      className="flex w-full flex-col gap-3"
      onSubmit={(evento) => {
        evento.preventDefault();
        aoConfirmar();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Data da roçada">
          <Entrada
            type="date"
            value={data}
            required
            disabled={carregando}
            onChange={(evento) => aoMudarData(evento.target.value)}
          />
        </Campo>

        <Campo rotulo="Equipe" obrigatorio>
          <Selecao
            value={equipeId == null ? "" : String(equipeId)}
            required
            disabled={carregando}
            onChange={(evento) => {
              const valor = evento.target.value;
              aoMudarEquipe(valor ? Number(valor) : null);
            }}
          >
            <option value="" disabled>
              Selecione uma equipe
            </option>
            {equipes
              .filter((e) => e.ativo)
              .map((e) => (
                <option key={e.id} value={String(e.id)}>
                  {e.nome} · {fmt.d1(Number(e.capacidade_km_dia))} km/dia
                </option>
              ))}
          </Selecao>
        </Campo>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Botao
          type="submit"
          tamanho="sm"
          variante="primario"
          carregando={carregando}
          disabled={!data || equipeId == null}
        >
          Confirmar aprovação
        </Botao>
        <Botao type="button" tamanho="sm" variante="fantasma" disabled={carregando} onClick={aoCancelar}>
          Cancelar
        </Botao>
      </div>
    </form>
  );
}

/**
 * A fila de decisão do gestor: o que a IA sugeriu e ainda ninguém confirmou.
 *
 * A lista some do jeito otimista assim que a decisão sai, porque a Server Action
 * revalida a rota e a linha não voltaria de qualquer jeito. Se a escrita falhar,
 * o item volta para a fila e a notificação diz o motivo, o gestor não pode
 * achar que aprovou algo que o banco recusou.
 */
export function ExigemDecisao({ itens, equipes }: { itens: ItemDecisao[]; equipes: Equipe[] }) {
  const { mostrar } = useNotificacao();
  const [, iniciar] = useTransition();
  const [decididos, setDecididos] = useState<Record<number, Decisao>>({});
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [expandido, setExpandido] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const [aprovando, setAprovando] = useState<number | null>(null);
  const [dataRascunho, setDataRascunho] = useState("");
  const [equipeRascunho, setEquipeRascunho] = useState<number | null>(null);
  const [situacao, setSituacao] = useState("");

  const visiveis = itens.filter((item) => decididos[item.id] == null);

  /** Aplica o resultado de uma decisão: otimista na tela, desfaz e avisa se o servidor recusar. */
  function concluir(
    item: ItemDecisao,
    decisao: Decisao,
    executar: () => Promise<Resultado<unknown>>,
    sucesso: { titulo: string; descricao: string },
  ) {
    setConfirmando(null);
    setAprovando(null);
    setOcupado(item.id);
    setDecididos((atual) => ({ ...atual, [item.id]: decisao }));

    iniciar(async () => {
      const resultado = await executar();
      setOcupado(null);

      if (!resultado.ok) {
        setDecididos((atual) => {
          const copia = { ...atual };
          delete copia[item.id];
          return copia;
        });
        setSituacao("A decisão não foi gravada.");
        mostrar({
          tom: "critical",
          titulo: "A decisão não foi gravada",
          descricao: resultado.erro,
          duracao: 0,
        });
        return;
      }

      setSituacao(`${sucesso.titulo}: ${sucesso.descricao}`);
      mostrar({ tom: decisao === "aprovado" ? "good" : "info", ...sucesso });
    });
  }

  function descartar(item: ItemDecisao) {
    const faixa = `${item.rodovia} · ${fmt.faixaKm(item.kmInicio, item.kmFim)}`;
    concluir(item, "descartado", () => mudarStatusAgendamento(item.id, "descartado"), {
      titulo: "Sugestão descartada",
      descricao: `${faixa} sai da fila. A próxima análise pode sugerir de novo.`,
    });
  }

  /** Abre o ajuste inline: a sugestão da IA vira só o ponto de partida, não a decisão final. */
  function abrirAprovacao(item: ItemDecisao) {
    setConfirmando(null);
    setAprovando(item.id);
    setDataRascunho(item.dataSugerida);
    setEquipeRascunho(item.equipeId);
  }

  function confirmarAprovacao(item: ItemDecisao) {
    const faixa = `${item.rodovia} · ${fmt.faixaKm(item.kmInicio, item.kmFim)}`;
    const equipe = equipeRascunho != null ? equipes.find((e) => e.id === equipeRascunho) : null;
    concluir(
      item,
      "aprovado",
      () => aprovarAgendamento(item.id, { data: dataRascunho, equipeId: equipeRascunho }),
      {
        titulo: "Roçada aprovada",
        descricao: `${faixa} entrou na agenda para ${fmt.dataMedia(dataRascunho)}${equipe ? ` com ${equipe.nome}` : ""}.`,
      },
    );
  }

  if (visiveis.length === 0) {
    return (
      <>
        <EstadoVazio
          icone={<CircleCheck />}
          titulo="Nenhuma decisão pendente"
          descricao="Todas as sugestões urgentes da IA já foram aprovadas ou descartadas. A próxima leva chega na análise seguinte da malha."
          className="m-5 mt-0"
        />
        <p aria-live="polite" className="sr-only">
          {situacao}
        </p>
      </>
    );
  }

  return (
    <>
      <ul className="border-t border-border">
        {visiveis.map((item, i) => {
          const aberto = expandido === item.id;
          const confirma = confirmando === item.id;
          const aprova = aprovando === item.id;
          const rotuloTrecho = `${item.rodovia}, ${fmt.faixaKm(item.kmInicio, item.kmFim)}`;

          return (
            <li
              key={item.id}
              className="rise group relative border-b border-border last:border-b-0"
              style={{ "--i": i } as CSSProperties}
            >
              {/* Filete de acento: marca a linha viva, e é o único limão grande daqui. */}
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-0.5 origin-top scale-y-0 bg-accent-line transition-transform duration-200 ease-[var(--ease-out-quint)] group-hover:scale-y-100 group-focus-within:scale-y-100"
              />

              <div className="grid grid-cols-1 gap-x-6 gap-y-5 p-6 pl-7 sm:grid-cols-[5.5rem_minmax(0,1fr)] xl:grid-cols-[5.5rem_minmax(0,1fr)_13rem]">
                <Prazo dias={item.diasAteLimite} />

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <ChipRisco risco={item.prioridade} tamanho="sm" />

                    <Link
                      href={`/trechos/${item.trechoId}`}
                      className="min-w-0 truncate rounded-sm text-sm font-medium text-ink transition-colors duration-150 ease-[var(--ease-out-quint)] hover:text-accent"
                    >
                      {item.rodovia}
                    </Link>

                    <Chip tom="neutro">{item.uf}</Chip>
                  </div>

                  <p className="tnum mt-2.5 font-mono text-xs break-words text-ink-3">
                    {fmt.faixaKm(item.kmInicio, item.kmFim)}
                    {item.sentido ? ` · ${item.sentido}` : ""} · {fmt.cm(item.alturaAtualCm)} de{" "}
                    {fmt.cm(item.alturaLimiteCm)} · {fmt.cmDia(item.crescimentoCmDia)}
                  </p>

                  <div id={`justificativa-${item.id}`}>
                    <p
                      className={cn(
                        "mt-3 text-sm leading-relaxed text-ink-2",
                        !aberto && "line-clamp-2",
                      )}
                    >
                      {item.justificativa}
                    </p>
                  </div>

                  <button
                    type="button"
                    aria-expanded={aberto}
                    aria-controls={`justificativa-${item.id}`}
                    onClick={() => setExpandido(aberto ? null : item.id)}
                    className="mt-3 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-ink-2 transition-colors duration-150 ease-[var(--ease-out-quint)] hover:text-ink"
                  >
                    {aberto ? "Recolher" : "Ler a justificativa completa"}
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        "size-3.5 shrink-0 transition-transform duration-200 ease-[var(--ease-out-quint)]",
                        aberto && "rotate-180",
                      )}
                    />
                  </button>
                </div>

                <div className="flex flex-wrap items-start justify-between gap-4 sm:col-span-2 xl:col-span-1 xl:flex-col xl:items-end xl:justify-start">
                  {aprova ? (
                    <PainelAprovar
                      equipes={equipes}
                      data={dataRascunho}
                      equipeId={equipeRascunho}
                      carregando={ocupado === item.id}
                      aoMudarData={setDataRascunho}
                      aoMudarEquipe={setEquipeRascunho}
                      aoConfirmar={() => confirmarAprovacao(item)}
                      aoCancelar={() => setAprovando(null)}
                    />
                  ) : (
                    <>
                      <div className="xl:text-right">
                        <span className="block text-2xs tracking-widest text-ink-3 uppercase">
                          Data sugerida
                        </span>
                        <span className="tnum mt-1.5 block font-mono text-sm leading-none text-ink">
                          {fmt.dataMedia(item.dataSugerida)}
                        </span>
                        <span className="mt-1.5 block text-2xs text-ink-3">
                          {relativoEmDias(item.dataSugerida)}
                        </span>
                        <Chip tom="neutro" tamanho="sm" icone={<Users />} className="mt-1.5 xl:ml-auto">
                          {item.equipe ?? "Sem equipe"}
                        </Chip>
                      </div>

                      {confirma ? (
                        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                          <p className="w-full text-xs text-ink-2 xl:text-right">
                            Descartar a sugestão de {rotuloTrecho}?
                          </p>
                          <Botao
                            tamanho="sm"
                            variante="perigo"
                            autoFocus
                            onClick={() => descartar(item)}
                          >
                            Sim, descartar
                          </Botao>
                          <Botao
                            tamanho="sm"
                            variante="fantasma"
                            onClick={() => setConfirmando(null)}
                          >
                            Cancelar
                          </Botao>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                          <Botao
                            tamanho="sm"
                            variante="primario"
                            iconeEsquerda={<Check />}
                            carregando={ocupado === item.id}
                            onClick={() => abrirAprovacao(item)}
                            aria-label={`Aprovar a roçada de ${rotuloTrecho}`}
                          >
                            Aprovar Roçada
                          </Botao>
                          <Botao
                            tamanho="sm"
                            variante="fantasma"
                            iconeEsquerda={<X />}
                            disabled={ocupado === item.id}
                            onClick={() => setConfirmando(item.id)}
                            aria-label={`Descartar a sugestão de ${rotuloTrecho}`}
                          >
                            Descartar
                          </Botao>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <p aria-live="polite" className="sr-only">
        {situacao}
      </p>
    </>
  );
}
