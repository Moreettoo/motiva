"use client";

import { useState } from "react";

import {
  Tabela,
  TabelaCabecalho,
  TabelaCelula,
  TabelaCorpo,
  TabelaLinha,
  TabelaTitulo,
} from "@/components/ui/tabela";
import { DicaGrafico, DicaLinha, DicaTitulo } from "@/components/viz/dica-grafico";
import { almofadaDominio, escalaLinear } from "@/components/viz/escalas";
import { MolduraGrafico, type Margens } from "@/components/viz/moldura";
import { fmt } from "@/lib/format";
import { CLASSE_ALTURA } from "@/lib/dominio";
import type { ClasseAltura } from "@/lib/types";
import { FRONTEIRAS_CM, MARGEM_CM, type ParProjetado, type ResumoFronteira } from "@/lib/validacao/fronteira";

/** A regua da Motiva escrita como ela e. "Classe 1" pede que o leitor tenha
 *  decorado a numeracao; "ate 10 cm" nao pede nada. */
const FAIXA: Record<ClasseAltura, string> = {
  1: "até 10 cm",
  2: "10 a 30 cm",
  3: "+ de 30 cm",
};

const ALTURA_FAIXA = 58;
const RAIO_PONTO = 3;
const MARGENS: Margens = { topo: 10, direita: 16, baixo: 26, esquerda: 96 };

/**
 * Espalhamento vertical DETERMINISTICO.
 *
 * 163 dos 195 pares caem numa faixa de 0,6 cm: empilhados na mesma linha eles
 * viram uma marca so e a densidade some. `Math.random` esta fora de questao --
 * o servidor e o cliente renderizariam pontos em lugares diferentes, e o React
 * reclamaria de hidratacao. Isto e uma sequencia fixa em funcao do indice.
 */
function desvio(i: number, amplitude: number): number {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * amplitude;
}

export function GraficoFronteira({
  pares,
  resumo,
}: {
  pares: ParProjetado[];
  resumo: ResumoFronteira[];
}) {
  const [ativo, setAtivo] = useState<ClasseAltura | null>(null);

  const classes = resumo.map((r) => r.classeInicial);
  const alturas = pares.map((p) => p.alturaFinalCm);
  // O dominio precisa conter as DUAS fronteiras mesmo que nenhum ponto chegue
  // perto de uma: a regua e o que da sentido ao grafico, nao os pontos.
  const dominio = almofadaDominio([...alturas, 0, ...FRONTEIRAS_CM], { fracao: 0.04, naoNegativo: true });
  const altura = classes.length * ALTURA_FAIXA + MARGENS.topo + MARGENS.baixo;

  const tabela = (
    <Tabela rotulo="Onde a resposta da IA caiu">
      <TabelaCabecalho>
        <tr>
          <TabelaTitulo>Começou em</TabelaTitulo>
          <TabelaTitulo numerica>Medições</TabelaTitulo>
          <TabelaTitulo numerica>Menor</TabelaTitulo>
          <TabelaTitulo numerica>Típica</TabelaTitulo>
          <TabelaTitulo numerica>Maior</TabelaTitulo>
          <TabelaTitulo numerica>Linha</TabelaTitulo>
          <TabelaTitulo numerica>A menos de {fmt.d1(MARGEM_CM)} cm dela</TabelaTitulo>
        </tr>
      </TabelaCabecalho>
      <TabelaCorpo>
        {resumo.map((r) => (
          <TabelaLinha key={r.classeInicial}>
            <TabelaCelula>{FAIXA[r.classeInicial]}</TabelaCelula>
            <TabelaCelula numerica className="font-mono">{fmt.n(r.n)}</TabelaCelula>
            <TabelaCelula numerica className="font-mono">{fmt.d2(r.minCm)}</TabelaCelula>
            <TabelaCelula numerica className="font-mono font-medium">{fmt.d2(r.medianaCm)}</TabelaCelula>
            <TabelaCelula numerica className="font-mono">{fmt.d2(r.maxCm)}</TabelaCelula>
            <TabelaCelula numerica className="font-mono">{fmt.n(r.fronteiraCm)} cm</TabelaCelula>
            <TabelaCelula numerica className="font-mono">{fmt.n(r.dentroDaMargem)} de {fmt.n(r.n)}</TabelaCelula>
          </TabelaLinha>
        ))}
      </TabelaCorpo>
    </Tabela>
  );

  return (
    <MolduraGrafico
      titulo="Onde a resposta da IA caiu"
      descricao="Cada ponto é uma medição, agrupada pela caixa em que o trecho começou. As linhas tracejadas são onde a equipe troca de caixa."
      altura={altura}
      margens={MARGENS}
      tabela={tabela}
      sobreposicao={({ dentro }) => {
        const x = escalaLinear({ dominio, alcance: [dentro.x, dentro.x + dentro.largura] });
        const r = ativo == null ? undefined : resumo.find((l) => l.classeInicial === ativo);

        return (
          <>
            {resumo.map((linha, i) => (
              <div
                key={linha.classeInicial}
                className="pointer-events-auto absolute"
                style={{ left: 0, top: dentro.y + i * ALTURA_FAIXA, width: "100%", height: ALTURA_FAIXA }}
                onMouseEnter={() => setAtivo(linha.classeInicial)}
                onMouseLeave={() => setAtivo(null)}
              >
                {/* Rotulo da faixa em HTML: cor de status nunca vem sozinha, e
                    aqui quem a acompanha e o nome da classe por extenso. */}
                <span
                  className="absolute top-1/2 -translate-y-1/2 text-right text-2xs leading-tight"
                  style={{ left: 0, width: MARGENS.esquerda - 10 }}
                >
                  {/* Duas linhas curtas, nunca "Começou em até 10 cm": com a
                      frase inteira o rotulo quebrava em quatro linhas e
                      invadia a faixa de baixo. O "começou em" agora e dito
                      uma vez so, na descricao do grafico. */}
                  <span className="block font-medium whitespace-nowrap text-ink">
                    {FAIXA[linha.classeInicial]}
                  </span>
                  <span className="tnum block font-mono whitespace-nowrap text-ink-3">
                    {fmt.n(linha.n)} medições
                  </span>
                </span>
              </div>
            ))}

            {r ? (
              <DicaGrafico
                x={x(r.medianaCm)}
                y={dentro.y + classes.indexOf(r.classeInicial) * ALTURA_FAIXA + ALTURA_FAIXA / 2}
                visivel
              >
                <DicaTitulo>Começou em {FAIXA[r.classeInicial]}</DicaTitulo>
                <DicaLinha rotulo="Medições" valor={fmt.n(r.n)} />
                <DicaLinha rotulo="Menor resposta" valor={`${fmt.d2(r.minCm)} cm`} />
                <DicaLinha
                  cor={CLASSE_ALTURA[r.classeInicial].cor}
                  rotulo="Resposta típica"
                  valor={`${fmt.d2(r.medianaCm)} cm`}
                />
                <DicaLinha rotulo="Maior resposta" valor={`${fmt.d2(r.maxCm)} cm`} />
                <DicaLinha
                  rotulo={`Distância até a linha dos ${fmt.n(r.fronteiraCm)} cm`}
                  valor={`${r.medianaAteFronteiraCm < 0 ? "−" : "+"}${fmt.d1(Math.abs(r.medianaAteFronteiraCm) * 10)} mm`}
                />
              </DicaGrafico>
            ) : null}
          </>
        );
      }}
    >
      {({ dentro }) => {
        const x = escalaLinear({ dominio, alcance: [dentro.x, dentro.x + dentro.largura] });

        return (
          <>
            {/* As marcas da regua primeiro, atras dos pontos: elas sao a
                referencia, nao o dado. */}
            {FRONTEIRAS_CM.map((f) => (
              <g key={f}>
                <line
                  x1={x(f)}
                  x2={x(f)}
                  y1={dentro.y}
                  y2={dentro.y + dentro.altura}
                  className="stroke-ink-3"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                />
                <text
                  x={x(f)}
                  y={dentro.y + dentro.altura + 15}
                  textAnchor="middle"
                  className="fill-ink-2 text-2xs font-medium"
                >
                  {fmt.n(f)} cm
                </text>
              </g>
            ))}

            {resumo.map((linha, i) => {
              const centro = dentro.y + i * ALTURA_FAIXA + ALTURA_FAIXA / 2;
              const token = CLASSE_ALTURA[linha.classeInicial];
              const doGrupo = pares.filter((p) => p.classeInicial === linha.classeInicial);
              const apagado = ativo != null && ativo !== linha.classeInicial;

              return (
                <g key={linha.classeInicial} opacity={apagado ? 0.25 : 1}>
                  {doGrupo.map((p, j) => (
                    <circle
                      key={j}
                      cx={x(p.alturaFinalCm)}
                      cy={centro + desvio(j, ALTURA_FAIXA - 22)}
                      r={RAIO_PONTO}
                      fill={token.cor}
                      fillOpacity={0.55}
                    />
                  ))}
                  {/* A mediana em cima do enxame: e o numero que a frase cita. */}
                  <line
                    x1={x(linha.medianaCm)}
                    x2={x(linha.medianaCm)}
                    y1={centro - ALTURA_FAIXA / 2 + 6}
                    y2={centro + ALTURA_FAIXA / 2 - 6}
                    stroke={token.cor}
                    strokeWidth={2}
                  />
                </g>
              );
            })}
          </>
        );
      }}
    </MolduraGrafico>
  );
}
