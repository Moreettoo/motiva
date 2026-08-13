"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { MapPinned } from "lucide-react";

import { ChipRisco } from "@/components/ui/chip";
import { EstadoVazio } from "@/components/ui/vazio";
import { CLASSE_BALAO, LARGURA_BALAO } from "@/components/viz/dica-grafico";
import { IconeDominio } from "@/components/viz/legenda";
import { useLargura } from "@/components/viz/usar-largura";
import {
  ORDEM_RISCO,
  RISCO,
  estadoDaAltura,
  ordemRisco,
  rotuloPrazo,
  textoPrazo,
} from "@/lib/dominio";
import { fmt } from "@/lib/format";
import type { Risco, TrechoStatus } from "@/lib/types";
import { clamp, cn, scale } from "@/lib/utils";

const RECUO = { topo: 14, direita: 14, base: 24, esquerda: 52 };
const PASSOS_GRAU = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];
const FOLGA_PARALELO = 56;
const FOLGA_MERIDIANO = 76;
/** Alvo de ponteiro maior que a marca (raio máximo de 9px). */
const ALVO = 28;

type Ponto = {
  id: number;
  x: number;
  y: number;
  raio: number;
  risco: Risco;
  trecho: TrechoStatus;
  rotuloDireto: string | null;
  rotuloX: number;
  rotuloAncora: "start" | "end";
};

function escolherPassoGrau(pixelsPorGrau: number, folga: number): number {
  for (const passo of PASSOS_GRAU) {
    if (passo * pixelsPorGrau >= folga) return passo;
  }
  return PASSOS_GRAU[PASSOS_GRAU.length - 1];
}

function graus(de: number, ate: number, passo: number): number[] {
  const primeiro = Math.ceil(de / passo - 1e-9) * passo;
  const total = Math.floor((ate - primeiro) / passo + 1e-9);
  if (total < 0) return [];

  const saida: number[] = [];
  for (let i = 0; i <= Math.min(total, 60); i += 1) saida.push(primeiro + i * passo);
  return saida;
}

/**
 * Dispersão geográfica da malha, em SVG puro.
 *
 * Sem biblioteca de mapa e sem tile externo de propósito: o painel precisa abrir
 * numa sala de operação sem internet. A projeção é equirretangular corrigida pelo
 * cosseno da latitude média — na escala de uma concessionária o erro é irrelevante
 * e o desenho não distorce distância leste-oeste.
 *
 * Os pontos são desenhados em SVG mas o alvo de interação é uma camada de <button>
 * (ou <Link>) em HTML por cima: foco de teclado, ordem de tabulação e aria-label
 * de verdade, sem inventar `role` em elemento gráfico.
 */
export function MapaMalha({
  trechos,
  selecionado = null,
  aoSelecionar,
  altura = 420,
  className,
}: {
  trechos: TrechoStatus[];
  selecionado?: number | null;
  aoSelecionar?: (id: number) => void;
  altura?: number;
  className?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const largura = useLargura(caixa);
  const [destacado, setDestacado] = useState<number | null>(null);

  const alturaPx = Math.max(altura, 240);

  const mapa = useMemo(() => {
    const validos = trechos.filter(
      (t) => Number.isFinite(Number(t.latitude)) && Number.isFinite(Number(t.longitude)),
    );
    if (validos.length === 0) return null;

    const lats = validos.map((t) => Number(t.latitude));
    const lons = validos.map((t) => Number(t.longitude));

    const latMedia = (Math.min(...lats) + Math.max(...lats)) / 2;
    const k = Math.max(Math.cos((latMedia * Math.PI) / 180), 0.1);

    const xs = lons.map((lon) => lon * k);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...lats);
    const maxY = Math.max(...lats);

    const larguraPlot = Math.max(largura - RECUO.esquerda - RECUO.direita, 10);
    const alturaPlot = Math.max(alturaPx - RECUO.topo - RECUO.base, 10);

    // Piso no intervalo para não estourar a escala quando a malha é quase pontual.
    const dx = Math.max(maxX - minX, 0.02);
    const dy = Math.max(maxY - minY, 0.02);
    // 0.9 deixa respiro para o raio do ponto e para o rótulo direto.
    const esc = Math.min(larguraPlot / dx, alturaPlot / dy) * 0.9;

    const centroX = (minX + maxX) / 2;
    const centroY = (minY + maxY) / 2;
    const meioPlotX = RECUO.esquerda + larguraPlot / 2;
    const meioPlotY = RECUO.topo + alturaPlot / 2;

    const projetar = (lat: number, lon: number) => ({
      x: meioPlotX + (lon * k - centroX) * esc,
      y: meioPlotY - (lat - centroY) * esc,
    });

    const extensoes = validos.map((t) => Number(t.extensao_km) || 0);
    const minExt = Math.min(...extensoes);
    const maxExt = Math.max(...extensoes);
    const raioDe = (ext: number) =>
      maxExt - minExt < 0.01 ? 7 : scale(ext, [minExt, maxExt], [5, 9]);

    // Crítico por último para ficar por cima na pilha de desenho.
    const ordenados = [...validos].sort((a, b) => ordemRisco(b.risco) - ordemRisco(a.risco));

    const ocupadas: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const cabe = (x1: number, y1: number, x2: number, y2: number) =>
      !ocupadas.some((r) => !(x2 < r.x1 || x1 > r.x2 || y2 < r.y1 || y1 > r.y2));

    const pontos: Ponto[] = ordenados.map((t) => {
      const { x, y } = projetar(Number(t.latitude), Number(t.longitude));
      const raio = raioDe(Number(t.extensao_km) || 0);
      ocupadas.push({ x1: x - raio - 2, y1: y - raio - 2, x2: x + raio + 2, y2: y + raio + 2 });
      return {
        id: t.id,
        x,
        y,
        raio,
        risco: t.risco,
        trecho: t,
        rotuloDireto: null,
        rotuloX: x,
        rotuloAncora: "start" as const,
      };
    });

    // Rótulo direto só quando são poucos pontos e sobra espaço — nunca um número
    // em cima de toda marca.
    if (pontos.length <= 12) {
      // Por urgência, não por ordem de desenho: quando dois pontos disputam o
      // mesmo espaço, quem fica com o rótulo é o trecho mais crítico.
      const disputa = [...pontos].sort((a, b) => ordemRisco(a.risco) - ordemRisco(b.risco));
      for (const p of disputa) {
        const texto = p.trecho.rodovia;
        const w = texto.length * 5.9 + 8;
        // 9px afasta o rótulo também do anel de seleção (raio + 5, traço de 2).
        const direita = p.x + p.raio + 9;
        const paraDireita = direita + w <= largura - RECUO.direita;
        const x1 = paraDireita ? direita : p.x - p.raio - 9 - w;
        const x2 = x1 + w;

        if (x1 < RECUO.esquerda) continue;
        if (!cabe(x1, p.y - 7, x2, p.y + 7)) continue;

        ocupadas.push({ x1, y1: p.y - 7, x2, y2: p.y + 7 });
        p.rotuloDireto = texto;
        p.rotuloX = paraDireita ? direita : p.x - p.raio - 9;
        p.rotuloAncora = paraDireita ? "start" : "end";
      }
    }

    const latMin = centroY - alturaPlot / 2 / esc;
    const latMax = centroY + alturaPlot / 2 / esc;
    const lonMin = (centroX - larguraPlot / 2 / esc) / k;
    const lonMax = (centroX + larguraPlot / 2 / esc) / k;

    const paralelos = graus(latMin, latMax, escolherPassoGrau(esc, FOLGA_PARALELO)).map((lat) => ({
      lat,
      y: projetar(lat, lonMin).y,
    }));
    const meridianos = graus(lonMin, lonMax, escolherPassoGrau(esc * k, FOLGA_MERIDIANO)).map(
      (lon) => ({ lon, x: projetar(latMin, lon).x }),
    );

    return { pontos, paralelos, meridianos, larguraPlot, alturaPlot };
  }, [trechos, largura, alturaPx]);

  const contagem = useMemo(() => {
    const base: Record<Risco, number> = { critica: 0, alta: 0, media: 0, baixa: 0 };
    for (const t of trechos) base[t.risco] += 1;
    return base;
  }, [trechos]);

  if (!mapa) {
    return (
      <EstadoVazio
        className={className}
        icone={<MapPinned />}
        titulo="Nenhum trecho com coordenada"
        descricao="A dispersão geográfica aparece assim que os trechos tiverem latitude e longitude preenchidas."
      />
    );
  }

  const { pontos, paralelos, meridianos } = mapa;
  const emFoco = pontos.find((p) => p.id === destacado) ?? null;
  const alturaEmFoco = emFoco
    ? estadoDaAltura(emFoco.trecho.altura_atual_cm, emFoco.trecho.altura_limite_cm)
    : null;

  // O desenho empilha o crítico por último; a tabulação faz o contrário, para
  // que a primeira parada de teclado seja o trecho mais urgente.
  const porUrgencia = [...pontos].sort((a, b) => ordemRisco(a.risco) - ordemRisco(b.risco));

  let estiloDica: CSSProperties = {};
  if (emFoco) {
    const acima = emFoco.y - emFoco.raio - 12 > 120;
    estiloDica = {
      width: LARGURA_BALAO,
      left:
        largura <= LARGURA_BALAO
          ? largura / 2
          : clamp(emFoco.x, LARGURA_BALAO / 2, largura - LARGURA_BALAO / 2),
      top: acima ? emFoco.y - emFoco.raio - 12 : emFoco.y + emFoco.raio + 12,
      transform: acima ? "translate(-50%, -100%)" : "translate(-50%, 0)",
    };
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div
        ref={caixa}
        className="relative w-full overflow-hidden rounded-lg border border-border bg-surface"
        style={{ height: alturaPx }}
      >
        <svg
          aria-hidden="true"
          focusable="false"
          width={largura}
          height={alturaPx}
          viewBox={`0 0 ${largura} ${alturaPx}`}
          className="block"
        >
          <g shapeRendering="crispEdges">
            {paralelos.map(({ lat, y }) => (
              <g key={`p-${lat}`}>
                <line
                  x1={RECUO.esquerda}
                  x2={largura - RECUO.direita}
                  y1={y}
                  y2={y}
                  className="stroke-grid"
                  strokeWidth={1}
                />
                <text
                  x={RECUO.esquerda - 6}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-ink-3 font-mono text-2xs"
                  shapeRendering="auto"
                >
                  {fmt.d1(lat)}°
                </text>
              </g>
            ))}

            {meridianos.map(({ lon, x }) => (
              <g key={`m-${lon}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={RECUO.topo}
                  y2={alturaPx - RECUO.base}
                  className="stroke-grid"
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={alturaPx - RECUO.base + 14}
                  textAnchor="middle"
                  className="fill-ink-3 font-mono text-2xs"
                  shapeRendering="auto"
                >
                  {fmt.d1(lon)}°
                </text>
              </g>
            ))}

            <rect
              x={RECUO.esquerda}
              y={RECUO.topo}
              width={Math.max(largura - RECUO.esquerda - RECUO.direita, 0)}
              height={Math.max(alturaPx - RECUO.topo - RECUO.base, 0)}
              fill="none"
              className="stroke-axis"
              strokeWidth={1}
            />
          </g>

          {pontos.map((p, i) => {
            const cor = RISCO[p.risco].cor;
            const ativo = p.id === selecionado;
            const sobre = p.id === destacado;

            return (
              <g key={p.id} className="fade" style={{ "--i": Math.min(i, 14) } as CSSProperties}>
                {/* Pulso só no que é crítico: o movimento é o canal mais caro da tela. */}
                {p.risco === "critica" ? (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={p.raio}
                    fill="none"
                    strokeWidth={2}
                    style={{
                      stroke: cor,
                      transformBox: "fill-box",
                      transformOrigin: "center",
                      // Defasagem em ciclo curto: os críticos são desenhados por
                      // último, e o índice cru atrasaria o pulso em vários segundos.
                      animation: `pulse-ring 2.4s var(--ease-out-quint) ${(i % 4) * 260}ms infinite`,
                    }}
                  />
                ) : null}

                {/* Segundo canal, estático: os 4 passos de status ficam abaixo de 3:1 entre si
                    (serious×warning = 1,44:1) e o mapa é forma de todos-os-pares. O anel escuro
                    separa o que precisa de equipe do que espera — e, ao contrário do pulso,
                    sobrevive a prefers-reduced-motion. */}
                {p.risco === "critica" || p.risco === "alta" ? (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={p.raio + 3}
                    fill="none"
                    className="stroke-ink"
                    strokeWidth={1.5}
                    strokeDasharray={p.risco === "alta" ? "2 2.5" : undefined}
                  />
                ) : null}

                {ativo ? (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={p.raio + 5}
                    fill="none"
                    className="stroke-accent-line"
                    strokeWidth={2}
                  />
                ) : null}

                {/* Anel na cor da superfície: pontos sobrepostos continuam separáveis. */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={sobre ? p.raio + 2 : p.raio}
                  className="stroke-surface"
                  strokeWidth={2}
                  style={{ fill: cor }}
                />

                {p.rotuloDireto ? (
                  <text
                    x={p.rotuloX}
                    y={p.y}
                    textAnchor={p.rotuloAncora}
                    dominantBaseline="middle"
                    className="fill-ink-2 text-2xs"
                  >
                    {p.rotuloDireto}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>

        {/* Camada de interação: <button> ou <Link> de verdade sobre cada marca. */}
        <div className="absolute inset-0">
          {porUrgencia.map((p) => {
            const t = p.trecho;
            const rotulo = [
              t.sentido ? `${t.rodovia} sentido ${t.sentido}` : t.rodovia,
              fmt.faixaKm(Number(t.km_inicio), Number(t.km_fim)),
              t.uf,
              `classificação de risco ${RISCO[p.risco].rotulo.toLowerCase()}`,
              textoPrazo(t.dias_ate_limite),
            ].join(", ");

            const estilo: CSSProperties = {
              left: p.x,
              top: p.y,
              width: ALVO,
              height: ALVO,
            };
            const classe =
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full outline-offset-2";

            const eventos = {
              onMouseEnter: () => setDestacado(p.id),
              onMouseLeave: () => setDestacado((atual) => (atual === p.id ? null : atual)),
              onFocus: () => setDestacado(p.id),
              onBlur: () => setDestacado((atual) => (atual === p.id ? null : atual)),
            };

            if (aoSelecionar) {
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-label={rotulo}
                  aria-pressed={p.id === selecionado}
                  className={classe}
                  style={estilo}
                  onClick={() => aoSelecionar(p.id)}
                  {...eventos}
                />
              );
            }

            return (
              <Link
                key={p.id}
                href={`/trechos/${p.id}`}
                aria-label={rotulo}
                aria-current={p.id === selecionado ? "true" : undefined}
                className={classe}
                style={estilo}
                {...eventos}
              />
            );
          })}
        </div>

        {emFoco ? (
          <div
            role="tooltip"
            className={cn("pointer-events-none absolute z-30", CLASSE_BALAO)}
            style={estiloDica}
          >
            <p className="truncate text-sm font-medium text-ink">
              {emFoco.trecho.sentido
                ? `${emFoco.trecho.rodovia} · ${emFoco.trecho.sentido}`
                : emFoco.trecho.rodovia}
            </p>
            <p className="tnum mt-0.5 font-mono text-2xs text-ink-3">
              {fmt.faixaKm(Number(emFoco.trecho.km_inicio), Number(emFoco.trecho.km_fim))} ·{" "}
              {emFoco.trecho.uf}
            </p>

            <div className="mt-2">
              <ChipRisco risco={emFoco.risco} tamanho="sm" />
            </div>

            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-2xs">
              <dt className="text-ink-3">Prazo</dt>
              <dd className="tnum text-right font-mono text-ink">
                {rotuloPrazo(emFoco.trecho.dias_ate_limite)}
              </dd>

              {/* Mesma leitura do balão da régua: altura contra limite, não o
                  percentual — o limite muda de trecho para trecho. */}
              <dt className="text-ink-3">Altura</dt>
              <dd className="tnum flex items-center justify-end gap-1 text-right font-mono text-ink">
                {alturaEmFoco == null ? (
                  "—"
                ) : (
                  <>
                    {alturaEmFoco.excedido ? (
                      <span
                        className="inline-flex shrink-0"
                        style={{ color: alturaEmFoco.token.tinta }}
                      >
                        <IconeDominio nome={alturaEmFoco.token.icone} className="size-3" />
                      </span>
                    ) : null}
                    {fmt.d1(alturaEmFoco.alturaCm)} / {fmt.cm(alturaEmFoco.limiteCm)}
                  </>
                )}
              </dd>

              <dt className="text-ink-3">Coordenada</dt>
              <dd className="tnum truncate text-right font-mono text-ink">
                {fmt.d3(Number(emFoco.trecho.latitude))}, {fmt.d3(Number(emFoco.trecho.longitude))}
              </dd>
            </dl>
          </div>
        ) : null}
      </div>

      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {ORDEM_RISCO.map((risco) => (
          <li key={risco} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full ring-2 ring-surface"
              style={{
                backgroundColor: RISCO[risco].cor,
                outline:
                  risco === "critica"
                    ? "1.5px solid var(--ink)"
                    : risco === "alta"
                      ? "1.5px dashed var(--ink)"
                      : undefined,
                outlineOffset: "2px",
              }}
            />
            <ChipRisco risco={risco} tamanho="sm" />
            <span className="tnum font-mono text-2xs text-ink-3">{fmt.n(contagem[risco])}</span>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-2xs text-ink-3">
        {pontos.length} {pontos.length === 1 ? "trecho posicionado" : "trechos posicionados"} · raio
        proporcional à extensão em&nbsp;km · contorno escuro nos trechos que precisam de equipe
      </p>
    </div>
  );
}
