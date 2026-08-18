import { describe, expect, it } from "vitest";

import amostras from "./amostras.json";
import { CAMPOS_ENTRADA, CATEGORIAS, PERMUTACAO, QUANTIS, preverBruto } from "./arvores";

/**
 * A rede de seguranca do modelo portado.
 *
 * `amostras.json` sai do `exportar_modelo.py`: 600 vetores de entrada e as TRES
 * saidas do PROPRIO scikit-learn para cada um. Se o percurso em TypeScript
 * divergir em qualquer amostra, isto fica vermelho.
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
    expect(amostras.quantis).toEqual([...QUANTIS]);
  });

  it("reproduz o scikit-learn nos tres quantis de todas as amostras", () => {
    expect(amostras.vetores).toHaveLength(amostras.saidas.length);
    expect(amostras.vetores.length).toBeGreaterThan(500);

    let pior = 0;
    let ondeDeu = -1;

    for (let i = 0; i < amostras.vetores.length; i += 1) {
      const nosso = preverBruto(amostras.vetores[i]);
      // O sklearn devolve os quantis na ordem [q10, q50, q90] mas os tres
      // modelos sao independentes e podem se cruzar. `preverBruto` ordena, e a
      // referencia precisa ser ordenada do mesmo jeito para a comparacao ser
      // sobre o percurso, e nao sobre o cruzamento.
      const deles = [...amostras.saidas[i]].sort((a, b) => a - b);

      for (const [j, previsto] of [nosso.q10, nosso.q50, nosso.q90].entries()) {
        const desvio = Math.abs(previsto - deles[j]);
        if (desvio > pior) {
          pior = desvio;
          ondeDeu = i;
        }
      }
    }

    // 1e-12 e folga generosa sobre o epsilon do float64: o percurso e
    // deterministico e a soma segue a mesma ordem do sklearn, entao na pratica
    // o desvio observado fica na casa de 1e-15.
    expect(
      pior,
      `pior desvio na amostra ${ondeDeu}: ${amostras.vetores[ondeDeu]?.join(", ")}`,
    ).toBeLessThan(1e-12);
  });

  it("cobre o caminho da especie desconhecida, que vira valor faltante", () => {
    // O `OrdinalEncoder` do sklearn foi ajustado com `unknown_value=nan`: uma
    // especie fora de `categorias` NAO vira a categoria zero, vira faltante. Se
    // o exportador parar de gerar essas linhas, o percurso do faltante numa
    // coluna categorica deixa de ser testado sem ninguem notar.
    const codigo = amostras.entrada.indexOf("especie");
    const semEspecie = amostras.vetores.filter((v) => v[codigo] == null);
    expect(semEspecie.length).toBeGreaterThan(10);
  });

  it("sempre devolve o intervalo ordenado, mesmo quando os modelos se cruzam", () => {
    for (const vetor of amostras.vetores) {
      const { q10, q50, q90 } = preverBruto(vetor);
      expect(q10).toBeLessThanOrEqual(q50);
      expect(q50).toBeLessThanOrEqual(q90);
    }
  });

  it("mantem a permutacao de colunas que o ColumnTransformer do sklearn aplica", () => {
    // Neste modelo `especie` ja e a primeira feature, entao a permutacao sai
    // identidade. Se esta expectativa quebrar, o modelo foi retreinado com
    // outra ordem de features. Nao "conserte" o array: confira que
    // `exportar_modelo.py` rodou de novo e que a paridade acima continua
    // passando -- e ela quem prova que a permutacao nova esta certa.
    expect([...PERMUTACAO]).toEqual([...Array(20).keys()]);
  });

  it("conhece as tres especies, na ordem que o OrdinalEncoder usou", () => {
    expect(CATEGORIAS.especie).toEqual(["batatais", "braquiaria", "esmeralda"]);
  });

  it("recusa vetor com o numero errado de valores em vez de prever torto", () => {
    expect(() => preverBruto([1, 2, 3])).toThrow(/espera 20 valores/);
  });
});
