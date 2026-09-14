import { CircleCheck, OctagonAlert, TriangleAlert } from "lucide-react";

import { CLASSE_ALTURA } from "@/lib/dominio";
import type { ClasseAltura } from "@/lib/types";

const ICONE = { CircleCheck, TriangleAlert, OctagonAlert } as const;

/** Cor nunca sozinha: ícone e rótulo sempre juntos, como manda `dominio.ts`. */
export function ChipClasse({ classe, curto = false }: { classe: ClasseAltura; curto?: boolean }) {
  const t = CLASSE_ALTURA[classe];
  const Icone = ICONE[t.icone as keyof typeof ICONE] ?? TriangleAlert;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-2xs font-medium"
      style={{ color: t.tinta, background: t.fundo }}
      title={t.descricao}
    >
      <Icone aria-hidden="true" className="size-3 shrink-0" />
      {curto ? String(classe) : t.rotulo}
    </span>
  );
}
