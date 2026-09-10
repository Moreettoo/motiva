"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";

import { LIMITES, type ChamadoCampo, type FotoLocal } from "@/lib/campo/contratos";
import { fmt } from "@/lib/format";

import { ALVO, borda, BotaoCampo, ESCALA, Rotulo } from "./base";
import { AdicionarExtra, CapturaFoto, type QuadroFoto } from "./captura-foto";
import { TelaRevisao } from "./tela-revisao";
import { useFotosDoEvento } from "./usar-fotos";

/**
 * Fechar a rocada: duas fotos do resultado, a altura final, revisao.
 *
 * A altura final e o unico numero que a equipe digita em todo o app, e vale
 * muito: `ia.aprovar_chamado` a grava em `ia.medicoes`, ou seja ela vira dado
 * de treino do modelo de crescimento. Por isso o campo e grande, com teclado
 * numerico, e a validacao acontece AQUI e tambem no banco (P0004, 0 a 300).
 */

const QUADROS: QuadroFoto[] = [
  { papel: "resultado", titulo: "Como ficou depois da roçada", dica: "A régua no capim cortado, mesmo ponto da primeira foto." },
  { papel: "extensao", titulo: "Extensão do trecho depois", dica: "De longe, a faixa inteira já roçada." },
];

/** Virgula e o separador do teclado brasileiro; recusar 8,5 seria recusar o normal. */
function alturaEmCm(texto: string): number | null {
  const bruto = texto.trim().replace(",", ".");
  if (bruto === "") return null;
  const n = Number(bruto);
  return Number.isFinite(n) ? n : null;
}

export function FluxoFinalizar({
  chamado,
  aoVoltar,
  aoRegistrar,
}: {
  chamado: ChamadoCampo;
  aoVoltar: () => void;
  aoRegistrar: (fotos: FotoLocal[], eventoId: string, ocorridoEm: string, alturaFinalCm: number) => Promise<void>;
}) {
  const { eventoId, fotos, extras, definir, adicionarExtra, removerExtra, obrigatoriasProntas, todas } = useFotosDoEvento(QUADROS);
  const [texto, setTexto] = useState("");
  const [tocado, setTocado] = useState(false);
  const [revisando, setRevisando] = useState(false);

  const altura = alturaEmCm(texto);
  const erroAltura =
    altura == null
      ? "Informe a altura do mato depois da roçada."
      : altura < 0 || altura > LIMITES.alturaMaxCm
        ? `A altura tem que ficar entre 0 e ${LIMITES.alturaMaxCm} cm.`
        : null;

  const pronto = obrigatoriasProntas && erroAltura == null;

  if (revisando && altura != null) {
    return (
      <TelaRevisao
        titulo="Conferir antes de enviar"
        consequencia="Ao confirmar, o chamado vai para aprovação do gestor. Sem sinal, fica guardado no aparelho e é enviado sozinho quando a rede voltar."
        fotos={todas}
        rotuloConfirmar="Enviar para aprovação"
        rotuloGravando="Guardando no aparelho…"
        aoVoltar={() => setRevisando(false)}
        aoConfirmar={() => aoRegistrar(todas, eventoId, new Date().toISOString(), altura)}
      >
        <Rotulo>Altura depois da roçada</Rotulo>
        <p className={`${ESCALA.numero} mt-1`}>{fmt.cm(altura)}</p>
        <p className={`${ESCALA.meta} mt-1 text-ink-2`}>Limite do trecho: {fmt.cm(chamado.trecho.altura_limite_cm)}</p>
      </TelaRevisao>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={aoVoltar}
        className={`${ESCALA.corpo} ${ALVO} -ml-3 inline-flex cursor-pointer items-center gap-1 rounded-md pr-3 pl-2 font-medium text-ink-2 active:bg-surface-3`}
      >
        <ChevronLeft aria-hidden="true" className="size-6" />
        Voltar
      </button>

      <div>
        <h1 className={ESCALA.tela}>Finalizar roçada</h1>
        <p className={`${ESCALA.corpo} mt-1 text-ink-2`}>Duas fotos do resultado e a altura que o mato ficou.</p>
      </div>

      {QUADROS.map((q) => (
        <CapturaFoto
          key={q.papel}
          quadro={q}
          etapa="fim"
          chamadoId={chamado.id}
          eventoId={eventoId}
          foto={fotos[q.papel] ?? null}
          aoTrocar={(f) => definir(q.papel, f)}
        />
      ))}

      {extras.map((extra, i) => (
        <CapturaFoto
          key={extra.chave}
          quadro={{ papel: "extra", titulo: `Foto extra ${i + 1}`, dica: "Qualquer coisa que o gestor precise ver." }}
          etapa="fim"
          chamadoId={chamado.id}
          eventoId={eventoId}
          foto={extra.foto}
          aoTrocar={(f) => definir("extra", f, extra.chave)}
          aoRemover={() => removerExtra(extra.chave)}
        />
      ))}

      <AdicionarExtra quantidade={extras.length} aoAdicionar={adicionarExtra} />

      <div className="rounded-lg border border-border bg-surface p-4">
        <label htmlFor="altura-final" className={`${ESCALA.corpo} block font-medium`}>
          Altura do mato depois da roçada
        </label>
        <p id="altura-final-dica" className={`${ESCALA.meta} mt-0.5 text-ink-2`}>
          Em centímetros. Vírgula pode.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <input
            id="altura-final"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={() => setTocado(true)}
            aria-describedby="altura-final-dica altura-final-erro"
            aria-invalid={tocado && erroAltura != null ? true : undefined}
            placeholder="8,5"
            style={borda(tocado && erroAltura ? "var(--critical)" : "var(--border-strong)")}
            className="tnum h-14 w-32 rounded-lg border bg-surface-2 px-4 text-2xl font-semibold text-ink placeholder:font-normal placeholder:text-ink-3"
          />
          <span className={`${ESCALA.corpo} text-ink-2`}>cm</span>
        </div>
        <p id="altura-final-erro" aria-live="polite" className={`${ESCALA.meta} mt-2 text-critical-ink ${tocado && erroAltura ? "" : "sr-only"}`}>
          {tocado && erroAltura ? erroAltura : ""}
        </p>
      </div>

      <BotaoCampo
        variante="primario"
        disabled={!pronto}
        onClick={() => {
          setTocado(true);
          if (pronto) setRevisando(true);
        }}
      >
        {!obrigatoriasProntas ? "Faltam as duas fotos" : erroAltura ? "Falta a altura final" : "Revisar"}
      </BotaoCampo>
    </div>
  );
}
