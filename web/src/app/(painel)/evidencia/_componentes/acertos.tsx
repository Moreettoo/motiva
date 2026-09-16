import { Cartao, CartaoCorpo } from "@/components/ui/cartao";
import { fmt } from "@/lib/format";
import {
  MARGEM_CM,
  resumirAcertoDeAltura,
  type ParProjetado,
  type ResumoFronteira,
} from "@/lib/validacao/fronteira";
import type { Validacao } from "@/lib/types";

import { GraficoFronteira } from "./grafico-fronteira";
import { Ladrilho } from "./ladrilho";

const pct = (v: number | string | null) => (v == null ? "—" : `${fmt.d1(Number(v) * 100)}%`);

/** Uma leitura do placar da regua: numero curto, uma linha de contexto. */
function Leitura({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div className="min-w-0">
      <span className="text-2xs tracking-widest text-ink-3 uppercase">{rotulo}</span>
      <p className="tnum mt-1.5 font-mono text-2xl leading-none font-semibold text-ink">{valor}</p>
      <p className="mt-1.5 text-xs text-ink-2">{nota}</p>
    </div>
  );
}

export function Acertos({
  v,
  pares,
  resumo,
}: {
  v: Validacao;
  pares: ParProjetado[];
  resumo: ResumoFronteira[];
}) {
  const usados = Number(v.n_pares_usados);
  const estaveis = Number(v.estaveis_total ?? 0);
  const linhaDeBase = usados ? estaveis / usados : 0;

  // O acerto de ALTURA, que e a afirmacao mais forte que estes dados sustentam.
  // Calculado aqui dos mesmos pares que o grafico desenha -- nao e um numero
  // copiado do relatorio.
  const acerto = resumirAcertoDeAltura(pares);

  // A classe onde o amontoado esta. Sai do resumo, nunca fixa em 1: uma
  // validacao de outra rodovia pode nao ter a mesma forma.
  const maisApertada = [...resumo].sort(
    (a, b) => Math.abs(a.medianaAteFronteiraCm) - Math.abs(b.medianaAteFronteiraCm),
  )[0];
  const erroMm = Math.abs(maisApertada.medianaAteFronteiraCm) * 10;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Ladrilho
          destaque
          rotulo="Acertou a altura"
          valor={`${fmt.n(acerto.dentroComMargem)} de ${fmt.n(acerto.n)}`}
          nota="a altura que ela previu coube onde a equipe viu o capim"
          detalhe={`Dentro da faixa observada, ou a menos de ${fmt.d1(MARGEM_CM)} cm dela. ${fmt.n(acerto.dentroDaBanda)} caíram dentro sem margem nenhuma.`}
        />
        <Ladrilho
          destaque
          rotulo="Erro de altura"
          valor={fmt.d2(acerto.mediaCm)}
          unidade="cm"
          nota={
            acerto.medianaCm === 0
              ? "na média — metade das medições errou zero"
              : `na média — metade errou até ${fmt.d2(acerto.medianaCm)} cm`
          }
        />
        <Ladrilho
          destaque
          rotulo="Da linha que decide a caixa"
          valor={fmt.d2(erroMm)}
          unidade="mm"
          nota="é onde a resposta típica dela caiu"
        />
        <Ladrilho
          destaque
          rotulo="Medições conferidas"
          valor={fmt.n(usados)}
          nota={`outras ${fmt.n(v.n_rocados_excluidos)} foram roçadas no meio da semana e ficaram de fora`}
        />
      </div>

      <Cartao>
        <CartaoCorpo className="p-5">
          <GraficoFronteira pares={pares} resumo={resumo} />
        </CartaoCorpo>
      </Cartao>

      {/* O placar da regua de tres caixas, e a causa de ele discordar do de
          cima. Os dois numeros ficam: uma tela de evidencia que mostra so o
          lado favoravel para de ser evidencia. O que muda e o peso -- eles
          explicam o de cima em vez de liderar a secao. */}
      <Cartao>
        <CartaoCorpo className="grid gap-6 p-5 lg:grid-cols-[auto_auto_minmax(0,1fr)] lg:items-center">
          <div className="lg:border-r lg:border-border lg:pr-6">
            <Leitura
              rotulo="Acertou a caixa exata"
              valor={pct(v.acuracia_classe)}
              nota={`a aposta "nada muda" acertaria ${pct(linhaDeBase)}`}
            />
          </div>

          <div className="lg:border-r lg:border-border lg:pr-6">
            <Leitura
              rotulo="Avisou a subida de faixa"
              valor={`${fmt.n(v.transicoes_detectadas ?? 0)} de ${fmt.n(v.transicoes_total ?? 0)}`}
              nota={`com ${fmt.n(v.alarmes_falsos ?? 0)} alarmes onde nada mudou`}
            />
          </div>

          <div className="min-w-0">
            <span className="text-2xs tracking-widest text-ink-3 uppercase">
              Por que os dois placares discordam
            </span>
            <p className="mt-1.5 text-sm text-ink">
              A equipe anota em três caixas: até 10 cm, de 10 a 30, acima de 30.
            </p>
            <p className="mt-1 text-sm text-ink-2">
              A resposta típica dela caiu a {fmt.d2(erroMm)} mm da linha dos {fmt.n(maisApertada.fronteiraCm)} cm.
            </p>
          </div>
        </CartaoCorpo>
      </Cartao>
    </div>
  );
}
