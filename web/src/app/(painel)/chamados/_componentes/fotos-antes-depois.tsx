"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { fmt } from "@/lib/format";
import type { ChamadoDetalhado, ChamadoFoto } from "@/lib/types";
import { distanciaKm } from "@/lib/utils";

/** Rótulo do papel da foto. Os quatro vêm do `check` de `ia.chamado_fotos`. */
const PAPEL: Record<ChamadoFoto["papel"], string> = {
  medida: "Régua",
  extensao: "Extensão",
  resultado: "Resultado",
  extra: "Extra",
};

type PontoTrecho = Pick<ChamadoDetalhado["trecho"], "latitude" | "longitude">;

/**
 * A distância entre onde a foto foi tirada e o meio do trecho.
 *
 * Não é enfeite: é o único jeito de a tela dizer que a evidência foi
 * produzida no lugar certo. `ia.trechos` guarda um ponto médio, então uma
 * faixa de 6 km dá até 3 km de distância legítima só pela geometria — o número
 * aparece cru, com a precisão do GPS ao lado, em vez de virar um selo
 * "confere / não confere" que fingiria uma certeza que este dado não tem.
 */
export function distanciaDaFoto(foto: ChamadoFoto, trecho: PontoTrecho): number | null {
  if (foto.latitude == null || foto.longitude == null) return null;
  if (trecho.latitude == null || trecho.longitude == null) return null;
  return distanciaKm(
    { latitude: Number(foto.latitude), longitude: Number(foto.longitude) },
    { latitude: Number(trecho.latitude), longitude: Number(trecho.longitude) },
  );
}

function legendaDeGps(foto: ChamadoFoto, trecho: PontoTrecho): string | null {
  const km = distanciaDaFoto(foto, trecho);
  if (km == null) return "sem GPS";
  const precisao = foto.precisao_m == null ? null : `±${fmt.n(Math.round(Number(foto.precisao_m)))} m`;
  return [`a ${fmt.km(km)} do meio do trecho`, precisao].filter(Boolean).join(" · ");
}

function Foto({
  foto,
  trecho,
  aoAmpliar,
}: {
  foto: ChamadoFoto;
  trecho: PontoTrecho;
  aoAmpliar: () => void;
}) {
  return (
    <figure className="min-w-0">
      <button
        type="button"
        onClick={aoAmpliar}
        style={{ borderColor: "var(--borda, var(--border))" }}
        className="block w-full overflow-hidden rounded-md border border-border bg-surface-3 hover:[--borda:var(--border-strong)]"
      >
        {/* `/api/fotos/<id>` redireciona para uma URL assinada de 60 s. Montar
            a URL do Storage aqui exporia o bucket, que é privado de propósito. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/fotos/${foto.id}`}
          alt={`${PAPEL[foto.papel]}, ${fmt.horaMin(foto.capturada_em)}`}
          loading="lazy"
          width={foto.largura_px}
          height={foto.altura_px}
          className="block h-36 w-full object-cover"
        />
      </button>

      <figcaption className="mt-1 min-w-0">
        <span className="block truncate text-xs font-medium text-ink-2">
          {PAPEL[foto.papel]} · <span className="tnum">{fmt.horaMin(foto.capturada_em)}</span>
        </span>
        <span className="block truncate text-2xs text-ink-3">{legendaDeGps(foto, trecho)}</span>
      </figcaption>
    </figure>
  );
}

function Coluna({
  titulo,
  vazio,
  fotos,
  trecho,
  aoAmpliar,
}: {
  titulo: string;
  vazio: string;
  fotos: ChamadoFoto[];
  trecho: PontoTrecho;
  aoAmpliar: (foto: ChamadoFoto) => void;
}) {
  return (
    <div className="min-w-0">
      <h4 className="mb-2 text-xs font-medium text-ink-2">{titulo}</h4>

      {fotos.length === 0 ? (
        <p className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-6 text-xs text-ink-3">
          <ImageOff aria-hidden="true" className="size-4 shrink-0" />
          {vazio}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {fotos.map((f) => (
            <Foto key={f.id} foto={f} trecho={trecho} aoAmpliar={() => aoAmpliar(f)} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Antes e depois, lado a lado.
 *
 * Empilhadas em ordem cronológica, as quatro fotos viram um rolo e a
 * comparação — que é a decisão inteira de aprovar ou devolver — teria que
 * acontecer na memória do gestor. Em duas colunas, ela acontece nos olhos.
 */
export function FotosAntesDepois({
  fotos,
  trecho,
}: {
  fotos: ChamadoFoto[];
  trecho: PontoTrecho;
}) {
  const [ampliada, setAmpliada] = useState<ChamadoFoto | null>(null);

  const inicio = fotos.filter((f) => f.etapa === "inicio");
  const fim = fotos.filter((f) => f.etapa === "fim");

  return (
    <>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <Coluna
          titulo="Antes"
          vazio="A equipe ainda não iniciou"
          fotos={inicio}
          trecho={trecho}
          aoAmpliar={setAmpliada}
        />
        <Coluna
          titulo="Depois"
          vazio="A equipe ainda não finalizou"
          fotos={fim}
          trecho={trecho}
          aoAmpliar={setAmpliada}
        />
      </div>

      <Modal
        aberto={ampliada != null}
        aoFechar={() => setAmpliada(null)}
        titulo={ampliada ? PAPEL[ampliada.papel] : "Foto"}
        descricao={
          ampliada
            ? `${ampliada.etapa === "inicio" ? "Antes" : "Depois"} · ${fmt.dataCurta(ampliada.capturada_em)}, ${fmt.horaMin(ampliada.capturada_em)} · ${legendaDeGps(ampliada, trecho)}`
            : undefined
        }
        largura="lg"
      >
        {ampliada ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/fotos/${ampliada.id}`}
            alt={`${PAPEL[ampliada.papel]}, ${fmt.horaMin(ampliada.capturada_em)}`}
            width={ampliada.largura_px}
            height={ampliada.altura_px}
            className="mx-auto block h-auto w-full rounded-md"
          />
        ) : null}
      </Modal>
    </>
  );
}
