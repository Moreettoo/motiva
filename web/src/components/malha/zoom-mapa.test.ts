import { describe, expect, it } from "vitest";

import {
  ANCORA_CENTRO,
  PASSO_ZOOM,
  ZOOM_MAX,
  ZOOM_MIN,
  aplicarZoom,
  deslocar,
  escalaDaVista,
  estaAjustada,
  fatorDaRoda,
  limitarVista,
  mesmaVista,
  trazerParaVista,
  vistaAjustada,
  type Enquadramento,
  type Limites,
  type Vista,
} from "./zoom-mapa";

/* A malha semeada, arredondada: ~20° de longitude por ~6° de latitude numa
   caixa de 900×480. O `esc0` sai da mesma conta do componente — o menor dos
   dois ajustes, com 10% de respiro. */
const LIM: Limites = { minX: -60, maxX: -40, minY: -25, maxY: -19 };
const ENQ: Enquadramento = {
  larguraPlot: 900,
  alturaPlot: 480,
  esc0: Math.min(900 / 20, 480 / 6) * 0.9,
};

/** Onde um ponto de dado cai na tela, em px a partir do centro da plotagem. */
function pixel(v: Vista, ponto: { x: number; y: number }) {
  const esc = escalaDaVista(ENQ, v.z);
  return { dx: (ponto.x - v.cx) * esc, dy: -(ponto.y - v.cy) * esc };
}

const meiaJanela = (v: Vista) => ({
  w: ENQ.larguraPlot / 2 / escalaDaVista(ENQ, v.z),
  h: ENQ.alturaPlot / 2 / escalaDaVista(ENQ, v.z),
});

describe("limitarVista", () => {
  it("trava o centro no meio do dado quando a janela é maior que a nuvem", () => {
    // No ajuste a janela sempre sobra: puxar o centro para longe não pode
    // prender o mapa numa borda (a faixa inverte, e o `clamp` embaralharia).
    const fora = limitarVista({ z: 1, cx: 0, cy: 0 }, LIM, ENQ);
    expect(fora).toEqual({ z: 1, cx: -50, cy: -22 });
  });

  it("mantém o zoom entre o ajuste e o teto", () => {
    expect(limitarVista({ z: 0.2, cx: -50, cy: -22 }, LIM, ENQ).z).toBe(ZOOM_MIN);
    expect(limitarVista({ z: 900, cx: -50, cy: -22 }, LIM, ENQ).z).toBe(ZOOM_MAX);
  });

  it("é idempotente", () => {
    const uma = limitarVista({ z: 7, cx: -99, cy: 12 }, LIM, ENQ);
    expect(limitarVista(uma, LIM, ENQ)).toEqual(uma);
  });
});

describe("aplicarZoom", () => {
  it("deixa parado o ponto de dado sob a âncora", () => {
    const antes: Vista = { z: 2, cx: -50, cy: -22 };
    const ancora = { dx: 120, dy: -60 };
    const esc = escalaDaVista(ENQ, antes.z);
    // A coordenada que está sob a âncora antes de ampliar.
    const alvo = { x: antes.cx + ancora.dx / esc, y: antes.cy - ancora.dy / esc };

    const depois = aplicarZoom(antes, 1.5, ancora, LIM, ENQ);

    expect(depois.z).toBeCloseTo(3, 10);
    expect(pixel(depois, alvo).dx).toBeCloseTo(ancora.dx, 8);
    expect(pixel(depois, alvo).dy).toBeCloseTo(ancora.dy, 8);
  });

  it("com âncora no centro, só mexe no zoom", () => {
    const antes: Vista = { z: 2, cx: -52, cy: -23 };
    const depois = aplicarZoom(antes, PASSO_ZOOM, ANCORA_CENTRO, LIM, ENQ);
    expect(depois.cx).toBeCloseTo(antes.cx, 10);
    expect(depois.cy).toBeCloseTo(antes.cy, 10);
    expect(depois.z).toBeCloseTo(antes.z * PASSO_ZOOM, 10);
  });

  it("não passa do teto nem cai abaixo do ajuste", () => {
    const topo = aplicarZoom({ z: ZOOM_MAX, cx: -50, cy: -22 }, 4, ANCORA_CENTRO, LIM, ENQ);
    expect(topo.z).toBe(ZOOM_MAX);

    const chao = aplicarZoom({ z: 1.1, cx: -50, cy: -22 }, 0.1, ANCORA_CENTRO, LIM, ENQ);
    expect(chao).toEqual(vistaAjustada(LIM));
  });

  it("reduzir de volta desfaz a ampliação, âncora incluída", () => {
    const antes: Vista = { z: 3, cx: -50, cy: -22 };
    const ancora = { dx: -200, dy: 80 };
    const ida = aplicarZoom(antes, 2, ancora, LIM, ENQ);
    const volta = aplicarZoom(ida, 0.5, ancora, LIM, ENQ);
    expect(volta.z).toBeCloseTo(antes.z, 10);
    expect(volta.cx).toBeCloseTo(antes.cx, 8);
    expect(volta.cy).toBeCloseTo(antes.cy, 8);
  });
});

describe("deslocar", () => {
  it("o conteúdo segue o dedo: puxar para a direita move o centro para a esquerda", () => {
    const antes: Vista = { z: 4, cx: -50, cy: -22 };
    const depois = deslocar(antes, 81, 0, LIM, ENQ);
    expect(depois.cx).toBeLessThan(antes.cx);
    expect(depois.cx).toBeCloseTo(antes.cx - 81 / escalaDaVista(ENQ, 4), 10);
    expect(depois.cy).toBe(antes.cy);
  });

  it("no ajuste não há o que deslocar, nem no eixo que decidiu a escala", () => {
    // O eixo apertado aqui é o horizontal (900/20 < 480/6); é justamente nele
    // que o respiro de 10% da escala não cobre a folga de 6% de cada lado.
    const v = vistaAjustada(LIM);
    expect(deslocar(v, 400, 200, LIM, ENQ)).toEqual(v);
    expect(deslocar(v, -400, -200, LIM, ENQ)).toEqual(v);
  });

  it("puxar para baixo move o centro para o norte", () => {
    const depois = deslocar({ z: 4, cx: -50, cy: -22 }, 0, 40, LIM, ENQ);
    expect(depois.cy).toBeGreaterThan(-22);
  });

  it("para na borda do dado, e insistir não move mais", () => {
    const preso = deslocar({ z: 4, cx: -50, cy: -22 }, 1e6, 0, LIM, ENQ);
    expect(deslocar(preso, 1e6, 0, LIM, ENQ)).toEqual(preso);

    // O trecho mais a oeste continua dentro da janela — a folga não é grande o
    // bastante para deixar a nuvem inteira sair de vista.
    const { w } = meiaJanela(preso);
    expect(preso.cx - w).toBeLessThan(LIM.minX);
    expect(preso.cx + w).toBeGreaterThan(LIM.minX);
  });
});

describe("trazerParaVista", () => {
  it("não mexe num ponto que já está confortável", () => {
    const v: Vista = { z: 4, cx: -50, cy: -22 };
    expect(trazerParaVista(v, { x: -50.2, y: -22.1 }, LIM, ENQ)).toEqual(v);
  });

  it("puxa um ponto de fora da janela para dentro, sem mexer no zoom", () => {
    const v: Vista = { z: 6, cx: -50, cy: -22 };
    const alvo = { x: -43, y: -19.5 };
    const depois = trazerParaVista(v, alvo, LIM, ENQ);

    expect(depois.z).toBe(v.z);
    const { w, h } = meiaJanela(depois);
    expect(Math.abs(alvo.x - depois.cx)).toBeLessThanOrEqual(w);
    expect(Math.abs(alvo.y - depois.cy)).toBeLessThanOrEqual(h);
  });
});

describe("fatorDaRoda", () => {
  it("rolar para cima aproxima e para baixo afasta", () => {
    expect(fatorDaRoda(-100)).toBeGreaterThan(1);
    expect(fatorDaRoda(100)).toBeLessThan(1);
  });

  it("vaivém de mesma intensidade não deriva o zoom", () => {
    expect(fatorDaRoda(-120) * fatorDaRoda(120)).toBeCloseTo(1, 12);
  });

  it("normaliza a unidade do delta: linha e página valem mais que pixel", () => {
    expect(fatorDaRoda(1, 1)).toBeCloseTo(fatorDaRoda(16, 0), 12);
    expect(fatorDaRoda(0.5, 2)).toBeCloseTo(fatorDaRoda(200, 0), 12);
  });

  it("põe teto no flick com inércia do trackpad", () => {
    expect(fatorDaRoda(4000)).toBe(fatorDaRoda(240));
    expect(fatorDaRoda(-4000)).toBe(fatorDaRoda(-240));
  });
});

describe("estaAjustada e mesmaVista", () => {
  it("reconhece o enquadramento inicial", () => {
    expect(estaAjustada(vistaAjustada(LIM))).toBe(true);
    expect(estaAjustada({ z: 1.5, cx: -50, cy: -22 })).toBe(false);
  });

  it("compara as três componentes", () => {
    const v: Vista = { z: 2, cx: -50, cy: -22 };
    expect(mesmaVista(v, { ...v })).toBe(true);
    expect(mesmaVista(v, { ...v, cx: -50.0001 })).toBe(false);
  });
});
