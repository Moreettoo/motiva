"use client";

import { useState } from "react";
import { ChartNoAxesColumn } from "lucide-react";

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
import { sum } from "@/lib/utils";

import { DicaGrafico, DicaLinha, DicaTitulo } from "./dica-grafico";
import { caminhoSegmento } from "./escalas";
import { IconeDominio, Legenda } from "./legenda";
import { MolduraGrafico } from "./moldura";

export type SegmentoFaixa = {
  chave: string;
  rotulo: string;
  valor: number;
  /** Cor de status: vem sempre com `icone`, nunca sozinha. */
  cor: string;
  icone?: string;
};

/** Folga de superfície entre segmentos vizinhos. Separa sem contorno. */
const FOLGA = 2;
const RAIO = 4;
/** Respiro vertical: o alvo de hover fica maior que a marca. */
const RESPIRO = 6;

/**
 * Uma faixa horizontal empilhada, a distribuição de risco da malha inteira em
 * uma linha só. Cada segmento traz cor de status, então cada segmento traz
 * ícone e rótulo na legenda.
 */
export function FaixaEmpilhada({
  segmentos,
  total,
  altura = 18,
  formatarValor = fmt.n,
  titulo,
  descricao,
  className,
}: {
  segmentos: SegmentoFaixa[];
  /** Base do percentual. Maior que a soma? O que sobra vira trilho vazio. */
  total?: number;
  altura?: number;
  formatarValor?: (v: number) => string;
  titulo: string;
  descricao?: string;
  className?: string;
}) {
  const [ativo, setAtivo] = useState<string | null>(null);

  const validos = segmentos.filter((s) => Number.isFinite(s.valor) && s.valor > 0);
  const soma = sum(validos.map((s) => s.valor));
  const base = Math.max(total ?? soma, soma, 1);

  const pct = (v: number) => fmt.pct((v / base) * 100);

  const legenda = (
    <Legenda
      itens={validos.map((s) => ({
        rotulo: s.rotulo,
        cor: s.cor,
        valor: `${formatarValor(s.valor)} · ${pct(s.valor)}`,
        icone: <IconeDominio nome={s.icone} />,
      }))}
    />
  );

  const tabela = (
    <Tabela rotulo={titulo} className="max-h-72">
      <TabelaCabecalho>
        <tr>
          <TabelaTitulo>Faixa</TabelaTitulo>
          <TabelaTitulo numerica>Quantidade</TabelaTitulo>
          <TabelaTitulo numerica>Participação</TabelaTitulo>
        </tr>
      </TabelaCabecalho>
      <TabelaCorpo>
        {validos.map((s) => (
          <TabelaLinha key={s.chave}>
            <TabelaCelula>
              <span className="flex items-center gap-1.5">
                <IconeDominio nome={s.icone} className="text-ink-3" />
                <span className="min-w-0 truncate">{s.rotulo}</span>
              </span>
            </TabelaCelula>
            <TabelaCelula numerica className="font-mono">
              {formatarValor(s.valor)}
            </TabelaCelula>
            <TabelaCelula numerica className="font-mono">
              {pct(s.valor)}
            </TabelaCelula>
          </TabelaLinha>
        ))}
      </TabelaCorpo>
    </Tabela>
  );

  /** Posições em px, calculadas uma vez e reaproveitadas pelo SVG e pelo balão. */
  function fatiar(x0: number, largura: number) {
    let acumulado = 0;

    return validos.map((s, i) => {
      const inicio = x0 + (acumulado / base) * largura;
      acumulado += s.valor;
      const fim = x0 + (acumulado / base) * largura;
      const ultimo = i === validos.length - 1 && soma >= base;

      return {
        segmento: s,
        x: inicio,
        // A folga sai da direita de todo segmento, menos do que encosta na ponta.
        largura: Math.max(1, fim - inicio - (ultimo ? 0 : FOLGA)),
        primeiro: i === 0,
        ultimo,
        par: i % 2 === 1,
      };
    });
  }

  return (
    <MolduraGrafico
      titulo={titulo}
      descricao={descricao}
      altura={altura + RESPIRO * 2}
      margens={{ topo: RESPIRO, direita: 0, baixo: RESPIRO, esquerda: 0 }}
      className={className}
      legenda={validos.length >= 2 ? legenda : undefined}
      tabela={tabela}
      vazio={
        validos.length === 0 ? (
          <EstadoVazio
            icone={<ChartNoAxesColumn />}
            titulo="Sem distribuição para mostrar"
            descricao="Nenhum trecho entrou neste recorte. Limpe os filtros para ver a malha inteira."
          />
        ) : undefined
      }
      sobreposicao={({ dentro }) => {
        const fatia = fatiar(dentro.x, dentro.largura).find((f) => f.segmento.chave === ativo);
        if (!fatia) return null;

        return (
          <DicaGrafico x={fatia.x + fatia.largura / 2} y={dentro.y} visivel>
            <DicaTitulo>{fatia.segmento.rotulo}</DicaTitulo>
            <DicaLinha
              cor={fatia.segmento.cor}
              rotulo="Trechos"
              valor={formatarValor(fatia.segmento.valor)}
            />
            <DicaLinha rotulo="Participação" valor={pct(fatia.segmento.valor)} />
          </DicaGrafico>
        );
      }}
    >
      {({ dentro }) => (
        <>
          {soma < base ? (
            <path
              d={caminhoSegmento(dentro.x, dentro.y, dentro.largura, altura, RAIO, {
                esquerda: true,
                direita: true,
              })}
              className="fill-surface-3"
            />
          ) : null}

          <g onPointerLeave={() => setAtivo(null)}>
            {fatiar(dentro.x, dentro.largura).map((f) => (
              <g
                key={f.segmento.chave}
                tabIndex={0}
                role="img"
                aria-label={`${f.segmento.rotulo}: ${formatarValor(f.segmento.valor)}, ${pct(f.segmento.valor)} do total`}
                onPointerEnter={() => setAtivo(f.segmento.chave)}
                onFocus={() => setAtivo(f.segmento.chave)}
                onBlur={() => setAtivo(null)}
              >
                <rect
                  x={f.x}
                  y={dentro.y - RESPIRO}
                  width={f.largura + FOLGA}
                  height={altura + RESPIRO * 2}
                  className="fill-transparent"
                />
                {/* Hachura alternada 45°/135°: é aqui que as marcas se encostam,
                    então é aqui que a textura precisa separar vizinhas quando a
                    cor cai (impressão, forced-colors). */}
                <path
                  d={caminhoSegmento(f.x, dentro.y, f.largura, altura, RAIO, {
                    esquerda: f.primeiro,
                    direita: f.ultimo,
                  })}
                  className={f.par ? "viz-fill-2" : "viz-fill-1"}
                  style={{ fill: f.segmento.cor }}
                  fillOpacity={ativo && ativo !== f.segmento.chave ? 0.55 : 1}
                />
              </g>
            ))}
          </g>
        </>
      )}
    </MolduraGrafico>
  );
}
