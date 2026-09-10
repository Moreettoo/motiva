"use client";

import { CircleCheck, LoaderCircle, OctagonAlert, RefreshCw, Upload, WifiOff } from "lucide-react";

import type { EstadoCampo, ItemFila } from "@/lib/campo/contratos";
import { resumoPendencias } from "@/lib/campo/fila";
import { fmt } from "@/lib/format";

import { ALVO, borda, ESCALA } from "./base";
import type { SituacaoRede } from "./usar-sincronizacao";

/**
 * A faixa do topo, sempre visivel: onde esta o trabalho que a pessoa acabou de
 * registrar.
 *
 * E a peca mais importante de um app offline. Quem aperta "Registrar inicio"
 * sem sinal precisa saber, sem perguntar a ninguem, que aquilo ficou guardado e
 * que vai sair sozinho — senao aperta de novo, ou refaz a foto, ou desiste e
 * anota no papel.
 *
 * Tres estados e uma quarta linha. Icone + PALAVRA sempre: nunca so a cor, e
 * nunca um giro sem texto.
 */

export function IndicadorSincronizacao({
  estado,
  fila,
  rede,
  sincronizando,
  aoEnviar,
  aoAtualizar,
}: {
  estado: EstadoCampo | null;
  fila: ItemFila[];
  rede: SituacaoRede;
  sincronizando: boolean;
  aoEnviar: () => void;
  aoAtualizar: () => void;
}) {
  const { total, comErro } = resumoPendencias(fila);
  const offline = rede === "offline";

  /* Item com `ultimo_erro` E tentativas: uma unica falha de rede ja grava
     `ultimo_erro`, e chamar isso de problema assustaria a pessoa a cada tunel.
     A linha critica e para o que NAO se resolve esperando. */
  const recusados = fila.filter((i) => i.ultimo_erro != null && i.tentativas >= 2);

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-2.5">
        <Situacao offline={offline} sincronizando={sincronizando} total={total} sincronizadoEm={estado?.sincronizadoEm} />

        {total > 0 && !offline ? (
          <button
            type="button"
            onClick={aoEnviar}
            disabled={sincronizando}
            style={borda("var(--border-strong)")}
            className={`${ESCALA.rotulo} ${ALVO} -my-1 inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border bg-surface-2 px-3 font-medium text-ink active:bg-surface-3 disabled:opacity-45`}
          >
            <Upload aria-hidden="true" className="size-4" />
            Enviar agora
          </button>
        ) : (
          <button
            type="button"
            onClick={aoAtualizar}
            disabled={sincronizando || offline}
            aria-label="Atualizar a lista"
            className={`${ALVO} -my-1 inline-flex w-14 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-2 active:bg-surface-3 disabled:opacity-35`}
          >
            <RefreshCw aria-hidden="true" className="size-5" />
          </button>
        )}
      </div>

      {comErro > 0 && recusados.length > 0 ? (
        <div role="alert" style={borda("var(--critical)")} className="border-t bg-critical-soft px-4 py-2">
          <div className={`${ESCALA.meta} mx-auto flex max-w-lg items-start gap-2 text-critical-ink`}>
            <OctagonAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0">
              {recusados.length === 1
                ? recusados[0].ultimo_erro
                : `${fmt.contar(recusados.length, "registro")} não foram aceitos pelo servidor. Fale com o gestor.`}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Situacao({
  offline,
  sincronizando,
  total,
  sincronizadoEm,
}: {
  offline: boolean;
  sincronizando: boolean;
  total: number;
  sincronizadoEm: string | undefined;
}) {
  const classe = `${ESCALA.meta} flex min-w-0 flex-1 items-center gap-2 font-medium`;

  if (sincronizando) {
    return (
      <p className={`${classe} text-ink`} aria-live="polite">
        <LoaderCircle aria-hidden="true" className="size-5 shrink-0 animate-spin" />
        <span className="truncate">Enviando…</span>
      </p>
    );
  }

  if (offline) {
    return (
      <p className={`${classe} text-ink-2`} aria-live="polite">
        <WifiOff aria-hidden="true" className="size-5 shrink-0" />
        <span className="truncate">
          {total > 0 ? `${fmt.contar(total, "pendente")} · sem sinal` : "Sem sinal · guardando no aparelho"}
        </span>
      </p>
    );
  }

  if (total > 0) {
    return (
      <p className={`${classe} text-warning-ink`} aria-live="polite">
        <Upload aria-hidden="true" className="size-5 shrink-0" />
        <span className="truncate">{fmt.contar(total, "pendente")} de envio</span>
      </p>
    );
  }

  return (
    <p className={`${classe} text-good-ink`} aria-live="polite">
      <CircleCheck aria-hidden="true" className="size-5 shrink-0" />
      <span className="truncate">Tudo enviado{sincronizadoEm ? ` · ${fmt.horaMin(sincronizadoEm)}` : ""}</span>
    </p>
  );
}
