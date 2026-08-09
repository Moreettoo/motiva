import { caminhoLinha, escalaLinear, extensao, type Ponto } from "./escalas";

/**
 * Sparkline sem eixo, para dentro do `Indicador`.
 *
 * Único gráfico da biblioteca sem camada de hover: o número que ele acompanha
 * já está impresso ao lado, em corpo maior. Um balão aqui repetiria o que o
 * bloco inteiro existe para mostrar.
 */
export function Minigrafico({
  pontos,
  cor = "var(--s1)",
  altura = 28,
  largura = 96,
  mostrarUltimo = true,
  rotulo,
}: {
  pontos: number[];
  cor?: string;
  altura?: number;
  largura?: number;
  mostrarUltimo?: boolean;
  /** Preenche o nome acessível. Sem ele o traçado é decorativo e some do leitor. */
  rotulo?: string;
}) {
  const validos = pontos.filter((v) => Number.isFinite(v));

  // Série vazia ou de um ponto só não vira linha: mantém a altura reservada
  // para o bloco não pular quando o dado chegar.
  if (validos.length < 2) {
    return <div aria-hidden="true" style={{ height: altura, width: largura }} />;
  }

  const raio = mostrarUltimo ? 3 : 0;
  const respiro = Math.max(2, raio) + 1;

  const x = escalaLinear({ dominio: [0, validos.length - 1], alcance: [respiro, largura - respiro] });

  const [min, max] = extensao(validos);
  // Série plana: uma faixa artificial mantém o traço no meio em vez de colado na borda.
  const faixa = max - min || Math.abs(max) || 1;
  const y = escalaLinear({
    dominio: [min - faixa * 0.15, max + faixa * 0.15],
    alcance: [altura - respiro, respiro],
  });

  const coordenadas: Ponto[] = validos.map((v, i) => [x(i), y(v)]);
  const ultimo = coordenadas[coordenadas.length - 1];

  return (
    <svg
      width={largura}
      height={altura}
      viewBox={`0 0 ${largura} ${altura}`}
      className="block"
      role={rotulo ? "img" : undefined}
      aria-label={rotulo}
      aria-hidden={rotulo ? undefined : true}
    >
      {rotulo ? <title>{rotulo}</title> : null}

      <path
        d={caminhoLinha(coordenadas)}
        fill="none"
        style={{ stroke: cor }}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {mostrarUltimo ? (
        <circle
          cx={ultimo[0]}
          cy={ultimo[1]}
          r={raio}
          style={{ fill: cor }}
          className="stroke-surface"
          strokeWidth="2"
        />
      ) : null}
    </svg>
  );
}
