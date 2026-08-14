"use client";

import { useState } from "react";

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

  // O teto corta sobre `itens` (o TOTAL), antes de separar por data — não por
  // grupo. `itens` já vem ordenado por urgência (risco primeiro, data depois;
  // ver `ordenarPorUrgencia`), então truncar aqui mantém os N mais urgentes
  // do jeito que o gestor decide o que olhar primeiro. Particionar antes de
  // truncar daria outra lista: um dia com muitos serviços "desta semana"
  // encheria o teto sozinho e cortaria "depois" inteiro, mesmo que algum item
  // ali tivesse risco maior que um item "desta semana" que sobrou dentro.
  const visiveis = expandido ? itens : itens.slice(0, TETO);

  // Grupos por FILTRO, não por índice de corte: risco e data são eixos
  // independentes (um trecho crítico pode ter `data_sugerida` distante), então
  // `visiveis` não é monotônica em `data` entre faixas de risco — um
  // `findIndex(item => item.data > janelaFim)` acharia a primeira ocorrência e
  // cortaria ainda DENTRO de uma faixa de risco, empurrando itens de risco
  // menor mas dentro da semana para debaixo do cabeçalho "Depois". Filtrar
  // preserva a ordem de urgência dentro de cada grupo, porque `visiveis` já
  // vem ordenada.
  const destaSemana = visiveis.filter((item) => item.data <= janelaFim);
  const depois = visiveis.filter((item) => item.data > janelaFim);

  // Fábrica de elemento, não componente: devolve `<CartaoServico>` direto, com
  // o mesmo `type` de sempre — o `memo` compara por `type` do elemento, não
  // por esta closure ser recriada a cada render. Existe só para os dois `map`
  // abaixo (por grupo) não divergirem nas mesmas 11 props que o `map` único
  // de antes já passava.
  const cartao = (item: ItemAgenda) => (
    <CartaoServico
      key={item.id}
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
  );

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
          {/* Cabeçalho órfão: um grupo vazio (fila inteira "desta semana", ou
              inteira "depois") não mostra o rótulo do grupo que não tem item. */}
          {destaSemana.length > 0 ? (
            <li className="px-1 pt-1 text-2xs tracking-widest text-ink-3 uppercase">
              Vence nesta semana
            </li>
          ) : null}
          {destaSemana.map(cartao)}

          {depois.length > 0 ? (
            <li className="px-1 pt-2 text-2xs tracking-widest text-ink-3 uppercase">Depois</li>
          ) : null}
          {depois.map(cartao)}
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
