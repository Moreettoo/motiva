import { cn } from "@/lib/utils";

/**
 * Marca própria do produto, não é o logotipo da Motiva.
 *
 * O símbolo é a faixa de domínio vista de cima: duas linhas de asfalto, o
 * tracejado do eixo entre elas e, na margem de baixo, o filete de acento que
 * representa a vegetação, o único elemento que o painel monitora e o único
 * lugar do símbolo em que o limão aparece.
 */
export function Marca({
  tamanho = 22,
  comTexto = false,
  className,
}: {
  tamanho?: number;
  comTexto?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        aria-hidden="true"
        focusable="false"
        width={tamanho}
        height={tamanho}
        viewBox="0 0 24 24"
        fill="none"
        className="shrink-0"
      >
        {/* Asfalto: as duas bordas da pista. */}
        <path
          d="M2.5 7.5h19M2.5 14h19"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        {/* Eixo tracejado: recessivo, é o miolo da pista. */}
        <path
          d="M4.5 10.75h3.5M11 10.75h2.5M16.5 10.75h3.5"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          opacity="0.4"
        />
        {/* Margem com vegetação: o filete de acento, sempre mais curto que a pista. */}
        <path
          d="M2.5 19.25h13"
          stroke="var(--accent-line)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>

      {comTexto ? (
        <span className="brilho-marca relative overflow-hidden text-base leading-none font-semibold tracking-tight text-ink">
          HighwAI
        </span>
      ) : null}
    </span>
  );
}
