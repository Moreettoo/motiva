"use client";

import { type CSSProperties, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Sprout, X } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";

import { BotaoIcone } from "@/components/ui/botao";
import { Delta, type DeltaIndicador } from "@/components/ui/indicador";
import { Minigrafico } from "@/components/viz/minigrafico";
import { fmt } from "@/lib/format";
import { ESPECIES, type Especie } from "@/lib/types";
import { cn } from "@/lib/utils";

export type CrescimentoEspecieDado = {
  especie: Especie;
  rotulo: string;
  cor: string;
  valor: number;
  pico: number;
  delta?: DeltaIndicador;
  serie: number[];
};

const FACE = "rounded-lg border border-border bg-surface p-4 [backface-visibility:hidden]";

/**
 * O card "Crescimento médio" tem verso: passar o mouse ou clicar no ícone vira
 * o card e mostra as 3 espécies lado a lado. Escolher uma delas troca a frente,
 * número, delta e pico, pela leitura daquela espécie em vez da malha
 * inteira, porque "0,085 cm/dia" sozinho não diz se é braquiária ou batatais.
 *
 * A seleção vai pra URL (`?especie=`) como qualquer outro filtro do painel; só
 * o "card está virado" é local: é leitura de hover, não filtro de dado.
 */
export function CartaoCrescimento({
  indice = 0,
  valorMalha,
  picoMalha,
  serieMalha,
  deltaMalha,
  especies,
}: {
  indice?: number;
  valorMalha: number;
  picoMalha: number;
  serieMalha: number[];
  deltaMalha?: DeltaIndicador;
  especies: CrescimentoEspecieDado[];
}) {
  const [especieSelecionada, setEspecieSelecionada] = useQueryState(
    "especie",
    parseAsStringLiteral(ESPECIES),
  );
  const [virado, setVirado] = useState(false);
  const reduzido = useReducedMotion();

  const ativa = especieSelecionada ? especies.find((e) => e.especie === especieSelecionada) : undefined;

  const dados = ativa
    ? {
        rotulo: `Crescimento · ${ativa.rotulo}`,
        valor: ativa.valor,
        delta: ativa.delta,
        nota: `Pico de ${ativa.rotulo} em ${fmt.cmDia(ativa.pico)}`,
        serie: ativa.serie,
        cor: ativa.cor,
        rotuloGrafico: `Crescimento diário de ${ativa.rotulo} nos últimos 45 dias`,
      }
    : {
        rotulo: "Crescimento médio",
        valor: valorMalha,
        delta: deltaMalha,
        nota: `Pico da malha em ${fmt.cmDia(picoMalha)}`,
        serie: serieMalha,
        cor: undefined,
        rotuloGrafico: "Crescimento médio diário da malha nos últimos 45 dias",
      };

  return (
    <div
      className="rise group relative"
      style={{ "--i": indice } as CSSProperties}
      onMouseEnter={() => setVirado(true)}
      onMouseLeave={() => setVirado(false)}
    >
      <div className="relative [perspective:1400px]">
        <motion.div
          className="relative"
          style={{ transformStyle: "preserve-3d" }}
          animate={{ rotateY: virado ? 180 : 0 }}
          transition={reduzido ? { duration: 0 } : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Frente: mesma leitura do resto da faixa de indicadores. */}
          <div
            className={cn(FACE, "group-hover:border-border-strong group-hover:bg-surface-2")}
            inert={virado}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-2xs font-medium tracking-wider text-ink-3 uppercase">
                {dados.rotulo}
              </span>
              <BotaoIcone
                rotulo={virado ? "Fechar" : "Ver por espécie"}
                tamanho="sm"
                variante="fantasma"
                onClick={() => setVirado((v) => !v)}
              >
                <Sprout aria-hidden="true" className="size-4" />
              </BotaoIcone>
            </div>

            <div className="mt-2 flex min-w-0 items-baseline justify-between gap-1.5">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="tnum truncate text-2xl leading-none font-semibold text-ink">
                  {fmt.d3(dados.valor)}
                </span>
                <span className="shrink-0 text-xs text-ink-3">cm/dia</span>
              </span>
              {ativa ? (
                <button
                  type="button"
                  onClick={() => setEspecieSelecionada(null)}
                  className="shrink-0 text-2xs font-medium text-ink-3 underline decoration-dotted underline-offset-2 hover:text-ink-2"
                >
                  voltar à malha
                </button>
              ) : null}
            </div>

            {dados.delta ? <Delta delta={dados.delta} /> : null}
            <p className="mt-1.5 line-clamp-2 text-xs text-ink-3">{dados.nota}</p>

            <div className="mt-3">
              <Minigrafico
                pontos={dados.serie}
                cor={dados.cor}
                rotulo={dados.rotuloGrafico}
                largura={112}
              />
            </div>
          </div>

          {/* Verso: 3 colunas, uma por espécie. */}
          <div
            className={cn(
              FACE,
              "absolute inset-0 flex flex-col [transform:rotateY(180deg)] group-hover:border-border-strong group-hover:bg-surface-2",
            )}
            inert={!virado}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-2xs font-medium tracking-wider text-ink-3 uppercase">
                Escolha a espécie
              </span>
              <BotaoIcone rotulo="Fechar" tamanho="sm" variante="fantasma" onClick={() => setVirado(false)}>
                <X aria-hidden="true" className="size-4" />
              </BotaoIcone>
            </div>

            <div className="mt-3 grid flex-1 grid-cols-3 gap-2">
              {especies.map((e) => (
                <button
                  key={e.especie}
                  type="button"
                  aria-pressed={especieSelecionada === e.especie}
                  onClick={() => {
                    setEspecieSelecionada(e.especie);
                    setVirado(false);
                  }}
                  className={cn(
                    "flex min-w-0 flex-col items-center justify-center gap-1 rounded-md border p-2 text-center transition-[background-color,border-color] duration-150 ease-[var(--ease-out-quint)]",
                    especieSelecionada === e.especie
                      ? "border-border-strong bg-surface-2"
                      : "border-border hover:border-border-strong hover:bg-surface-2",
                  )}
                >
                  <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ background: e.cor }} />
                  <span className="w-full truncate text-2xs font-medium text-ink-2">{e.rotulo}</span>
                  <span className="tnum text-sm font-semibold text-ink">{fmt.d3(e.valor)}</span>
                  <Minigrafico
                    pontos={e.serie}
                    cor={e.cor}
                    largura={48}
                    altura={16}
                    mostrarUltimo={false}
                    rotulo={`Crescimento diário de ${e.rotulo} nos últimos 45 dias`}
                  />
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
