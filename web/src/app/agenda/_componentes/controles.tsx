"use client";

import { RotateCcw } from "lucide-react";

import { Botao } from "@/components/ui/botao";
import { Selecao } from "@/components/ui/campo";
import { IconeDominio } from "@/components/viz/legenda";
import { STATUS } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import { STATUS_AGENDAMENTO, type Equipe, type StatusAgendamento } from "@/lib/types";
import { cn } from "@/lib/utils";

import type { FiltroEquipe } from "./dados";

export function Controles({
  status,
  aoMudarStatus,
  equipe,
  aoMudarEquipe,
  equipes,
  porStatus,
  alterado,
  aoRestaurar,
}: {
  status: StatusAgendamento[];
  aoMudarStatus: (valor: StatusAgendamento[]) => void;
  equipe: FiltroEquipe;
  aoMudarEquipe: (valor: FiltroEquipe) => void;
  equipes: Equipe[];
  porStatus: Record<StatusAgendamento, number>;
  alterado: boolean;
  aoRestaurar: () => void;
}) {
  function alternar(valor: StatusAgendamento) {
    aoMudarStatus(
      status.includes(valor) ? status.filter((s) => s !== valor) : [...status, valor],
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div
        role="group"
        aria-label="Filtrar por status do agendamento"
        className="flex flex-wrap items-center gap-1.5"
      >
        {STATUS_AGENDAMENTO.map((s) => {
          const token = STATUS[s];
          const ativo = status.includes(s);

          return (
            <button
              key={s}
              type="button"
              aria-pressed={ativo}
              onClick={() => alternar(s)}
              style={ativo ? { color: token.tinta, backgroundColor: token.fundo } : undefined}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium",
                "transition-[background-color,border-color,color] duration-150 ease-[var(--ease-out-quint)]",
                ativo
                  ? "border-transparent"
                  : "border-border bg-surface text-ink-3 hover:border-border-strong hover:text-ink-2",
              )}
            >
              <IconeDominio nome={token.icone} className="size-3.5" />
              <span>{token.rotulo}</span>
              <span className="tnum font-mono text-2xs opacity-70">{fmt.n(porStatus[s])}</span>
            </button>
          );
        })}
      </div>

      {/* PENDÊNCIA (Tarefa 8, decisão C): o filtro deixou de ESCONDER cartões —
          o quadro precisa da célula de toda equipe como destino de solta. Ele
          ainda não DESTACA a equipe escolhida: `QuadroSemana` não tem prop
          para isso, e criar uma pertence à Tarefa 7 (dentro de `quadro/`), não
          a esta. Por ora o seletor só guarda a escolha na URL, sem efeito
          visual, pronta para o dia em que o destaque for sequenciado. */}
      <Selecao
        aria-label="Filtrar por equipe"
        value={equipe}
        onChange={(evento) => aoMudarEquipe(evento.target.value)}
        className="h-8 w-auto min-w-44 text-xs"
      >
        <option value="">Todas as equipes</option>
        {equipes
          .filter((e) => e.ativo)
          .map((e) => (
            <option key={e.id} value={String(e.id)}>
              {e.nome}
            </option>
          ))}
      </Selecao>

      {alterado ? (
        <Botao tamanho="sm" variante="fantasma" iconeEsquerda={<RotateCcw />} onClick={aoRestaurar}>
          Restaurar filtros
        </Botao>
      ) : null}
    </div>
  );
}
