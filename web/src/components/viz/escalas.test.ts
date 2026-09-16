import { describe, expect, it } from "vitest";

import { caminhoBarra } from "./escalas";

/**
 * A barra divergente da pagina `/evidencia` foi o primeiro uso de `"esquerda"`.
 * O modo de falha de um `d` de SVG errado e silencioso: o caminho nao lanca, a
 * marca so desenha torta -- ou some. Estes testes prendem a geometria.
 */
/** So as coordenadas X do caminho: `M x y`, `H x` e o par final de `A r r 0 0 s
 *  x y`. Uma regex de "todo numero" pegaria Y e raio junto e mediria outra
 *  coisa -- foi o que a primeira versao deste teste fez. */
function extensaoX(d: string): [number, number] {
  const xs: number[] = [];
  for (const m of d.matchAll(/M([-\d.]+) [-\d.]+|H([-\d.]+)|A[-\d.]+ [-\d.]+ 0 0 \d ([-\d.]+) [-\d.]+/g)) {
    xs.push(Number(m[1] ?? m[2] ?? m[3]));
  }
  return [Math.min(...xs), Math.max(...xs)];
}

describe("caminhoBarra", () => {
  it("ancora a base no zero e arredonda so a ponta, para a direita", () => {
    const d = caminhoBarra(100, 10, 40, 8, 4, "direita");
    // Comeca no canto quadrado da base (x = zero) e termina fechando nele.
    expect(d.startsWith("M100 10")).toBe(true);
    expect(d).toContain("H100");
    expect(d.endsWith("Z")).toBe(true);
  });

  it("espelha para a esquerda: base no zero a DIREITA, ponta arredondada a esquerda", () => {
    // Numa barra negativa o zero e a borda direita. Se o espelho estivesse
    // errado, a ponta arredondaria encostada no eixo e a barra leria como se
    // crescesse a partir da borda do grafico.
    const d = caminhoBarra(60, 10, 40, 8, 4, "esquerda");
    expect(d.startsWith("M100 10")).toBe(true);
    expect(d).toContain("H100");
    expect(d.endsWith("Z")).toBe(true);
    // O arco tem que varrer no sentido contrario ao da barra positiva, senao a
    // curva estufa para fora em vez de arredondar o canto.
    expect(d).toContain("0 0 0");
    expect(d).not.toContain("0 0 1");
  });

  it("as duas metades ocupam o mesmo X para o mesmo valor absoluto", () => {
    // O que garante que uma barra de -5 leia igual a uma de +5. Uma barra
    // negativa vai de (zero - largura) a zero; a positiva, de zero a
    // (zero + largura).
    expect(extensaoX(caminhoBarra(60, 10, 40, 8, 4, "esquerda"))).toEqual([60, 100]);
    expect(extensaoX(caminhoBarra(100, 10, 40, 8, 4, "direita"))).toEqual([100, 140]);
  });

  it("encolhe o raio em barra curta, para a ponta nao virar meia-lua", () => {
    // Raio 4 numa barra de 2 px superestimaria o valor: a curva passaria do fim.
    const d = caminhoBarra(60, 10, 2, 8, 4, "esquerda");
    expect(d).toContain("A2 2");
  });

  it("devolve vazio em vez de caminho degenerado quando o valor e zero", () => {
    expect(caminhoBarra(60, 10, 0, 8, 4, "esquerda")).toBe("");
    expect(caminhoBarra(60, 10, 40, 0, 4, "direita")).toBe("");
  });
});
