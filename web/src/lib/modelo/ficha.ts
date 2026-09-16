import amostras from "./amostras.json";
import {
  CAMPOS_ENTRADA,
  CATEGORIAS,
  FAIXAS_TREINO,
  LINHAS_DE_TREINO,
  METRICAS,
  QUANTIS,
  TREINADO_EM,
  VERSAO_SKLEARN,
  preverBruto,
} from "./arvores";
import { codificarEspecie } from "./campos";
import fixture from "./fixture-features.json";
import pacote from "./modelo.json";

/**
 * A ficha do modelo: o que a pagina `/evidencia` mostra sobre ele.
 *
 * Tudo aqui e DERIVADO do proprio `modelo.json` -- nenhum numero desta pasta e
 * digitado a mao. Retreinar o modelo e rodar `exportar_modelo.py` move a pagina
 * junto; nao mover e o modo de falha que este arquivo existe para evitar (uma
 * tela afirmando a precisao de um modelo que ja foi trocado).
 *
 * Modulo puro de propriedade intencional: sem `server-only`, sem rede, sem
 * banco. E o que permite `ficha.test.ts` rodar as contas de verdade, contra as
 * arvores de verdade, em vez de contra um dublê.
 */

/** Tolerancia do teste de paridade (`arvores.test.ts`), repetida aqui porque a
 *  tela mostra contra o que o desvio medido foi comparado. */
export const TOLERANCIA_PARIDADE = 1e-12;

export type Paridade = {
  /** Vetores de referencia conferidos (`amostras.json`). */
  amostras: number;
  /** Previsoes conferidas: uma por amostra por quantil. */
  previsoes: number;
  /** Maior desvio absoluto, em cm, entre o TypeScript e o scikit-learn. */
  piorDesvio: number;
  tolerancia: number;
};

/**
 * Roda o teste de paridade DE VERDADE, no servidor, a cada carga fria.
 *
 * A pagina nao AFIRMA que o porte reproduz o scikit-learn: ela refaz a conta e
 * mostra o desvio que acabou de medir. Custa ~80 ms (600 amostras x 3 quantis x
 * 400 arvores), entao o resultado e memoizado no modulo -- ele nao pode mudar
 * dentro de um processo, porque as arvores e as amostras sao estaticas.
 *
 * `amostras.json` traz as saidas do PROPRIO scikit-learn, gravadas por
 * `exportar_modelo.py` na maquina que treinou. Nao e o TypeScript conferindo a
 * si mesmo.
 */
let medido: Paridade | null = null;

export function medirParidade(): Paridade {
  if (medido) return medido;

  let pior = 0;
  for (let i = 0; i < amostras.vetores.length; i += 1) {
    const nosso = preverBruto(amostras.vetores[i]);
    // Os tres modelos de quantil sao independentes e podem se cruzar.
    // `preverBruto` ordena, entao a referencia precisa ser ordenada do mesmo
    // jeito: a comparacao e sobre o PERCURSO, nao sobre o cruzamento.
    const deles = [...amostras.saidas[i]].sort((a, b) => a - b);
    for (const [j, previsto] of [nosso.q10, nosso.q50, nosso.q90].entries()) {
      const desvio = Math.abs(previsto - deles[j]);
      if (desvio > pior) pior = desvio;
    }
  }

  medido = {
    amostras: amostras.vetores.length,
    previsoes: amostras.vetores.length * QUANTIS.length,
    piorDesvio: pior,
    tolerancia: TOLERANCIA_PARIDADE,
  };
  return medido;
}

/**
 * O cenario de referencia da sensibilidade.
 *
 * Sai do primeiro caso de `fixture-features.json` -- braquiaria, 12 cm, rocada
 * ha 40 dias, periodo de 45 dias -- e nao de uma mediana das faixas de treino.
 * A mediana foi TENTADA e rejeitada: ela combina altura mediana com periodo
 * mediano e fase mediana num vetor que nenhuma trajetoria real percorre, e o
 * modelo responde -3,6 cm (encolhimento) sobre ele. Sensibilidade medida em
 * volta de um ponto saturado mede a saturacao, nao o modelo.
 *
 * O fixture serve porque suas linhas saem de `clima.montar_features` (Python),
 * o mesmo preenchedor do lote: e um vetor fisicamente coerente, nao 20 numeros
 * escolhidos um a um. `ficha.test.ts` prende qual caso e este -- se o gerador
 * do fixture mudar de cenario, o teste fica vermelho em vez de a pagina passar
 * a descrever, em silencio, um cenario que nao e mais o que ela diz.
 */
const CASO_REFERENCIA = fixture.casos[0];

export const CENARIO_REFERENCIA = {
  especie: CASO_REFERENCIA.pedido.especie,
  alturaInicialCm: CASO_REFERENCIA.pedido.altura_cm,
  diasDesdeRocada: CASO_REFERENCIA.pedido.dias_desde_rocada,
  diasPeriodo: CASO_REFERENCIA.pedido.dias_periodo,
} as const;

export function vetorDeReferencia(): number[] {
  const f = CASO_REFERENCIA.features as Record<string, number | string>;
  return CAMPOS_ENTRADA.map((campo) =>
    campo === "especie" ? codificarEspecie(f[campo] as string) : (f[campo] as number),
  );
}

export type EfeitoFeature = {
  campo: string;
  min: number;
  max: number;
  /** `false` quando a faixa saiu dos limiares de bin de uma feature continua:
   *  ela e um tico ESTREITA, e a tela nao deve prometer precisao que nao tem. */
  faixaExata: boolean;
  q50NoMinimo: number;
  q50NoMaximo: number;
  /** Variacao do q50 entre as pontas, em cm. Negativa = a feature derruba o crescimento. */
  efeitoCm: number;
  /** A mesma variacao como fracao do q50 do cenario de referencia. */
  efeitoRelativo: number;
};

/**
 * Sensibilidade de uma feature de cada vez, em volta do cenario de referencia.
 *
 * Varre cada coluna NUMERICA da ponta minima a maxima da faixa que ela assumiu
 * no treino (`FAIXAS_TREINO`, que sai dos limiares de bin do proprio modelo),
 * segurando as outras 19 no cenario. E a leitura mais direta de "o que a IA
 * olha" que da para fazer sem premissa nenhuma alem do ponto de partida -- e o
 * ponto de partida esta escrito na tela.
 *
 * `especie` fica de fora porque nao tem ponta: sao tres categorias, e
 * `efeitoDaEspecie` as devolve inteiras.
 */
export function efeitoDasFeatures(): EfeitoFeature[] {
  const base = vetorDeReferencia();
  const referencia = Math.abs(preverBruto(base).q50);

  const linhas: EfeitoFeature[] = [];
  for (const [i, campo] of CAMPOS_ENTRADA.entries()) {
    const faixa = FAIXAS_TREINO[campo];
    if (!faixa) continue;

    const noMinimo = [...base];
    noMinimo[i] = faixa.min;
    const noMaximo = [...base];
    noMaximo[i] = faixa.max;

    const q50NoMinimo = preverBruto(noMinimo).q50;
    const q50NoMaximo = preverBruto(noMaximo).q50;
    const efeitoCm = q50NoMaximo - q50NoMinimo;

    linhas.push({
      campo,
      min: faixa.min,
      max: faixa.max,
      faixaExata: faixa.exata,
      q50NoMinimo,
      q50NoMaximo,
      efeitoCm,
      efeitoRelativo: referencia === 0 ? 0 : efeitoCm / referencia,
    });
  }

  return linhas.sort((a, b) => Math.abs(b.efeitoCm) - Math.abs(a.efeitoCm));
}

export type EfeitoEspecie = { especie: string; q50: number };

/** O mesmo cenario com cada uma das tres especies. E a entrada que mais move a
 *  resposta, e a unica que o levantamento da Motiva nunca mediu. */
export function efeitoDaEspecie(): EfeitoEspecie[] {
  const base = vetorDeReferencia();
  const i = CAMPOS_ENTRADA.indexOf("especie");

  return CATEGORIAS.especie
    .map((especie) => {
      const v = [...base];
      v[i] = codificarEspecie(especie);
      return { especie, q50: preverBruto(v).q50 };
    })
    .sort((a, b) => b.q50 - a.q50);
}

/** Arvores e nos, contados no proprio JSON em vez de repetidos num comentario.
 *  Sao os numeros que a tela usa para dizer o tamanho do modelo. */
function tamanhoDoModelo(): { arvores: number; nos: number } {
  let arvores = 0;
  let nos = 0;
  for (const ensemble of pacote.ensembles) {
    arvores += ensemble.arvores.length;
    for (const arvore of ensemble.arvores) nos += arvore.f.length;
  }
  return { arvores, nos };
}

/** O cartao de identidade do modelo: tudo que a tela diz sobre o treino. */
export function fichaDoTreino() {
  return {
    linhas: LINHAS_DE_TREINO,
    features: CAMPOS_ENTRADA.length,
    quantis: QUANTIS,
    especies: CATEGORIAS.especie,
    treinadoEm: TREINADO_EM,
    sklearn: VERSAO_SKLEARN,
    metricas: METRICAS,
    ...tamanhoDoModelo(),
  };
}
