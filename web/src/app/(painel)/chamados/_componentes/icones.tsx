import type { ComponentType, SVGProps } from "react";
import {
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  CalendarX,
  Circle,
  CircleCheck,
  CircleSlash,
  Clock,
  Flag,
  Hourglass,
  MessageSquare,
  Play,
  Plus,
  Ruler,
  ShieldCheck,
  TriangleAlert,
  Undo2,
  Users,
} from "lucide-react";

import { STATUS_CHAMADO_TOKEN } from "@/lib/dominio";
import type { StatusChamado } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Ponte entre o nome de ícone guardado em `@/lib/dominio` e o componente,
 * para o vocabulário do CHAMADO.
 *
 * Existe separada de `components/viz/legenda.tsx` porque aquele registro
 * atende risco, status de agendamento e procedência de clima, e os dezessete
 * ícones daqui (sete estados × quinze tipos de evento, com sobreposição) não
 * aparecem em legenda de gráfico nenhuma. Misturar os dois faria toda tela do
 * painel carregar os ícones desta.
 */
const ICONES: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  CalendarX,
  CircleCheck,
  CircleSlash,
  Clock,
  Flag,
  Hourglass,
  MessageSquare,
  Play,
  Plus,
  Ruler,
  ShieldCheck,
  TriangleAlert,
  Undo2,
  Users,
};

/** Cobre todo `icone` de `STATUS_CHAMADO_TOKEN` e `TIPO_EVENTO`. O `Circle` é
 *  rede de segurança para um vocabulário novo que chegue sem passar por aqui,
 *  e ele LÊ como ícone que não carregou: é para isso mesmo. */
export function IconeChamado({ nome, className }: { nome: string; className?: string }) {
  const Icone = ICONES[nome] ?? Circle;
  return <Icone aria-hidden="true" className={cn("size-3.5 shrink-0", className)} />;
}

const BASE_CHIP =
  "inline-flex max-w-full items-center gap-1.5 rounded-full border font-medium whitespace-nowrap";

/* `border-transparent` do Tailwind e MORTA neste projeto: `globals.css` tem
   `* { border-color: var(--border) }` fora de camada, e CSS sem camada vence as
   utilities. Sem esta cor inline todo chip de estado ganhava um anel cinza em
   volta do fundo colorido -- visivel na tela, invisivel em tipos, lint e build. */
export const BORDA_INVISIVEL = { borderColor: "transparent" } as const;

const TAMANHOS = {
  sm: "h-5 px-1.5 text-2xs [&_svg]:size-3",
  md: "h-6 px-2 text-xs [&_svg]:size-3.5",
} as const;

/**
 * Estado do chamado. Irmão de `ChipStatus` em `components/ui/chip.tsx`, que
 * cobre o status do AGENDAMENTO e tem outra escala de valores.
 *
 * Cor nunca sozinha: `aguardando_aprovacao` e `adiamento_solicitado` usam
 * `warning`, que no tema claro fica abaixo de 3:1 de propósito, e são o ícone e
 * o rótulo que carregam a informação.
 */
export function ChipChamado({
  status,
  tamanho = "md",
  className,
}: {
  status: StatusChamado;
  tamanho?: "sm" | "md";
  className?: string;
}) {
  const token = STATUS_CHAMADO_TOKEN[status];

  return (
    <span
      className={cn(BASE_CHIP, TAMANHOS[tamanho], className)}
      style={{ ...BORDA_INVISIVEL, color: token.tinta, backgroundColor: token.fundo }}
      title={token.descricao}
    >
      <IconeChamado nome={token.icone} />
      <span className="truncate">{token.rotulo}</span>
    </span>
  );
}
