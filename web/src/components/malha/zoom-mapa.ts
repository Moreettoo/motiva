import { clamp } from "@/lib/utils";

/**
 * Aritmética do enquadramento do mapa da malha — ampliar, deslocar e os limites
 * que impedem de navegar para o vazio.
 *
 * Mora fora do componente porque é a parte que erra em silêncio: uma âncora com
 * o sinal trocado faz o mapa escorregar sob o cursor, e nada disso aparece na
 * verificação de tipos nem no build. Aqui o vitest alcança, e o componente fica
 * só com o que precisa de DOM.
 *
 * O sistema de coordenadas é o mesmo da projeção do mapa: `x = longitude ×
 * cos(latitude média)` e `y = latitude`, ambos em GRAUS, nunca em pixels. Quem
 * converte para pixel é `Enquadramento.esc0` vezes o zoom.
 */

/** O ajuste que cabe a malha inteira. Abaixo disto não há o que enxergar. */
export const ZOOM_MIN = 1;
/**
 * Teto do zoom. Com os 50 trechos semeados a malha ocupa ~20° de longitude, o
 * que a 24× deixa ~0,8° na tela — perto de 90 km, a escala em que dois trechos
 * da mesma rodovia deixam de ser a mesma bolinha. Mais que isso só afastaria os
 * pontos num mapa que não tem traçado de rodovia para servir de referência.
 */
export const ZOOM_MAX = 24;
/** Passo dos botões, do teclado e do duplo clique: oito toques vão do ajuste ao teto. */
export const PASSO_ZOOM = 1.6;

/**
 * Folga além da nuvem de pontos, em fração da janela do ajuste. Sem ela o
 * trecho da borda encosta na moldura assim que se amplia na direção dele.
 *
 * Ela é TETADA pela sobra do próprio ajuste — ver `folgaDoEixo`.
 */
const FOLGA = 0.06;

/** Deslocamento em px que compromete o gesto — abaixo disto ainda é um clique. */
export const LIMIAR_ARRASTO = 4;

/* A roda chega em três unidades diferentes conforme o navegador e o
   dispositivo; `deltaMode` diz qual. Normalizar para pixel antes da conta é o
   que impede o Firefox em modo linha (deltaMode 1) de pular o zoom inteiro num
   entalhe só. */
const PX_POR_LINHA = 16;
const PX_POR_PAGINA = 400;
/** 100px de rolagem ≈ 1,28×: dois entalhes de mouse valem um toque no botão, e
 *  no trackpad o gesto contínuo fica suave em vez de saltar. */
const SENSIBILIDADE = 0.0025;
/** Teto por evento. Um trackpad com inércia entrega deltas de milhares de px
 *  num quadro só, e sem o teto um flick atravessa o zoom inteiro. */
const TETO_DELTA = 240;

export type Vista = {
  /** Multiplicador sobre `esc0`. 1 é o ajuste que cabe tudo. */
  z: number;
  /** Centro da janela visível, nas coordenadas projetadas. */
  cx: number;
  cy: number;
};

export type Limites = { minX: number; maxX: number; minY: number; maxY: number };

export type Enquadramento = {
  /** Pixels por grau projetado com zoom 1 — o ajuste que cabe a malha inteira. */
  esc0: number;
  larguraPlot: number;
  alturaPlot: number;
};

/** Âncora de um zoom, em pixels a partir do CENTRO da área de plotagem. O ponto
 *  de dado que estiver aqui continua aqui depois de ampliar. */
export type Ancora = { dx: number; dy: number };

/** O centro da área de plotagem — âncora de zoom por botão e por teclado, onde
 *  não há ponteiro de onde tirar uma. */
export const ANCORA_CENTRO: Ancora = { dx: 0, dy: 0 };

export function escalaDaVista(enq: Enquadramento, z: number): number {
  return enq.esc0 * z;
}

/** O enquadramento inicial: zoom 1, centrado na nuvem de pontos. */
export function vistaAjustada(lim: Limites): Vista {
  return { z: ZOOM_MIN, cx: (lim.minX + lim.maxX) / 2, cy: (lim.minY + lim.maxY) / 2 };
}

/** Se o botão de voltar ao ajuste tem o que fazer. No zoom 1 o centro já está
 *  travado pelo próprio limite, então o zoom sozinho responde. */
export function estaAjustada(v: Vista): boolean {
  return v.z <= ZOOM_MIN + 1e-6;
}

/**
 * Quanto se pode navegar além da nuvem de pontos num eixo.
 *
 * O teto pela SOBRA do ajuste (`janela1 - extensão`, metade de cada lado) é o
 * que garante o invariante de que o zoom 1 é um enquadramento só, imóvel: sem
 * ele o eixo APERTADO — aquele que decidiu a escala — ficava com uma fresta de
 * deslocamento no próprio ajuste, porque o respiro de 10% da escala é menor que
 * os 6% de folga de cada lado. Uma fresta assim faz o mapa escorregar ao ser
 * arrastado no estado "ajustado" e tira o sentido do botão de voltar.
 */
function folgaDoEixo(janela1: number, extensao: number): number {
  return Math.max(0, Math.min(janela1 * FOLGA, (janela1 - extensao) / 2));
}

/**
 * A faixa em que o centro pode andar num eixo.
 *
 * Quando a janela é MAIOR que a nuvem mais a folga — o caso do zoom 1 — a faixa
 * inverte, e aí o centro é fixo no meio do dado. Devolver a faixa invertida
 * faria o `clamp` embaralhar os extremos e prender o mapa numa das bordas.
 */
function faixaDoCentro(min: number, max: number, meiaJanela: number, janela1: number): [number, number] {
  const folga = folgaDoEixo(janela1, max - min);
  const inicio = min - folga + meiaJanela;
  const fim = max + folga - meiaJanela;
  const meio = (min + max) / 2;
  return inicio > fim ? [meio, meio] : [inicio, fim];
}

/**
 * Põe uma vista de volta dentro do que existe: zoom entre o ajuste e o teto, e
 * centro dentro da nuvem de pontos mais a folga.
 *
 * Toda função deste módulo termina aqui, e o componente também chama direto no
 * render — o `esc0` muda quando a caixa é redimensionada, e um centro que era
 * legal numa largura pode deixar de ser em outra.
 */
export function limitarVista(v: Vista, lim: Limites, enq: Enquadramento): Vista {
  const z = clamp(v.z, ZOOM_MIN, ZOOM_MAX);
  const esc = escalaDaVista(enq, z);
  const [x1, x2] = faixaDoCentro(
    lim.minX,
    lim.maxX,
    enq.larguraPlot / 2 / esc,
    enq.larguraPlot / enq.esc0,
  );
  const [y1, y2] = faixaDoCentro(
    lim.minY,
    lim.maxY,
    enq.alturaPlot / 2 / esc,
    enq.alturaPlot / enq.esc0,
  );
  return { z, cx: clamp(v.cx, x1, x2), cy: clamp(v.cy, y1, y2) };
}

/**
 * Amplia por um fator mantendo parado o ponto de dado que está sob a âncora.
 *
 * É o que separa um zoom de mapa de um zoom de imagem: quem gira a roda sobre
 * um trecho quer aquele trecho maior, não o centro da tela maior. A conta é
 * ida e volta — descobre que coordenada está sob a âncora na escala VELHA e
 * recoloca o centro para que ela caia no mesmo pixel na escala NOVA.
 *
 * O `y` inverte de sinal nos dois lados porque a latitude cresce para cima e o
 * pixel cresce para baixo.
 */
export function aplicarZoom(
  v: Vista,
  fator: number,
  ancora: Ancora,
  lim: Limites,
  enq: Enquadramento,
): Vista {
  const z = clamp(v.z * fator, ZOOM_MIN, ZOOM_MAX);
  const esc = escalaDaVista(enq, v.z);
  const escNovo = escalaDaVista(enq, z);
  const alvoX = v.cx + ancora.dx / esc;
  const alvoY = v.cy - ancora.dy / esc;
  return limitarVista(
    { z, cx: alvoX - ancora.dx / escNovo, cy: alvoY + ancora.dy / escNovo },
    lim,
    enq,
  );
}

/** Desloca a vista pelo arrasto do ponteiro, em pixels de tela. Puxar o mapa
 *  para a direita move o centro para a ESQUERDA — é o conteúdo que segue o
 *  dedo, não a janela. */
export function deslocar(
  v: Vista,
  dxPx: number,
  dyPx: number,
  lim: Limites,
  enq: Enquadramento,
): Vista {
  const esc = escalaDaVista(enq, v.z);
  return limitarVista({ z: v.z, cx: v.cx - dxPx / esc, cy: v.cy + dyPx / esc }, lim, enq);
}

/** Fração da meia-janela dentro da qual um ponto conta como confortavelmente
 *  visível. Menor que 1 para o ponto não pousar colado na moldura. */
const ZONA_CONFORTO = 0.8;

/**
 * Traz um ponto para a zona de conforto pelo caminho mais curto, sem mexer no
 * zoom.
 *
 * Existe pela tabulação. Só as marcas na vista viram alvo de foco, então o Tab
 * nunca pousa num trecho que sumiu da tela — mas pousa nos que estão COLADOS na
 * moldura, com metade do alvo recortada e o balão nascendo por cima do eixo.
 * Nesses a vista dá um passo para trazê-los ao miolo.
 *
 * Quando o ponto já está confortável a função não mexe em nada: senão todo Tab
 * arrastaria o mapa alguns pixels debaixo de quem está lendo.
 */
export function trazerParaVista(
  v: Vista,
  alvo: { x: number; y: number },
  lim: Limites,
  enq: Enquadramento,
): Vista {
  const esc = escalaDaVista(enq, v.z);
  const margemX = (enq.larguraPlot / 2 / esc) * ZONA_CONFORTO;
  const margemY = (enq.alturaPlot / 2 / esc) * ZONA_CONFORTO;
  return limitarVista(
    {
      z: v.z,
      cx: clamp(v.cx, alvo.x - margemX, alvo.x + margemX),
      cy: clamp(v.cy, alvo.y - margemY, alvo.y + margemY),
    },
    lim,
    enq,
  );
}

/**
 * Fator de zoom de um evento de roda. Rolar para CIMA (delta negativo) aproxima.
 *
 * Exponencial, não linear: dois eventos iguais em sentidos opostos precisam se
 * cancelar exatamente, ou a roda de vaivém deriva o zoom para um lado.
 */
export function fatorDaRoda(deltaY: number, deltaMode = 0): number {
  const px = deltaY * (deltaMode === 1 ? PX_POR_LINHA : deltaMode === 2 ? PX_POR_PAGINA : 1);
  return Math.exp(-clamp(px, -TETO_DELTA, TETO_DELTA) * SENSIBILIDADE);
}

/** Duas vistas são a mesma. Usado para decidir se um evento de roda deve ser
 *  engolido: no teto do zoom ele não muda nada, e a página tem que continuar
 *  rolando em vez de o ponteiro ficar preso no mapa. */
export function mesmaVista(a: Vista, b: Vista): boolean {
  return a.z === b.z && a.cx === b.cx && a.cy === b.cy;
}
