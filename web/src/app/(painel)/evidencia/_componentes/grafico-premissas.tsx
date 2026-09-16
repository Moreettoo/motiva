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
import { almofadaDominio, escalaLinear, ticksAgradaveis } from "@/components/viz/escalas";
import { Legenda } from "@/components/viz/legenda";
import { EixoX, MolduraGrafico, type Margens } from "@/components/viz/moldura";
import { ESPECIE } from "@/lib/dominio";
import { fmt } from "@/lib/format";

const MARGENS: Margens = { topo: 16, direita: 20, baixo: 30, esquerda: 20 };
const ALTURA = 132;
const RAIO = 5;

const COR_RODADA = "var(--s1)";
const COR_VIGENTE = "var(--s2)";

export type RodadaPremissa = {
  id: number;
  especie: string;
  classe3Cm: number;
  diasDesdeRocada: number;
  acuracia: number;
  /** Quantas transicoes de classe ela detectou. Zero = virou o palpite
   *  preguicoso: responde "nada muda" em todo lugar. */
  transicoesDetectadas: number;
  vigente: boolean;
};

/**
 * As 27 rodadas de premissa numa regua so.
 *
 * Forma escolhida de proposito: 27 barras empilhadas verticalmente ocupariam
 * mil pixels e nao responderiam a pergunta, que nao e "quanto cada rodada
 * acertou" e sim "onde elas se AMONTOAM". Num strip plot o amontoado em cima
 * da linha de base e a resposta inteira -- a maioria das combinacoes de
 * premissa colapsa no mesmo ponto, porque o modelo para de prever mudanca.
 */
export function GraficoPremissas({
  rodadas,
  linhaDeBase,
}: {
  rodadas: RodadaPremissa[];
  linhaDeBase: number;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);

  const acuracias = rodadas.map((r) => r.acuracia);
  // O dominio sai do DADO, e as marcas vem depois, dentro dele.
  // `ticksAgradaveis` devolve marcas "sempre dentro de [min, max]" (e assim
  // esta documentada): usa-la como dominio encolhia o eixo ate a ultima marca
  // redonda -- 80% -- e jogava para fora da tela a linha de base em 83,1% e as
  // 21 rodadas empilhadas em cima dela. O grafico mostrava 3 pontos de 27 e
  // nao acusava nada.
  const dominio = almofadaDominio([...acuracias, linhaDeBase], { fracao: 0.1 });
  const ticks = ticksAgradaveis(dominio[0], dominio[1], 4);

  const preguicosos = rodadas.filter((r) => r.transicoesDetectadas === 0).length;

  const tabela = (
    <Tabela rotulo="O resultado com cada suposição" className="max-h-96">
      <TabelaCabecalho>
        <tr>
          <TabelaTitulo>Capim suposto</TabelaTitulo>
          <TabelaTitulo numerica>Acima de 30 vale</TabelaTitulo>
          <TabelaTitulo numerica>Roçado há</TabelaTitulo>
          <TabelaTitulo numerica>Acertos</TabelaTitulo>
          <TabelaTitulo numerica>Avisos dados</TabelaTitulo>
        </tr>
      </TabelaCabecalho>
      <TabelaCorpo>
        {[...rodadas].sort((a, b) => b.acuracia - a.acuracia).map((r) => (
          <TabelaLinha key={r.id}>
            <TabelaCelula>
              {ESPECIE[r.especie as keyof typeof ESPECIE]?.rotulo ?? r.especie}
              {r.vigente ? <span className="ml-1.5 text-2xs text-ink-3">(em uso)</span> : null}
            </TabelaCelula>
            <TabelaCelula numerica className="font-mono">{fmt.cm(r.classe3Cm)}</TabelaCelula>
            <TabelaCelula numerica className="font-mono">{fmt.n(r.diasDesdeRocada)} d</TabelaCelula>
            <TabelaCelula numerica className="font-mono font-medium">{fmt.d1(r.acuracia * 100)}%</TabelaCelula>
            <TabelaCelula numerica className="font-mono">
              {r.transicoesDetectadas === 0 ? (
                <span className="text-ink-3">nenhuma</span>
              ) : (
                fmt.n(r.transicoesDetectadas)
              )}
            </TabelaCelula>
          </TabelaLinha>
        ))}
      </TabelaCorpo>
    </Tabela>
  );

  return (
    <MolduraGrafico
      titulo="27 suposições diferentes, 27 resultados"
      descricao={`O que muda se o capim for outro, ou se a última roçada tiver sido em outra data. Em ${fmt.n(preguicosos)} das ${fmt.n(rodadas.length)}, a IA para de prever qualquer mudança — vira o mesmo que chutar.`}
      altura={ALTURA}
      margens={MARGENS}
      tabela={tabela}
      legenda={
        <Legenda
          itens={[
            { rotulo: "Uma suposição", cor: COR_RODADA },
            { rotulo: "A que o sistema usa hoje", cor: COR_VIGENTE },
          ]}
        />
      }
      sobreposicao={({ dentro }) => {
        const x = escalaLinear({ dominio, alcance: [dentro.x, dentro.x + dentro.largura] });
        const r = ativo == null ? undefined : rodadas.find((l) => l.id === ativo);

        return (
          <>
            <div
              className="pointer-events-auto absolute"
              style={{ left: dentro.x, top: dentro.y, width: dentro.largura, height: dentro.altura }}
              onMouseLeave={() => setAtivo(null)}
            >
              {rodadas.map((rodada, i) => (
                <button
                  key={rodada.id}
                  type="button"
                  aria-label={`${rodada.especie}, acima de 30 valendo ${rodada.classe3Cm} cm, roçado há ${rodada.diasDesdeRocada} dias: ${fmt.d1(rodada.acuracia * 100)}% de acerto`}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-2"
                  style={{
                    left: x(rodada.acuracia) - dentro.x,
                    top: dentro.altura / 2 + desvio(i),
                    width: 18,
                    height: 18,
                  }}
                  onMouseEnter={() => setAtivo(rodada.id)}
                  onFocus={() => setAtivo(rodada.id)}
                  onBlur={() => setAtivo(null)}
                />
              ))}
            </div>

            {r ? (
              <DicaGrafico
                x={x(r.acuracia)}
                y={dentro.y + dentro.altura / 2}
                visivel
              >
                <DicaTitulo>
                  {ESPECIE[r.especie as keyof typeof ESPECIE]?.rotulo ?? r.especie}
                  {r.vigente ? " · a que o sistema usa" : ""}
                </DicaTitulo>
                <DicaLinha rotulo="Acima de 30 vale" valor={fmt.cm(r.classe3Cm)} />
                <DicaLinha rotulo="Roçado há" valor={`${fmt.n(r.diasDesdeRocada)} dias`} />
                <DicaLinha
                  cor={r.vigente ? COR_VIGENTE : COR_RODADA}
                  rotulo="Acertos"
                  valor={`${fmt.d1(r.acuracia * 100)}%`}
                />
                <DicaLinha
                  rotulo="Avisos dados"
                  valor={r.transicoesDetectadas === 0 ? "nenhuma" : fmt.n(r.transicoesDetectadas)}
                />
              </DicaGrafico>
            ) : null}
          </>
        );
      }}
    >
      {({ dentro }) => {
        const x = escalaLinear({ dominio, alcance: [dentro.x, dentro.x + dentro.largura] });
        const centro = dentro.y + dentro.altura / 2;

        return (
          <>
            <EixoX
              marcas={ticks.map((t) => ({ posicao: x(t), rotulo: fmt.pct(t * 100) }))}
              dentro={dentro}
            />

            {/* A linha de base e a regua do grafico: sem ela, 60% e 83% sao so
                dois numeros. Com ela, da para ver o que esta abaixo. */}
            <line
              x1={x(linhaDeBase)}
              x2={x(linhaDeBase)}
              y1={dentro.y}
              y2={dentro.y + dentro.altura}
              className="stroke-ink-2"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <text
              x={x(linhaDeBase)}
              y={dentro.y - 4}
              textAnchor="end"
              className="fill-ink-2 text-2xs font-medium"
            >
              chutar &quot;não muda nada&quot; ←
            </text>

            {rodadas.map((r, i) => (
              <circle
                key={r.id}
                cx={x(r.acuracia)}
                cy={centro + desvio(i)}
                r={RAIO}
                fill={r.vigente ? COR_VIGENTE : COR_RODADA}
                fillOpacity={r.vigente ? 1 : 0.5}
                // Anel na cor da superficie: com 21 pontos no mesmo lugar, sem
                // ele o amontoado vira uma mancha unica e some a contagem.
                stroke="var(--surface)"
                strokeWidth={ativo === r.id ? 2.5 : 1.5}
              />
            ))}
          </>
        );
      }}
    </MolduraGrafico>
  );
}

/** Espalhamento vertical deterministico, mesmo motivo de `grafico-fronteira`:
 *  `Math.random` daria pontos diferentes no servidor e no cliente. */
function desvio(i: number): number {
  const s = Math.sin(i * 78.233) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 52;
}
