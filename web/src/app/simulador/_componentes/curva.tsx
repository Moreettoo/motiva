"use client";

import { GraficoLinha } from "@/components/viz/linha";
import { corSerie } from "@/lib/dominio";
import { fmt } from "@/lib/format";

/**
 * A curva de altura ao longo do periodo.
 *
 * Uma serie so. Poderia haver uma segunda com o cm/dia, mas seriam duas
 * unidades no mesmo eixo, o numero de crescimento vive nos indicadores acima
 * do grafico, onde ele nao precisa dividir escala com centimetro.
 */
export function Curva({
  pontos,
  limite,
  descricao,
}: {
  pontos: { dia: number; alturaCm: number }[];
  limite: { valor: number; rotulo: string } | null;
  descricao: string;
}) {
  return (
    <GraficoLinha
      titulo="Altura prevista, dia a dia"
      descricao={descricao}
      tipoX="numero"
      area
      altura={280}
      unidadeY="cm"
      formatarX={(v) => (v === 0 ? "hoje" : `${fmt.n(v)}d`)}
      formatarY={fmt.d1}
      linhaLimite={limite ?? undefined}
      series={[
        {
          chave: "altura",
          rotulo: "Altura",
          cor: corSerie(0),
          pontos: pontos.map((p) => ({ x: p.dia, y: p.alturaCm })),
        },
      ]}
    />
  );
}
