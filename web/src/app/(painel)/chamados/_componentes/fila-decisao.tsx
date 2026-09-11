"use client";

import type { ReactNode } from "react";

import { diasDeAtraso } from "@/lib/chamados/numero";
import { MOTIVO_ADIAMENTO, STATUS_CHAMADO_TOKEN } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import type { ChamadoNaTela } from "@/lib/chamados/queries";
import type { ChamadoAdiamento, StatusChamado } from "@/lib/types";

import { CartaoChamado, desde, type Destaque } from "./cartao-chamado";
import { IconeChamado } from "./icones";

/** O que `filaDeDecisao` devolve. Tipo local, e não importado do módulo de
 *  consulta, porque o adiamento vem embutido só no bloco do meio. */
export type Fila = {
  aguardando: ChamadoNaTela[];
  adiamentos: (ChamadoNaTela & { adiamento: ChamadoAdiamento })[];
  atrasados: ChamadoNaTela[];
};

export type BlocoDaFila = "aguardando" | "adiamentos" | "atrasados";

/** Quantas fichas cada bloco mostra antes de mandar para a lista. Quatro cabem
 *  na altura de um bloco sem rolagem interna; o resto está a um clique em
 *  "Ver todos", que é a mesma informação com mais espaço. */
const FICHAS = 4;

function Bloco({
  titulo,
  status,
  total,
  aoVerTodos,
  children,
}: {
  titulo: string;
  /** De onde saem o ícone e a tinta do bloco. */
  status: StatusChamado;
  total: number;
  aoVerTodos: () => void;
  children: ReactNode;
}) {
  const token = STATUS_CHAMADO_TOKEN[status];

  return (
    <section
      aria-label={titulo}
      className="flex min-w-0 flex-col rounded-lg border border-l-2 border-border bg-surface p-4"
      style={{ borderLeftColor: token.tinta }}
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-ink">
          <IconeChamado nome={token.icone} />
          <span className="truncate">{titulo}</span>
        </h2>
        <span className="tnum shrink-0 text-2xl leading-none font-semibold text-ink">
          {fmt.n(total)}
        </span>
      </header>

      <div className="mt-3 flex min-w-0 flex-col gap-2">{children}</div>

      {total > FICHAS ? (
        <button
          type="button"
          onClick={aoVerTodos}
          className="mt-2 self-start rounded-sm text-xs font-medium text-accent hover:underline"
        >
          Ver os {fmt.n(total)} na lista
        </button>
      ) : null}
    </section>
  );
}

/** Bloco vazio nunca some: a fila tem três posições fixas e o gestor aprende
 *  onde cada decisão mora. Um bloco que desaparece faz os outros dois pularem
 *  de lugar toda vez que a última decisão daquele tipo é resolvida. */
function NadaEsperando() {
  return (
    <p className="rounded-md border border-dashed border-border px-2.5 py-4 text-center text-xs text-ink-3">
      Nada esperando você
    </p>
  );
}

/**
 * A fila de decisão: três blocos com o que depende de uma pessoa agora.
 *
 * Não é um resumo da lista abaixo com outro desenho. Os três blocos são três
 * PERGUNTAS diferentes — "isso está pronto?", "posso remarcar?", "por que não
 * começou?" — e cada ficha mostra o dado que responde à sua, e só ele. O chip
 * de estado não aparece nas fichas porque o bloco já o diz.
 */
export function FilaDecisao({
  fila,
  hoje,
  agora,
  chamadoAberto,
  aoAbrir,
  aoVerTodos,
}: {
  fila: Fila;
  hoje: string;
  /** Instante do servidor: é dele que sai "finalizado há 2 h". */
  agora: string;
  chamadoAberto: number | null;
  aoAbrir: (id: number) => void;
  aoVerTodos: (bloco: BlocoDaFila) => void;
}) {
  function fichas(lista: ChamadoNaTela[], destaque: (c: ChamadoNaTela) => Destaque) {
    if (lista.length === 0) return <NadaEsperando />;
    return lista.slice(0, FICHAS).map((c) => (
      <CartaoChamado
        key={c.id}
        chamado={c}
        destaque={destaque(c)}
        selecionado={chamadoAberto === c.id}
        aoAbrir={() => aoAbrir(c.id)}
      />
    ));
  }

  return (
    /* `items-start`: cada bloco tem a altura do seu conteúdo. Esticados até a
       altura do maior, os dois blocos com uma ficha ficavam com meia tela de
       vazio embaixo — e um retângulo vazio grande lê como área que falhou em
       carregar, não como "nada esperando você", que a frase já diz. */
    <div className="grid min-w-0 items-start gap-3 md:grid-cols-3">
      <Bloco
        titulo="Aguardando aprovação"
        status="aguardando_aprovacao"
        total={fila.aguardando.length}
        aoVerTodos={() => aoVerTodos("aguardando")}
      >
        {fichas(fila.aguardando, (c) => ({
          icone: "Flag",
          texto: c.finalizado_em
            ? `Finalizado ${desde(c.finalizado_em, agora)}`
            : "Sem hora de fechamento",
        }))}
      </Bloco>

      <Bloco
        titulo="Adiamento pedido"
        status="adiamento_solicitado"
        total={fila.adiamentos.length}
        aoVerTodos={() => aoVerTodos("adiamentos")}
      >
        {fila.adiamentos.length === 0 ? (
          <NadaEsperando />
        ) : (
          fila.adiamentos.slice(0, FICHAS).map((c) => {
            const motivo = MOTIVO_ADIAMENTO[c.adiamento.motivo].toLowerCase();
            return (
              <CartaoChamado
                key={c.id}
                chamado={c}
                destaque={{
                  icone: "CalendarClock",
                  texto: c.adiamento.data_sugerida
                    ? `Pede ${fmt.dataCurta(c.adiamento.data_sugerida)} · ${motivo}`
                    : `Pede outra data · ${motivo}`,
                }}
                selecionado={chamadoAberto === c.id}
                aoAbrir={() => aoAbrir(c.id)}
              />
            );
          })
        )}
      </Bloco>

      <Bloco
        titulo="Atrasados"
        status="aberto"
        total={fila.atrasados.length}
        aoVerTodos={() => aoVerTodos("atrasados")}
      >
        {fichas(fila.atrasados, (c) => ({
          icone: "TriangleAlert",
          texto: fmt.contar(diasDeAtraso(c.agendamento.data_sugerida, hoje), "dia de atraso", "dias de atraso"),
          alarme: true,
        }))}
      </Bloco>
    </div>
  );
}
