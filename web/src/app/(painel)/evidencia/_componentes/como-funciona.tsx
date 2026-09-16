import { ArrowRight } from "lucide-react";

import { Cartao, CartaoCorpo } from "@/components/ui/cartao";
import { ESPECIE } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import { CENARIO_REFERENCIA, type EfeitoEspecie, type EfeitoFeature } from "@/lib/modelo/ficha";

import { GraficoEfeitos } from "./grafico-efeitos";

/** Um passo do fluxo. Tres palavras no titulo, tres embaixo -- o desenho
 *  carrega a explicacao, nao o paragrafo. */
function Passo({ n, titulo, detalhe, ultimo }: { n: number; titulo: string; detalhe: string; ultimo?: boolean }) {
  return (
    <li className="flex min-w-0 flex-1 items-center gap-3">
      <div className="min-w-0 flex-1">
        <span className="tnum block font-mono text-2xs text-ink-3">{String(n).padStart(2, "0")}</span>
        <span className="mt-1 block text-sm font-medium text-ink">{titulo}</span>
        <span className="mt-0.5 block text-xs text-ink-3">{detalhe}</span>
      </div>
      {ultimo ? null : (
        <ArrowRight aria-hidden="true" className="hidden size-4 shrink-0 text-ink-3 lg:block" />
      )}
    </li>
  );
}

export function ComoFunciona({
  especies,
  totalFeatures,
}: {
  especies: EfeitoEspecie[];
  totalFeatures: number;
}) {
  const maior = especies[0];
  const menor = especies[especies.length - 1];
  const vezes = menor.q50 > 0.05 ? maior.q50 / menor.q50 : maior.q50 / 0.05;

  return (
    <div className="grid gap-4">
      <Cartao>
        <CartaoCorpo className="p-5">
          <ol className="flex flex-col gap-5 lg:flex-row lg:items-start">
            <Passo n={1} titulo="Olha o lugar" detalhe="clima do dia a dia e o solo daquele ponto" />
            <Passo n={2} titulo={`Junta ${fmt.n(totalFeatures)} informações`} detalhe="chuva, calor, água no solo, tipo de capim" />
            <Passo n={3} titulo="Dá três respostas" detalhe="o mínimo, o mais provável e o máximo" />
            <Passo n={4} titulo="Diz a data da roçada" detalhe="o dia em que o capim passa do limite" ultimo />
          </ol>
        </CartaoCorpo>
      </Cartao>

      {/* Especie em tres colunas, largura cheia, e o grafico embaixo.
          Lado a lado com as 19 barras do grafico ela esticava para acompanhar
          a altura dele e abria um vao de 270 px no meio do cartao: tres
          valores nao preenchem a altura de dezenove. */}
      <Cartao>
        <CartaoCorpo className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-ink">O tipo de capim pesa mais que tudo</p>
            <p className="text-xs text-ink-3">Mesmo lugar, mesmo clima, mesma época. Só o capim muda.</p>
          </div>

          <ul className="mt-5 grid gap-5 sm:grid-cols-3">
            {especies.map((e) => {
              const fracao = maior.q50 > 0 ? Math.max(0, e.q50) / maior.q50 : 0;
              return (
                <li key={e.especie} className="min-w-0">
                  <span className="block text-xs text-ink-2">
                    {ESPECIE[e.especie as keyof typeof ESPECIE]?.rotulo ?? e.especie}
                  </span>
                  <span className="tnum mt-1.5 block font-mono text-2xl leading-none font-semibold text-ink">
                    {fmt.cm(e.q50)}
                  </span>
                  <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(fracao * 100, 1.5)}%`, background: "var(--s1)" }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="mt-5 text-xs text-ink-2">
            <strong className="tnum font-mono text-base font-semibold text-ink">{fmt.d1(vezes)}×</strong>{" "}
entre o que mais cresce e o que menos cresce — e ninguém anotou qual está em cada trecho.
          </p>
        </CartaoCorpo>
      </Cartao>

    </div>
  );
}

/**
 * O grafico de sensibilidade, sozinho numa tela.
 *
 * Saiu de dentro de `ComoFunciona` porque nao cabia: 19 barras mais o fluxo
 * mais a especie passavam de 890 px, contra ~720 px de janela util. Encolher a
 * barra resolveria no papel e pioraria a leitura -- o grafico e o bloco mais
 * denso da pagina e e o que mais ganha com espaco.
 */
export function OQueMove({
  features,
  totalFeatures,
}: {
  features: EfeitoFeature[];
  totalFeatures: number;
}) {
  const cenario = ESPECIE[CENARIO_REFERENCIA.especie as keyof typeof ESPECIE]?.rotulo.toLowerCase();

  return (
    <Cartao>
      <CartaoCorpo className="p-5">
        <GraficoEfeitos
          linhas={features}
          titulo={`As outras ${fmt.n(totalFeatures - 1)} informações`}
          descricao={`Quanto o capim cresce a mais, ou a menos, quando cada informação vai do menor ao maior valor já visto. Situação usada: ${cenario} de ${fmt.cm(CENARIO_REFERENCIA.alturaInicialCm)}, roçada há ${fmt.n(CENARIO_REFERENCIA.diasDesdeRocada)} dias, ao longo de ${fmt.n(CENARIO_REFERENCIA.diasPeriodo)} dias.`}
        />
      </CartaoCorpo>
    </Cartao>
  );
}
