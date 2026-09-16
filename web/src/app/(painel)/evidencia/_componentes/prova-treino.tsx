import { Check, EyeOff, HelpCircle } from "lucide-react";

import { Cartao, CartaoCorpo } from "@/components/ui/cartao";
import { fmt } from "@/lib/format";

import { Ladrilho } from "./ladrilho";
import { ReguaErro } from "./regua-erro";

type Metricas = {
  r2_aleatorio: number;
  mae_aleatorio: number;
  r2_locais_novos: number;
  mae_locais_novos: number;
  cobertura_q10_q90: number;
};

const PASSOS = [
  { icone: <EyeOff />, texto: "Escondemos lugares inteiros dela." },
  { icone: <HelpCircle />, texto: "Pedimos o crescimento deles." },
  { icone: <Check />, texto: "Conferimos com a resposta certa." },
] as const;

/**
 * O exame que o modelo prestou no fim do treino, e a nota.
 *
 * Fica separada de `ComoTreinou` de proposito: aquela conta o que ENTROU, esta
 * conta quanto ele TIROU. Juntas viravam um cartao onde o numero que importa --
 * o erro em lugar nunca visto -- era o quarto item de uma lista.
 *
 * O holdout foi GEOGRAFICO, nao aleatorio: foram escondidos locais inteiros, e
 * nao linhas sorteadas. E a diferenca entre "sabe responder sobre o que
 * estudou" e "aprendeu a regra", e e a unica razao de a piora valer alguma
 * coisa como evidencia.
 */
export function ProvaTreino({ metricas }: { metricas: Metricas }) {
  const piora = metricas.mae_locais_novos - metricas.mae_aleatorio;

  return (
    <div className="grid gap-4">
      {/* O exame em tres passos. E o "fluxo" da prova, e ele precisa vir antes
          do numero: sem saber o que foi escondido, 1,29 cm nao e evidencia de
          nada. */}
      <Cartao>
        <div className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {PASSOS.map((p, i) => (
            <div key={p.texto} className="flex min-w-0 items-start gap-3 p-5">
              <span
                aria-hidden="true"
                className="tnum shrink-0 font-mono text-2xs tracking-widest"
                style={{ color: "var(--accent)" }}
              >
                {i + 1}
              </span>
              <span className="flex min-w-0 items-start gap-2.5">
                <span aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3 [&_svg]:size-4">
                  {p.icone}
                </span>
                <span className="text-sm text-ink">{p.texto}</span>
              </span>
            </div>
          ))}
        </div>
      </Cartao>

      {/* A nota, desenhada. */}
      <Cartao>
        <CartaoCorpo className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 flex-col gap-4">
            <div>
              <span className="text-2xs tracking-widest text-ink-3 uppercase">
                O erro dela, do tamanho que é
              </span>
              <p className="mt-1 text-sm text-ink-2">Todas na mesma escala.</p>
            </div>
            <ReguaErro erroCm={metricas.mae_locais_novos} />
          </div>

          <div className="flex flex-col justify-center lg:w-52 lg:border-l lg:border-border lg:pl-6">
            <span className="text-2xs tracking-widest text-ink-3 uppercase">Erra por</span>
            <span className="tnum mt-2 block font-mono text-4xl leading-none font-semibold whitespace-nowrap text-ink">
              {fmt.d2(metricas.mae_locais_novos)}
              <span className="ml-1.5 text-base font-normal text-ink-3">cm</span>
            </span>
            <span className="mt-2 text-xs text-ink-2">Em lugares onde nunca esteve.</span>
          </div>
        </CartaoCorpo>
      </Cartao>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Ladrilho
          rotulo="Onde já esteve"
          valor={fmt.d2(metricas.mae_aleatorio)}
          unidade="cm"
          nota="trechos que ela estudou"
        />
        <Ladrilho
          rotulo="Onde nunca esteve"
          valor={fmt.d2(metricas.mae_locais_novos)}
          unidade="cm"
          nota="lugares escondidos dela"
        />
        <Ladrilho
          rotulo="Piora"
          valor={fmt.d2(piora)}
          unidade="cm"
          nota="aprendeu a regra, não decorou os trechos"
        />
        <Ladrilho
          rotulo="A certa coube no intervalo"
          valor={fmt.pct(metricas.cobertura_q10_q90 * 100)}
          nota="ela promete 80%"
          detalhe={`Cobertura medida da banda q10–q90: ${fmt.pct(metricas.cobertura_q10_q90 * 100, 1)}.`}
        />
      </div>
    </div>
  );
}
