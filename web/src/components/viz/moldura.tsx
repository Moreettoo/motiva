"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChartLine, Table2 } from "lucide-react";

import { Botao } from "@/components/ui/botao";
import { cn } from "@/lib/utils";

export type Margens = { topo: number; direita: number; baixo: number; esquerda: number };

export type Dimensoes = {
  largura: number;
  altura: number;
  /** Área de plotagem, já descontadas as margens de eixo e rótulo. */
  dentro: { x: number; y: number; largura: number; altura: number };
};

const MARGENS_PADRAO: Margens = { topo: 14, direita: 14, baixo: 26, esquerda: 44 };

/**
 * Esqueleto compartilhado por todo gráfico: título, legenda, medição de largura,
 * `<defs>` de textura e a alternância grafico ↔ tabela.
 *
 * É componente de cliente porque mede o container com ResizeObserver — logo o
 * `children` (função) só pode vir de outro componente de cliente. Todos os
 * gráficos desta pasta são de cliente por causa da camada de hover, então isso
 * não custa nada na prática.
 *
 * Convenção de cor em toda a pasta: token fixo entra por `className`
 * (`fill-s1`, `stroke-grid`…) e cor vinda de prop entra por `style`. Nunca por
 * atributo de apresentação — `var()` dentro de `fill="…"` não é substituído de
 * forma confiável em todo navegador, e a falha é silenciosa (a marca some).
 */
export function MolduraGrafico({
  titulo,
  descricao,
  altura = 240,
  margens = MARGENS_PADRAO,
  legenda,
  className,
  children,
  sobreposicao,
  tabela,
  vazio,
}: {
  titulo: string;
  descricao?: string;
  altura?: number;
  /** Função quando a margem depende da largura (rótulo direto só cabe em tela larga). */
  margens?: Margens | ((largura: number) => Margens);
  legenda?: ReactNode;
  className?: string;
  /** Conteúdo SVG do gráfico. */
  children: (dimensoes: Dimensoes) => ReactNode;
  /** Camada HTML sobre o SVG — tooltip e rótulo que precisa de truncamento real. */
  sobreposicao?: (dimensoes: Dimensoes) => ReactNode;
  /** Visão de tabela. Obrigatória quando alguma cor do gráfico fica abaixo de 3:1. */
  tabela?: ReactNode;
  /** Substitui a área de plotagem quando não há o que desenhar. */
  vazio?: ReactNode;
}) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  const [vendoTabela, setVendoTabela] = useState(false);

  useEffect(() => {
    const alvo = container.current;
    if (!alvo) return;

    // A medida sai do efeito, nunca do render: ler layout durante o render força
    // reflow síncrono e o painel abre com vários gráficos na mesma tela.
    const observador = new ResizeObserver((entradas) => {
      const nova = entradas[0]?.contentRect.width ?? 0;
      setLargura((atual) => (Math.abs(atual - nova) < 0.5 ? atual : nova));
    });

    observador.observe(alvo);
    setLargura(alvo.clientWidth);

    return () => observador.disconnect();
  }, []);

  const m = typeof margens === "function" ? margens(largura) : margens;

  const dimensoes: Dimensoes = {
    largura,
    altura,
    dentro: {
      x: m.esquerda,
      y: m.topo,
      largura: Math.max(0, largura - m.esquerda - m.direita),
      altura: Math.max(0, altura - m.topo - m.baixo),
    },
  };

  const pronto = dimensoes.dentro.largura > 0 && dimensoes.dentro.altura > 0;
  // Sem dado não há tabela para alternar: o botão viraria um caminho para outra tela vazia.
  const podeAlternar = Boolean(tabela) && !vazio;

  return (
    <figure className={cn("min-w-0", className)}>
      <figcaption className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium break-words text-ink">{titulo}</p>
          {descricao ? (
            <p className="mt-0.5 text-xs break-words text-ink-3">{descricao}</p>
          ) : null}
        </div>

        {podeAlternar ? (
          <div className="-my-1 flex shrink-0 items-center gap-1">
            <Botao
              tamanho="sm"
              variante="fantasma"
              aria-expanded={vendoTabela}
              aria-controls={`${id}-conteudo`}
              iconeEsquerda={vendoTabela ? <ChartLine /> : <Table2 />}
              onClick={() => setVendoTabela((v) => !v)}
            >
              {vendoTabela ? "Ver gráfico" : "Ver tabela"}
            </Botao>
          </div>
        ) : null}
      </figcaption>

      {legenda && !vazio ? <div className="mt-3">{legenda}</div> : null}

      {/* O container fica montado nos dois modos: se desmontasse ao abrir a
          tabela, o ResizeObserver perderia o alvo e a largura voltaria a zero. */}
      <div id={`${id}-conteudo`} ref={container} className="relative mt-3 min-w-0">
        {vazio ? (
          vazio
        ) : vendoTabela && tabela ? (
          tabela
        ) : (
          <>
            <svg
              role="img"
              aria-label={titulo}
              width="100%"
              height={altura}
              viewBox={`0 0 ${Math.max(largura, 1)} ${altura}`}
              className="block"
            >
              <title>{titulo}</title>
              <desc>{descricao ?? `Gráfico: ${titulo}`}</desc>

              {/* Canal de textura da skill dataviz. Os ids são globais de
                  propósito: `globals.css` referencia `url(#hachura-45)` literal,
                  então não podem ser sufixados. Com vários gráficos na página o
                  navegador resolve para o primeiro — e como todas as definições
                  são idênticas, a pintura é a mesma. */}
              <defs>
                <pattern
                  id="hachura-45"
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <line x1="0" y1="0" x2="0" y2="6" className="stroke-ink-2" strokeWidth="2.5" />
                </pattern>
                <pattern
                  id="hachura-135"
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(135)"
                >
                  <line x1="0" y1="0" x2="0" y2="6" className="stroke-ink-2" strokeWidth="2.5" />
                </pattern>
              </defs>

              {pronto ? children(dimensoes) : null}
            </svg>

            {sobreposicao && pronto ? (
              <div className="pointer-events-none absolute inset-0">{sobreposicao(dimensoes)}</div>
            ) : null}
          </>
        )}
      </div>
    </figure>
  );
}

/** Grade e eixo recessivos, compartilhados por linha e barras. */
export function EixoY({
  ticks,
  escala,
  dentro,
  formatar,
}: {
  ticks: number[];
  escala: (v: number) => number;
  dentro: Dimensoes["dentro"];
  formatar: (v: number) => string;
}) {
  return (
    <g aria-hidden="true">
      {ticks.map((t) => {
        const y = escala(t);
        return (
          <g key={t}>
            <line
              x1={dentro.x}
              y1={y}
              x2={dentro.x + dentro.largura}
              y2={y}
              className="stroke-grid"
              strokeWidth="1"
              shapeRendering="crispEdges"
            />
            <text
              x={dentro.x - 8}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              className="tnum fill-ink-3 font-mono text-2xs"
            >
              {formatar(t)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function EixoX({
  marcas,
  dentro,
}: {
  marcas: { posicao: number; rotulo: string }[];
  dentro: Dimensoes["dentro"];
}) {
  const base = dentro.y + dentro.altura;

  return (
    <g aria-hidden="true">
      <line
        x1={dentro.x}
        y1={base}
        x2={dentro.x + dentro.largura}
        y2={base}
        className="stroke-axis"
        strokeWidth="1"
        shapeRendering="crispEdges"
      />
      {marcas.map((marca) => (
        <text
          key={`${marca.posicao}-${marca.rotulo}`}
          x={marca.posicao}
          y={base + 15}
          textAnchor="middle"
          className="tnum fill-ink-3 font-mono text-2xs"
        >
          {marca.rotulo}
        </text>
      ))}
    </g>
  );
}
