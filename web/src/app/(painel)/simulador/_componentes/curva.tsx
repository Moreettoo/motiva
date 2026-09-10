"use client";

import { GraficoLinha } from "@/components/viz/linha";
import { corSerie } from "@/lib/dominio";
import { fmt } from "@/lib/format";

/**
 * A curva de altura ao longo do periodo, com o intervalo do modelo.
 *
 * Uma linha e uma faixa, nao tres linhas. O modelo v3.1 responde q10, q50 e
 * q90, e os dois extremos nao sao duas previsoes concorrentes: sao a margem da
 * mediana. Desenhados como series proprias, com cores proprias, o leitor
 * contaria tres coisas onde ha uma com incerteza.
 *
 * A faixa e o argumento inteiro do modelo novo estar na tela. O antigo devolvia
 * um numero e a curva parecia certeza; esta mostra o quanto o modelo nao sabe,
 * que numa faixa de dominio e muito -- crescimento de grama tem variancia
 * irredutivel, e o treino registra 72% de cobertura empirica para uma faixa
 * nominal de 80%.
 */
export function Curva({
  pontos,
  limite,
  descricao,
}: {
  pontos: { dia: number; alturaCm: number; alturaMinCm: number; alturaMaxCm: number }[];
  limite: { valor: number; rotulo: string } | null;
  descricao: string;
}) {
  return (
    <GraficoLinha
      titulo="Altura prevista, dia a dia"
      descricao={descricao}
      tipoX="numero"
      altura={300}
      unidadeY="cm"
      formatarX={(v) => (v === 0 ? "hoje" : `${fmt.n(v)}d`)}
      formatarY={fmt.d1}
      linhaLimite={limite ?? undefined}
      faixa={{
        chave: "intervalo",
        rotulo: "Intervalo de 80%",
        cor: corSerie(0),
        superior: pontos.map((p) => ({ x: p.dia, y: p.alturaMaxCm })),
        inferior: pontos.map((p) => ({ x: p.dia, y: p.alturaMinCm })),
      }}
      series={[
        {
          chave: "altura",
          rotulo: "Altura provável",
          cor: corSerie(0),
          pontos: pontos.map((p) => ({ x: p.dia, y: p.alturaCm })),
        },
      ]}
    />
  );
}
