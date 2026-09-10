"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";

import { Botao } from "@/components/ui/botao";
import { sair } from "@/lib/auth/acoes";
import { CARGO } from "@/lib/dominio";
import type { Cargo } from "@/lib/types";

/** Quem esta logado, e a saida. Nome e cargo em texto: a paleta de status e do dado, nao de gente. */
export function MenuUsuario({ usuario }: { usuario: { nome: string; cargo: Cargo } }) {
  const [saindo, iniciar] = useTransition();
  const iniciais = usuario.nome
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="hidden size-8 items-center justify-center rounded-full bg-surface-3 font-mono text-xs font-semibold text-ink-2 sm:inline-flex"
      >
        {iniciais}
      </span>
      <span className="hidden min-w-0 flex-col leading-tight md:flex">
        <span className="truncate text-sm font-medium text-ink">{usuario.nome}</span>
        <span className="truncate text-2xs text-ink-3">{CARGO[usuario.cargo].rotulo}</span>
      </span>
      <Botao
        variante="fantasma"
        tamanho="sm"
        carregando={saindo}
        iconeEsquerda={<LogOut />}
        aria-label="Sair da conta"
        onClick={() => iniciar(() => sair())}
      >
        <span className="hidden sm:inline">Sair</span>
      </Botao>
    </div>
  );
}
