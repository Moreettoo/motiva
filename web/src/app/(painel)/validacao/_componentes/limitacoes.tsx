import { TriangleAlert } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";
import { fmt } from "@/lib/format";
import type { Validacao } from "@/lib/types";

function pct(v: number | string | null): string {
  return v == null ? "—" : `${fmt.d1(Number(v) * 100)}%`;
}

/** `distanciaFronteiraClasse1` (queries.ts) já devolve cm; a frase fala em mm,
 *  a escala em que a distância é pequena o bastante para importar. */
function mm(cm: number): string {
  return `${fmt.d2(cm * 10)} mm`;
}

/**
 * Declaradas antes que perguntem. Espelha a spec §15.
 *
 * O segundo item carrega, de propósito, o framing que a apresentação de 16/09
 * escolheu: a acurácia de classe não é "o modelo erra quase metade", é uma
 * régua de três classes aplicada sobre uma previsão contínua que já acerta a
 * altura a poucos centímetros. Os dois números que sustentam essa frase —
 * a acurácia (`pct(v.acuracia_classe)`) e a distância da fronteira mais
 * próxima (`distanciaFronteiraCm`, de `validacao/queries.ts`, contra
 * `ia.validacao_pares`) — são derivados a cada render, nunca hardcoded: uma
 * validação nova (a Tarefa 13 já regravou a vigente duas vezes num único
 * dia) não pode deixar esta frase dizendo um número que a página já não
 * mostra mais. Antes desta correção só a acurácia era derivada e a distância
 * ficava fixa em "menos de 1 mm" — o comentário já dizia "decisão simétrica"
 * quando o código tratava as duas de formas diferentes; agora tratam.
 *
 * A largura da banda q10–q90 (2,91 cm nos 195 pares da validação de
 * 14/09/2026) continua fora do texto: `Validacao` não carrega essa largura, e
 * abrir uma consulta nova só para ela ficaria fora do que este componente já
 * lê. A frase fala "poucos centímetros" em vez de cravar o valor.
 */
function limitacoes(v: Validacao, distanciaFronteiraCm: number | null): string[] {
  return [
    "Duas datas apenas, ambas em março de 2026: a calibração vale para o fim da estação chuvosa em São Paulo.",
    `Classes de altura, não centímetros: a banda q10–q90 do modelo prevê a altura dentro de poucos centímetros, e os ${pct(v.acuracia_classe)} de acurácia vêm de forçar essa previsão contínua sobre uma régua de três classes${
      distanciaFronteiraCm == null
        ? ""
        : ` cuja fronteira mais próxima (10 cm, entre as classes 1 e 2) fica a ${mm(distanciaFronteiraCm)} da mediana das alturas finais previstas para quem começou na classe 1`
    }: o número que mais dói (acurácia de classe) é o mais sensível a onde a régua corta, não o que mais mede o modelo errando.`,
    `Dias desde a última roçada eram desconhecidos em ${fmt.dataMedia(v.janela_de)}: a premissa de 200 dias foi testada contra 30 e 60.`,
    "A calibração é do Rodoanel. O método transfere para outra rodovia; o número, não.",
    "Pixel de 10 m no satélite: faixas estreitas (dispositivos e marginais) ficam fora da leitura por segmento.",
    "53 roçadas inferidas em uma semana é amostra pequena para um detector automático de corte.",
    "A acurácia não é prometida: é medida a cada levantamento novo que entrar pelo importador.",
  ];
}

export function Limitacoes({ v, distanciaFronteiraCm }: { v: Validacao; distanciaFronteiraCm: number | null }) {
  return (
    <Cartao>
      <CartaoCabecalho icone={<TriangleAlert />} titulo="Limitações declaradas" descricao="O que este número não diz." />
      <CartaoCorpo>
        <ol className="space-y-2">
          {limitacoes(v, distanciaFronteiraCm).map((l, i) => (
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
