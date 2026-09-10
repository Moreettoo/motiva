"use client";

import { ChevronRight } from "lucide-react";

import type { ChamadoCampo } from "@/lib/campo/contratos";
import { RISCO, STATUS_CHAMADO_TOKEN } from "@/lib/dominio";
import { fmt, relativoEmDias } from "@/lib/format";

import { ALVO, borda, ChipCampo, ESCALA } from "./base";

/**
 * Um servico, do jeito que quem vai executar o reconhece.
 *
 * A HIERARQUIA E INVERTIDA em relacao ao painel, de proposito: o gestor procura
 * "CH-2026-0002", o rocador procura "Anhanguera, km 88". Entao a rodovia e a
 * faixa de km sao o titulo, e o numero do chamado cai para mono pequeno — ele
 * continua ali porque e o identificador que o gestor vai citar no radio, mas
 * nao e por ele que a pessoa acha o servico na lista.
 *
 * `destaque` = a secao "Hoje": superficie e borda mais fortes. A urgencia entra
 * pela estrutura, nao por enfeite colorido.
 */

export function CartaoChamado({
  chamado,
  destaque = false,
  pendente = false,
  aoAbrir,
}: {
  chamado: ChamadoCampo;
  destaque?: boolean;
  /** Tem evento seu na fila local, esperando rede. */
  pendente?: boolean;
  aoAbrir: () => void;
}) {
  const status = STATUS_CHAMADO_TOKEN[chamado.status];
  const risco = RISCO[chamado.prioridade];
  const urgente = chamado.prioridade === "critica" || chamado.prioridade === "alta";

  return (
    <button
      type="button"
      onClick={aoAbrir}
      style={borda(destaque ? "var(--border-strong)" : "var(--border)")}
      className={`${ALVO} flex w-full cursor-pointer items-center gap-3 rounded-lg border p-4 text-left transition-colors duration-150 active:bg-surface-3 ${
        destaque ? "bg-surface-2" : "bg-surface"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className={`${ESCALA.cartao} truncate`}>{chamado.trecho.rodovia}</p>
        <p className={`${ESCALA.meta} tnum truncate text-ink-2`}>
          {fmt.faixaKm(chamado.trecho.km_inicio, chamado.trecho.km_fim)}
          {chamado.trecho.sentido ? `, sentido ${chamado.trecho.sentido}` : ""}
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <ChipCampo icone={status.icone} tinta={status.tinta} fundo={status.fundo}>
            {status.rotulo}
          </ChipCampo>
          {urgente ? (
            <ChipCampo icone={risco.icone} tinta={risco.tinta} fundo={risco.fundo}>
              {risco.rotulo}
            </ChipCampo>
          ) : null}
          {pendente ? (
            <ChipCampo icone="Clock" tinta="var(--warning-ink)" fundo="var(--warning-soft)">
              aguardando envio
            </ChipCampo>
          ) : null}
        </div>

        <p className={`${ESCALA.rotulo} mt-2 flex flex-wrap items-baseline gap-x-2 text-ink-3`}>
          <span className="font-mono">{chamado.numero}</span>
          <span>
            {chamado.status === "concluido" || chamado.status === "cancelado"
              ? relativoEmDias(chamado.atualizado_em)
              : `prevista ${relativoEmDias(chamado.data_sugerida)}`}
          </span>
        </p>
      </div>

      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-3" />
    </button>
  );
}
