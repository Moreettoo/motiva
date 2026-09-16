import { FRONTEIRAS_CM } from "../validacao/fronteira";

/**
 * O erro do treino ao lado das distancias que decidem a roçada.
 *
 * A secao "A prova do treino" diz um numero -- o erro em lugares que o modelo
 * nunca viu -- e um numero sozinho nao tem tamanho. Desenhado contra a regua da
 * Motiva, tem: a mesma escala mostra que o erro e uma fracao do degrau que
 * separa uma faixa da seguinte.
 *
 * Puro de propriedade, no molde de `validacao/fronteira.ts`: e a conta que
 * sustenta o desenho, e conta que sustenta desenho precisa de teste.
 */

/** Piso da barra do erro, em porcentagem da maior.
 *
 *  Sem ele a barra que a secao existe para mostrar e a unica que some: 1,29 em
 *  30 cm da 4,3%, e um modelo mais preciso levaria isso a sub-pixel. O piso
 *  vale SO para o erro -- as fronteiras ficam na escala real, senao o desenho
 *  passaria a mentir sobre a proporcao que ele existe para mostrar. */
export const LARGURA_MINIMA_PCT = 2.5;

export type BarraProva = {
  chave: "troca" | "faixa" | "erro";
  rotulo: string;
  valorCm: number;
  larguraPct: number;
  destaque: boolean;
};

/**
 * As tres barras, da maior para a menor.
 *
 * O erro vem por ultimo porque a leitura termina nele: os dois degraus da regua
 * entram primeiro para dar a referencia, e a lasca do erro fecha a frase.
 */
export function barrasDaProva(erroCm: number): BarraProva[] {
  const [menor, maior] = FRONTEIRAS_CM;

  const valores = [
    { chave: "troca", rotulo: `Troca para a faixa de cima`, valorCm: maior, destaque: false },
    { chave: "faixa", rotulo: `A linha que decide a faixa`, valorCm: menor, destaque: false },
    { chave: "erro", rotulo: "O quanto ela erra", valorCm: erroCm, destaque: true },
  ] as const;

  // A escala sai do maior valor PRESENTE, nunca da maior fronteira: retreinar o
  // modelo move o erro, e uma escala presa em 30 cm desenharia uma barra
  // estourando o cartao no dia em que ele passasse disso.
  const escala = Math.max(...valores.map((v) => v.valorCm));

  return valores.map((v) => {
    const bruta = escala === 0 ? 0 : (v.valorCm / escala) * 100;
    return {
      chave: v.chave,
      rotulo: v.rotulo,
      valorCm: v.valorCm,
      larguraPct: v.destaque ? Math.max(bruta, LARGURA_MINIMA_PCT) : bruta,
      destaque: v.destaque,
    };
  });
}
