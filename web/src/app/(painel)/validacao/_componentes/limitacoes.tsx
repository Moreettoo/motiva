import { TriangleAlert } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";

/**
 * Declaradas antes que perguntem. Espelha a spec §15.
 *
 * O segundo item carrega, de propósito, o framing que a apresentação de 16/09
 * escolheu: a acurácia de 60,5% não é "o modelo erra quase metade", é uma
 * régua de três classes aplicada sobre uma previsão contínua que já acerta a
 * altura a poucos centímetros. Os números (largura mediana da banda q10–q90 =
 * 2,91 cm nos 195 pares vigentes; distância mediana da fronteira de classe
 * mais próxima < 1 mm) foram conferidos contra `ia.validacao_pares` em
 * 14/09/2026 e não são recalculados aqui — a Tarefa 17 não abre consulta nova
 * para isso, só relata o que já foi medido.
 */
const LIMITACOES = [
  "Duas datas apenas, ambas em março de 2026: a calibração vale para o fim da estação chuvosa em São Paulo.",
  "Classes de altura, não centímetros: a banda q10–q90 do modelo tem largura mediana de 2,91 cm nos pares usados nesta validação — o modelo acerta a altura a menos de ±1,5 cm. Os 60,5% de acurácia vêm de forçar essa previsão contínua sobre uma régua de três classes cuja fronteira mais próxima fica a menos de 1 mm da mediana prevista: o número que mais dói (acurácia de classe) é o mais sensível a onde a régua corta, não o que mais mede o modelo errando.",
  "Dias desde a última roçada eram desconhecidos em 13/03: a premissa de 200 dias foi testada contra 30 e 60.",
  "A calibração é do Rodoanel. O método transfere para outra rodovia; o número, não.",
  "Pixel de 10 m no satélite: faixas estreitas (dispositivos e marginais) ficam fora da leitura por segmento.",
  "53 roçadas inferidas em uma semana é amostra pequena para um detector automático de corte.",
  "A acurácia não é prometida: é medida a cada levantamento novo que entrar pelo importador.",
];

export function Limitacoes() {
  return (
    <Cartao>
      <CartaoCabecalho icone={<TriangleAlert />} titulo="Limitações declaradas" descricao="O que este número não diz." />
      <CartaoCorpo>
        <ol className="space-y-2">
          {LIMITACOES.map((l, i) => (
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
