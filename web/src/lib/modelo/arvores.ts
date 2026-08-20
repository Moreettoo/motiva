/**
 * O modelo de crescimento, rodando dentro do painel.
 *
 * `modelo_gramas.pkl` sao tres `HistGradientBoostingRegressor` -- q10, q50 e
 * q90. Carrega-los exige scikit-learn, scipy e numpy: mais de 250 MB, acima do
 * teto de bundle de uma funcao serverless. Por isso a reanalise de trecho vai
 * para o GitHub Actions.
 *
 * O simulador nao pode esperar 90 segundos por uma resposta, entao aqui a
 * abordagem e outra: `exportar_modelo.py` serializa o DESENHO das arvores
 * (3 x 400 arvores, 150.000 nos, 6 MB de JSON) e este arquivo percorre esse
 * desenho. As tres previsoes saem em menos de um milissegundo.
 *
 * O algoritmo e a traducao direta de `_predict_one_from_raw_data`, em
 * `sklearn/ensemble/_hist_gradient_boosting/_predictor.pyx`. Os quatro casos de
 * desvio (faltante, categorica conhecida, categorica desconhecida, numerica)
 * estao aqui na mesma ordem em que estao la, porque a ordem importa: um valor
 * negativo numa coluna categorica e tratado como FALTANTE, nao como categoria.
 *
 * `arvores.test.ts` compara 600 previsoes x 3 quantis contra a saida do proprio
 * scikit-learn. E ele que transforma "prever errado em silencio", o medo que o
 * CLAUDE.md registra sobre trocar a versao do sklearn, em teste vermelho.
 *
 * POR QUE OS NOS FICAM EM ARRAYS ACHATADOS
 * ----------------------------------------
 * A versao anterior guardava um objeto com dez arrays tipados POR ARVORE. Com
 * 165 arvores isso era invisivel; com 1.200 seriam 12.000 arrays tipados, cada
 * um com seu cabecalho e seu buffer, alocados na carga do modulo. Aqui cada
 * ensemble tem dez arrays e um indice de inicio por arvore. Os indices `left` e
 * `right` do sklearn sao LOCAIS a arvore, entao o percurso soma o deslocamento
 * na hora de ler -- em vez de reescrever os indices, que dobraria o custo da
 * carga para economizar uma soma por no.
 *
 * NAO importe este modulo de um componente cliente: sao 6 MB que nao tem o que
 * fazer no navegador. Ele nao declara `server-only` so porque o vitest roda em
 * `node` e precisa importa-lo direto.
 */

import pacote from "./modelo.json";

/** As tres respostas do modelo para um mesmo cenario, em cm do periodo. */
export type Intervalo = {
  /** Cenario pessimista de crescimento: 10% das vezes cresce menos que isto. */
  q10: number;
  /** A mediana. E o numero de trabalho. */
  q50: number;
  /** Cenario otimista: 10% das vezes cresce mais que isto. */
  q90: number;
};

type EnsembleCru = (typeof pacote.ensembles)[number];

type Ensemble = {
  base: number;
  /** Onde comeca cada arvore dentro dos arrays de no. Tem nArvores+1 posicoes. */
  inicio: Int32Array;
  /** Onde comeca o bloco de bitsets de cada arvore, em palavras de 32 bits. */
  bitsInicio: Int32Array;
  f: Int32Array;
  t: Float64Array;
  esq: Int32Array;
  dir: Int32Array;
  v: Float64Array;
  folha: Uint8Array;
  cat: Uint8Array;
  faltaEsq: Uint8Array;
  bi: Int32Array;
  /** Bitsets de 256 bits (8 x uint32), todos os das arvores em sequencia. */
  bits: Uint32Array;
  /** Categorias que cada coluna categorica viu no treino, mesmo formato. */
  conhecidas: Uint32Array;
  mapaCat: Int32Array;
};

const PALAVRAS = 8; // 256 bits por bitset, como no sklearn

function compilar(e: EnsembleCru): Ensemble {
  const arvores = e.arvores;
  const totalNos = arvores.reduce((n, a) => n + a.f.length, 0);
  const totalBits = arvores.reduce((n, a) => n + a.bits.length, 0) * PALAVRAS;

  const saida: Ensemble = {
    base: e.base,
    inicio: new Int32Array(arvores.length + 1),
    bitsInicio: new Int32Array(arvores.length + 1),
    f: new Int32Array(totalNos),
    t: new Float64Array(totalNos),
    esq: new Int32Array(totalNos),
    dir: new Int32Array(totalNos),
    v: new Float64Array(totalNos),
    folha: new Uint8Array(totalNos),
    cat: new Uint8Array(totalNos),
    faltaEsq: new Uint8Array(totalNos),
    bi: new Int32Array(totalNos),
    bits: new Uint32Array(totalBits),
    conhecidas: Uint32Array.from(e.conhecidas.flat()),
    mapaCat: Int32Array.from(e.mapaCat),
  };

  let no = 0;
  let bit = 0;
  for (let a = 0; a < arvores.length; a += 1) {
    const arvore = arvores[a];
    saida.inicio[a] = no;
    saida.bitsInicio[a] = bit;

    saida.f.set(arvore.f, no);
    saida.t.set(arvore.t, no);
    saida.esq.set(arvore.e, no);
    saida.dir.set(arvore.d, no);
    saida.v.set(arvore.v, no);
    saida.folha.set(arvore.folha, no);
    saida.cat.set(arvore.cat, no);
    saida.faltaEsq.set(arvore.faltaEsq, no);
    saida.bi.set(arvore.bi, no);
    no += arvore.f.length;

    for (const linha of arvore.bits) {
      saida.bits.set(linha, bit);
      bit += PALAVRAS;
    }
  }
  saida.inicio[arvores.length] = no;
  saida.bitsInicio[arvores.length] = bit;

  return saida;
}

const ENSEMBLES: Ensemble[] = pacote.ensembles.map(compilar);

/**
 * Da ordem em que o vetor e montado para a ordem que os nos enxergam.
 *
 * Quando `categorical_features` e usado, o sklearn intercala um
 * ColumnTransformer que joga as colunas categoricas para a FRENTE antes de
 * qualquer arvore ver o dado. Neste modelo `especie` ja e a primeira feature, e
 * a permutacao sai identidade -- mas isso e coincidencia do treino atual, e a
 * permutacao continua vindo do JSON. No modelo anterior ela NAO era identidade,
 * e sem ela a latitude (negativa) caia no split categorico da especie e o
 * modelo devolvia numero plausivel e errado, sempre.
 *
 * `interno[i] = entrada[PERMUTACAO[i]]`.
 */
export const PERMUTACAO: Int32Array = Int32Array.from(pacote.permutacao);

/** Ordem em que quem chama monta o vetor, a mesma de `clima.montar_features`. */
export const CAMPOS_ENTRADA = pacote.entrada as readonly string[];

/** Os quantis exportados, em ordem. Sempre [0.1, 0.5, 0.9]. */
export const QUANTIS = pacote.quantis as readonly number[];

/**
 * Faixa que cada coluna numerica assumiu no treino. A tela usa para dizer onde
 * o modelo esta extrapolando.
 *
 * `exata` distingue os dois casos que `exportar_modelo.py` sabe separar. Para
 * feature de valores inteiros (`dias_periodo`, `geadas_no_periodo`) da para
 * recuperar a faixa exata a partir dos pontos medios entre valores observados.
 * Para feature continua nao da: a faixa sai um tico ESTREITA, porque o menor
 * limiar de bin ja esta dentro do que o modelo viu. Errar estreito e o lado
 * seguro, mas a tela nao deve prometer precisao que nao tem.
 */
export const FAIXAS_TREINO = pacote.faixas as Readonly<
  Record<string, { min: number; max: number; exata: boolean }>
>;

/** Categorias por coluna categorica. O CODIGO de uma categoria e o indice aqui:
 *  e o que o `OrdinalEncoder` do sklearn produz, nao um mapa a parte. */
export const CATEGORIAS = pacote.categorias as Readonly<Record<string, readonly string[]>>;

export const METRICAS = pacote.metricas;
export const VERSAO_SKLEARN = pacote.sklearn;
export const TREINADO_EM = pacote.treinadoEm;
export const LINHAS_DE_TREINO = pacote.nLinhas;
export const AVISO_DO_MODELO = pacote.aviso;

function noBitset(bits: Uint32Array, base: number, categoria: number): boolean {
  return ((bits[base + (categoria >>> 5)] >>> (categoria & 31)) & 1) === 1;
}

function percorrer(e: Ensemble, arvore: number, x: Float64Array): number {
  const off = e.inicio[arvore];
  const bitsOff = e.bitsInicio[arvore];
  let i = 0;

  for (;;) {
    const n = off + i;
    if (e.folha[n] === 1) return e.v[n];

    const coluna = e.f[n];
    const valor = x[coluna];
    const esq = e.esq[n];
    const dir = e.dir[n];
    const faltante = e.faltaEsq[n] === 1 ? esq : dir;

    if (Number.isNaN(valor)) {
      i = faltante;
    } else if (e.cat[n] === 1) {
      if (valor < 0) {
        // Negativo nao e categoria: o sklearn o trata como faltante.
        i = faltante;
      } else {
        // O sklearn converte para uint8 antes de indexar o bitset. Pelo
        // `codificarEspecie` deste projeto a categoria e sempre 0..2, entao o
        // `& 0xff` nunca muda nada; esta aqui para o percurso nao divergir se
        // alguem chamar `preverBruto` com um vetor cru.
        const c = Math.trunc(valor) & 0xff;
        if (noBitset(e.bits, bitsOff + e.bi[n] * PALAVRAS, c)) i = esq;
        else if (noBitset(e.conhecidas, e.mapaCat[coluna] * PALAVRAS, c)) i = dir;
        else i = faltante;
      }
    } else {
      i = valor <= e.t[n] ? esq : dir;
    }
  }
}

function somar(e: Ensemble, x: Float64Array): number {
  // Base primeiro, depois arvore por arvore, na mesma ordem do
  // `_predict_iterations` do sklearn: soma de ponto flutuante nao e
  // associativa e o teste de paridade compara com tolerancia de 1e-12.
  let soma = e.base;
  const n = e.inicio.length - 1;
  for (let a = 0; a < n; a += 1) soma += percorrer(e, a, x);
  return soma;
}

/**
 * Previsao a partir do vetor cru, na ordem de `CAMPOS_ENTRADA`.
 *
 * Devolve o crescimento TOTAL em cm para o periodo descrito pelo vetor -- nao
 * cm/dia. `dias_periodo` e uma das entradas, e a resposta nao e linear nele.
 *
 * Os tres modelos de quantil sao independentes e podem se CRUZAR: nada garante
 * q10 <= q50 <= q90 numa linha qualquer. A saida sai ordenada, que e a mesma
 * correcao que o notebook de calibracao e o `modelo.prever` do lote aplicam.
 * Sem ela o "intervalo" as vezes sai invertido na tela.
 */
export function preverBruto(entrada: readonly (number | null)[]): Intervalo {
  if (entrada.length !== PERMUTACAO.length) {
    throw new Error(
      `O modelo espera ${PERMUTACAO.length} valores, recebeu ${entrada.length}. ` +
        `Ordem esperada: ${CAMPOS_ENTRADA.join(", ")}.`,
    );
  }

  const x = new Float64Array(PERMUTACAO.length);
  for (let i = 0; i < PERMUTACAO.length; i += 1) {
    const v = entrada[PERMUTACAO[i]];
    // `null` e NaN sao a mesma coisa aqui: o valor faltante do sklearn. O JSON
    // das amostras usa `null` porque JSON nao tem NaN.
    x[i] = v == null ? Number.NaN : v;
  }

  const bruto = ENSEMBLES.map((e) => somar(e, x)).sort((a, b) => a - b);
  return { q10: bruto[0], q50: bruto[1], q90: bruto[2] };
}
