import { Dica } from "@/components/ui/dica";
import { ESTADO_ALTURA, estadoDaAltura } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import { clamp, cn } from "@/lib/utils";

import { caminhoArco, escalaLinear, pontoNoArco } from "./escalas";
import { IconeDominio } from "./legenda";

const ANGULO_INICIO = -120;
const ANGULO_FIM = 120;

/**
 * Arco de 240° com a altura atual contra o limite do trecho.
 *
 * O limite é uma marca radial, não um fim de escala: o arco continua depois
 * dele para que "passou em 6&nbsp;cm" e "passou em 30&nbsp;cm" não desenhem
 * igual. O excedente vem hachurado: a leitura crítica precisa mudar de textura,
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
  const estado = estadoDaAltura(valor, limite);
  // Limite invalido nao existe em dado real, mas o arco precisa de uma cor:
  // sem leitura, o medidor desenha como "dentro" e o numero fala por si.
  const token = estado?.token ?? ESTADO_ALTURA.dentro;
  const ocupacao = estado?.pct ?? 0;
  const excedeu = estado?.excedido ?? false;

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

  const leitura = `${rotulo}: ${formatarValor(valor)}, limite ${formatarValor(limite)}, ${token.rotulo}, ${fmt.pct(ocupacao)} do limite.`;

  // O número e a unidade vêm num só texto ("32,4 cm"), mas só o número varia,
  // "cm" é sempre duas letras. Desenhar as duas partes no mesmo corpo de fonte
  // gasta, na unidade, a mesma largura que um dígito do valor custaria; com
  // dois dígitos inteiros a string inteira passa do vão do arco e o traço
  // risca as duas pontas (o "3" de um lado, o "m" do outro, a string é
  // centralizada, então as duas bordas colidem à mesma distância). Separar a
  // unidade num corpo menor devolve essa largura para o valor.
  const textoValor = formatarValor(valor);
  const posEspaco = textoValor.indexOf(" ");
  const numeroTexto = posEspaco === -1 ? textoValor : textoValor.slice(0, posEspaco);
  const unidadeTexto = posEspaco === -1 ? null : textoValor.slice(posEspaco + 1);

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
            style={{ stroke: `color-mix(in oklab, ${token.cor} 20%, var(--surface))` }}
            strokeWidth={traco}
            strokeLinecap="round"
          />

          {anguloCheio > ANGULO_INICIO ? (
            <path
              d={caminhoArco(cx, cy, raio, ANGULO_INICIO, anguloCheio)}
              fill="none"
              style={{ stroke: token.cor }}
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
            {numeroTexto}
            {unidadeTexto ? (
              <tspan dx="4" className="fill-ink-3 text-sm font-medium">
                {unidadeTexto}
              </tspan>
            ) : null}
          </text>
        </svg>

        {/* Cor de estado nunca sozinha: ícone + rótulo em texto, sempre. */}
        <span
          className="flex items-center gap-1.5 text-xs font-medium"
          style={{ color: token.tinta }}
        >
          <IconeDominio nome={token.icone} />
          {token.rotulo}
        </span>

        <span className="tnum font-mono text-2xs text-ink-3">
          limite {formatarValor(limite)}
        </span>
      </span>
    </Dica>
  );
}
