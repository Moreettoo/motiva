"use client";

import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { ChaveCelula, LinhaEquipe, Ocupacao } from "../dados";
import { CartaoServico } from "./cartao-servico";
import { CelulaEquipe } from "./celula-equipe";
import type { Alvo, CargaArrasto } from "./usar-arrasto";

/**
 * A calha grudada com o nome da turma, mais as 7 células da semana.
 *
 * Isolada de `quadro-semana.tsx` para o arquivo principal caber num tamanho
 * revisável — a lista de props é grande porque a grade é plana (sem
 * `subgrid`), então cada linha recebe tudo que suas células e cartões
 * precisam de fora.
 */
export function LinhaTurma({
  linha,
  atenuada,
  previa,
  alvoAtual,
  recusaAtual,
  emVoo,
  selecionado,
  idAtivo,
  salvandoIds,
  aoPegar,
  aoTeclar,
  aoAbrir,
  engolirClique,
  refCartao,
  desfazerDe,
}: {
  linha: LinhaEquipe;
  /** Outra equipe está em destaque (`controles.tsx`) e não é esta: a linha
   *  inteira recebe ênfase reduzida. Nunca esconde nem desabilita — só muda
   *  o quanto o olho é puxado para cá. */
  atenuada: boolean;
  previa: Map<ChaveCelula, Ocupacao>;
  alvoAtual: Alvo | null;
  recusaAtual: string | null;
  emVoo: number | null;
  selecionado: number | null;
  idAtivo: number | null;
  salvandoIds: ReadonlySet<number>;
  aoPegar: (e: React.PointerEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoTeclar: (e: React.KeyboardEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoAbrir: (id: number) => void;
  engolirClique: (e: React.MouseEvent) => void;
  refCartao: (id: number) => (no: HTMLElement | null) => void;
  desfazerDe: (id: number) => (() => void) | null;
}) {
  const eq = linha.equipe;

  return (
    <>
      {/* NÃO é `opacity-60` no bloco inteiro: essa opacidade compõe o TEXTO
          contra o fundo também, e `text-ink-3` (linha de baixo) já mede
          4,6:1/4,9:1 no piso — qualquer opacity a mais fura o mínimo de
          contraste para texto pequeno (medido: ~2,4:1 no claro, ~2,5:1 no
          escuro). Em vez disso, uma veladura por baixo do texto (mesmo
          truque de `CelulaEquipe`, com a mesma variável `--velatura`) escurece
          só o retângulo; o texto continua opaco por cima. A opacidade aqui é
          BEM menor que a de `CelulaEquipe` (3% contra 10%) porque lá não há
          texto nenhum sob a veladura — aqui há, e 3% ainda deixa `text-ink-3`
          em ~4,68:1 no claro (medido a mão; escurecer o fundo só AUMENTA o
          contraste no escuro, onde o texto é claro). A borda dimui junto,
          via modificador `/60` do Tailwind — que baixa alfa só da borda, sem
          tocar no texto, ao contrário do `opacity` do elemento. */}
      <div
        className={cn(
          "sticky left-0 z-10 flex flex-col justify-center border-r border-b bg-surface px-2 py-1.5",
          atenuada ? "border-border/60" : "border-border",
        )}
      >
        {atenuada ? (
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-velatura opacity-[0.03]" />
        ) : null}
        <p className="relative truncate text-2xs font-medium text-ink" title={eq.nome}>
          {eq.nome}
        </p>
        <p className="relative tnum truncate font-mono text-2xs text-ink-3">
          {fmt.km(Number(eq.capacidade_km_dia))}/dia
          {eq.ativo ? "" : " · desativada"}
        </p>
      </div>

      {linha.celulas.map((celula) => (
        <CelulaEquipe
          key={celula.chave}
          celula={celula}
          equipeNome={eq.nome}
          previa={previa.get(celula.chave) ?? null}
          realcada={alvoAtual === celula.chave && !recusaAtual}
          recusada={alvoAtual === celula.chave && recusaAtual != null}
          atenuada={atenuada}
          filhos={celula.itens.map((item) => (
            <CartaoServico
              key={item.id}
              item={item}
              origem={celula.chave}
              fantasma={item.id === emVoo}
              selecionado={item.id === selecionado}
              salvando={salvandoIds.has(item.id)}
              ativo={item.id === idAtivo}
              desfazer={desfazerDe(item.id)}
              aoPegar={aoPegar}
              aoTeclar={aoTeclar}
              aoAbrir={aoAbrir}
              engolirClique={engolirClique}
              refCartao={refCartao(item.id)}
            />
          ))}
        />
      ))}
    </>
  );
}
