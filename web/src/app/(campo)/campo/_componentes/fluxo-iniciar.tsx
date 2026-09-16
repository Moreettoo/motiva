"use client";

import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";

import { LIMITES, type ChamadoCampo, type FotoLocal } from "@/lib/campo/contratos";
import { fmt } from "@/lib/format";

import { ALVO, borda, BotaoCampo, ESCALA, Rotulo } from "./base";
import { AdicionarExtra, CapturaFoto, type QuadroFoto } from "./captura-foto";
import { TelaRevisao } from "./tela-revisao";
import { useFotosDoEvento } from "./usar-fotos";

/**
 * Registrar o inicio da rocada: duas fotos com nome, a altura atual do mato,
 * extras opcionais, revisao.
 *
 * As duas fotos nao sao burocracia: `ia.registrar_evento_chamado` conta
 * `medida` e `extensao` com o mesmo `evento_id` antes de aceitar `iniciado`, e
 * sem elas o evento volta recusado depois, quando a equipe ja saiu do trecho.
 * A altura tem a MESMA exigencia (0 a 300, checada aqui e no banco, P0004) e o
 * MESMO motivo do campo espelho em `fluxo-finalizar.tsx`: e o estado real da
 * vegetacao que a equipe encontrou, e vira leitura em `ia.medicoes` -- dado de
 * treino do modelo de crescimento, nao so texto de tela.
 *
 * Isto NAO troca `chamado.altura_inicial_cm` (a previsao/informacao anterior
 * a chegada da equipe): a medida entra num campo proprio para o gestor
 * comparar previsto x medido, e nao para apagar um dos dois numeros.
 */

const QUADROS: QuadroFoto[] = [
  { papel: "medida", titulo: "Medida do mato, com a régua encostada", dica: "A régua em pé no capim, os números legíveis." },
  { papel: "extensao", titulo: "Extensão do trecho", dica: "De longe, mostrando a faixa inteira." },
];

/** Virgula e o separador do teclado brasileiro; recusar 8,5 seria recusar o normal. */
function alturaEmCm(texto: string): number | null {
  const bruto = texto.trim().replace(",", ".");
  if (bruto === "") return null;
  const n = Number(bruto);
  return Number.isFinite(n) ? n : null;
}

export function FluxoIniciar({
  chamado,
  aoVoltar,
  aoRegistrar,
}: {
  chamado: ChamadoCampo;
  aoVoltar: () => void;
  aoRegistrar: (fotos: FotoLocal[], eventoId: string, ocorridoEm: string, alturaInicialMedidaCm: number) => Promise<void>;
}) {
  const { eventoId, fotos, extras, definir, adicionarExtra, removerExtra, obrigatoriasProntas, todas } = useFotosDoEvento(QUADROS);
  const [texto, setTexto] = useState("");
  const [tocado, setTocado] = useState(false);
  const [revisando, setRevisando] = useState(false);

  const altura = alturaEmCm(texto);
  const erroAltura =
    altura == null
      ? "Meça e informe a altura atual do mato."
      : altura < 0 || altura > LIMITES.alturaMaxCm
        ? `A altura tem que ficar entre 0 e ${LIMITES.alturaMaxCm} cm.`
        : null;

  const pronto = obrigatoriasProntas && erroAltura == null;

  const consequencia = useMemo(
    () =>
      "Ao confirmar, o chamado passa a Em andamento. Sem sinal, fica guardado no aparelho e é enviado sozinho quando a rede voltar.",
    [],
  );

  if (revisando && altura != null) {
    return (
      <TelaRevisao
        titulo="Conferir antes de registrar"
        consequencia={consequencia}
        fotos={todas}
        rotuloConfirmar="Registrar início"
        rotuloGravando="Guardando no aparelho…"
        aoVoltar={() => setRevisando(false)}
        aoConfirmar={() => aoRegistrar(todas, eventoId, new Date().toISOString(), altura)}
      >
        <Rotulo>Trecho</Rotulo>
        <p className={`${ESCALA.corpo} tnum mt-1`}>
          {chamado.trecho.rodovia}, {fmt.faixaKm(chamado.trecho.km_inicio, chamado.trecho.km_fim)}
        </p>

        <Rotulo className="mt-3">Altura do mato agora</Rotulo>
        <p className={`${ESCALA.numero} mt-1`}>{fmt.cm(altura)}</p>
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
        <h1 className={ESCALA.tela}>Iniciar roçada</h1>
        <p className={`${ESCALA.corpo} mt-1 text-ink-2`}>Duas fotos e a altura do mato são obrigatórias. Fotografe e meça antes de começar a cortar.</p>
      </div>

      {QUADROS.map((q) => (
        <CapturaFoto
          key={q.papel}
          quadro={q}
          etapa="inicio"
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
          etapa="inicio"
          chamadoId={chamado.id}
          eventoId={eventoId}
          foto={extra.foto}
          aoTrocar={(f) => definir("extra", f, extra.chave)}
          aoRemover={() => removerExtra(extra.chave)}
        />
      ))}

      <AdicionarExtra quantidade={extras.length} aoAdicionar={adicionarExtra} />

      <div className="rounded-lg border border-border bg-surface p-4">
        <label htmlFor="altura-inicial" className={`${ESCALA.corpo} block font-medium`}>
          Altura do mato agora
        </label>
        <p id="altura-inicial-dica" className={`${ESCALA.meta} mt-0.5 text-ink-2`}>
          Em centímetros, com a régua encostada no mato. Vírgula pode.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <input
            id="altura-inicial"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={() => setTocado(true)}
            aria-describedby="altura-inicial-dica altura-inicial-erro"
            aria-invalid={tocado && erroAltura != null ? true : undefined}
            placeholder="24,0"
            style={borda(tocado && erroAltura ? "var(--critical)" : "var(--border-strong)")}
            className="tnum h-14 w-32 rounded-lg border bg-surface-2 px-4 text-2xl font-semibold text-ink placeholder:font-normal placeholder:text-ink-3"
          />
          <span className={`${ESCALA.corpo} text-ink-2`}>cm</span>
        </div>
        <p id="altura-inicial-erro" aria-live="polite" className={`${ESCALA.meta} mt-2 text-critical-ink ${tocado && erroAltura ? "" : "sr-only"}`}>
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
        {!obrigatoriasProntas ? "Faltam as duas fotos" : erroAltura ? "Falta a altura do mato" : "Revisar"}
      </BotaoCampo>
    </div>
  );
}
