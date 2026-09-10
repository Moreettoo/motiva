import {
  CalendarRange, ClipboardList, FlaskConical, LayoutDashboard, MessageSquareText, Smartphone, Users, Waypoints,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { podeVerRota } from "@/lib/auth/permissoes";
import type { Cargo } from "@/lib/types";

/* Modulo sem "use client" e sem JSX de proposito: o Shell (servidor) e os quatro
   consumidores (cliente) leem a mesma lista. Um componente de servidor nao
   pode ler constante de um modulo "use client". */

export const GRUPOS = [
  { chave: "operacao", rotulo: "Operação" },
  { chave: "administracao", rotulo: "Administração" },
  { chave: "laboratorio", rotulo: "Laboratório" },
] as const;

export type GrupoNavegacao = (typeof GRUPOS)[number]["chave"];

export type ItemNavegacao = {
  href: string;
  rotulo: string;
  icone: LucideIcon;
  /** Frase curta que a Dica mostra quando a lateral está colapsada. */
  descricao: string;
  grupo: GrupoNavegacao;
};

export const NAVEGACAO: ItemNavegacao[] = [
  { href: "/", rotulo: "Painel", icone: LayoutDashboard, descricao: "Visão geral da malha", grupo: "operacao" },
  { href: "/malha", rotulo: "Malha", icone: Waypoints, descricao: "Trechos por rodovia, em régua de km", grupo: "operacao" },
  { href: "/agenda", rotulo: "Agenda", icone: CalendarRange, descricao: "Roçadas sugeridas e aprovadas", grupo: "operacao" },
  { href: "/chamados", rotulo: "Chamados", icone: ClipboardList, descricao: "Ordens de roçada: execução, aprovação e adiamentos", grupo: "operacao" },
  { href: "/copiloto", rotulo: "Copiloto", icone: MessageSquareText, descricao: "Perguntas em português sobre a malha", grupo: "operacao" },
  { href: "/campo", rotulo: "Campo", icone: Smartphone, descricao: "A tela da equipe, para suporte e teste", grupo: "operacao" },
  { href: "/usuarios", rotulo: "Usuários", icone: Users, descricao: "Convites, cargos e equipes lideradas", grupo: "administracao" },
  { href: "/simulador", rotulo: "Simulador", icone: FlaskConical, descricao: "Crescimento previsto em um ponto qualquer", grupo: "laboratorio" },
];

export function rotaAtiva(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** A navegacao e a matriz de permissoes aplicada a lista: nao decide acesso, reflete. */
export function itensDeNavegacao(cargo: Cargo): ItemNavegacao[] {
  return NAVEGACAO.filter((item) => podeVerRota(cargo, item.href));
}
