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
      {/* `opacity-60` no BLOCO inteiro, texto incluso: ink/surface tem folga
          grande de contraste (é o mesmo tratamento que `CabecalhoDia` já usa
          para o dia passado), diferente do par de cores do RISCO nos
          cartões — ver o comentário em `CelulaEquipe` sobre por que aquele
          caso é tratado diferente. */}
      <div
        className={cn(
          "sticky left-0 z-10 flex flex-col justify-center border-r border-b border-border bg-surface px-2 py-1.5",
          atenuada && "opacity-60",
        )}
      >
        <p className="truncate text-2xs font-medium text-ink" title={eq.nome}>
          {eq.nome}
        </p>
        <p className="tnum truncate font-mono text-2xs text-ink-3">
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
