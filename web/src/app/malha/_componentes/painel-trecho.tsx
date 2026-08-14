"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import {
  CircleCheck,
  CircleSlash,
  CloudRain,
  ExternalLink,
  Leaf,
  Mountain,
  NotebookPen,
  Pencil,
  Sparkles,
  Thermometer,
} from "lucide-react";

import { Aviso } from "@/components/ui/aviso";
import { Botao, classesBotao } from "@/components/ui/botao";
import { Chip, ChipRisco, ChipStatus } from "@/components/ui/chip";
import { Leitura } from "@/components/ui/leitura";
import { useNotificacao } from "@/components/ui/notificacoes";
import { PainelLateral } from "@/components/ui/painel-lateral";
import { Medidor } from "@/components/viz/medidor";
import { mudarStatusAgendamento } from "@/lib/acoes";
import { ESPECIE, erroFaltaEquipe, rotuloPrazo } from "@/lib/dominio";
import { fmt, relativoEmDias } from "@/lib/format";
import type { StatusAgendamento, TrechoStatus, ZonaClima } from "@/lib/types";

function Secao({
  titulo,
  icone,
  children,
}: {
  titulo: string;
  icone: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border pt-4">
      <h3 className="flex items-center gap-2 text-2xs font-medium tracking-widest text-ink-3 uppercase">
        <span aria-hidden="true" className="inline-flex shrink-0 [&_svg]:size-3.5">
          {icone}
        </span>
        {titulo}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * Detalhe do trecho sem sair da malha.
 *
 * O gestor está lendo a régua inteira; abrir uma página nova custa o contexto
 * das rodovias vizinhas, que é justamente o que ele veio comparar. O link
 * "Abrir trecho" continua ali para quem quer o histórico completo.
 */
export function PainelTrecho({
  trecho,
  zona,
  aberto,
  aoFechar,
}: {
  trecho: TrechoStatus | null;
  zona: ZonaClima | null;
  aberto: boolean;
  aoFechar: () => void;
}) {
  const { mostrar } = useNotificacao();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  /** Qual das duas decisões está em curso — o giro tem que aparecer no botão
   *  que foi clicado, não no primeiro da linha. */
  const [emCurso, setEmCurso] = useState<"aprovado" | "descartado" | null>(null);
  /** Descartar apaga a sugestão da IA: pede confirmação em vez de obedecer no
   *  primeiro clique, como já faz o painel da agenda. */
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);

  if (!trecho) return null;

  const kmInicio = Number(trecho.km_inicio);
  const kmFim = Number(trecho.km_fim);
  const limite = Number(trecho.altura_limite_cm);
  const atual = trecho.altura_atual_cm == null ? null : Number(trecho.altura_atual_cm);
  const especie = ESPECIE[trecho.especie];
  const status = trecho.agendamento_status;
  const agendamentoId = trecho.agendamento_id;
  const manual = trecho.agendamento_origem === "manual";
  // Este painel não tem seletor de equipe — só a agenda atribui. Por isso a
  // dica manda para lá em vez de repetir o texto genérico de `erroFaltaEquipe`.
  const bloqueioAprovacao = erroFaltaEquipe(trecho.equipe_id, "aprovado")
    ? "Atribua uma equipe pela agenda antes de aprovar."
    : null;

  function decidir(novoStatus: Extract<StatusAgendamento, "aprovado" | "descartado">) {
    if (agendamentoId == null || !trecho) return;

    const id = agendamentoId;
    const identificacao = `${trecho.rodovia} · ${fmt.faixaKm(kmInicio, kmFim)}`;
    setErro(null);
    setEmCurso(novoStatus);

    iniciar(async () => {
      const resultado = await mudarStatusAgendamento(id, novoStatus);

      if (resultado.ok) {
        mostrar({
          tom: "good",
          titulo: novoStatus === "aprovado" ? "Roçada aprovada" : "Sugestão descartada",
          descricao: identificacao,
        });
      } else {
        setErro(resultado.erro);
        mostrar({ tom: "critical", titulo: "Não foi possível salvar", descricao: resultado.erro });
      }

      setEmCurso(null);
    });
  }

  const decidido = status === "aprovado" || status === "descartado" || status === "executado";

  return (
    <PainelLateral
      aberto={aberto}
      // O painel é montado uma única vez na malha, sem `key` por trecho: sem
      // limpar aqui, o próximo trecho abriria já no par de confirmação.
      aoFechar={() => {
        setConfirmandoDescarte(false);
        aoFechar();
      }}
      largura="lg"
      titulo={trecho.sentido ? `${trecho.rodovia} · ${trecho.sentido}` : trecho.rodovia}
      descricao={`${fmt.faixaKm(kmInicio, kmFim)} · ${trecho.uf}`}
      rodape={
        <div className="flex flex-wrap items-center gap-2">
          {agendamentoId != null ? (
            <>
              <Botao
                variante="primario"
                iconeEsquerda={<CircleCheck />}
                carregando={pendente && emCurso === "aprovado"}
                disabled={
                  pendente || status === "aprovado" || status === "executado" || bloqueioAprovacao != null
                }
                title={status === "sugerido" ? (bloqueioAprovacao ?? undefined) : undefined}
                onClick={() => decidir("aprovado")}
              >
                Aprovar roçada
              </Botao>
              {confirmandoDescarte ? (
                <>
                  <Botao
                    variante="perigo"
                    carregando={pendente && emCurso === "descartado"}
                    disabled={pendente}
                    onClick={() => {
                      setConfirmandoDescarte(false);
                      decidir("descartado");
                    }}
                  >
                    Confirmar descarte
                  </Botao>
                  <Botao
                    variante="fantasma"
                    disabled={pendente}
                    onClick={() => setConfirmandoDescarte(false)}
                  >
                    Manter sugestão
                  </Botao>
                </>
              ) : (
                <Botao
                  variante="perigo"
                  iconeEsquerda={<CircleSlash />}
                  disabled={pendente || status === "descartado" || status === "executado"}
                  onClick={() => setConfirmandoDescarte(true)}
                >
                  Descartar
                </Botao>
              )}
            </>
          ) : null}

          <Link
            href={`/trechos/${trecho.id}`}
            className={classesBotao("secundario", "md", "ml-auto shrink-0")}
          >
            Abrir trecho
            <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
          </Link>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <ChipRisco risco={trecho.risco} />
          {status ? <ChipStatus status={status} /> : null}
          <Chip tom="neutro">{especie?.rotulo ?? trecho.especie}</Chip>
          {trecho.tipo_pista ? <Chip tom="neutro">{trecho.tipo_pista}</Chip> : null}
        </div>

        {erro ? (
          <Aviso tom="critical" titulo="A ação não foi salva" aoFechar={() => setErro(null)}>
            <p>{erro}</p>
          </Aviso>
        ) : null}

        {atual == null ? (
          <Aviso tom="warning" titulo="Sem previsão de altura para este trecho">
            <p>
              Registre uma medição de campo para o modelo voltar a estimar o crescimento e o prazo
              até o limite.
            </p>
          </Aviso>
        ) : (
          <div className="flex justify-center rounded-lg border border-border bg-surface-2 py-5">
            <Medidor valor={atual} limite={limite} rotulo="Altura" tamanho={168} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Leitura
            rotulo="Prazo"
            valor={rotuloPrazo(trecho.dias_ate_limite)}
            nota="até passar do limite"
          />
          <Leitura
            rotulo="Crescimento"
            valor={
              trecho.crescimento_cm_dia == null
                ? "—"
                : fmt.cmDia(Number(trecho.crescimento_cm_dia))
            }
            nota={trecho.previsto_em ? `previsto em ${fmt.dataCurta(trecho.previsto_em)}` : "sem previsão"}
          />
          <Leitura
            rotulo="Última medição"
            valor={
              trecho.altura_medida_cm == null ? "—" : fmt.cm(Number(trecho.altura_medida_cm))
            }
            nota={trecho.medido_em ? relativoEmDias(trecho.medido_em) : "sem medição de campo"}
          />
          <Leitura
            rotulo="Última roçada"
            valor={trecho.rocado_em ? fmt.dataMedia(trecho.rocado_em) : "—"}
            nota={trecho.rocado_em ? relativoEmDias(trecho.rocado_em) : "sem execução registrada"}
          />
        </div>

        <Secao titulo="Clima da zona" icone={<CloudRain />}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Leitura
              rotulo="Temperatura média"
              valor={
                trecho.temperatura_media_c == null
                  ? "—"
                  : fmt.celsius(Number(trecho.temperatura_media_c))
              }
              nota="janela da última previsão"
            />
            <Leitura
              rotulo="Chuva acumulada"
              valor={trecho.chuva_total_mm == null ? "—" : fmt.mm(Number(trecho.chuva_total_mm))}
              nota="janela da última previsão"
            />
          </div>

          {zona ? (
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
              <Thermometer aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
              <span className="min-w-0 break-words">{zona.nome ?? "Zona sem nome"}</span>
              <span className="tnum font-mono text-ink-3">
                {fmt.faixaKm(Number(zona.km_inicio), Number(zona.km_fim))}
              </span>
              {zona.altitude_m != null ? (
                <span className="inline-flex items-center gap-1 text-ink-3">
                  <Mountain aria-hidden="true" className="size-3.5 shrink-0" />
                  <span className="tnum font-mono">{fmt.n(Number(zona.altitude_m))} m</span>
                </span>
              ) : null}
            </p>
          ) : (
            <p className="mt-3 text-xs text-ink-3">
              Nenhuma zona de clima cobre esta faixa de km.
            </p>
          )}
        </Secao>

        <Secao titulo="Espécie" icone={<Leaf />}>
          <p className="text-sm text-ink">
            {especie?.rotulo ?? trecho.especie}{" "}
            <span className="text-ink-3 italic">{especie?.nomeCientifico}</span>
          </p>
          {especie ? <p className="mt-1 text-sm break-words text-ink-2">{especie.nota}</p> : null}
        </Secao>

        {trecho.observacoes ? (
          <Secao titulo="Observações do trecho" icone={<NotebookPen />}>
            <p className="text-sm break-words text-ink-2">{trecho.observacoes}</p>
          </Secao>
        ) : null}

        {/* Título e ícone seguem a ORIGEM: a mesma `justificativa` da view tem
            dois donos possíveis desde que existe agendamento manual, e chamar
            de "Decisão da IA" um texto que um gestor digitou atribui a decisão
            a quem não a tomou. "Sugerida" também sai — a roçada manual nasce
            aprovada, não sugerida. */}
        <Secao
          titulo={manual ? "Agendamento manual" : "Decisão da IA"}
          icone={manual ? <Pencil /> : <Sparkles />}
        >
          {trecho.justificativa ? (
            <>
              {trecho.data_sugerida ? (
                <p className="mb-3 flex flex-wrap items-baseline gap-x-2 text-sm text-ink-2">
                  <span>{manual ? "Roçada marcada para" : "Roçada sugerida para"}</span>
                  <span className="tnum font-mono text-ink">
                    {fmt.dataMedia(trecho.data_sugerida)}
                  </span>
                  <span className="text-ink-3">{relativoEmDias(trecho.data_sugerida)}</span>
                </p>
              ) : null}

              <p className="text-sm break-words text-ink-2">{trecho.justificativa}</p>

              {trecho.fatores && trecho.fatores.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {trecho.fatores.map((fator, i) => (
                    <li key={`${i}-${fator}`} className="flex gap-2 text-xs text-ink-2">
                      <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-accent-line" />
                      <span className="min-w-0 break-words">{fator}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {trecho.equipe_nome ? (
                <p className="mt-3 text-xs text-ink-3">
                  Equipe atribuída: <span className="text-ink-2">{trecho.equipe_nome}</span>
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-ink-2">
              A IA ainda não sugeriu data para este trecho. A análise em lote só consulta o modelo
              de linguagem para trechos a menos de 45 dias do limite.
            </p>
          )}
        </Secao>

        {decidido ? (
          <p aria-live="polite" className="text-xs text-ink-3">
            Sugestão já decidida. Reabra pela agenda para trocar a data ou a equipe.
          </p>
        ) : null}
      </div>
    </PainelLateral>
  );
}
