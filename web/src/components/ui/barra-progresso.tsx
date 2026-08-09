import type * as React from "react";
import { OctagonAlert } from "lucide-react";

import { fmt } from "@/lib/format";
import { clamp, cn } from "@/lib/utils";

export type TomBarra = "acento" | "good" | "warning" | "serious" | "critical" | "neutro";

const TOM_COR: Record<TomBarra, string> = {
  acento: "var(--accent)",
  good: "var(--good)",
  warning: "var(--warning)",
  serious: "var(--serious)",
  critical: "var(--critical)",
  neutro: "var(--ink-3)",
};

const ALTURAS = {
  fina: "h-1",
  media: "h-2",
} as const;

/**
 * Medidor de ocupacao (altura atual contra o limite do trecho).
 *
 * O preenchimento anima por `scaleX`, nunca por `width`: largura forca layout
 * a cada quadro e o painel tem dezenas destas barras na mesma tela.
 */
export function BarraProgresso({
  valor,
  max = 100,
  tom = "acento",
  rotulo,
  marcaLimite,
  altura = "fina",
  mostrarValor = false,
  className,
}: {
  valor: number;
  max?: number;
  tom?: TomBarra;
  rotulo: string;
  marcaLimite?: number;
  altura?: "fina" | "media";
  mostrarValor?: boolean;
  className?: string;
}) {
  const limiteSuperior = max > 0 ? max : 100;
  const pct = (valor / limiteSuperior) * 100;
  const excedido = valor > limiteSuperior;
  const cor = TOM_COR[tom];

  // Passou do limite: a barra satura e ganha hachura diagonal. O caso critico
  // precisa ler diferente mesmo para quem nao distingue a cor.
  const estiloPreenchimento: React.CSSProperties = excedido
    ? {
        transform: "scaleX(1)",
        backgroundImage: `repeating-linear-gradient(45deg, ${cor} 0 4px, color-mix(in oklab, ${cor} 55%, var(--bg)) 4px 8px)`,
      }
    : {
        transform: `scaleX(${clamp(pct, 0, 100) / 100})`,
        backgroundColor: cor,
      };

  const texto = fmt.pct(clamp(pct, 0, 999));

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="progressbar"
        aria-label={rotulo}
        aria-valuemin={0}
        aria-valuemax={limiteSuperior}
        aria-valuenow={clamp(valor, 0, limiteSuperior)}
        aria-valuetext={excedido ? `${texto} — acima do limite` : texto}
        className="relative min-w-0 flex-1"
      >
        <div className={cn("overflow-hidden rounded-sm bg-surface-3", ALTURAS[altura])}>
          <div
            className="h-full w-full origin-left transition-transform duration-500 ease-[var(--ease-out-quint)]"
            style={estiloPreenchimento}
          />
        </div>

        {marcaLimite != null ? (
          <span
            aria-hidden="true"
            className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-sm bg-ink-2"
            style={{ left: `${clamp(marcaLimite, 0, 100)}%` }}
          />
        ) : null}
      </div>

      {mostrarValor ? (
        <span
          className={cn(
            "tnum shrink-0 font-mono text-2xs",
            excedido ? "text-critical-ink" : "text-ink-3",
          )}
        >
          {excedido ? (
            <OctagonAlert aria-hidden="true" className="mr-1 inline size-3 align-[-2px]" />
          ) : null}
          {texto}
          {excedido ? <span className="sr-only"> acima do limite</span> : null}
        </span>
      ) : null}
    </div>
  );
}
