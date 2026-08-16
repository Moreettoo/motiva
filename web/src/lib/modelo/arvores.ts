/**
 * O modelo de crescimento, rodando dentro do painel.
 *
 * `modelo_vegetacao.pkl` e um HistGradientBoostingRegressor. Carrega-lo exige
 * scikit-learn, scipy e numpy: mais de 250 MB, acima do teto de bundle de uma
 * funcao serverless. Por isso a reanalise de trecho vai para o GitHub Actions.
 *
 * O simulador nao pode esperar 90 segundos por uma resposta, entao aqui a
 * abordagem e outra: `exportar_modelo.py` serializa o DESENHO das arvores
 * (165 arvores, 10.065 nos, 430 KB de JSON) e este arquivo percorre esse
 * desenho. Uma previsao sai em menos de um milissegundo.
 *
 * O algoritmo e a traducao direta de `_predict_one_from_raw_data`, em
 * `sklearn/ensemble/_hist_gradient_boosting/_predictor.pyx`. Os quatro casos de
 * desvio (faltante, categorica conhecida, categorica desconhecida, numerica)
 * estao aqui na mesma ordem em que estao la, porque a ordem importa: um valor
 * negativo numa coluna categorica e tratado como FALTANTE, nao como categoria.
 *
 * `arvores.test.ts` compara 500 previsoes contra a saida do proprio
 * scikit-learn. E ele que transforma "prever errado em silencio", o medo que o
 * CLAUDE.md registra sobre trocar a versao do sklearn, em teste vermelho.
 *
 * NAO importe este modulo de um componente cliente: sao 430 KB que nao tem o
 * que fazer no navegador. Ele nao declara `server-only` so porque o vitest
 * roda em `node` e precisa importa-lo direto.
 */

import pacote from "./modelo.json";

type ArvoreCrua = (typeof pacote.arvores)[number];

/** Uma arvore ja em arrays tipados: o laco de previsao roda 20 mil vezes por
 *  simulacao, e acesso a propriedade de objeto e a parte cara. */
type Arvore = {
  f: Int32Array;
  t: Float64Array;
  esq: Int32Array;
  dir: Int32Array;
  v: Float64Array;
  folha: Uint8Array;
  cat: Uint8Array;
  faltaEsq: Uint8Array;
  bi: Int32Array;
  /** Um bitset de 256 bits (8 x uint32) por split categorico da arvore. */
  bits: Uint32Array[];
};

function compilar(a: ArvoreCrua): Arvore {
  return {
    f: Int32Array.from(a.f),
    t: Float64Array.from(a.t),
    esq: Int32Array.from(a.e),
    dir: Int32Array.from(a.d),
    v: Float64Array.from(a.v),
    folha: Uint8Array.from(a.folha),
    cat: Uint8Array.from(a.cat),
    faltaEsq: Uint8Array.from(a.faltaEsq),
    bi: Int32Array.from(a.bi),
    bits: a.bits.map((linha) => Uint32Array.from(linha)),
  };
}

const ARVORES: Arvore[] = pacote.arvores.map(compilar);
const BASE = pacote.base;

/** Categorias que cada coluna categorica viu no treino. Uma categoria fora
 *  daqui nao vai para a direita: vai para o lado do faltante. */
const CONHECIDAS: Uint32Array[] = pacote.conhecidas.map((l) => Uint32Array.from(l));
const MAPA_CAT: Int32Array = Int32Array.from(pacote.mapaCat);

/**
 * Da ordem em que o vetor e montado para a ordem que os nos enxergam.
 *
 * Quando `categorical_features` e usado, o sklearn intercala um
 * ColumnTransformer que joga as colunas categoricas para a FRENTE antes de
 * qualquer arvore ver o dado. Quem chama `modelo.predict()` nunca percebe. Quem
 * le os nos direto, como este arquivo, percebe do pior jeito: sem a permutacao
 * a latitude (negativa) cai no split categorico da especie e e tratada como
 * valor faltante, e o modelo devolve numero plausivel e errado, sempre.
 *
 * `interno[i] = entrada[PERMUTACAO[i]]`.
 */
export const PERMUTACAO: Int32Array = Int32Array.from(pacote.permutacao);

/** Ordem em que quem chama monta o vetor, a mesma de `analisar_lote.py`. */
export const CAMPOS_ENTRADA = pacote.entrada as readonly string[];

/**
 * Faixa que cada coluna numerica assumiu no treino. A tela usa para dizer onde
 * o modelo esta extrapolando.
 *
 * `exata` distingue os dois casos que `exportar_modelo.py` sabe separar. Para
 * feature de valores inteiros (`dias_periodo`, `mes`) da para recuperar a faixa
 * exata a partir dos pontos medios entre valores observados. Para feature
 * continua nao da: a faixa sai um tico ESTREITA, porque o menor limiar de bin ja
 * esta dentro do que o modelo viu. Errar estreito e o lado seguro, mas a tela
 * nao deve prometer precisao que nao tem.
 */
export const FAIXAS_TREINO = pacote.faixas as Readonly<
  Record<string, { min: number; max: number; exata: boolean }>
>;

export const MAPAS = pacote.mapas;
export const METRICAS = pacote.metricas;
export const VERSAO_SKLEARN = pacote.sklearn;

function noBitset(linha: Uint32Array, categoria: number): boolean {
  return ((linha[categoria >>> 5] >>> (categoria & 31)) & 1) === 1;
}

function percorrer(arvore: Arvore, x: Float64Array): number {
  let i = 0;

  for (;;) {
    if (arvore.folha[i] === 1) return arvore.v[i];

    const coluna = arvore.f[i];
    const valor = x[coluna];
    const esq = arvore.esq[i];
    const dir = arvore.dir[i];
    const faltante = arvore.faltaEsq[i] === 1 ? esq : dir;

    if (Number.isNaN(valor)) {
      i = faltante;
    } else if (arvore.cat[i] === 1) {
      if (valor < 0) {
        // Negativo nao e categoria: o sklearn o trata como faltante.
        i = faltante;
      } else {
        // O sklearn converte para uint8 antes de indexar o bitset. Pelo
        // `codificar` deste modulo a categoria e sempre 0..4, entao o `& 0xff`
        // nunca muda nada, esta aqui para o percurso nao divergir se alguem
        // chamar `preverBruto` com um vetor cru.
        const c = Math.trunc(valor) & 0xff;
        if (noBitset(arvore.bits[arvore.bi[i]], c)) i = esq;
        else if (noBitset(CONHECIDAS[MAPA_CAT[coluna]], c)) i = dir;
        else i = faltante;
      }
    } else {
      i = valor <= arvore.t[i] ? esq : dir;
    }
  }
}

/**
 * Previsao a partir do vetor cru, na ordem de `CAMPOS_ENTRADA`.
 *
 * Devolve crescimento medio em cm/dia para o periodo descrito pelo vetor.
 *
 * A soma acontece na mesma ordem do `_predict_iterations` do sklearn, base
 * primeiro, depois arvore por arvore, porque soma de ponto flutuante nao e
 * associativa e o teste de paridade compara com tolerancia de 1e-12.
 */
export function preverBruto(entrada: readonly number[]): number {
  if (entrada.length !== PERMUTACAO.length) {
    throw new Error(
      `O modelo espera ${PERMUTACAO.length} valores, recebeu ${entrada.length}. ` +
        `Ordem esperada: ${CAMPOS_ENTRADA.join(", ")}.`,
    );
  }

  const x = new Float64Array(PERMUTACAO.length);
  for (let i = 0; i < PERMUTACAO.length; i += 1) x[i] = entrada[PERMUTACAO[i]];

  let soma = BASE;
  for (let a = 0; a < ARVORES.length; a += 1) soma += percorrer(ARVORES[a], x);
  return soma;
}
