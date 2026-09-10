import { Eye, ShieldCheck, Tractor, UserCog } from "lucide-react";

import { CARGO } from "@/lib/dominio";
import type { Cargo } from "@/lib/types";

/**
 * Ponte entre o nome de icone que `CARGO` guarda e o componente, igual ao que
 * `IconeDominio` faz para risco e status. Existe separada porque o mapa de
 * `components/viz/legenda.tsx` cobre risco, status e procedencia do clima, e
 * nao os quatro cargos: passar "ShieldCheck" por lá cai no `?? Circle` e o chip
 * do cargo desenha uma bolinha vazia, que na tela le como icone que nao
 * carregou. Quando os cargos entrarem naquele mapa, este arquivo sai.
 */
const ICONES = { ShieldCheck, UserCog, Eye, Tractor } as const;

export function IconeCargo({ cargo }: { cargo: Cargo }) {
  const Icone = ICONES[CARGO[cargo].icone as keyof typeof ICONES];
  return <Icone aria-hidden="true" className="size-3.5 shrink-0" />;
}
