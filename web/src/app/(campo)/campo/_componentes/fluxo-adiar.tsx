"use client";

import { useState } from "react";
import { Check, ChevronLeft } from "lucide-react";

import type { ChamadoCampo } from "@/lib/campo/contratos";
import { MOTIVO_ADIAMENTO } from "@/lib/dominio";
import { fmt, somarDias } from "@/lib/format";
import { MOTIVOS_ADIAMENTO, type MotivoAdiamento } from "@/lib/types";

import { ALVO, borda, BotaoCampo, ESCALA } from "./base";
import { TelaRevisao } from "./tela-revisao";

/**
 * Pedir para voltar outro dia.
 *
 * Motivo por LISTA e nao por texto livre: o gestor decide dezenas destes por
 * semana e precisa comparar, e "chuva" escrito de seis jeitos nao agrupa. O
 * texto livre existe, e vira obrigatorio quando o motivo e "Outro" — que e
 * exatamente quando a lista nao explica nada.
 *
 * Sem foto: adiar e uma decisao, nao uma evidencia, e exigir foto de chuva na
 * beira da pista atrasaria o pedido para depois do fim do turno.
 */

const HOJE_MAIS_UM = () => somarDias(new Date(), 1).toISOString().slice(0, 10);

export function FluxoAdiar({
  chamado,
  aoVoltar,
  aoRegistrar,
}: {
  chamado: ChamadoCampo;
  aoVoltar: () => void;
  aoRegistrar: (
    eventoId: string,
    ocorridoEm: string,
    payload: { motivo: MotivoAdiamento; detalhe: string | null; data_sugerida: string | null },
  ) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState<MotivoAdiamento | null>(null);
  const [detalhe, setDetalhe] = useState("");
  const [data, setData] = useState("");
  const [revisando, setRevisando] = useState(false);

  const detalheObrigatorio = motivo === "outro";
  const pronto = motivo != null && (!detalheObrigatorio || detalhe.trim().length >= 3);
  const minimo = HOJE_MAIS_UM();

  if (revisando && motivo != null) {
    return (
      <TelaRevisao
        titulo="Conferir o pedido"
        consequencia="Ao confirmar, o gestor recebe o pedido e decide a nova data. A roçada fica parada até ele responder. Sem sinal, o pedido fica guardado e é enviado sozinho."
        fotos={[]}
        rotuloConfirmar="Pedir adiamento"
        rotuloGravando="Guardando no aparelho…"
        aoVoltar={() => setRevisando(false)}
        aoConfirmar={() =>
          aoRegistrar(crypto.randomUUID(), new Date().toISOString(), {
            motivo,
            detalhe: detalhe.trim() || null,
            data_sugerida: data || null,
          })
        }
      >
        <dl className={`${ESCALA.corpo} divide-y divide-border rounded-lg border border-border bg-surface`}>
          <div className="px-4 py-3">
            <dt className="text-ink-2">Motivo</dt>
            <dd className="mt-0.5 font-medium">{MOTIVO_ADIAMENTO[motivo]}</dd>
          </div>
          {detalhe.trim() ? (
            <div className="px-4 py-3">
              <dt className="text-ink-2">O que aconteceu</dt>
              <dd className="mt-0.5">{detalhe.trim()}</dd>
            </div>
          ) : null}
          <div className="px-4 py-3">
            <dt className="text-ink-2">Quando dá para voltar</dt>
            <dd className="mt-0.5 font-medium">{data ? fmt.dataMedia(data) : "sem data sugerida"}</dd>
          </div>
        </dl>
      </TelaRevisao>
    );
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={aoVoltar}
        className={`${ESCALA.corpo} ${ALVO} -ml-3 inline-flex cursor-pointer items-center gap-1 rounded-md pr-3 pl-2 font-medium text-ink-2 active:bg-surface-3`}
      >
        <ChevronLeft aria-hidden="true" className="size-6" />
        Voltar
      </button>

      <div>
        <h1 className={ESCALA.tela}>Pedir adiamento</h1>
        <p className={`${ESCALA.corpo} mt-1 text-ink-2`}>
          {chamado.trecho.rodovia}, {fmt.faixaKm(chamado.trecho.km_inicio, chamado.trecho.km_fim)}
        </p>
      </div>

      <fieldset>
        <legend className={`${ESCALA.rotulo} mb-2 font-medium tracking-wide text-ink-3 uppercase`}>Por que não dá hoje</legend>
        <div className="space-y-2">
          {MOTIVOS_ADIAMENTO.map((m) => {
            const escolhido = motivo === m;
            return (
              <label
                key={m}
                style={borda(escolhido ? "var(--accent)" : "var(--border)")}
                className={`${ESCALA.corpo} ${ALVO} flex cursor-pointer items-center gap-3 rounded-lg border px-4 ${
                  escolhido ? "bg-accent-soft text-ink" : "bg-surface active:bg-surface-3"
                }`}
              >
                <input
                  type="radio"
                  name="motivo"
                  value={m}
                  checked={escolhido}
                  onChange={() => setMotivo(m)}
                  className="sr-only"
                />
                {/* Marca desenhada e nao `appearance-none` no radio nativo: 24 px
                    de alvo visual, e o `sr-only` acima mantem o radio de verdade
                    para teclado e leitor de tela. */}
                <span
                  aria-hidden="true"
                  style={borda(escolhido ? "var(--accent)" : "var(--border-strong)")}
                  className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${escolhido ? "bg-accent" : ""}`}
                >
                  {escolhido ? <Check className="size-4 text-accent-ink" /> : null}
                </span>
                <span className="min-w-0 flex-1">{MOTIVO_ADIAMENTO[m]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="detalhe" className={`${ESCALA.corpo} block font-medium`}>
          O que aconteceu {detalheObrigatorio ? "" : "(opcional)"}
        </label>
        <textarea
          id="detalhe"
          rows={3}
          value={detalhe}
          onChange={(e) => setDetalhe(e.target.value)}
          placeholder={detalheObrigatorio ? "Conte ao gestor o que impediu a roçada." : ""}
          className={`${ESCALA.corpo} mt-2 w-full resize-y rounded-lg border border-border bg-surface-2 px-4 py-3 text-ink placeholder:text-ink-3`}
        />
        {detalheObrigatorio && detalhe.trim().length < 3 ? (
          <p className={`${ESCALA.meta} mt-1 text-ink-2`}>Com o motivo &ldquo;Outro&rdquo;, escreva o que aconteceu.</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="data-sugerida" className={`${ESCALA.corpo} block font-medium`}>
          Quando dá para voltar (opcional)
        </label>
        <input
          id="data-sugerida"
          type="date"
          min={minimo}
          value={data}
          onChange={(e) => setData(e.target.value)}
          style={borda("var(--border-strong)")}
          className={`${ESCALA.corpo} tnum mt-2 h-14 w-full rounded-lg border bg-surface-2 px-4 text-ink`}
        />
      </div>

      <BotaoCampo variante="primario" disabled={!pronto} onClick={() => setRevisando(true)}>
        {motivo == null ? "Escolha o motivo" : "Revisar"}
      </BotaoCampo>
    </div>
  );
}
