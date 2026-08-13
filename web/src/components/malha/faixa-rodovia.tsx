import type { CSSProperties } from "react";
import { OctagonAlert } from "lucide-react";
import Link from "next/link";

import { Chip, ChipRisco } from "@/components/ui/chip";
import { ESPECIE } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import type { Risco, TrechoStatus, UF } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ReguaKm, type AlturaRegua, type SegmentoRegua } from "./regua-km";

/**
 * Uma rodovia da malha: cabeçalho de leitura + a régua de km logo abaixo.
 *
 * Sem cartão: a separação é por hairline. Dezenas destas linhas empilhadas com
 * moldura própria viram ruído e o gestor perde qual delas está viva.
 */
export function FaixaRodovia({
  rodovia,
  uf,
  extensao,
  criticos,
  piorRisco,
  trechos,
  selecionado = null,
  aoSelecionar,
  altura = "normal",
  href,
  indice = 0,
  className,
}: {
  rodovia: string;
  uf: UF;
  extensao: number;
  criticos: number;
  piorRisco: Risco;
  trechos: TrechoStatus[];
  selecionado?: number | null;
  aoSelecionar?: (id: number) => void;
  altura?: AlturaRegua;
  href?: string;
  indice?: number;
  className?: string;
}) {
  const kms = trechos.flatMap((t) => [Number(t.km_inicio), Number(t.km_fim)]);
  const kmInicio = kms.length ? Math.min(...kms) : 0;
  const kmFim = kms.length ? Math.max(...kms) : Math.max(extensao, 1);

  // Uma folga de 2% em cada ponta impede que o primeiro e o último trecho
  // encostem na borda do leito e pareçam cortados.
  const folga = Math.max((kmFim - kmInicio) * 0.02, 0.1);

  const segmentos: SegmentoRegua[] = trechos.map((t) => ({
    id: t.id,
    kmInicio: Number(t.km_inicio),
    kmFim: Number(t.km_fim),
    risco: t.risco,
    rotulo: t.sentido ? `${t.rodovia} · ${t.sentido}` : t.rodovia,
    // `numeric` do Postgres chega como string pelo PostgREST; a régua faz conta com isso.
    alturaCm: t.altura_atual_cm == null ? null : Number(t.altura_atual_cm),
    limiteCm: Number(t.altura_limite_cm),
    diasAteLimite: t.dias_ate_limite,
    detalhe: ESPECIE[t.especie]?.rotulo ?? null,
    href: `/trechos/${t.id}`,
  }));

  const ativa = selecionado != null && trechos.some((t) => t.id === selecionado);
  const total = trechos.length;

  const cabecalho = (
    <>
      <span className="truncate text-base font-medium text-ink">{rodovia}</span>
      <Chip tom="neutro">{uf}</Chip>
    </>
  );

  return (
    <div
      className={cn(
        "rise relative border-b border-border py-4 pl-4 last:border-b-0",
        className,
      )}
      style={{ "--i": indice } as CSSProperties}
    >
      {/* Filete de acento: marca a rodovia que contém o trecho selecionado. */}
      {ativa ? (
        <span
          aria-hidden="true"
          className="absolute top-4 bottom-4 left-0 w-0.5 rounded-sm bg-accent-line"
        />
      ) : null}

      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="flex min-w-0 items-center gap-2">
          {href ? (
            <Link
              href={href}
              className="group inline-flex min-w-0 items-center gap-2 rounded-sm transition-colors duration-150 ease-[var(--ease-out-quint)] hover:text-accent"
            >
              {cabecalho}
            </Link>
          ) : (
            <span className="inline-flex min-w-0 items-center gap-2">{cabecalho}</span>
          )}
        </h3>

        <span className="tnum font-mono text-xs text-ink-3">{fmt.km(extensao)}</span>

        <span className="text-xs text-ink-3">
          {total} {total === 1 ? "trecho" : "trechos"}
        </span>

        {criticos > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-critical-ink">
            <OctagonAlert aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="tnum">
              {criticos} {criticos === 1 ? "crítico" : "críticos"}
            </span>
          </span>
        ) : null}

        <span className="ml-auto shrink-0">
          <ChipRisco risco={piorRisco} tamanho="sm" />
        </span>
      </header>

      <ReguaKm
        kmInicio={kmInicio - folga}
        kmFim={kmFim + folga}
        segmentos={segmentos}
        altura={altura}
        selecionado={selecionado}
        aoSelecionar={aoSelecionar ? (id) => aoSelecionar(Number(id)) : undefined}
        rotuloAcessivel={`Trechos monitorados da ${rodovia}`}
      />
    </div>
  );
}
