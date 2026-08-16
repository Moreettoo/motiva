"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { ChartLine } from "lucide-react";

import {
  Tabela,
  TabelaCabecalho,
  TabelaCelula,
  TabelaCorpo,
  TabelaLinha,
  TabelaTitulo,
} from "@/components/ui/tabela";
import { EstadoVazio } from "@/components/ui/vazio";
import { fmt, parseData } from "@/lib/format";
import { clamp } from "@/lib/utils";

import { DicaGrafico, DicaLinha, DicaTitulo } from "./dica-grafico";
import {
  almofadaDominio,
  caminhoArea,
  caminhoLinha,
  comprimentoLinha,
  dominioComTicks,
  escalaLinear,
  extensao,
  ticksAgradaveis,
  type Ponto,
} from "./escalas";
import { Legenda } from "./legenda";
import { EixoX, EixoY, MolduraGrafico, type Margens } from "./moldura";

export type PontoSerie = { x: number | string; y: number };

export type SerieLinha = {
  chave: string;
  rotulo: string;
  /** Cor da ENTIDADE, fixada pelo chamador. Filtrar séries não pode repintar as que ficam. */
  cor: string;
  pontos: PontoSerie[];
};

/** Largura média de caractere nas fontes Geist no corpo 11px, só para reservar margem. */
const LARGURA_CARACTERE = 6.3;
const LARGURA_MINIMA_ROTULO_DIRETO = 480;

export function GraficoLinha({
  series,
  tipoX = "data",
  linhaLimite,
  formatarY = fmt.d1,
  formatarX,
  unidadeY,
  altura = 260,
  area = false,
  titulo,
  descricao,
  className,
}: {
  series: SerieLinha[];
  tipoX?: "data" | "numero";
  /** Limite de altura do trecho: tracejado em `--critical`, sempre com rótulo. */
  linhaLimite?: { valor: number; rotulo: string };
  formatarY?: (v: number) => string;
  formatarX?: (v: number) => string;
  unidadeY?: string;
  altura?: number;
  area?: boolean;
  titulo: string;
  descricao?: string;
  className?: string;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);

  const rotularX = formatarX ?? (tipoX === "data" ? (v: number) => fmt.dataCurta(new Date(v)) : fmt.d1);
  const valorLimite = linhaLimite?.valor;

  const modelo = useMemo(() => {
    // Quatro é o teto validado de séries adjacentes; a quinta não vira cor nova.
    const usadas = series.slice(0, 4);

    const paraNumero = (x: number | string) =>
      tipoX === "data" && typeof x === "string" ? parseData(x).getTime() : Number(x);

    const mapas = usadas.map((s) => {
      const mapa = new Map<number, number>();
      for (const p of s.pontos) {
        const vx = paraNumero(p.x);
        if (Number.isFinite(vx) && Number.isFinite(p.y)) mapa.set(vx, p.y);
      }
      return mapa;
    });

    const eixo = [...new Set(mapas.flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);

    const todosY = mapas.flatMap((m) => [...m.values()]);
    if (valorLimite != null) todosY.push(valorLimite);

    return { usadas, mapas, eixo, todosY };
  }, [series, tipoX, valorLimite]);

  const { usadas, mapas, eixo, todosY } = modelo;

  const topo = unidadeY ? 24 : 14;
  const baixo = 26;
  const alturaPlot = Math.max(1, altura - topo - baixo);

  // Altura de vegetação não é negativa: a almofada nunca inventa um piso abaixo de zero.
  const [minAlvo, maxAlvo] = almofadaDominio(todosY, { naoNegativo: true });

  const ticksY = ticksAgradaveis(minAlvo, maxAlvo, clamp(Math.round(alturaPlot / 46), 2, 6));
  const dominioY = dominioComTicks([minAlvo, maxAlvo], ticksY);

  const rotulosY = ticksY.map(formatarY);
  const esquerda = clamp(
    Math.ceil(Math.max(0, ...rotulosY.map((r) => r.length)) * LARGURA_CARACTERE) + 14,
    34,
    76,
  );

  const maiorRotuloSerie = Math.max(0, ...usadas.map((s) => s.rotulo.length));
  const direitaComRotulo = clamp(Math.ceil(maiorRotuloSerie * LARGURA_CARACTERE) + 14, 48, 116);

  const margens = (largura: number): Margens => ({
    topo,
    direita: largura >= LARGURA_MINIMA_ROTULO_DIRETO ? direitaComRotulo : 14,
    baixo,
    esquerda,
  });

  const itensLegenda = usadas.map((s) => ({ rotulo: s.rotulo, cor: s.cor }));
  const unidade = unidadeY ? ` ${unidadeY}` : "";

  const tabela = (
    <Tabela rotulo={titulo} className="max-h-72">
      <TabelaCabecalho>
        <tr>
          <TabelaTitulo>{tipoX === "data" ? "Data" : "Posição"}</TabelaTitulo>
          {usadas.map((s) => (
            <TabelaTitulo key={s.chave} numerica>
              {s.rotulo}
            </TabelaTitulo>
          ))}
        </tr>
      </TabelaCabecalho>
      <TabelaCorpo>
        {eixo.map((vx) => (
          <TabelaLinha key={vx}>
            <TabelaCelula className="font-mono whitespace-nowrap tnum">{rotularX(vx)}</TabelaCelula>
            {usadas.map((s, i) => {
              const v = mapas[i].get(vx);
              return (
                <TabelaCelula key={s.chave} numerica className="font-mono">
                  {v == null ? "—" : formatarY(v)}
                </TabelaCelula>
              );
            })}
          </TabelaLinha>
        ))}
      </TabelaCorpo>
    </Tabela>
  );

  const semDados = usadas.length === 0 || eixo.length === 0;

  return (
    <MolduraGrafico
      titulo={titulo}
      descricao={descricao}
      altura={altura}
      margens={margens}
      className={className}
      legenda={usadas.length >= 2 ? <Legenda itens={itensLegenda} /> : undefined}
      tabela={tabela}
      vazio={
        semDados ? (
          <EstadoVazio
            icone={<ChartLine />}
            titulo="Sem série para desenhar"
            descricao="Nenhuma medição ou previsão chegou para este recorte. Amplie o período ou revise os filtros."
          />
        ) : undefined
      }
      sobreposicao={({ dentro }) => {
        const escalaX = escalaLinear({
          dominio: extensao(eixo),
          alcance: [dentro.x, dentro.x + dentro.largura],
        });
        const escalaY = escalaLinear({
          dominio: dominioY,
          alcance: [dentro.y + dentro.altura, dentro.y],
        });

        const vx = ativo == null ? null : eixo[ativo];
        if (vx == null) return null;

        const leituras = usadas
          .map((s, i) => ({ serie: s, valor: mapas[i].get(vx) }))
          .filter((l): l is { serie: SerieLinha; valor: number } => l.valor != null);

        const topoBalao = leituras.length
          ? Math.min(...leituras.map((l) => escalaY(l.valor)))
          : dentro.y + dentro.altura / 2;

        return (
          <DicaGrafico x={escalaX(vx)} y={topoBalao} visivel>
            <DicaTitulo>{rotularX(vx)}</DicaTitulo>
            <div className="space-y-1">
              {leituras.map((l) => (
                <DicaLinha
                  key={l.serie.chave}
                  cor={l.serie.cor}
                  rotulo={l.serie.rotulo}
                  valor={`${formatarY(l.valor)}${unidade}`}
                />
              ))}
              {leituras.length === 0 ? (
                <p className="text-ink-3">Sem leitura nesta data.</p>
              ) : null}
            </div>
          </DicaGrafico>
        );
      }}
    >
      {({ largura, dentro }) => {
        const escalaX = escalaLinear({
          dominio: extensao(eixo),
          alcance: [dentro.x, dentro.x + dentro.largura],
        });
        const escalaY = escalaLinear({
          dominio: dominioY,
          alcance: [dentro.y + dentro.altura, dentro.y],
        });

        const base = dentro.y + dentro.altura;
        const comRotuloDireto = largura >= LARGURA_MINIMA_ROTULO_DIRETO;
        const maxCaracteres = Math.max(3, Math.floor((direitaComRotulo - 12) / LARGURA_CARACTERE));

        const tracados = usadas.map((s, i) => {
          const coordenadas: Ponto[] = eixo
            .filter((vx) => mapas[i].has(vx))
            .map((vx) => [escalaX(vx), escalaY(mapas[i].get(vx) as number)]);
          return { serie: s, coordenadas };
        });

        // Rótulo direto só quando as pontas se separam. Empilhar rótulo que
        // colide descola o texto da linha e vira ruído, nesse caso a legenda resolve.
        const pontas = tracados
          .filter((t) => t.coordenadas.length > 0)
          .map((t) => ({
            chave: t.serie.chave,
            rotulo: t.serie.rotulo,
            y: t.coordenadas[t.coordenadas.length - 1][1],
          }))
          .sort((a, b) => a.y - b.y);

        const pontasSeparadas = pontas.every(
          (p, i) => i === 0 || p.y - pontas[i - 1].y >= 14,
        );

        const qtdMarcasX = clamp(Math.floor(dentro.largura / 78), 2, 7);
        const totalMarcas = Math.min(qtdMarcasX, eixo.length);
        const indicesX =
          totalMarcas <= 1
            ? [0]
            : [
                ...new Set(
                  Array.from({ length: totalMarcas }, (_, k) =>
                    Math.round((k * (eixo.length - 1)) / (totalMarcas - 1)),
                  ),
                ),
              ];

        const yLimite = linhaLimite ? escalaY(linhaLimite.valor) : null;
        const rotuloLimiteAcima = yLimite != null && yLimite - 6 > dentro.y + 10;

        return (
          <>
            <EixoY ticks={ticksY} escala={escalaY} dentro={dentro} formatar={formatarY} />

            {unidadeY ? (
              <text
                x={2}
                y={dentro.y - 8}
                className="fill-ink-3 text-2xs font-medium tracking-wider uppercase"
              >
                {unidadeY}
              </text>
            ) : null}

            {area
              ? tracados.map(({ serie, coordenadas }) => (
                  <path
                    key={`area-${serie.chave}`}
                    d={caminhoArea(coordenadas, base)}
                    style={{ fill: serie.cor }}
                    fillOpacity="0.1"
                    className="fade"
                  />
                ))
              : null}

            {yLimite != null && linhaLimite ? (
              <g>
                <line
                  x1={dentro.x}
                  y1={yLimite}
                  x2={dentro.x + dentro.largura}
                  y2={yLimite}
                  className="stroke-critical"
                  strokeWidth="2"
                  strokeDasharray="5 4"
                  strokeLinecap="round"
                />
                <text
                  x={dentro.x + 4}
                  y={rotuloLimiteAcima ? yLimite - 6 : yLimite + 14}
                  className="fill-critical-ink text-2xs font-medium"
                >
                  {linhaLimite.rotulo}
                </text>
              </g>
            ) : null}

            {tracados.map(({ serie, coordenadas }) => {
              const d = caminhoLinha(coordenadas);
              const estilo = {
                "--dash": comprimentoLinha(coordenadas),
                stroke: serie.cor,
              } as CSSProperties;

              return (
                <path
                  key={serie.chave}
                  d={d}
                  fill="none"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="draw"
                  style={estilo}
                />
              );
            })}

            {/* Ponto só nas pontas, marcar todo vértice transforma a linha em colar. */}
            {tracados.map(({ serie, coordenadas }) => {
              if (coordenadas.length === 0) return null;
              const extremos =
                coordenadas.length === 1
                  ? coordenadas
                  : [coordenadas[0], coordenadas[coordenadas.length - 1]];

              return (
                <g key={`ponta-${serie.chave}`} className="fade">
                  {extremos.map(([cx, cy], i) => (
                    <circle
                      key={i}
                      cx={cx}
                      cy={cy}
                      r="4"
                      style={{ fill: serie.cor }}
                      className="stroke-surface"
                      strokeWidth="2"
                    />
                  ))}
                </g>
              );
            })}

            {comRotuloDireto && pontasSeparadas
              ? pontas.map((p) => (
                  <text
                    key={`rotulo-${p.chave}`}
                    x={dentro.x + dentro.largura + 10}
                    y={p.y}
                    dominantBaseline="middle"
                    className="fill-ink-2 text-2xs"
                  >
                    {p.rotulo.length > maxCaracteres
                      ? `${p.rotulo.slice(0, maxCaracteres - 1)}…`
                      : p.rotulo}
                  </text>
                ))
              : null}

            <EixoX
              dentro={dentro}
              marcas={indicesX.map((i) => ({ posicao: escalaX(eixo[i]), rotulo: rotularX(eixo[i]) }))}
            />

            {/* Crosshair: o leitor mira uma data, nunca um traço de 2px. */}
            {ativo != null && eixo[ativo] != null ? (
              <g aria-hidden="true">
                <line
                  x1={escalaX(eixo[ativo])}
                  y1={dentro.y}
                  x2={escalaX(eixo[ativo])}
                  y2={base}
                  className="stroke-axis"
                  strokeWidth="1"
                  shapeRendering="crispEdges"
                />
                {usadas.map((s, i) => {
                  const v = mapas[i].get(eixo[ativo]);
                  if (v == null) return null;
                  return (
                    <circle
                      key={s.chave}
                      cx={escalaX(eixo[ativo])}
                      cy={escalaY(v)}
                      r="4.5"
                      style={{ fill: s.cor }}
                      className="stroke-surface"
                      strokeWidth="2"
                    />
                  );
                })}
              </g>
            ) : null}

            {/* Alvo de hover = a faixa inteira em volta do ponto, não a linha.
                Também é o caminho de teclado: o `aria-label` traz todas as séries. */}
            <g onPointerLeave={() => setAtivo(null)}>
              {eixo.map((vx, i) => {
                const px = escalaX(vx);
                const inicio = i === 0 ? dentro.x : (escalaX(eixo[i - 1]) + px) / 2;
                const fim =
                  i === eixo.length - 1 ? dentro.x + dentro.largura : (px + escalaX(eixo[i + 1])) / 2;

                const leitura = usadas
                  .map((s, j) => {
                    const v = mapas[j].get(vx);
                    return v == null ? null : `${s.rotulo} ${formatarY(v)}${unidade}`;
                  })
                  .filter(Boolean)
                  .join(", ");

                return (
                  <rect
                    key={vx}
                    x={inicio}
                    y={dentro.y}
                    width={Math.max(1, fim - inicio)}
                    height={dentro.altura}
                    fill="transparent"
                    tabIndex={0}
                    role="img"
                    aria-label={`${rotularX(vx)}: ${leitura || "sem leitura"}`}
                    onPointerEnter={() => setAtivo(i)}
                    onFocus={() => setAtivo(i)}
                    onBlur={() => setAtivo(null)}
                  />
                );
              })}
            </g>
          </>
        );
      }}
    </MolduraGrafico>
  );
}
