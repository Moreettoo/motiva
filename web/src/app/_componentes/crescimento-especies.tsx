"use client";

import { GraficoLinha, type SerieLinha } from "@/components/viz/linha";
import { fmt } from "@/lib/format";

/**
 * Uma linha por espécie, três séries, um eixo Y só.
 *
 * A cor vem da espécie e é fixada no servidor (slot de série pelo índice em
 * `ESPECIES`), nunca pelo ranking do período: uma espécie sumir do recorte não
 * pode repintar as outras duas.
 */
export function CrescimentoPorEspecie({ series }: { series: SerieLinha[] }) {
  return (
    <GraficoLinha
      series={series}
      tipoX="data"
      unidadeY="cm/dia"
      formatarY={fmt.d2}
      altura={236}
      titulo="Crescimento por espécie"
      descricao="Média diária prevista pelo modelo nos últimos 45 dias"
    />
  );
}
