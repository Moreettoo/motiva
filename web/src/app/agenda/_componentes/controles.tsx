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

      {/* Destaque, não filtro: escolher uma equipe aqui não esconde nenhum
          cartão — o quadro (`QuadroSemana`) atenua as linhas das OUTRAS
          equipes, porque toda célula continua sendo destino válido de solta.
          Sem opção "sem equipe": o trilho já É a visão de quem não tem
          turma, e destacar "ninguém" não faz sentido como conceito. */}
      <Selecao
        aria-label="Destacar equipe"
        value={equipe}
        onChange={(evento) => aoMudarEquipe(evento.target.value)}
        className="h-8 w-auto min-w-44 text-xs"
      >
        <option value="">Nenhuma equipe em destaque</option>
        {equipes
          .filter((e) => e.ativo)
          .map((e) => (
            <option key={e.id} value={String(e.id)}>
              {e.nome}
            </option>
          ))}
      </Selecao>

      {/* "Restaurar padrão", não "Restaurar filtros": o seletor de equipe
          acima destaca, não filtra, e o rótulo antigo prometia esconder algo
          que este botão nunca escondeu. */}
      {alterado ? (
        <Botao tamanho="sm" variante="fantasma" iconeEsquerda={<RotateCcw />} onClick={aoRestaurar}>
          Restaurar padrão
        </Botao>
      ) : null}
    </div>
  );
}
