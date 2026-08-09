import { CircleCheck, OctagonAlert, TriangleAlert } from "lucide-react";

import { Dica } from "@/components/ui/dica";
import { fmt } from "@/lib/format";
import { clamp, cn } from "@/lib/utils";

import { caminhoArco, escalaLinear, pontoNoArco } from "./escalas";

const ANGULO_INICIO = -120;
const ANGULO_FIM = 120;

/**
 * Estado de ocupação — quanto da altura permitida já foi consumida.
 *
 * NÃO é o risco de `@/lib/dominio`: risco vem de `dias_ate_limite` (o prazo),
 * este vem da razão altura/limite (o quanto). São eixos diferentes e um trecho
 * pode estar folgado num e apertado no outro.
 */
const ESTADOS = {
  dentro: {
    rotulo: "Dentro do limite",
    Icone: CircleCheck,
    cor: "var(--good)",
    tinta: "text-good-ink",
  },
  perto: {
    rotulo: "Perto do limite",
    Icone: TriangleAlert,
    cor: "var(--warning)",
    tinta: "text-warning-ink",
  },
  acima: {
    rotulo: "Acima do limite",
    Icone: OctagonAlert,
    cor: "var(--critical)",
    tinta: "text-critical-ink",
  },
} as const;

function estadoPorOcupacao(pct: number) {
  if (pct >= 100) return ESTADOS.acima;
  if (pct >= 90) return ESTADOS.perto;
  return ESTADOS.dentro;
}

/**
 * Arco de 240° com a altura atual contra o limite do trecho.
 *
 * O limite é uma marca radial, não um fim de escala: o arco continua depois
 * dele para que "passou em 6&nbsp;cm" e "passou em 30&nbsp;cm" não desenhem
 * igual. O excedente vem hachurado — a leitura crítica precisa mudar de textura,
 * não só de cor.
 */
export function Medidor({
  valor,
  limite,
  maximo,
  rotulo,
  formatarValor = fmt.cm,
  tamanho = 160,
}: {
  valor: number;
  limite: number;
  maximo?: number;
  rotulo: string;
  formatarValor?: (v: number) => string;
  tamanho?: number;
}) {
  const teto = Math.max(maximo ?? 0, limite * 1.25, valor * 1.05, 1);
  const ocupacao = limite > 0 ? (valor / limite) * 100 : 0;
  const estado = estadoPorOcupacao(ocupacao);
  const excedeu = valor > limite;

  const traco = Math.max(8, Math.round(tamanho * 0.075));
  const raio = tamanho / 2 - traco / 2 - 2;
  const cx = tamanho / 2;
  const cy = tamanho / 2;
  const alturaSvg = Math.round(tamanho * 0.78);

  const angulo = escalaLinear({ dominio: [0, teto], alcance: [ANGULO_INICIO, ANGULO_FIM] });

  const anguloValor = angulo(clamp(valor, 0, teto));
  const anguloLimite = angulo(clamp(limite, 0, teto));
  const anguloCheio = Math.min(anguloValor, anguloLimite);

  const [tickX1, tickY1] = pontoNoArco(cx, cy, raio - traco / 2 - 3, anguloLimite);
  const [tickX2, tickY2] = pontoNoArco(cx, cy, raio + traco / 2 + 3, anguloLimite);

  const leitura = `${rotulo}: ${formatarValor(valor)}, limite ${formatarValor(limite)} — ${estado.rotulo}, ${fmt.pct(ocupacao)} do limite.`;

  return (
    <Dica
      lado="cima"
      conteudo={
        <span className="block space-y-0.5">
          <span className="block">
            Atual <span className="tnum font-mono">{formatarValor(valor)}</span>
          </span>
          <span className="block">
            Limite <span className="tnum font-mono">{formatarValor(limite)}</span>
          </span>
          <span className="block">
            Ocupação <span className="tnum font-mono">{fmt.pct(ocupacao)}</span>
          </span>
        </span>
      }
    >
      <span
        role="img"
        aria-label={leitura}
        tabIndex={0}
        className="inline-flex flex-col items-center gap-1.5 rounded-md"
      >
        <svg
          aria-hidden="true"
          width={tamanho}
          height={alturaSvg}
          viewBox={`0 0 ${tamanho} ${alturaSvg}`}
          className="block"
        >
          {/* Mesmo raciocínio de id global da moldura: definições idênticas em
              todo medidor, então resolver para a primeira pinta igual. */}
          <defs>
            <pattern
              id="hachura-medidor"
              width="7"
              height="7"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="7" height="7" className="fill-critical" />
              <rect width="3.5" height="7" className="fill-surface" fillOpacity="0.5" />
            </pattern>
          </defs>

          {/* Trilho: passo claro da própria cor, para o estado ler no arco inteiro. */}
          <path
            d={caminhoArco(cx, cy, raio, ANGULO_INICIO, ANGULO_FIM)}
            fill="none"
            style={{ stroke: `color-mix(in oklab, ${estado.cor} 20%, var(--surface))` }}
            strokeWidth={traco}
            strokeLinecap="round"
          />

          {anguloCheio > ANGULO_INICIO ? (
            <path
              d={caminhoArco(cx, cy, raio, ANGULO_INICIO, anguloCheio)}
              fill="none"
              style={{ stroke: estado.cor }}
              strokeWidth={traco}
              // Ponta reta quando passou do limite: uma ponta redonda avançaria
              // meia espessura além da marca e mentiria sobre onde o limite está.
              strokeLinecap={excedeu ? "butt" : "round"}
            />
          ) : null}

          {excedeu ? (
            <path
              d={caminhoArco(cx, cy, raio, anguloLimite, anguloValor)}
              fill="none"
              stroke="url(#hachura-medidor)"
              strokeWidth={traco}
              strokeLinecap="butt"
            />
          ) : null}

          <line
            x1={tickX1}
            y1={tickY1}
            x2={tickX2}
            y2={tickY2}
            className="stroke-ink"
            strokeWidth="2"
            strokeLinecap="round"
          />

          <text
            x={cx}
            y={cy - tamanho * 0.115}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-ink-3 text-2xs font-medium tracking-wider uppercase"
          >
            {rotulo}
          </text>

          <text
            x={cx}
            y={cy + tamanho * 0.065}
            textAnchor="middle"
            dominantBaseline="middle"
            className={cn(
              "tnum fill-ink font-mono font-semibold",
              tamanho >= 150 ? "text-2xl" : "text-xl",
            )}
          >
            {formatarValor(valor)}
          </text>
        </svg>

        {/* Cor de estado nunca sozinha: ícone + rótulo em texto, sempre. */}
        <span className={cn("flex items-center gap-1.5 text-xs font-medium", estado.tinta)}>
          <estado.Icone aria-hidden="true" className="size-3.5 shrink-0" />
          {estado.rotulo}
        </span>

        <span className="tnum font-mono text-2xs text-ink-3">
          limite {formatarValor(limite)}
        </span>
      </span>
    </Dica>
  );
}
