"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
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

const FACE = "rounded-lg border bg-surface p-4 [backface-visibility:hidden]";

/** Cor de borda inline: `globals.css` tem `* { border-color: var(--border) }`
 *  fora de camada e vence as utilities do Tailwind, entao `border-border-strong`
 *  resolvia para o cinza fraco. A classe so troca a variavel. */
const BORDA = { borderColor: "var(--borda, var(--border))" } as const;

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

  /* `inert` na face escondida e o que tira o conteudo do Tab -- e tambem o que
     derrubava o foco para o `<body>`: o botao "Ver por especie" mora DENTRO da
     frente, entao aciona-lo tornava inert o proprio ancestral do no focado.
     Medido: `document.activeElement` virava `BODY`. O foco vai agora para o
     controle equivalente da outra face, mas SO quando a virada veio de
     comando; virar por hover e roubar o foco de quem esta digitando noutro
     lugar da tela seria trocar um defeito por outro pior. */
  const refFrente = useRef<HTMLButtonElement>(null);
  const refVerso = useRef<HTMLButtonElement>(null);
  /* Ref e nao estado: a intencao nao pinta nada, e um segundo `useState` so
     para o efeito zerar depois seria estado derivado de estado. */
  const virouPorComando = useRef(false);

  useEffect(() => {
    if (!virouPorComando.current) return;
    virouPorComando.current = false;
    (virado ? refVerso : refFrente).current?.focus();
  }, [virado]);

  function virar(paraOVerso: boolean) {
    virouPorComando.current = true;
    setVirado(paraOVerso);
  }

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
            className={cn(FACE, "group-hover:bg-surface-2 group-hover:[--borda:var(--border-strong)]")}
            style={BORDA}
            inert={virado}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-2xs font-medium tracking-wider text-ink-3 uppercase">
                {dados.rotulo}
              </span>
              <BotaoIcone
                ref={refFrente}
                rotulo={virado ? "Fechar" : "Ver por espécie"}
                tamanho="sm"
                variante="fantasma"
                onClick={() => virar(!virado)}
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
              "absolute inset-0 flex flex-col [transform:rotateY(180deg)] group-hover:bg-surface-2 group-hover:[--borda:var(--border-strong)]",
            )}
            style={BORDA}
            inert={!virado}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-2xs font-medium tracking-wider text-ink-3 uppercase">
                Escolha a espécie
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {/* Mora AQUI, e nao na frente. O card vira no `onMouseEnter` do
                    invólucro, entao qualquer botao da frente e inalcancavel com
                    o mouse: vindo de fora, o ponteiro dispara a virada ANTES de
                    chegar nele, e a frente fica inert e com `backface-visibility:
                    hidden`. Medido: o clique em "voltar a malha" estourava por
                    timeout, e este e o unico caminho para limpar `?especie=`. */}
                {ativa ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEspecieSelecionada(null);
                      virar(false);
                    }}
                    className="text-2xs font-medium text-ink-3 underline decoration-dotted underline-offset-2 hover:text-ink-2"
                  >
                    voltar à malha
                  </button>
                ) : null}
                <BotaoIcone ref={refVerso} rotulo="Fechar" tamanho="sm" variante="fantasma" onClick={() => virar(false)}>
                  <X aria-hidden="true" className="size-4" />
                </BotaoIcone>
              </span>
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
                      ? "bg-surface-2 [--borda:var(--border-strong)]"
                      : "hover:bg-surface-2 hover:[--borda:var(--border-strong)]",
                  )}
                  style={BORDA}
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
