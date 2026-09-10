"use client";

import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { ChaveCelula, LinhaEquipe, Ocupacao } from "../dados";
import { CartaoServico } from "./cartao-servico";
import { CelulaEquipe } from "./celula-equipe";
import type { Alvo, CargaArrasto } from "./usar-arrasto";

/**
 * A calha grudada com o nome da equipe, mais as 7 células da semana.
 *
 * Isolada de `quadro-semana.tsx` para o arquivo principal caber num tamanho
 * revisável, a lista de props é grande porque a grade é plana (sem
 * `subgrid`), então cada linha recebe tudo que suas células e cartões
 * precisam de fora.
 */
export function LinhaTurma({
  linha,
  destacada,
  previa,
  alvoAtual,
  recusaAtual,
  emVoo,
  selecionado,
  idAtivo,
  salvandoIds,
  anelErroPorId,
  aoPegar,
  aoTeclar,
  aoAbrir,
  engolirClique,
  refCartao,
  aoFocar,
  desfazerDe,
}: {
  linha: LinhaEquipe;
  /** ESTA é a equipe escolhida no seletor de destaque (`controles.tsx`): a
   *  linha inteira recebe realce. Nunca esconde nem desabilita nenhuma outra,
   *  toda célula continua sendo destino válido de solta.
   *
   *  Era o inverso (`atenuada`, nas nove OUTRAS linhas) e não funcionava: a
   *  ênfase reduzida era uma veladura preta a 3%, que no tema escuro produz
   *  1,007:1 de diferença, invisível, em qualquer alfa (a 20% ainda é
   *  1,030:1). Realçar uma linha com matiz custa zero contraste e se vê nos
   *  dois temas; ver `linhaDestacada`, em `dados.tsx`. */
  destacada: boolean;
  previa: Map<ChaveCelula, Ocupacao>;
  alvoAtual: Alvo | null;
  recusaAtual: string | null;
  emVoo: number | null;
  selecionado: number | null;
  idAtivo: number | null;
  salvandoIds: ReadonlySet<number>;
  /** id → geração do último erro de escrita. Mesma forma de `salvandoIds`: a
   *  coleção desce e o CARTÃO recebe o escalar, para o `memo` dos ~130 cartões
   *  não cair a cada `pointermove`. */
  anelErroPorId: ReadonlyMap<number, number>;
  aoPegar: (e: React.PointerEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoTeclar: (e: React.KeyboardEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoAbrir: (id: number) => void;
  engolirClique: (e: React.MouseEvent) => void;
  refCartao: (id: number) => (no: HTMLElement | null) => void;
  aoFocar: (id: number) => () => void;
  desfazerDe: (id: number) => (() => void) | null;
}) {
  const eq = linha.equipe;

  return (
    <>
      {/* NÃO é `opacity-60` no bloco inteiro: essa opacidade compõe o TEXTO
          contra o fundo também, e `text-ink-3` (a linha de baixo) sobre
          `surface` já mede 4,99:1 no claro e 4,87:1 no escuro, quase no piso
          de 4,5:1 para texto pequeno. A 60% o mesmo par desaba para 2,36:1 e
          2,53:1. Em vez disso, uma veladura por baixo do texto (mesmo truque de
          `CelulaEquipe`, mesma variável `--velatura` e a MESMA opacidade de 3%,
          pelo motivo medido lá) escurece só o retângulo; o texto continua opaco
          por cima e o par fica em 4,66:1 no claro e 4,90:1 no escuro,
          escurecer o fundo custa contraste no claro e ganha no escuro, onde o
          texto é o lado claro do par. A borda diminui junto, via modificador
          `/60` do Tailwind, que baixa o alfa só da borda, sem tocar no texto,
          ao contrário do `opacity` do elemento. */}
      <div
        /* A calha gruda na borda esquerda da pista e come 144px dela. Sem este
           marcador, com o quadro rolado para a direita a primeira coluna
           visível cai inteira dentro da zona morta da auto-rolagem e a pista
           foge do ponteiro em pleno arrasto. Quem lê é `medirInsets`, em
           `usar-arrasto.ts`; por borda fica o maior, então as 11 calhas de
           mesma largura contam como uma. */
        data-obstaculo="esquerda"
        className={cn(
          "sticky left-0 z-10 flex flex-col justify-center border-r border-b border-border px-2 py-1.5",
          destacada ? "bg-accent-soft" : "bg-surface",
        )}
      >
        {/* O trilho de `--accent` é o sinal forte, e o único que não custa
            nada: 4,82:1 sobre a superfície no claro e 12,31:1 no escuro, bem
            acima do piso de 3:1 para elemento gráfico, e não toca texto nenhum.
            Fica na calha porque ela é `sticky left-0`, o realce continua
            visível com a pista rolada para qualquer dia da semana, que é
            justamente quando achar a linha da equipe custa mais.
            `bg-accent-soft` na calha é seguro para os dois textos abaixo:
            medido, `ink` dá 17,33:1 no claro e 13,79:1 no escuro; `ink-2`
            (para onde a segunda linha sobe quando destacada) dá 5,69:1 e
            6,84:1. Em `ink-3` a segunda linha cairia para 3,98:1 no escuro,
            abaixo do piso: por isso ela sobe um passo, e só aqui. */}
        {destacada ? (
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-accent" />
        ) : null}
        <p
          className={cn(
            "relative truncate text-2xs text-ink",
            destacada ? "font-semibold" : "font-medium",
          )}
          title={eq.nome}
        >
          {eq.nome}
        </p>
        <p
          className={cn(
            "relative tnum truncate font-mono text-2xs",
            destacada ? "text-ink-2" : "text-ink-3",
          )}
        >
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
          destacada={destacada}
        >
          {celula.itens.map((item) => (
            <CartaoServico
              key={item.id}
              item={item}
              origem={celula.chave}
              fantasma={item.id === emVoo}
              selecionado={item.id === selecionado}
              salvando={salvandoIds.has(item.id)}
              anelErro={anelErroPorId.get(item.id) ?? 0}
              ativo={item.id === idAtivo}
              desfazer={desfazerDe(item.id)}
              aoPegar={aoPegar}
              aoTeclar={aoTeclar}
              aoAbrir={aoAbrir}
              engolirClique={engolirClique}
              refCartao={refCartao(item.id)}
              aoFocar={aoFocar(item.id)}
            />
          ))}
        </CelulaEquipe>
      ))}
    </>
  );
}
