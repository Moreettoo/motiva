"use client";

import { useState } from "react";

import { DicaGrafico, DicaLinha, DicaTitulo } from "@/components/viz/dica-grafico";
import { caminhoBarra, escalaLinear } from "@/components/viz/escalas";
import { Legenda } from "@/components/viz/legenda";
import { MolduraGrafico, type Margens } from "@/components/viz/moldura";
import {
  Tabela,
  TabelaCabecalho,
  TabelaCelula,
  TabelaCorpo,
  TabelaLinha,
  TabelaTitulo,
} from "@/components/ui/tabela";
import { fmt } from "@/lib/format";
import { rotuloDaFeature } from "@/lib/modelo/campos";
import type { EfeitoFeature } from "@/lib/modelo/ficha";

/** Coluna de rotulo a esquerda. Em HTML, nao em `<text>`: "Capacidade de água
 *  do solo" precisa de truncamento de verdade. */
const LARGURA_ROTULO = 174;
const BANDA = 19;
const ALTURA_BARRA = 8;
const RAIO_PONTA = 4;

/** Par divergente: uma cor para cada sentido, e o zero como meio NEUTRO (a
 *  linha, sem cor propria). Nunca um matiz no meio -- e a regra da skill
 *  `dataviz`, e a razao de a escala nao ser um degrade de vermelho a verde. */
const COR_AUMENTA = "var(--s1)";
const COR_REDUZ = "var(--s2)";

const cm = (v: number) => `${v >= 0 ? "+" : "−"}${fmt.d1(Math.abs(v))} cm`;

export function GraficoEfeitos({
  linhas,
  titulo,
  descricao,
}: {
  linhas: EfeitoFeature[];
  titulo: string;
  descricao: string;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);

  // Folga de 18% em cima da maior barra. Sem ela a barra mais longa encosta na
  // borda da area util e o rotulo de valor dela cai POR CIMA da coluna de
  // nomes -- media medida em tela, nao chute: "Geadas no período" e "−18,1 cm"
  // se sobrepunham.
  const extremo = Math.max(1, ...linhas.map((l) => Math.abs(l.efeitoCm))) * 1.18;
  const altura = linhas.length * BANDA + 6;
  const margens: Margens = { topo: 3, direita: 52, baixo: 3, esquerda: LARGURA_ROTULO };

  const tabela = (
    <Tabela rotulo={titulo} className="max-h-96">
      <TabelaCabecalho>
        <tr>
          <TabelaTitulo>Entrada</TabelaTitulo>
          <TabelaTitulo>Faixa vista no treino</TabelaTitulo>
          <TabelaTitulo numerica>No mínimo</TabelaTitulo>
          <TabelaTitulo numerica>No máximo</TabelaTitulo>
          <TabelaTitulo numerica>Efeito</TabelaTitulo>
        </tr>
      </TabelaCabecalho>
      <TabelaCorpo>
        {linhas.map((l) => (
          <TabelaLinha key={l.campo}>
            <TabelaCelula>{rotuloDaFeature(l.campo)}</TabelaCelula>
            <TabelaCelula className="tnum text-ink-2">
              {fmt.d1(l.min)} – {fmt.d1(l.max)}
              {l.faixaExata ? null : <span className="text-ink-3"> ~</span>}
            </TabelaCelula>
            <TabelaCelula numerica className="font-mono">{fmt.d1(l.q50NoMinimo)}</TabelaCelula>
            <TabelaCelula numerica className="font-mono">{fmt.d1(l.q50NoMaximo)}</TabelaCelula>
            <TabelaCelula numerica className="font-mono font-medium">{cm(l.efeitoCm)}</TabelaCelula>
          </TabelaLinha>
        ))}
      </TabelaCorpo>
    </Tabela>
  );

  const escalaX = (dentro: { x: number; largura: number }) =>
    escalaLinear({ dominio: [-extremo, extremo], alcance: [dentro.x, dentro.x + dentro.largura] });

  return (
    <MolduraGrafico
      titulo={titulo}
      descricao={descricao}
      altura={altura}
      margens={margens}
      tabela={tabela}
      legenda={
        <Legenda
          itens={[
            { rotulo: "Faz crescer mais", cor: COR_AUMENTA },
            { rotulo: "Faz crescer menos", cor: COR_REDUZ },
          ]}
        />
      }
      sobreposicao={({ dentro }) => {
        const x = escalaX(dentro);
        const l = ativo == null ? undefined : linhas[ativo];

        return (
          <>
            {linhas.map((linha, i) => {
              const positivo = linha.efeitoCm >= 0;
              const ponta = x(linha.efeitoCm);

              return (
                <div
                  key={linha.campo}
                  className="pointer-events-auto absolute flex items-center"
                  style={{ left: 0, top: dentro.y + i * BANDA, width: "100%", height: BANDA }}
                  onMouseEnter={() => setAtivo(i)}
                  onMouseLeave={() => setAtivo(null)}
                >
                  <span
                    className="shrink-0 truncate pr-2.5 text-right text-xs text-ink-2"
                    style={{ width: LARGURA_ROTULO }}
                  >
                    {rotuloDaFeature(linha.campo)}
                  </span>
                  {/* Rotulo direto na ponta da barra: com o valor escrito em
                      cada uma, o eixo numerico vira ruido -- e e ele que
                      cumpre o "relief" que o WARN de contraste da skill
                      dataviz exige de cor abaixo de 3:1. */}
                  <span
                    className="tnum absolute font-mono text-2xs font-medium whitespace-nowrap text-ink"
                    style={
                      positivo
                        ? { left: ponta + 6 }
                        : { right: `calc(100% - ${ponta - 6}px)` }
                    }
                  >
                    {cm(linha.efeitoCm)}
                  </span>
                </div>
              );
            })}

            {l && ativo != null ? (
              <DicaGrafico x={x(0)} y={dentro.y + ativo * BANDA + BANDA / 2} visivel>
                <DicaTitulo>{rotuloDaFeature(l.campo)}</DicaTitulo>
                <DicaLinha rotulo={`No mínimo (${fmt.d1(l.min)})`} valor={`${fmt.d1(l.q50NoMinimo)} cm`} />
                <DicaLinha rotulo={`No máximo (${fmt.d1(l.max)})`} valor={`${fmt.d1(l.q50NoMaximo)} cm`} />
                <DicaLinha
                  cor={l.efeitoCm >= 0 ? COR_AUMENTA : COR_REDUZ}
                  rotulo="Efeito no crescimento"
                  valor={cm(l.efeitoCm)}
                />
              </DicaGrafico>
            ) : null}
          </>
        );
      }}
    >
      {({ dentro }) => {
        const x = escalaX(dentro);
        const zero = x(0);

        return (
          <>
            {/* O eixo do zero e a referencia de leitura do grafico inteiro:
                recessivo, mas continuo de ponta a ponta. */}
            <line
              x1={zero}
              x2={zero}
              y1={dentro.y}
              y2={dentro.y + dentro.altura}
              className="stroke-axis"
              strokeWidth={1}
            />

            {linhas.map((l, i) => {
              const positivo = l.efeitoCm >= 0;
              const ponta = x(l.efeitoCm);
              const y = dentro.y + i * BANDA + (BANDA - ALTURA_BARRA) / 2;

              return (
                <path
                  key={l.campo}
                  d={caminhoBarra(
                    positivo ? zero : ponta,
                    y,
                    Math.abs(ponta - zero),
                    ALTURA_BARRA,
                    RAIO_PONTA,
                    positivo ? "direita" : "esquerda",
                  )}
                  fill={positivo ? COR_AUMENTA : COR_REDUZ}
                  opacity={ativo == null || ativo === i ? 1 : 0.35}
                />
              );
            })}
          </>
        );
      }}
    </MolduraGrafico>
  );
}
