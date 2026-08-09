"use client";

import { useState } from "react";
import { ChartColumnBig } from "lucide-react";

import {
  Tabela,
  TabelaCabecalho,
  TabelaCelula,
  TabelaCorpo,
  TabelaLinha,
  TabelaTitulo,
} from "@/components/ui/tabela";
import { EstadoVazio } from "@/components/ui/vazio";
import { fmt } from "@/lib/format";
import { clamp } from "@/lib/utils";

import { DicaGrafico, DicaLinha, DicaTitulo } from "./dica-grafico";
import { caminhoBarra, escalaLinear, ticksAgradaveis } from "./escalas";
import { IconeDominio, Legenda } from "./legenda";
import { EixoX, EixoY, MolduraGrafico, type Margens } from "./moldura";

export type BarraDado = {
  rotulo: string;
  valor: number;
  /** Só quando a cor CARREGA significado (risco, status). Barra nominal fica no slot 1. */
  cor?: string;
  /** Nome de ícone de `@/lib/dominio` — obrigatório junto de `cor` de status. */
  icone?: string;
};

const LARGURA_CARACTERE = 6.3;
const BANDA_HORIZONTAL = 38;
const ALTURA_BARRA = 10;
const RAIO_PONTA = 4;

/**
 * Geometria de uma faixa horizontal: rótulo em cima, barra embaixo.
 *
 * A banda sai da altura REAL da área de plotagem, não da constante — assim um
 * `altura` passado pelo chamador redistribui as faixas em vez de estourar a
 * última para fora do SVG.
 */
function faixaHorizontal(alturaPlot: number, quantidade: number) {
  const banda = quantidade > 0 ? alturaPlot / quantidade : 0;
  return { banda, deslocamentoBarra: Math.max(20, banda - 14) };
}

export function GraficoBarras({
  dados,
  orientacao = "horizontal",
  formatarValor = fmt.n,
  titulo,
  descricao,
  altura,
  maximo,
  rotuloDireto = true,
  className,
}: {
  dados: BarraDado[];
  /** Horizontal por padrão: nome de rodovia é longo e não cabe embaixo de coluna. */
  orientacao?: "vertical" | "horizontal";
  formatarValor?: (v: number) => string;
  titulo: string;
  descricao?: string;
  altura?: number;
  maximo?: number;
  rotuloDireto?: boolean;
  className?: string;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);

  const validos = dados.filter((d) => Number.isFinite(d.valor));
  const horizontal = orientacao === "horizontal";
  const temCorPropria = validos.some((d) => d.cor);

  // Barra nasce sempre do zero; o comprimento É o valor.
  const maiorValor = Math.max(0, ...validos.map((d) => d.valor));

  // Rótulo direto antes de grade: com o valor em cada barra, o eixo vira ruído.
  const comEixo = !rotuloDireto;
  const ticks = comEixo ? ticksAgradaveis(0, Math.max(1, maximo ?? maiorValor), 4) : [];
  // `maximo` fixa a escala para comparar gráficos, mas nunca corta uma barra:
  // o maior valor entra no teto de qualquer jeito.
  const teto = Math.max(1, maximo ?? 0, maiorValor, ticks[ticks.length - 1] ?? 0);

  const alturaGrafico =
    altura ?? (horizontal ? validos.length * BANDA_HORIZONTAL + (comEixo ? 26 : 4) : 240);

  const rotulosTick = ticks.map(formatarValor);
  const larguraTick = Math.ceil(Math.max(0, ...rotulosTick.map((r) => r.length)) * LARGURA_CARACTERE);

  const margens: Margens = horizontal
    ? { topo: 2, direita: 4, baixo: comEixo ? 26 : 2, esquerda: 0 }
    : { topo: 18, direita: 8, baixo: 34, esquerda: clamp(larguraTick + 14, 34, 76) };

  const tabela = (
    <Tabela rotulo={titulo} className="max-h-72">
      <TabelaCabecalho>
        <tr>
          <TabelaTitulo>Categoria</TabelaTitulo>
          <TabelaTitulo numerica>Valor</TabelaTitulo>
        </tr>
      </TabelaCabecalho>
      <TabelaCorpo>
        {validos.map((d) => (
          <TabelaLinha key={d.rotulo}>
            <TabelaCelula>
              <span className="flex items-center gap-1.5">
                <IconeDominio nome={d.icone} className="text-ink-3" />
                <span className="min-w-0 truncate">{d.rotulo}</span>
              </span>
            </TabelaCelula>
            <TabelaCelula numerica className="font-mono">
              {formatarValor(d.valor)}
            </TabelaCelula>
          </TabelaLinha>
        ))}
      </TabelaCorpo>
    </Tabela>
  );

  // Em coluna o ícone não cabe embaixo da barra; a legenda é quem garante o par
  // ícone + rótulo que toda cor de status exige.
  const legenda =
    !horizontal && temCorPropria ? (
      <Legenda
        itens={validos.map((d) => ({
          rotulo: d.rotulo,
          cor: d.cor ?? "var(--s1)",
          icone: <IconeDominio nome={d.icone} />,
        }))}
      />
    ) : undefined;

  return (
    <MolduraGrafico
      titulo={titulo}
      descricao={descricao}
      altura={alturaGrafico}
      margens={margens}
      className={className}
      legenda={legenda}
      tabela={tabela}
      vazio={
        validos.length === 0 ? (
          <EstadoVazio
            icone={<ChartColumnBig />}
            titulo="Nada para comparar"
            descricao="Nenhuma categoria tem valor neste recorte. Ajuste o filtro para ver a distribuição."
          />
        ) : undefined
      }
      sobreposicao={({ dentro }) => {
        const indice = ativo;
        const dado = indice == null ? undefined : validos[indice];

        const escalaValor = escalaLinear({
          dominio: [0, teto],
          alcance: horizontal
            ? [dentro.x, dentro.x + dentro.largura]
            : [dentro.y + dentro.altura, dentro.y],
        });

        const faixa = faixaHorizontal(dentro.altura, validos.length);
        const banda = horizontal ? faixa.banda : dentro.largura / Math.max(1, validos.length);

        return (
          <>
            {/* Rótulo em HTML e não em <text>: só assim há truncamento real e
                ícone de verdade num nome de rodovia que pode ser longo. */}
            {horizontal
              ? validos.map((d, i) => (
                  <div
                    key={d.rotulo}
                    className="absolute flex items-center gap-1.5 text-xs"
                    style={{
                      left: dentro.x,
                      top: dentro.y + i * faixa.banda,
                      width: dentro.largura,
                      height: 18,
                    }}
                  >
                    <IconeDominio nome={d.icone} className="text-ink-3" />
                    <span className="min-w-0 flex-1 truncate text-ink-2">{d.rotulo}</span>
                    {rotuloDireto ? (
                      <span className="tnum shrink-0 font-mono font-medium text-ink">
                        {formatarValor(d.valor)}
                      </span>
                    ) : null}
                  </div>
                ))
              : null}

            {dado && indice != null ? (
              <DicaGrafico
                x={
                  horizontal
                    ? Math.min(escalaValor(Math.max(0, dado.valor)), dentro.x + dentro.largura)
                    : dentro.x + banda * (indice + 0.5)
                }
                y={
                  horizontal
                    ? dentro.y + indice * faixa.banda + faixa.deslocamentoBarra
                    : escalaValor(Math.max(0, dado.valor))
                }
                visivel
              >
                <DicaTitulo>{dado.rotulo}</DicaTitulo>
                <DicaLinha
                  cor={dado.cor ?? "var(--s1)"}
                  rotulo="Valor"
                  valor={formatarValor(dado.valor)}
                />
              </DicaGrafico>
            ) : null}
          </>
        );
      }}
    >
      {({ dentro }) => {
        if (horizontal) {
          const escala = escalaLinear({
            dominio: [0, teto],
            alcance: [dentro.x, dentro.x + dentro.largura],
          });
          const base = dentro.y + dentro.altura;
          const faixa = faixaHorizontal(dentro.altura, validos.length);

          return (
            <>
              {comEixo ? (
                <g aria-hidden="true">
                  {ticks.map((t) => (
                    <line
                      key={t}
                      x1={escala(t)}
                      y1={dentro.y}
                      x2={escala(t)}
                      y2={base}
                      className="stroke-grid"
                      strokeWidth="1"
                      shapeRendering="crispEdges"
                    />
                  ))}
                </g>
              ) : null}

              <g onPointerLeave={() => setAtivo(null)}>
                {validos.map((d, i) => {
                  const yBanda = dentro.y + i * faixa.banda;
                  const largura = Math.max(0, escala(Math.max(0, d.valor)) - dentro.x);

                  return (
                    <g
                      key={d.rotulo}
                      tabIndex={0}
                      role="img"
                      aria-label={`${d.rotulo}: ${formatarValor(d.valor)}`}
                      onPointerEnter={() => setAtivo(i)}
                      onFocus={() => setAtivo(i)}
                      onBlur={() => setAtivo(null)}
                    >
                      {/* O alvo é a faixa inteira, bem maior que a marca de 10px. */}
                      <rect
                        x={dentro.x}
                        y={yBanda - 3}
                        width={dentro.largura}
                        height={Math.max(1, faixa.banda - 4)}
                        rx="6"
                        className={ativo === i ? "fill-surface-3" : "fill-transparent"}
                      />
                      <path
                        d={caminhoBarra(
                          dentro.x,
                          yBanda + faixa.deslocamentoBarra,
                          largura,
                          ALTURA_BARRA,
                          RAIO_PONTA,
                          "direita",
                        )}
                        style={{ fill: d.cor }}
                        className={d.cor ? undefined : "fill-s1"}
                      />
                    </g>
                  );
                })}
              </g>

              {comEixo ? (
                <EixoX
                  dentro={dentro}
                  marcas={ticks.map((t) => ({ posicao: escala(t), rotulo: formatarValor(t) }))}
                />
              ) : null}
            </>
          );
        }

        const escala = escalaLinear({
          dominio: [0, teto],
          alcance: [dentro.y + dentro.altura, dentro.y],
        });
        const base = dentro.y + dentro.altura;
        const banda = dentro.largura / validos.length;
        // 2px de folga mínima entre vizinhas; 24px de teto para a barra não virar bloco.
        const larguraBarra = Math.max(2, Math.min(24, banda - 2));
        const maxCaracteres = Math.max(2, Math.floor((banda - 4) / LARGURA_CARACTERE));

        return (
          <>
            {comEixo ? (
              <EixoY ticks={ticks} escala={escala} dentro={dentro} formatar={formatarValor} />
            ) : null}

            <line
              x1={dentro.x}
              y1={base}
              x2={dentro.x + dentro.largura}
              y2={base}
              className="stroke-axis"
              strokeWidth="1"
              shapeRendering="crispEdges"
            />

            <g onPointerLeave={() => setAtivo(null)}>
              {validos.map((d, i) => {
                const centro = dentro.x + banda * (i + 0.5);
                const topoBarra = escala(Math.max(0, d.valor));

                return (
                  <g
                    key={d.rotulo}
                    tabIndex={0}
                    role="img"
                    aria-label={`${d.rotulo}: ${formatarValor(d.valor)}`}
                    onPointerEnter={() => setAtivo(i)}
                    onFocus={() => setAtivo(i)}
                    onBlur={() => setAtivo(null)}
                  >
                    <rect
                      x={dentro.x + banda * i}
                      y={dentro.y}
                      width={banda}
                      height={dentro.altura}
                      className={ativo === i ? "fill-surface-3" : "fill-transparent"}
                    />
                    <path
                      d={caminhoBarra(
                        centro - larguraBarra / 2,
                        topoBarra,
                        larguraBarra,
                        Math.max(0, base - topoBarra),
                        RAIO_PONTA,
                        "cima",
                      )}
                      style={{ fill: d.cor }}
                      className={d.cor ? undefined : "fill-s1"}
                    />

                    {rotuloDireto ? (
                      <text
                        x={centro}
                        y={topoBarra - 6}
                        textAnchor="middle"
                        className="tnum fill-ink-2 font-mono text-2xs"
                      >
                        {formatarValor(d.valor)}
                      </text>
                    ) : null}

                    <text
                      x={centro}
                      y={base + 15}
                      textAnchor="middle"
                      className="fill-ink-3 text-2xs"
                    >
                      {d.rotulo.length > maxCaracteres
                        ? `${d.rotulo.slice(0, maxCaracteres - 1)}…`
                        : d.rotulo}
                    </text>
                  </g>
                );
              })}
            </g>
          </>
        );
      }}
    </MolduraGrafico>
  );
}
