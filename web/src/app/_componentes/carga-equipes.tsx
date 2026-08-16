"use client";

import { GraficoBarras, type BarraDado } from "@/components/viz/barras";
import { fmt } from "@/lib/format";

/**
 * Ocupação por equipe nos próximos 21 dias.
 *
 * Uma medida só, então uma cor só (slot 1) com rótulo direto, o eixo viraria
 * ruído. Quem passa de 100% troca para a escala de status, e por isso vem com
 * ícone: cor de status nunca aparece sozinha.
 */
export function CargaDasEquipes({
  dados,
  sobrecarregadas,
}: {
  dados: BarraDado[];
  sobrecarregadas: number;
}) {
  const descricao =
    sobrecarregadas > 0
      ? `${sobrecarregadas === 1 ? "1 equipe passou" : `${sobrecarregadas} equipes passaram`} da capacidade dos próximos 21 dias`
      : "Km agendados sobre a capacidade de cada equipe nos próximos 21 dias";

  return (
    <GraficoBarras
      dados={dados}
      orientacao="horizontal"
      formatarValor={(v) => fmt.pct(v)}
      maximo={100}
      titulo="Carga das equipes"
      descricao={descricao}
    />
  );
}
