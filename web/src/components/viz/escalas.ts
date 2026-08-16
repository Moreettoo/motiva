/**
 * Escalas e caminhos: matemática pura, sem React e sem biblioteca de gráfico.
 *
 * Tudo aqui devolve número ou string de `path`. Manter essa camada sem DOM é o
 * que permite calcular a geometria durante o render sem forçar layout.
 */

export type Faixa = [number, number];
export type Ponto = [number, number];

/** Duas casas bastam para um pixel e cortam ~40% do `d` no HTML. */
function q(n: number): number {
  return Math.round(n * 100) / 100;
}

function finito([x, y]: Ponto): boolean {
  return Number.isFinite(x) && Number.isFinite(y);
}

/**
 * Projeção linear de domínio em alcance.
 *
 * Domínio degenerado (série constante, ponto único) projeta no meio do alcance
 * em vez de dividir por zero, um NaN dentro de um atributo `d` some da tela sem
 * aviso e é caro de rastrear.
 */
export function escalaLinear({ dominio, alcance }: { dominio: Faixa; alcance: Faixa }): (v: number) => number {
  const [d0, d1] = dominio;
  const [a0, a1] = alcance;
  const amplitude = d1 - d0;

  if (!Number.isFinite(amplitude) || amplitude === 0) {
    const meio = (a0 + a1) / 2;
    return () => meio;
  }

  const fator = (a1 - a0) / amplitude;
  return (v: number) => a0 + (v - d0) * fator;
}

/** Menor passo "redondo" (1, 2 ou 5 × 10ⁿ) maior ou igual a `bruto`. */
export function passoAgradavel(bruto: number): number {
  if (!(bruto > 0) || !Number.isFinite(bruto)) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(bruto));
  const normalizado = bruto / magnitude;
  const passo = normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 5 ? 5 : 10;

  return passo * magnitude;
}

/** Arredonda na precisão do próprio passo: 0.1 × 3 não pode virar 0,30000000000000004 no eixo. */
function noPasso(v: number, passo: number): number {
  const casas = Math.min(12, Math.max(0, -Math.floor(Math.log10(passo))));
  return Number(v.toFixed(casas));
}

/**
 * Marcas de eixo em passos de 1/2/5 × 10ⁿ, sempre dentro de [min, max].
 * Multiplica por índice em vez de somar em laço para não acumular erro binário.
 */
export function ticksAgradaveis(min: number, max: number, quantidade = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [noPasso(min, passoAgradavel(Math.abs(min) || 1))];

  const [a, b] = min < max ? [min, max] : [max, min];
  const alvo = Math.max(2, Math.round(quantidade));
  const passo = passoAgradavel((b - a) / alvo);
  const folga = passo * 1e-9;

  const marcas: number[] = [];
  for (let i = Math.ceil(a / passo - 1e-9); i * passo <= b + folga; i++) {
    marcas.push(noPasso(i * passo, passo));
  }

  return marcas;
}

/** [mínimo, máximo] ignorando NaN/Infinity. Lista vazia devolve [0, 1] para a escala não morrer. */
export function extensao(valores: number[]): Faixa {
  let min = Infinity;
  let max = -Infinity;

  for (const v of valores) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  return min === Infinity ? [0, 1] : [min, max];
}

/**
 * Extensao dos valores com respiro nas duas pontas, para a marca nao encostar
 * na borda da area de plotagem e parecer cortada.
 *
 * `naoNegativo` e para grandeza que nao existe abaixo de zero (altura de
 * vegetacao): o respiro nunca inventa um piso negativo, que sugeriria ao gestor
 * que a grama pode medir menos que nada. Serie plana nao tem vao para
 * proporcionar, entao cai numa faixa artificial e o traco fica no meio.
 */
export function almofadaDominio(
  valores: number[],
  { fracao = 0.12, naoNegativo = false }: { fracao?: number; naoNegativo?: boolean } = {},
): Faixa {
  const [min, max] = extensao(valores);
  const vao = max - min;
  const almofada = vao > 0 ? vao * fracao : Math.abs(max) * fracao || 1;
  const piso = min - almofada;

  return [naoNegativo && min >= 0 ? Math.max(0, piso) : piso, max + almofada];
}

/**
 * Estica o dominio ate caber a primeira e a ultima marca.
 *
 * `ticksAgradaveis` arredonda para fora do alvo; sem esta correcao a linha de
 * grade do topo fica fora da area util e o rotulo dela aparece sem grade.
 */
export function dominioComTicks([min, max]: Faixa, ticks: number[]): Faixa {
  return [Math.min(min, ticks[0] ?? min), Math.max(max, ticks[ticks.length - 1] ?? max)];
}

export function caminhoLinha(pontos: Ponto[]): string {
  const validos = pontos.filter(finito);
  if (validos.length === 0) return "";

  return validos.map(([x, y], i) => `${i === 0 ? "M" : "L"}${q(x)} ${q(y)}`).join(" ");
}

/** Mesmo traçado da linha, fechado contra uma base horizontal (o zero do eixo). */
export function caminhoArea(pontos: Ponto[], base: number): string {
  const validos = pontos.filter(finito);
  if (validos.length === 0) return "";

  const primeiro = validos[0];
  const ultimo = validos[validos.length - 1];
  const corpo = validos.map(([x, y]) => `L${q(x)} ${q(y)}`).join(" ");

  return `M${q(primeiro[0])} ${q(base)} ${corpo} L${q(ultimo[0])} ${q(base)} Z`;
}

/**
 * Comprimento aproximado da poligonal, para alimentar `--dash` da classe `.draw`.
 * `getTotalLength()` seria exato, mas exigiria ler o DOM depois da pintura.
 */
export function comprimentoLinha(pontos: Ponto[]): number {
  const p = pontos.filter(finito);
  let total = 0;

  for (let i = 1; i < p.length; i++) {
    total += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  }

  // Folga de 6%: `stroke-linejoin` arredonda os vértices e o traço fica um pouco
  // mais longo que a poligonal, dash curto demais deixa a linha inacabada.
  return Math.ceil(total * 1.06) || 1;
}

export type LadoArredondado = "direita" | "cima";

/**
 * Retângulo de barra com raio só na ponta do dado: a base fica quadrada,
 * ancorada na linha de zero. `r` encolhe quando a barra é menor que o raio,
 * senão a ponta vira meia-lua e superestima o valor.
 */
export function caminhoBarra(
  x: number,
  y: number,
  largura: number,
  altura: number,
  raio: number,
  lado: LadoArredondado,
): string {
  const l = Math.max(0, largura);
  const a = Math.max(0, altura);
  if (l === 0 || a === 0) return "";

  if (lado === "direita") {
    const r = Math.min(raio, l, a / 2);
    return [
      `M${q(x)} ${q(y)}`,
      `H${q(x + l - r)}`,
      `A${q(r)} ${q(r)} 0 0 1 ${q(x + l)} ${q(y + r)}`,
      `V${q(y + a - r)}`,
      `A${q(r)} ${q(r)} 0 0 1 ${q(x + l - r)} ${q(y + a)}`,
      `H${q(x)}`,
      "Z",
    ].join(" ");
  }

  const r = Math.min(raio, a, l / 2);
  return [
    `M${q(x)} ${q(y + a)}`,
    `V${q(y + r)}`,
    `A${q(r)} ${q(r)} 0 0 1 ${q(x + r)} ${q(y)}`,
    `H${q(x + l - r)}`,
    `A${q(r)} ${q(r)} 0 0 1 ${q(x + l)} ${q(y + r)}`,
    `V${q(y + a)}`,
    "Z",
  ].join(" ");
}

/**
 * Retângulo com raio só nas pontas escolhidas, segmento do meio de uma pilha
 * fica reto dos dois lados, e só as extremidades externas da faixa arredondam.
 */
export function caminhoSegmento(
  x: number,
  y: number,
  largura: number,
  altura: number,
  raio: number,
  pontas: { esquerda?: boolean; direita?: boolean },
): string {
  const l = Math.max(0, largura);
  const a = Math.max(0, altura);
  if (l === 0 || a === 0) return "";

  const r = Math.min(raio, l / 2, a / 2);
  const re = pontas.esquerda ? r : 0;
  const rd = pontas.direita ? r : 0;

  return [
    `M${q(x + re)} ${q(y)}`,
    `H${q(x + l - rd)}`,
    rd ? `A${q(rd)} ${q(rd)} 0 0 1 ${q(x + l)} ${q(y + rd)}` : "",
    `V${q(y + a - rd)}`,
    rd ? `A${q(rd)} ${q(rd)} 0 0 1 ${q(x + l - rd)} ${q(y + a)}` : "",
    `H${q(x + re)}`,
    re ? `A${q(re)} ${q(re)} 0 0 1 ${q(x)} ${q(y + a - re)}` : "",
    `V${q(y + re)}`,
    re ? `A${q(re)} ${q(re)} 0 0 1 ${q(x + re)} ${q(y)}` : "",
    "Z",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Ângulo em graus, 0 = topo, crescendo no sentido horário → ponto no círculo. */
export function pontoNoArco(cx: number, cy: number, raio: number, grau: number): Ponto {
  const rad = ((grau - 90) * Math.PI) / 180;
  return [cx + raio * Math.cos(rad), cy + raio * Math.sin(rad)];
}

/** Arco aberto, para ser traçado (`stroke`) e não preenchido. */
export function caminhoArco(cx: number, cy: number, raio: number, de: number, ate: number): string {
  const varredura = ate - de;
  if (Math.abs(varredura) < 0.01) return "";

  const [x0, y0] = pontoNoArco(cx, cy, raio, de);
  const [x1, y1] = pontoNoArco(cx, cy, raio, ate);
  const maior = Math.abs(varredura) > 180 ? 1 : 0;
  const sentido = varredura > 0 ? 1 : 0;

  return `M${q(x0)} ${q(y0)} A${q(raio)} ${q(raio)} 0 ${maior} ${sentido} ${q(x1)} ${q(y1)}`;
}
