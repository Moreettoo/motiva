import { describe, expect, it } from "vitest";

import amostras from "./amostras.json";
import { CAMPOS_ENTRADA, PERMUTACAO, preverBruto } from "./arvores";

/**
 * A rede de seguranca do modelo portado.
 *
 * `amostras.json` sai do `exportar_modelo.py`: 500 vetores de entrada e a saida
 * do PROPRIO scikit-learn para cada um. Se o percurso em TypeScript divergir em
 * qualquer amostra, isto fica vermelho.
 *
 * Existe porque a falha desse tipo de porta nao e um erro: e um numero plausivel
 * e errado. Sem a permutacao de colunas, por exemplo, tudo compila, tudo roda, e
 * toda previsao sai torta, que e exatamente o "prever errado em silencio" que o
 * CLAUDE.md registra como o risco de mexer na versao do sklearn.
 *
 * Quem retreinar o modelo precisa rodar `python exportar_modelo.py`. Esquecer
 * quebra aqui, e nao em producao.
 */

describe("modelo de crescimento portado do .pkl", () => {
  it("gera as amostras a partir da mesma lista de features do modelo", () => {
    expect(amostras.entrada).toEqual([...CAMPOS_ENTRADA]);
  });

  it("reproduz o scikit-learn em todas as 500 amostras", () => {
    expect(amostras.vetores).toHaveLength(amostras.saidas.length);
    expect(amostras.vetores.length).toBeGreaterThan(400);

    let pior = 0;
    let ondeDeu = -1;

    for (let i = 0; i < amostras.vetores.length; i += 1) {
      const desvio = Math.abs(preverBruto(amostras.vetores[i]) - amostras.saidas[i]);
      if (desvio > pior) {
        pior = desvio;
        ondeDeu = i;
      }
    }

    // 1e-12 e folga generosa sobre o epsilon do float64: o percurso e
    // deterministico e a soma segue a mesma ordem do sklearn, entao na pratica
    // o desvio observado fica na casa de 1e-16.
    expect(
      pior,
      `pior desvio na amostra ${ondeDeu}: ${amostras.vetores[ondeDeu]?.join(", ")}`,
    ).toBeLessThan(1e-12);
  });

  it("mantem a permutacao de colunas que o ColumnTransformer do sklearn aplica", () => {
    // Se esta expectativa quebrar, o modelo foi retreinado com outro conjunto de
    // categoricas. Nao "conserte" o numero: confira que `exportar_modelo.py`
    // rodou de novo e que o teste de paridade acima continua passando.
    expect([...PERMUTACAO]).toEqual([11, 12, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("recusa vetor com o numero errado de valores em vez de prever torto", () => {
    expect(() => preverBruto([1, 2, 3])).toThrow(/espera 13 valores/);
  });
});
