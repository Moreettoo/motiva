"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Largura medida do elemento — o SVG e a regua precisam de pixels reais para
 * nao escalar a tipografia junto com o desenho.
 *
 * A medida sai de um efeito, nunca do render: ler layout durante o render forca
 * reflow sincrono e o painel abre com varios destes na mesma tela.
 */
export function useLargura<T extends HTMLElement>(
  alvo: RefObject<T | null>,
  inicial = 720,
): number {
  const [largura, setLargura] = useState(inicial);

  useEffect(() => {
    const el = alvo.current;
    if (!el) return;

    const observador = new ResizeObserver((entradas) => {
      const w = entradas[0]?.contentRect.width ?? 0;
      if (w > 0) setLargura(w);
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, [alvo]);

  return largura;
}
