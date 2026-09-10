"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, LoaderCircle, MapPin, MapPinOff, Plus, RotateCcw, X } from "lucide-react";

import { LIMITES, type FotoLocal, type Papel } from "@/lib/campo/contratos";
import { capturarPosicao, comprimirFoto } from "@/lib/campo/imagem";
import { fmt } from "@/lib/format";

import { ALVO, borda, ESCALA, PreviaFoto } from "./base";

/**
 * O quadro de foto: um por evidencia exigida, com NOME.
 *
 * "Toque para fotografar" num quadro chamado "Medida do mato, com a regua
 * encostada" ensina o enquadramento sem manual. Um botao generico de anexo
 * deixaria a decisao para a pessoa, e a foto errada so aparece quando o gestor
 * devolve o chamado, no fim do dia, quando a equipe ja saiu do trecho.
 *
 * `<input capture="environment">` abre a camera nativa e FUNCIONA SEM SINAL —
 * e a razao de nao haver `getUserMedia` aqui. No desktop o mesmo input abre o
 * seletor de arquivos, que e como o teste offline do plano roda.
 *
 * A prevIa sai de `URL.createObjectURL` e e revogada na limpeza: um blob de
 * 300 KB por foto, com 6 fotos por evento, vaza rapido num app que a pessoa
 * deixa aberto o dia todo.
 */

export type QuadroFoto = {
  papel: Papel;
  titulo: string;
  /** O que enquadrar. Uma frase, sem jargao. */
  dica: string;
};

type Estado = "vazio" | "processando" | "pronto" | "erro";

export function CapturaFoto({
  quadro,
  etapa,
  chamadoId,
  eventoId,
  foto,
  aoTrocar,
  aoRemover,
}: {
  quadro: QuadroFoto;
  etapa: "inicio" | "fim";
  chamadoId: number;
  eventoId: string;
  foto: FotoLocal | null;
  aoTrocar: (foto: FotoLocal) => void;
  /** Só os quadros extras podem sair de cena; os obrigatórios só refazem. */
  aoRemover?: () => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Estado>(foto ? "pronto" : "vazio");
  const [erro, setErro] = useState<string | null>(null);

  const escolher = useCallback(
    async (arquivo: File) => {
      setEstado("processando");
      setErro(null);
      try {
        /* Comprimir e pegar o GPS em PARALELO: o satelite leva ate 8 s e o
           canvas leva menos de um. Em serie, a pessoa esperaria a soma. */
        const capturada_em = new Date().toISOString();
        const [imagem, posicao] = await Promise.all([comprimirFoto(arquivo), capturarPosicao()]);
        aoTrocar({
          foto_id: crypto.randomUUID(),
          evento_id: eventoId,
          chamado_id: chamadoId,
          etapa,
          papel: quadro.papel,
          blob: imagem.blob,
          largura_px: imagem.largura,
          altura_px: imagem.altura,
          bytes: imagem.blob.size,
          latitude: posicao?.latitude ?? null,
          longitude: posicao?.longitude ?? null,
          precisao_m: posicao?.precisao_m ?? null,
          capturada_em,
          enviada: false,
        });
        setEstado("pronto");
      } catch {
        setEstado("erro");
        setErro("Não foi possível preparar esta foto. Tente fotografar de novo.");
      }
    },
    [aoTrocar, chamadoId, etapa, eventoId, quadro.papel],
  );

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`${ESCALA.corpo} font-medium`}>{quadro.titulo}</p>
          <p className={`${ESCALA.meta} text-ink-2`}>{quadro.dica}</p>
        </div>
        {aoRemover ? (
          <button
            type="button"
            onClick={aoRemover}
            aria-label={`Tirar o quadro ${quadro.titulo}`}
            /* 56 px como todo alvo do campo, e nao os 36 que estavam aqui:
               medido em 36x36, e um dedo com luva erra. O `-m` devolve o peso
               visual de um icone pequeno sem encolher o alvo. */
            className={`${ALVO} -mt-1 -mr-2 inline-flex w-14 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-3 active:bg-surface-3`}
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        ) : null}
      </div>

      <input
        ref={entrada}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          // Zerar o valor: refazer com a MESMA foto nao dispararia `change` de novo.
          e.target.value = "";
          if (arquivo) void escolher(arquivo);
        }}
      />

      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={estado === "processando"}
        style={borda("var(--border-strong)")}
        className="mt-3 flex aspect-[4/3] w-full cursor-pointer items-center justify-center overflow-hidden rounded-md border bg-surface-3 active:opacity-90 disabled:cursor-default"
      >
        {estado === "processando" ? (
          <span className={`${ESCALA.corpo} flex items-center gap-2 text-ink-2`}>
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
            Preparando a foto…
          </span>
        ) : foto ? (
          /* `key` no `foto_id`: refazer a foto REMONTA a previa, e e o desmonte
             que revoga a URL antiga. Sem isso a imagem na tela continuaria a
             anterior. */
          <PreviaFoto key={foto.foto_id} blob={foto.blob} alt={quadro.titulo} />
        ) : (
          <span className={`${ESCALA.corpo} flex flex-col items-center gap-2 text-ink-2`}>
            <Camera aria-hidden="true" className="size-8" />
            Toque para fotografar
          </span>
        )}
      </button>

      {erro ? (
        <p role="alert" className={`${ESCALA.meta} mt-2 text-critical-ink`}>
          {erro}
        </p>
      ) : null}

      {foto ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className={`${ESCALA.rotulo} flex min-w-0 items-center gap-1.5 text-ink-3`}>
            {foto.precisao_m != null ? (
              <>
                <MapPin aria-hidden="true" className="size-4 shrink-0" />
                <span className="tnum">±{fmt.n(Math.round(foto.precisao_m))} m</span>
              </>
            ) : (
              <>
                <MapPinOff aria-hidden="true" className="size-4 shrink-0" />
                <span>sem GPS</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="tnum">{fmt.n(Math.round(foto.bytes / 1024))} KB</span>
          </p>

          <button
            type="button"
            onClick={() => entrada.current?.click()}
            className={`${ESCALA.rotulo} ${ALVO} -my-1 inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 font-medium text-ink active:bg-surface-3`}
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Refazer
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** "Adicionar foto", ate `LIMITES.fotosExtrasMax`. O contador diz quantas ainda cabem. */
export function AdicionarExtra({ quantidade, aoAdicionar }: { quantidade: number; aoAdicionar: () => void }) {
  const restam = LIMITES.fotosExtrasMax - quantidade;
  if (restam <= 0) return null;

  return (
    <button
      type="button"
      onClick={aoAdicionar}
      style={borda("var(--border-strong)")}
      className={`${ESCALA.corpo} ${ALVO} flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed text-ink-2 active:bg-surface-3`}
    >
      <Plus aria-hidden="true" className="size-5" />
      Adicionar foto {quantidade > 0 ? `(cabem ${restam})` : "(opcional)"}
    </button>
  );
}
