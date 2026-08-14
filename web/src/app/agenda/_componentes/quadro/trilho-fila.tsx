"use client";

import { Botao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/vazio";
import { IconeDominio } from "@/components/viz/legenda";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { ItemAgenda } from "../dados";
import { CartaoServico } from "./cartao-servico";
import type { CargaArrasto } from "./usar-arrasto";

export function TrilhoFila({
  itens,
  total,
  expandido,
  aoExpandir,
  janelaFim,
  realcado,
  idEmVoo,
  idAtivo,
  selecionado,
  salvandoIds,
  anelErroPorId,
  aoPegar,
  aoTeclar,
  aoAbrir,
  engolirClique,
  refCartao,
  aoFocar,
}: {
  /** Já cortado por quem chama (`TETO_TRILHO`, em `quadro-semana.tsx`) — o
   *  corte subiu pra lá porque o roving tabindex da grade inteira
   *  (`usar-foco-grade.ts`) precisa saber exatamente quais ids têm cartão
   *  montado; um teto escondido aqui dentro deixava isso invisível de fora,
   *  e um id além dele podia virar `idAtivo` sem cartão nenhum na tela para
   *  representá-lo. */
  itens: ItemAgenda[];
  /** Tamanho da fila INTEIRA, sem o corte — para o selo do cabeçalho e o
   *  texto do botão "mostrar os outros". */
  total: number;
  expandido: boolean;
  aoExpandir: () => void;
  janelaFim: string;
  realcado: boolean;
  idEmVoo: number | null;
  /** Roving tabindex da GRADE INTEIRA (trilho + calha), não só deste trilho:
   *  `usar-foco-grade.ts` sabe qual cartão está ativo entre os ~130 da tela e
   *  manda o id pronto para comparar. `null` enquanto nada tem foco ainda. */
  idAtivo: number | null;
  selecionado: number | null;
  salvandoIds: ReadonlySet<number>;
  /** id → geração do último erro de escrita. Mesma forma de `salvandoIds`: a
   *  coleção desce e o CARTÃO recebe o escalar. */
  anelErroPorId: ReadonlyMap<number, number>;
  aoPegar: (e: React.PointerEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoTeclar: (e: React.KeyboardEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoAbrir: (id: number) => void;
  engolirClique: (e: React.MouseEvent) => void;
  refCartao: (id: number) => (no: HTMLElement | null) => void;
  aoFocar: (id: number) => () => void;
}) {
  // Grupos por FILTRO, não por índice de corte: risco e data são eixos
  // independentes (um trecho crítico pode ter `data_sugerida` distante), então
  // `itens` não é monotônica em `data` entre faixas de risco — um
  // `findIndex(item => item.data > janelaFim)` acharia a primeira ocorrência e
  // cortaria ainda DENTRO de uma faixa de risco, empurrando itens de risco
  // menor mas dentro da semana para debaixo do cabeçalho "Depois". Filtrar
  // preserva a ordem de urgência dentro de cada grupo, porque `itens` já
  // vem ordenada (e já vem cortada por quem chama — ver o comentário da prop).
  const destaSemana = itens.filter((item) => item.data <= janelaFim);
  const depois = itens.filter((item) => item.data > janelaFim);

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
      anelErro={anelErroPorId.get(item.id) ?? 0}
      ativo={item.id === idAtivo}
      desfazer={null}
      aoPegar={aoPegar}
      aoTeclar={aoTeclar}
      aoAbrir={aoAbrir}
      engolirClique={engolirClique}
      refCartao={refCartao(item.id)}
      aoFocar={aoFocar(item.id)}
    />
  );

  return (
    <section
      data-trilho=""
      aria-label={`Fila de decisão, ${fmt.contar(total, "serviço", "serviços")} sem equipe`}
      className={cn(
        "flex min-h-0 w-full flex-col border-r border-border bg-surface",
        realcado && "ring-2 ring-accent ring-inset",
      )}
    >
      {/* `data-obstaculo="topo"`: este cabeçalho é `sticky top-0` e come a faixa
          de cima da área em que se solta um cartão na fila. Vale nas DUAS
          montagens do trilho (`trilho-responsivo.tsx`) porque as duas põem um
          rolador IMEDIATAMENTE em volta deste `<section>` — no largo a coluna
          (`overflow-y-auto`, `max-h-[min(78vh,760px)]`), no estreito a doca aberta
          (`overflow-y-auto`, `max-h-[60vh]`) — e quem lê o atributo é o rolador em
          que o elemento está DENTRO (`medirInsets`, em `usar-arrasto.ts`), não um
          rolador nomeado: o mesmo atributo serve aos dois sem saber qual está
          montado. Com a doca FECHADA o container é `overflow-hidden` e `inert`,
          então não é rolador, não entra na conta de ninguém, e não há ponteiro
          para pairar ali. */}
      <header
        data-obstaculo="topo"
        className="sticky top-0 z-20 flex items-start gap-2 border-b border-border bg-surface p-3"
      >
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-ink">Fila de decisão</h3>
          <p className="mt-0.5 text-2xs text-ink-3">
            Arraste para um dia e uma turma. Soltar decide as duas coisas de uma vez.
          </p>
        </div>
        <span className="tnum shrink-0 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-ink">
          {fmt.n(total)}
        </span>
      </header>

      {total === 0 ? (
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

      {!expandido && total > itens.length ? (
        <div className="border-t border-border p-2">
          <Botao tamanho="sm" variante="fantasma" onClick={aoExpandir}>
            Mostrar os outros {fmt.n(total - itens.length)}
          </Botao>
        </div>
      ) : null}
    </section>
  );
}
