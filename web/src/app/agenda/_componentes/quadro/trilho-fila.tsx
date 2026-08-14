"use client";

import { Fragment, useState } from "react";

import { Botao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/vazio";
import { IconeDominio } from "@/components/viz/legenda";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { ItemAgenda } from "../dados";
import { CartaoServico } from "./cartao-servico";
import type { CargaArrasto } from "./usar-arrasto";

/** 62 cartões de uma vez são 62 subárvores no hit-test de cada quadro do
 *  arrasto — o teto existe para o CUSTO por quadro, não para poupar pixel. */
const TETO = 25;

export function TrilhoFila({
  itens,
  janelaFim,
  realcado,
  idEmVoo,
  idAtivo,
  selecionado,
  salvandoIds,
  aoPegar,
  aoTeclar,
  aoAbrir,
  engolirClique,
  refCartao,
}: {
  itens: ItemAgenda[];
  janelaFim: string;
  realcado: boolean;
  idEmVoo: number | null;
  /** Roving tabindex da GRADE INTEIRA (trilho + calha), não só deste trilho: a
   *  Tarefa 7 sabe qual cartão está ativo entre os ~130 da tela e manda o id
   *  pronto para comparar. `null` enquanto nada tem foco ainda. */
  idAtivo: number | null;
  selecionado: number | null;
  salvandoIds: ReadonlySet<number>;
  aoPegar: (e: React.PointerEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoTeclar: (e: React.KeyboardEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoAbrir: (id: number) => void;
  engolirClique: (e: React.MouseEvent) => void;
  refCartao: (id: number) => (no: HTMLElement | null) => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const visiveis = expandido ? itens : itens.slice(0, TETO);
  // -1 (nada depois da semana) e 0 (nada dentro dela) são os dois casos em que
  // só um dos dois cabeçalhos abaixo aparece — cobertos pelas condições `!== 0`
  // e `i === corte`, não por um `if (corte === -1)` à parte.
  const corte = visiveis.findIndex((item) => item.data > janelaFim);

  return (
    <section
      data-trilho=""
      aria-label={`Fila de decisão, ${fmt.contar(itens.length, "serviço", "serviços")} sem equipe`}
      className={cn(
        "flex min-h-0 w-full flex-col border-r border-border bg-surface",
        realcado && "ring-2 ring-accent ring-inset",
      )}
    >
      <header className="sticky top-0 z-20 flex items-start gap-2 border-b border-border bg-surface p-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-ink">Fila de decisão</h3>
          <p className="mt-0.5 text-2xs text-ink-3">
            Arraste para um dia e uma turma. Soltar decide as duas coisas de uma vez.
          </p>
        </div>
        <span className="tnum shrink-0 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-ink">
          {fmt.n(itens.length)}
        </span>
      </header>

      {itens.length === 0 ? (
        <div className="p-3">
          <EstadoVazio
            icone={<IconeDominio nome="CircleCheck" />}
            titulo="Nada esperando decisão"
            descricao="Toda sugestão da IA já tem turma."
          />
        </div>
      ) : (
        <ul className="flex min-w-0 flex-col gap-1.5 p-2">
          {visiveis.map((item, i) => (
            <Fragment key={item.id}>
              {i === 0 && corte !== 0 ? (
                <li className="px-1 pt-1 text-2xs tracking-widest text-ink-3 uppercase">
                  Vence nesta semana
                </li>
              ) : null}
              {i === corte ? (
                <li className="px-1 pt-2 text-2xs tracking-widest text-ink-3 uppercase">Depois</li>
              ) : null}
              <CartaoServico
                item={item}
                origem="fila"
                fantasma={item.id === idEmVoo}
                selecionado={item.id === selecionado}
                salvando={salvandoIds.has(item.id)}
                ativo={item.id === idAtivo}
                desfazer={null}
                aoPegar={aoPegar}
                aoTeclar={aoTeclar}
                aoAbrir={aoAbrir}
                engolirClique={engolirClique}
                refCartao={refCartao(item.id)}
              />
            </Fragment>
          ))}
        </ul>
      )}

      {!expandido && itens.length > TETO ? (
        <div className="border-t border-border p-2">
          <Botao tamanho="sm" variante="fantasma" onClick={() => setExpandido(true)}>
            Mostrar os outros {fmt.n(itens.length - TETO)}
          </Botao>
        </div>
      ) : null}
    </section>
  );
}
