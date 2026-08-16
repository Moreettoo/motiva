/**
 * Agrupamento da malha por rodovia.
 *
 * Modulo puro de proposito: o servidor agrupa a malha inteira em
 * `trechosPorRodovia` e o cliente reagrupa o resultado filtrado da tela de
 * malha. Eram duas copias da mesma regra, e ja tinham comecado a divergir na
 * chave. Uma copia so, aqui, sem `server-only` para os dois lados importarem.
 */

import { ordemRisco, piorRiscoDe } from "./dominio";
import type { Risco, TrechoStatus, UF } from "./types";

export type GrupoRodovia = {
  chave: string;
  rodovia: string;
  uf: UF;
  trechos: TrechoStatus[];
  kmMin: number;
  kmMax: number;
  extensao: number;
  criticos: number;
  piorRisco: Risco;
};

/**
 * Uma régua por rodovia E por UF.
 *
 * A quilometragem reinicia na divisa: a BR-101 tem um km 22 em SP e um km 450 no
 * RJ. Desenhar os dois na mesma régua inventaria uma faixa contínua de 500 km que
 * não existe, e afundaria os trechos reais em 3 pixels cada.
 */
export function agruparPorRodovia(trechos: TrechoStatus[]): GrupoRodovia[] {
  const grupos = new Map<string, TrechoStatus[]>();

  for (const t of trechos) {
    const chave = `${t.rodovia} · ${t.uf}`;
    const atual = grupos.get(chave);

    if (atual) atual.push(t);
    else grupos.set(chave, [t]);
  }

  return [...grupos.entries()]
    .map(([chave, lista]) => {
      const ordenados = [...lista].sort((a, b) => Number(a.km_inicio) - Number(b.km_inicio));

      return {
        chave,
        rodovia: ordenados[0].rodovia,
        uf: ordenados[0].uf,
        trechos: ordenados,
        kmMin: Math.min(...ordenados.map((t) => Number(t.km_inicio))),
        kmMax: Math.max(...ordenados.map((t) => Number(t.km_fim))),
        extensao: ordenados.reduce((total, t) => total + (Number(t.extensao_km) || 0), 0),
        criticos: ordenados.filter((t) => t.risco === "critica").length,
        piorRisco: piorRiscoDe(ordenados),
      };
    })
    .sort(
      (a, b) =>
        ordemRisco(a.piorRisco) - ordemRisco(b.piorRisco) ||
        a.rodovia.localeCompare(b.rodovia, "pt-BR") ||
        a.uf.localeCompare(b.uf, "pt-BR"),
    );
}
