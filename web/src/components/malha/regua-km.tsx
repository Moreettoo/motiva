"use client";

import { useRef, useState, type CSSProperties } from "react";
import Link from "next/link";

import { ChipRisco } from "@/components/ui/chip";
import { CLASSE_BALAO, LARGURA_BALAO } from "@/components/viz/dica-grafico";
import { useLargura } from "@/components/viz/usar-largura";
import { RISCO, rotuloPrazo, textoPrazo } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import type { Risco } from "@/lib/types";
import { clamp, cn } from "@/lib/utils";

export type SegmentoRegua = {
  id: number | string;
  kmInicio: number;
  kmFim: number;
  risco: Risco;
  /** Identifica o trecho no balão e no leitor de tela — normalmente rodovia + sentido. */
  rotulo: string;
  ocupacaoPct?: number | null;
  diasAteLimite?: number | null;
  /** Linha secundária do balão: espécie, tipo de pista, equipe… */
  detalhe?: string | null;
  href?: string;
};

export type AlturaRegua = "compacta" | "normal" | "detalhada";

const ALTURA_PX: Record<AlturaRegua, number> = {
  compacta: 28,
  normal: 44,
  detalhada: 72,
};

/** Passos de escala que um humano lê sem traduzir. */
const PASSOS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];

/** Só a marca maior (a cada 5 passos) recebe rótulo, então é ela que define a folga. */
const FOLGA_ENTRE_ROTULOS = 68;

function escolherPasso(extensaoKm: number, larguraPx: number): number {
  for (const passo of PASSOS) {
    if ((passo / extensaoKm) * larguraPx * 5 >= FOLGA_ENTRE_ROTULOS) return passo;
  }
  return PASSOS[PASSOS.length - 1];
}

type Marca = { km: number; maior: boolean };

function montarMarcas(kmInicio: number, kmFim: number, passo: number): Marca[] {
  const primeiro = Math.ceil(kmInicio / passo - 1e-9) * passo;
  const total = Math.floor((kmFim - primeiro) / passo + 1e-9);
  if (total < 0) return [];

  const marcas: Marca[] = [];
  // Acumular com `+=` derrapa em passo fracionário; multiplicar não derrapa.
  for (let i = 0; i <= Math.min(total, 600); i += 1) {
    const km = primeiro + i * passo;
    marcas.push({ km, maior: Math.round(km / passo) % 5 === 0 });
  }
  return marcas;
}

/**
 * A régua de quilômetro — a metáfora dominante do painel.
 *
 * Rodovia é uma linha reta, então a malha é desenhada como faixa graduada em km,
 * não como grade de cartões: é o que revela se os trechos críticos estão perto uns
 * dos outros, que é a informação que economiza deslocamento de equipe.
 *
 * Em HTML com posição percentual, não em SVG: assim cada segmento é um <button> ou
 * um <Link> de verdade, com foco nativo, ordem de tabulação e aria-label completo.
 */
export function ReguaKm({
  kmInicio,
  kmFim,
  segmentos,
  altura = "normal",
  aoSelecionar,
  selecionado = null,
  rotuloAcessivel,
  className,
}: {
  kmInicio: number;
  kmFim: number;
  segmentos: SegmentoRegua[];
  altura?: AlturaRegua;
  aoSelecionar?: (id: number | string) => void;
  selecionado?: number | string | null;
  rotuloAcessivel?: string;
  className?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const largura = useLargura(caixa);
  const [destacado, setDestacado] = useState<number | string | null>(null);

  const extensao = kmFim - kmInicio;
  if (!(extensao > 0)) return null;

  const alturaPx = ALTURA_PX[altura];
  // Cresce 2px para cada lado no hover, seja qual for a altura da régua.
  const escalaHover = (alturaPx + 4) / alturaPx;

  const posicao = (km: number) => ((km - kmInicio) / extensao) * 100;

  const visiveis = segmentos
    .filter((s) => s.kmFim > kmInicio && s.kmInicio < kmFim)
    .sort((a, b) => a.kmInicio - b.kmInicio);

  const passo = escolherPasso(extensao, largura);
  const marcas = montarMarcas(kmInicio, kmFim, passo);
  // Marca miúda demais vira borrão: abaixo de 5px só sobra a marca maior.
  const mostrarMenores = (passo / extensao) * largura >= 5;
  // Casas decimais fixas ao longo da régua: "1" ao lado de "0,5" quebra a coluna.
  const rotularKm = passo < 1 ? fmt.d1 : fmt.n;

  const emFoco = visiveis.find((s) => s.id === destacado) ?? null;
  const centroDica = emFoco
    ? ((emFoco.kmInicio + emFoco.kmFim) / 2 - kmInicio) / extensao * largura
    : 0;

  return (
    <div ref={caixa} className={cn("relative w-full", className)}>
      <div className="relative w-full">
        {emFoco ? (
          <div
            role="tooltip"
            className={cn("pointer-events-none absolute bottom-full z-30 mb-2", CLASSE_BALAO)}
            style={{
              width: LARGURA_BALAO,
              left:
                largura <= LARGURA_BALAO
                  ? largura / 2
                  : clamp(centroDica, LARGURA_BALAO / 2, largura - LARGURA_BALAO / 2),
              transform: "translateX(-50%)",
            }}
          >
            <p className="truncate text-sm font-medium text-ink">{emFoco.rotulo}</p>
            <p className="tnum mt-0.5 font-mono text-2xs text-ink-3">
              {fmt.faixaKm(emFoco.kmInicio, emFoco.kmFim)}
            </p>

            <div className="mt-2">
              <ChipRisco risco={emFoco.risco} tamanho="sm" />
            </div>

            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-2xs">
              <dt className="text-ink-3">Prazo</dt>
              <dd className="tnum text-right font-mono text-ink">
                {rotuloPrazo(emFoco.diasAteLimite)}
              </dd>

              <dt className="text-ink-3">Ocupação</dt>
              <dd className="tnum text-right font-mono text-ink">
                {emFoco.ocupacaoPct == null ? "—" : fmt.pct(emFoco.ocupacaoPct)}
              </dd>

              {emFoco.detalhe ? (
                <>
                  <dt className="text-ink-3">Espécie</dt>
                  <dd className="truncate text-right text-ink">{emFoco.detalhe}</dd>
                </>
              ) : null}
            </dl>
          </div>
        ) : null}

        {/* Leito da via. Fica nu nos vãos entre trechos monitorados — a ausência de
            dado precisa ser visível, não preenchida. */}
        <div
          role={rotuloAcessivel ? "group" : undefined}
          aria-label={rotuloAcessivel}
          className="relative w-full rounded-sm border border-border bg-surface-3"
          style={{ height: alturaPx }}
        >
          <span
            aria-hidden="true"
            className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, var(--border-strong) 0 10px, transparent 10px 22px)",
            }}
          />

          {visiveis.length === 0 ? (
            <p className="absolute inset-0 grid place-items-center text-2xs text-ink-3">
              Sem trechos monitorados nesta faixa
            </p>
          ) : null}

          {visiveis.map((s, i) => {
            const esquerda = clamp(posicao(s.kmInicio), 0, 100);
            const direita = clamp(posicao(s.kmFim), 0, 100);
            const cor = RISCO[s.risco].cor;

            const ocupacao = s.ocupacaoPct;
            const comMedidor = altura === "detalhada" && ocupacao != null;
            const excedido = comMedidor && (ocupacao as number) > 100;

            const ativo = s.id === selecionado;
            const sobre = s.id === destacado;

            const estilo: CSSProperties = {
              // Cascata limitada: numa rodovia com 30 trechos, o índice cru
              // empurraria a última entrada para depois de um segundo.
              "--i": Math.min(i, 12),
              // 2px de folga entre segmentos vizinhos, e piso de 3px para que um
              // trecho curto não desapareça numa malha longa.
              left: `calc(${esquerda}% + 1px)`,
              width: `max(3px, calc(${direita - esquerda}% - 2px))`,
              backgroundColor: comMedidor
                ? `color-mix(in oklab, ${cor} 38%, var(--surface-3))`
                : cor,
              // O contorno delimita o "tanque": sem ele, uma ocupação baixa deixa
              // o corpo diluído perto demais do leito e o trecho some.
              border: comMedidor ? `1px solid ${cor}` : undefined,
              transform: sobre ? `scaleY(${escalaHover})` : undefined,
              transformOrigin: "center",
              zIndex: sobre ? 20 : ativo ? 10 : undefined,
            } as CSSProperties;

            const rotuloCompleto = [
              s.rotulo,
              fmt.faixaKm(s.kmInicio, s.kmFim),
              `classificação de risco ${RISCO[s.risco].rotulo.toLowerCase()}`,
              textoPrazo(s.diasAteLimite),
              ocupacao == null ? null : `ocupação ${fmt.pct(ocupacao)}`,
            ]
              .filter(Boolean)
              .join(", ");

            const classe = cn(
              "fade absolute inset-y-0 block cursor-pointer rounded-sm",
              "transition-transform duration-200 ease-[var(--ease-out-quint)]",
            );

            const interior = (
              <>
                {comMedidor ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 rounded-sm"
                    style={
                      excedido
                        ? {
                            top: 0,
                            backgroundImage: `repeating-linear-gradient(45deg, ${cor} 0 4px, color-mix(in oklab, ${cor} 55%, var(--surface-3)) 4px 8px)`,
                          }
                        : {
                            height: `${clamp(ocupacao as number, 0, 100)}%`,
                            backgroundColor: cor,
                          }
                    }
                  />
                ) : null}

                {ativo ? (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-0.5 rounded-sm border-2"
                    style={{ borderColor: "var(--accent-line)" }}
                  />
                ) : null}
              </>
            );

            const eventos = {
              onMouseEnter: () => setDestacado(s.id),
              onMouseLeave: () => setDestacado((atual) => (atual === s.id ? null : atual)),
              onFocus: () => setDestacado(s.id),
              onBlur: () => setDestacado((atual) => (atual === s.id ? null : atual)),
            };

            if (aoSelecionar) {
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-label={rotuloCompleto}
                  aria-pressed={ativo}
                  className={classe}
                  style={estilo}
                  onClick={() => aoSelecionar(s.id)}
                  {...eventos}
                >
                  {interior}
                </button>
              );
            }

            if (s.href) {
              return (
                <Link
                  key={s.id}
                  href={s.href}
                  aria-label={rotuloCompleto}
                  aria-current={ativo ? "true" : undefined}
                  className={classe}
                  style={estilo}
                  {...eventos}
                >
                  {interior}
                </Link>
              );
            }

            return (
              <span
                key={s.id}
                role="img"
                aria-label={rotuloCompleto}
                className={cn(classe, "cursor-default")}
                style={estilo}
                onMouseEnter={eventos.onMouseEnter}
                onMouseLeave={eventos.onMouseLeave}
              >
                {interior}
              </span>
            );
          })}
        </div>
      </div>

      <div aria-hidden="true" className="relative mt-1 h-5 w-full">
        <span className="absolute inset-x-0 top-0 h-px bg-grid" />

        {marcas.map(({ km, maior }) => {
          if (!maior && !mostrarMenores) return null;

          const p = posicao(km);
          const alinhamento =
            p < 4 ? "translateX(0)" : p > 96 ? "translateX(-100%)" : "translateX(-50%)";

          return (
            <span key={km} className="absolute top-0" style={{ left: `${p}%` }}>
              <span
                className={cn("absolute top-0 left-0 w-px", maior ? "h-2 bg-axis" : "h-1 bg-grid")}
              />
              {maior ? (
                <span
                  className="tnum absolute top-2.5 left-0 font-mono text-2xs whitespace-nowrap text-ink-3"
                  style={{ transform: alinhamento }}
                >
                  {rotularKm(km)}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
