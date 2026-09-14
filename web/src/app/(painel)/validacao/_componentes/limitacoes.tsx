import { TriangleAlert } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";
import { fmt } from "@/lib/format";
import type { Validacao } from "@/lib/types";

function pct(v: number | string | null): string {
  return v == null ? "—" : `${fmt.d1(Number(v) * 100)}%`;
}

/**
 * Declaradas antes que perguntem. Espelha a spec §15.
 *
 * O segundo item carrega, de propósito, o framing que a apresentação de 16/09
 * escolheu: a acurácia de classe não é "o modelo erra quase metade", é uma
 * régua de três classes aplicada sobre uma previsão contínua que já acerta a
 * altura a poucos centímetros. A acurácia entra como `${pct(v.acuracia_classe)}`,
 * derivada de `v` a cada render — nunca hardcoded — porque o ladrilho de
 * `ResumoValidacao` já mostra o mesmo número ao vivo, e uma validação nova
 * (a Tarefa 13 já regravou a vigente duas vezes num único dia) não pode
 * deixar esta frase dizendo um número que a página já não mostra mais.
 *
 * A largura da banda q10–q90 (medida à parte, 2,91 cm nos 195 pares da
 * validação de 14/09/2026, contra `ia.validacao_pares`) fica de fora do texto
 * por decisão simétrica: `Validacao` não carrega essa largura, então o
 * componente não tem como conferir o número a cada render — só teria como
 * escrevê-lo fixo, o mesmo problema que motivou tirar "60,5%" daqui. A frase
 * abaixo fala "poucos centímetros" em vez de cravar o valor.
 */
function limitacoes(v: Validacao): string[] {
  return [
    "Duas datas apenas, ambas em março de 2026: a calibração vale para o fim da estação chuvosa em São Paulo.",
    `Classes de altura, não centímetros: a banda q10–q90 do modelo prevê a altura dentro de poucos centímetros, e os ${pct(v.acuracia_classe)} de acurácia vêm de forçar essa previsão contínua sobre uma régua de três classes cuja fronteira mais próxima fica a menos de 1 mm da mediana prevista: o número que mais dói (acurácia de classe) é o mais sensível a onde a régua corta, não o que mais mede o modelo errando.`,
    "Dias desde a última roçada eram desconhecidos em 13/03: a premissa de 200 dias foi testada contra 30 e 60.",
    "A calibração é do Rodoanel. O método transfere para outra rodovia; o número, não.",
    "Pixel de 10 m no satélite: faixas estreitas (dispositivos e marginais) ficam fora da leitura por segmento.",
    "53 roçadas inferidas em uma semana é amostra pequena para um detector automático de corte.",
    "A acurácia não é prometida: é medida a cada levantamento novo que entrar pelo importador.",
  ];
}

export function Limitacoes({ v }: { v: Validacao }) {
  return (
    <Cartao>
      <CartaoCabecalho icone={<TriangleAlert />} titulo="Limitações declaradas" descricao="O que este número não diz." />
      <CartaoCorpo>
        <ol className="space-y-2">
          {limitacoes(v).map((l, i) => (
            <li key={l} className="flex gap-2.5 text-sm text-ink-2">
              <span aria-hidden="true" className="tnum shrink-0 font-mono text-2xs text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 break-words">{l}</span>
            </li>
          ))}
        </ol>
      </CartaoCorpo>
    </Cartao>
  );
}
