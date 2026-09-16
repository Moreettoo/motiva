import { fmt } from "@/lib/format";
import type { ClasseAltura, Validacao } from "@/lib/types";

/**
 * SEM CHAMADOR desde 16/09/2026, e de proposito.
 *
 * Saiu de `/evidencia` a pedido: a matriz e o grafico de fronteira eram dois
 * desenhos densos lado a lado, e nenhum dos dois se le num projetor. A
 * acuracia que ela detalha continua na tela, em numero. Voltar e renderizar
 * `<MatrizConfusao v={v} />` em `acertos.tsx` -- nada mais.
 */

const CLASSES: ClasseAltura[] = [1, 2, 3];

/** A regua da Motiva escrita como ela e -- "viu 1" nao diz nada a quem nao
 *  decorou a numeracao das classes; "ate 10 cm" diz na hora. */
const FAIXA: Record<ClasseAltura, string> = {
  1: "até 10 cm",
  2: "10 a 30 cm",
  3: "+ de 30 cm",
};

/** A rampa sequencial de `globals.css`, clara → escura. Um degrade de UM matiz,
 *  nunca arco-iris: magnitude nao tem polo, so intensidade. */
const RAMPA = ["--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5", "--seq-6"] as const;

/**
 * A partir deste passo a celula troca `--ink` por `--surface`.
 *
 * Funciona nos dois temas sem ramo de codigo porque a rampa INVERTE junto com
 * eles: no claro `--seq-6` e azul escuro e `--surface` e quase branco; no
 * escuro `--seq-6` e azul claro e `--surface` e quase preto. Os dois tokens
 * viram ao mesmo tempo que o fundo, entao o par continua contrastando. Uma cor
 * fixa (`#fff`) acertaria o claro e sumiria no escuro.
 */
const PASSO_TINTA_CLARA = 3;

function passo(fracao: number): number {
  if (fracao <= 0) return -1;
  return Math.min(RAMPA.length - 1, Math.floor(fracao * RAMPA.length));
}

/**
 * A matriz como mapa de calor, e nao como tabela de numeros.
 *
 * A intensidade e a fracao da LINHA (do que a equipe viu, quanto o modelo
 * acertou), nao do total: normalizar pelo total faria a classe 1 -- que sozinha
 * tem 130 dos 195 pares -- pintar forte em toda parte e esconder que a classe 3
 * e a que o modelo mais acerta.
 *
 * O numero aparece escrito em toda celula. Cor sozinha nunca carrega o valor:
 * e a regra da skill `dataviz` e tambem o que faz a matriz funcionar impressa.
 */
export function MatrizConfusao({ v }: { v: Validacao }) {
  const celula = (obs: ClasseAltura, prev: ClasseAltura) =>
    Number(v.matriz_confusao[String(obs) as "1" | "2" | "3"]?.[String(prev) as "1" | "2" | "3"] ?? 0);

  const totalLinha = (obs: ClasseAltura) => CLASSES.reduce((s, p) => s + celula(obs, p), 0);

  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-ink">O que a equipe viu × o que a IA disse</p>
        <p className="text-2xs text-ink-3">
          {fmt.dataMedia(v.janela_de)} → {fmt.dataMedia(v.janela_ate)}
        </p>
      </div>

      <div className="grid grid-cols-[auto_repeat(3,minmax(0,1fr))] gap-1">
        <span />
        {CLASSES.map((c) => (
          <span key={c} className="pb-1 text-center text-2xs font-medium text-ink-2">
            IA: {FAIXA[c]}
          </span>
        ))}

        {CLASSES.map((obs) => {
          const total = totalLinha(obs);
          return (
            <div key={obs} className="contents">
              <span className="flex items-center justify-end pr-2 text-right text-2xs font-medium text-ink-2">
                viu {FAIXA[obs]}
              </span>
              {CLASSES.map((prev) => {
                const n = celula(obs, prev);
                const fracao = total ? n / total : 0;
                const p = passo(fracao);
                const acerto = obs === prev;

                return (
                  <div
                    key={prev}
                    title={`A equipe viu ${FAIXA[obs]}, a IA disse ${FAIXA[prev]}: ${fmt.n(n)} ${n === 1 ? "medição" : "medições"}${total ? ` (${fmt.d1(fracao * 100)}% da linha)` : ""}`}
                    className="flex aspect-[2/1] min-w-0 flex-col items-center justify-center rounded-md"
                    style={{
                      background: p < 0 ? "var(--surface-3)" : `var(${RAMPA[p]})`,
                      // Borda por `style`: toda utility `border-<cor>` do
                      // Tailwind e morta neste projeto (ver CLAUDE.md).
                      outline: acerto ? "2px solid var(--ink)" : undefined,
                      outlineOffset: acerto ? "-2px" : undefined,
                      color:
                        p >= PASSO_TINTA_CLARA ? "var(--surface)" : p < 0 ? "var(--ink-3)" : "var(--ink)",
                    }}
                  >
                    <span className="tnum font-mono text-lg leading-none font-semibold">{fmt.n(n)}</span>
                    <span className="tnum mt-1 font-mono text-2xs opacity-80">
                      {total ? fmt.pct(fracao * 100) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-2xs text-ink-3">
        As caixas contornadas são os acertos. Quanto mais forte a cor, maior a parte daquela linha.
      </p>
    </div>
  );
}
