import { MapPin, Sprout } from "lucide-react";

import { Chip, ChipRisco } from "@/components/ui/chip";
import { Dica } from "@/components/ui/dica";
import { IconeDominio } from "@/components/viz/legenda";
import { ESPECIE, TIPO_PISTA_ICONE } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import type { TrechoStatus } from "@/lib/types";

function Separador() {
  return <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />;
}

/**
 * Identidade do trecho, a linha que responde "qual pedaço de rodovia é este".
 *
 * Faixa de km, coordenada e tudo que se lê como instrumento vem em monoespaçado;
 * a separação é por hairline, não por espaço vazio.
 */
export function FaixaIdentidade({ trecho }: { trecho: TrechoStatus }) {
  const especie = ESPECIE[trecho.especie];
  const tipoPista = trecho.tipo_pista?.trim() || null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-border bg-surface px-4 py-3">
      <span className="tnum shrink-0 font-mono text-base text-ink">
        {fmt.faixaKm(Number(trecho.km_inicio), Number(trecho.km_fim))}
      </span>

      <Separador />

      <ChipRisco risco={trecho.risco} />
      <Chip tom="neutro">{trecho.uf}</Chip>

      {trecho.sentido ? (
        <span className="min-w-0 truncate text-xs text-ink-2">Sentido {trecho.sentido}</span>
      ) : null}

      {tipoPista ? (
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-ink-2">
          <IconeDominio nome={TIPO_PISTA_ICONE[tipoPista]} className="text-ink-3" />
          <span className="truncate">Pista em {tipoPista}</span>
        </span>
      ) : null}

      <Dica
        lado="baixo"
        conteudo={
          <span className="block">
            <span className="block font-medium italic">{especie.nomeCientifico}</span>
            <span className="mt-0.5 block">{especie.nota}</span>
          </span>
        }
      >
        <span
          tabIndex={0}
          className="inline-flex min-w-0 items-center gap-1.5 rounded-sm text-xs text-ink-2"
        >
          <Sprout aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
          <span className="truncate">{especie.rotulo}</span>
          <span className="truncate text-ink-3 italic">{especie.nomeCientifico}</span>
        </span>
      </Dica>

      <span className="tnum ml-auto inline-flex shrink-0 items-center gap-1.5 font-mono text-xs text-ink-3">
        <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
        lat <span className="text-ink-2">{fmt.d3(Number(trecho.latitude))}</span>
        <span aria-hidden="true">·</span>
        lon <span className="text-ink-2">{fmt.d3(Number(trecho.longitude))}</span>
      </span>
    </div>
  );
}
