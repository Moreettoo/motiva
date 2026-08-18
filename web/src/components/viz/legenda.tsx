import type { ComponentType, CSSProperties, ReactNode, SVGProps } from "react";
import {
  Circle,
  CircleCheck,
  CircleSlash,
  Clock,
  CloudSun,
  Fence,
  Flag,
  GitFork,
  History,
  Minus,
  OctagonAlert,
  Redo2,
  Repeat,
  Rows3,
  Sparkles,
  Spline,
  TriangleAlert,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Ponte entre o nome de ícone guardado em `@/lib/dominio` e o componente.
 * Fica aqui, e não em cada gráfico, porque ícone só aparece colado num rótulo,
 * e rótulo colado em marca colorida é exatamente o que a legenda é.
 */
const ICONES: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  OctagonAlert,
  TriangleAlert,
  Clock,
  CircleCheck,
  Sparkles,
  Flag,
  CircleSlash,
  Minus,
  Spline,
  GitFork,
  Redo2,
  Rows3,
  Fence,
  // Procedência do clima no simulador. Sem estes três o `?? Circle` desenhava
  // uma bolinha vazia ao lado de "Previsão" e "Média observada", que na tela
  // lê como ícone que não carregou, não como escolha.
  CloudSun,
  History,
  Repeat,
};

export function IconeDominio({
  nome,
  className,
  style,
}: {
  nome?: string;
  className?: string;
  /** Para quando a cor sai de um token do domínio (`RISCO[r].tinta`) e não de
   *  uma classe: o cartão da agenda pinta o ícone com a tinta do risco enquanto
   *  o texto ao lado fica em `--ink`. Tailwind não gera classe para valor
   *  vindo de objeto, e `text-[var(--…)]` arbitrário não aceita interpolação. */
  style?: CSSProperties;
}) {
  if (!nome) return null;
  const Icone = ICONES[nome] ?? Circle;
  return (
    <Icone aria-hidden="true" className={cn("size-3.5 shrink-0", className)} style={style} />
  );
}

export type ItemLegenda = {
  rotulo: string;
  /** Token de cor da entidade: `var(--s1)`, `var(--critical)`… nunca hex. */
  cor: string;
  /** Para item que na área do gráfico é PREENCHIMENTO translúcido, e não traço:
   *  a faixa de incerteza do gráfico de linha usa a mesma cor da mediana, e uma
   *  marca sólida faria a legenda anunciar duas séries onde há uma com margem.
   *  Não é a mesma opacidade do preenchimento (0,16 num quadrado de 8 px some);
   *  é a menor que ainda lê como "versão clara da mesma cor". */
  opacidade?: number;
  valor?: string;
  icone?: ReactNode;
};

/**
 * Legenda, presente sempre que houver duas séries ou mais.
 *
 * O rótulo usa tinta de TEXTO, nunca a cor da série: amarelo e laranja são
 * ilegíveis como texto sobre a superfície. Quem carrega a identidade é a marca
 * de 8&nbsp;px ao lado.
 */
export function Legenda({
  itens,
  orientacao = "horizontal",
  className,
}: {
  itens: ItemLegenda[];
  orientacao?: "horizontal" | "vertical";
  className?: string;
}) {
  if (itens.length === 0) return null;

  return (
    <ul
      className={cn(
        "flex min-w-0 text-xs",
        orientacao === "vertical" ? "flex-col gap-1.5" : "flex-wrap items-center gap-x-4 gap-y-1.5",
        className,
      )}
    >
      {itens.map((item, i) => (
        <li key={`${item.rotulo}-${i}`} className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-[2px]"
            style={{ backgroundColor: item.cor, opacity: item.opacidade }}
          />

          {item.icone ? (
            <span aria-hidden="true" className="inline-flex shrink-0 text-ink-3 [&_svg]:size-3">
              {item.icone}
            </span>
          ) : null}

          <span className="min-w-0 truncate text-ink-2">{item.rotulo}</span>

          {item.valor ? (
            <span className="tnum shrink-0 font-mono text-ink-3">{item.valor}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
