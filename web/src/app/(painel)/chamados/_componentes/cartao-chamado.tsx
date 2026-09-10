"use client";

import { fmt } from "@/lib/format";
import type { ChamadoDetalhado } from "@/lib/types";
import { cn } from "@/lib/utils";

import { IconeChamado } from "./icones";

/**
 * "há 2 h", "há 40 min", "há 3 dias", a partir de dois instantes.
 *
 * `relativoEmDias`, em `@/lib/format`, é a função certa para DATA de
 * calendário e responde em dias: um chamado fechado às 6h40 desta manhã sairia
 * como "hoje", que é exatamente o que a fila de aprovação não pode dizer, ela
 * existe para ordenar o que chegou primeiro dentro do mesmo dia. Daí um
 * `Intl.RelativeTimeFormat` próprio com passo de minuto e de hora.
 *
 * `agora` é PARÂMETRO, e vem do servidor pela página: calculado aqui com
 * `Date.now()`, o texto renderizado no servidor e o da hidratação seriam
 * diferentes sempre que a virada de minuto caísse entre os dois.
 */
const RELATIVO = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto", style: "narrow" });

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

export function desde(instante: string, agora: string): string {
  const decorrido = new Date(agora).getTime() - new Date(instante).getTime();
  if (!Number.isFinite(decorrido)) return "—";

  if (decorrido < MINUTO) return "agora há pouco";
  if (decorrido < HORA) return RELATIVO.format(-Math.round(decorrido / MINUTO), "minute");
  if (decorrido < 2 * DIA) return RELATIVO.format(-Math.round(decorrido / HORA), "hour");
  return RELATIVO.format(-Math.round(decorrido / DIA), "day");
}

/** O dado que justifica o cartão estar naquele bloco. Ícone + texto, e a tinta
 *  só quando ele é o alarme (atraso). */
export type Destaque = {
  icone: string;
  texto: string;
  alarme?: boolean;
};

/**
 * Ficha compacta da fila de decisão.
 *
 * Não traz o chip de estado, de propósito: o bloco em que ela está JÁ diz o
 * estado, e repeti-lo em cada uma das quatro fichas gastaria a linha que
 * carrega o único dado que muda entre elas, o `destaque`.
 */
export function CartaoChamado({
  chamado,
  destaque,
  selecionado,
  aoAbrir,
}: {
  chamado: ChamadoDetalhado;
  destaque: Destaque;
  selecionado: boolean;
  aoAbrir: () => void;
}) {
  const { trecho, agendamento } = chamado;
  const equipe = agendamento.equipe;

  return (
    <button
      type="button"
      onClick={aoAbrir}
      aria-current={selecionado || undefined}
      /* A cor da borda VAI POR INLINE: `globals.css` tem
         `* { border-color: var(--border) }` fora de camada, e CSS sem camada
         vence as utilities do Tailwind -- `border-accent` resolvia para o
         cinza neutro e a ficha selecionada nao fechava a moldura. As classes
         abaixo so trocam a variavel, que e custom property e nao sofre disso. */
      style={{ borderColor: "var(--borda, var(--border))" }}
      className={cn(
        "w-full min-w-0 rounded-md border px-2.5 py-2 text-left",
        "transition-[background-color,border-color,transform] duration-150 ease-[var(--ease-out-quint)]",
        "active:translate-y-px",
        selecionado
          ? "bg-accent-soft [--borda:var(--accent)]"
          : "bg-surface-2 hover:bg-surface-3 hover:[--borda:var(--border-strong)]",
      )}
    >
      <span className="tnum block truncate font-mono text-2xs text-ink-3">{chamado.numero}</span>

      <span className="mt-0.5 block truncate text-sm font-medium text-ink">{trecho.rodovia}</span>

      <span className="tnum block truncate text-xs text-ink-2">
        {fmt.faixaKm(Number(trecho.km_inicio), Number(trecho.km_fim))}
      </span>

      <span className="mt-1 block truncate text-2xs text-ink-3">
        {equipe ? (equipe.lider_nome ? `${equipe.nome} · ${equipe.lider_nome}` : equipe.nome) : "Sem equipe"}
      </span>

      <span
        className={cn(
          "mt-1.5 flex min-w-0 items-center gap-1.5 text-xs",
          destaque.alarme ? "text-critical-ink" : "text-ink-2",
        )}
      >
        <IconeChamado nome={destaque.icone} className="size-3" />
        <span className="truncate">{destaque.texto}</span>
      </span>
    </button>
  );
}
