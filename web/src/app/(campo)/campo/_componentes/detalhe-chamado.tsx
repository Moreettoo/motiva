"use client";

import { ChevronLeft } from "lucide-react";

import type { ChamadoCampo } from "@/lib/campo/contratos";
import { acoesDisponiveis } from "@/lib/chamados/maquina";
import { ESPECIE, MOTIVO_ADIAMENTO, STATUS_CHAMADO_TOKEN, TIPO_EVENTO } from "@/lib/dominio";
import { fmt, relativoEmDias } from "@/lib/format";

import { ALVO, BotaoCampo, ChipCampo, ESCALA, Icone, Rotulo } from "./base";
import { ReguaAntesDepois, ReguaAltura } from "./regua-altura";

/**
 * Uma ordem de servico inteira, na ordem em que a pessoa precisa dela.
 *
 * A acao fica FIXA NO RODAPE, nao no fim do documento. Quem esta de luva,
 * rolando um detalhe com justificativa longa e observacao de trecho, nao deve
 * ter de cacar o botao: o proximo passo e a unica coisa que nunca sai da tela.
 *
 * `acoesDisponiveis` e a MESMA funcao do painel, e o cargo passado e sempre
 * `rocador` mesmo quando quem olha e um gestor conferindo pelo `?equipe=`: o
 * app de campo oferece os passos de campo, e o gestor tem o painel para o
 * resto. O servidor decide de novo de qualquer jeito.
 */

export function DetalheChamado({
  chamado,
  pendente,
  aoVoltar,
  aoIniciar,
  aoFinalizar,
  aoAdiar,
}: {
  chamado: ChamadoCampo;
  pendente: boolean;
  aoVoltar: () => void;
  aoIniciar: () => void;
  aoFinalizar: () => void;
  aoAdiar: () => void;
}) {
  const status = STATUS_CHAMADO_TOKEN[chamado.status];
  const acoes = acoesDisponiveis(chamado.status, "rocador", true);
  const t = chamado.trecho;
  const especie = ESPECIE[t.especie as keyof typeof ESPECIE];
  const eventos = chamado.eventos_recentes ?? [];

  return (
    <div className="pb-4">
      <div className="flex items-center gap-1 border-b border-border pb-3">
        <button
          type="button"
          onClick={aoVoltar}
          className={`${ESCALA.corpo} ${ALVO} -ml-3 inline-flex cursor-pointer items-center gap-1 rounded-md pr-3 pl-2 font-medium text-ink-2 active:bg-surface-3`}
        >
          <ChevronLeft aria-hidden="true" className="size-6" />
          Lista
        </button>
        <span className={`${ESCALA.rotulo} ml-auto font-mono text-ink-3`}>{chamado.numero}</span>
      </div>

      <div className="space-y-5 pt-4">
        {/* Devolvido: o comentario do gestor vem ANTES de tudo. E a unica coisa
            que mudou desde a ultima vez que a pessoa olhou este chamado. */}
        {chamado.status === "devolvido" && chamado.comentario_gestor ? (
          <div role="alert" className="rounded-lg border-l-2 bg-serious-soft p-4" style={{ borderLeftColor: "var(--serious)" }}>
            <p className={`${ESCALA.corpo} font-medium text-serious-ink`}>O gestor pediu para refazer</p>
            <p className={`${ESCALA.corpo} mt-1 text-serious-ink`}>{chamado.comentario_gestor}</p>
          </div>
        ) : null}

        <div>
          <h1 className={ESCALA.tela}>{t.rodovia}</h1>
          <p className={`${ESCALA.corpo} tnum mt-0.5 text-ink-2`}>
            {fmt.faixaKm(t.km_inicio, t.km_fim)}
            {t.sentido ? `, sentido ${t.sentido}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ChipCampo icone={status.icone} tinta={status.tinta} fundo={status.fundo}>
              {status.rotulo}
            </ChipCampo>
            {pendente ? (
              <ChipCampo icone="Clock" tinta="var(--warning-ink)" fundo="var(--warning-soft)">
                aguardando envio
              </ChipCampo>
            ) : null}
          </div>
        </div>

        <section>
          <Rotulo>{chamado.altura_final_cm != null ? "Altura do mato" : "Altura do mato agora"}</Rotulo>
          <div className="mt-3">
            {chamado.altura_final_cm != null ? (
              <ReguaAntesDepois antesCm={chamado.altura_inicial_cm} depoisCm={chamado.altura_final_cm} limiteCm={t.altura_limite_cm} />
            ) : (
              <ReguaAltura
                alturaCm={chamado.altura_inicial_cm}
                limiteCm={t.altura_limite_cm}
                legenda={chamado.altura_inicial_origem === "informada" ? "informada pelo gestor" : "prevista pelo modelo"}
              />
            )}
          </div>
        </section>

        <section>
          <Rotulo>O trecho</Rotulo>
          <dl className={`${ESCALA.corpo} mt-2 divide-y divide-border rounded-lg border border-border bg-surface`}>
            <Linha rotulo="Extensão" valor={fmt.km(t.km_fim - t.km_inicio)} />
            <Linha rotulo="Capim" valor={especie?.rotulo ?? t.especie} />
            <Linha rotulo="Limite" valor={fmt.cm(t.altura_limite_cm)} />
          </dl>
        </section>

        {t.observacoes ? (
          <section>
            <div className="rounded-lg border-l-2 bg-surface-2 p-4" style={{ borderLeftColor: "var(--accent-line)" }}>
              <p className={`${ESCALA.corpo} font-medium`}>Atenção no trecho</p>
              <p className={`${ESCALA.corpo} mt-1 text-ink-2`}>{t.observacoes}</p>
            </div>
          </section>
        ) : null}

        <section>
          <Rotulo>Por que esta roçada</Rotulo>
          <p className={`${ESCALA.corpo} mt-2 text-ink-2`}>{chamado.justificativa}</p>
        </section>

        {chamado.adiamento_pendente ? (
          <p role="status" className={`${ESCALA.corpo} rounded-lg bg-warning-soft p-4 text-warning-ink`}>
            Você pediu adiamento ({MOTIVO_ADIAMENTO[chamado.adiamento_pendente.motivo].toLowerCase()}) em{" "}
            {fmt.dataCurta(chamado.adiamento_pendente.solicitado_em)}. Aguardando o gestor.
          </p>
        ) : null}

        {eventos.length > 0 ? (
          <section>
            <Rotulo>O que já aconteceu</Rotulo>
            <ol className="mt-2 space-y-3">
              {eventos.map((e) => {
                const token = TIPO_EVENTO[e.tipo];
                return (
                  <li key={`${e.tipo}-${e.ocorrido_em}`} className="flex items-start gap-3">
                    <span className="mt-0.5 text-ink-3">
                      <Icone nome={token.icone} />
                    </span>
                    <span className="min-w-0">
                      <span className={`${ESCALA.corpo} block`}>{token.rotulo}</span>
                      <span className={`${ESCALA.rotulo} block text-ink-3`}>
                        {relativoEmDias(e.ocorrido_em)}, {fmt.horaMin(e.ocorrido_em)} · {e.autor_nome}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        <Espera chamado={chamado} temAcao={acoes.length > 0} />
      </div>

      {acoes.length > 0 ? (
        /* Fixo no rodape, com a mesma largura do conteudo. `pb-[max(...,env(
           safe-area-inset-bottom))]` porque o layout usa `viewportFit: "cover"`
           e num celular com barra de gestos o botao ficaria por baixo dela.

           `z-10` explicito: `backdrop-blur` e um filtro, e filtro cria contexto
           de empilhamento. Sem o z-index esta barra pintava POR CIMA do aviso
           "Guardado no aparelho" (z-30), que e justamente a confirmacao da acao
           que acabou de sair daqui. */
        <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-border bg-bg/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="space-y-2">
            {acoes.includes("iniciar") ? (
              <BotaoCampo variante="primario" icone={<Icone nome="Play" />} onClick={aoIniciar}>
                Iniciar roçada
              </BotaoCampo>
            ) : null}
            {acoes.includes("finalizar") ? (
              <BotaoCampo variante="primario" icone={<Icone nome="Flag" />} onClick={aoFinalizar}>
                Finalizar roçada
              </BotaoCampo>
            ) : null}
            {acoes.includes("pedir_adiamento") ? (
              <BotaoCampo variante="secundario" icone={<Icone nome="CalendarClock" />} onClick={aoAdiar}>
                Pedir adiamento
              </BotaoCampo>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** O estado de espera, quando nao ha passo nenhum a dar. Dizer isso e melhor que uma tela sem botao. */
function Espera({ chamado, temAcao }: { chamado: ChamadoCampo; temAcao: boolean }) {
  if (temAcao) return null;

  const frase =
    chamado.status === "aguardando_aprovacao" && chamado.finalizado_em
      ? `Enviado para aprovação em ${fmt.dataCurta(chamado.finalizado_em)}, ${fmt.horaMin(chamado.finalizado_em)}. Nada a fazer por enquanto.`
      : chamado.status === "concluido"
        ? `Aprovado em ${fmt.dataCurta(chamado.atualizado_em)}. Roçada registrada.`
        : chamado.status === "cancelado"
          ? "O gestor cancelou este chamado."
          : chamado.status === "adiamento_solicitado"
            ? "O gestor está decidindo o adiamento. Nada a fazer por enquanto."
            : "Nada a fazer neste chamado por enquanto.";

  return <p className={`${ESCALA.corpo} rounded-lg border border-border bg-surface p-4 text-ink-2`}>{frase}</p>;
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <dt className="text-ink-2">{rotulo}</dt>
      <dd className="tnum font-medium">{valor}</dd>
    </div>
  );
}
