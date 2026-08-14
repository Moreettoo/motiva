"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

import type { Grade } from "../dados";

/** Primeiro cartão do quadro inteiro (fila, senão a grade): o padrão do
 *  roving tabindex quando nada foi arrastado nem selecionado ainda, e o
 *  reserva quando o cartão memorizado sumiu da lista. Sem isso a grade
 *  ficaria sem NENHUM ponto de entrada por Tab na primeira visita. */
function primeiroItemDoQuadro(grade: Grade): number | null {
  if (grade.fila[0]) return grade.fila[0].id;
  for (const linha of grade.linhas) {
    for (const celula of linha.celulas) {
      if (celula.itens[0]) return celula.itens[0].id;
    }
  }
  return null;
}

/**
 * Qual cartão é o "ativo" da grade inteira — roving tabindex de uma parada só
 * (ver `cartao-servico.tsx`: duas paradas de Tab NO cartão ativo, alça e
 * botão de detalhe, mas uma parada só na grade inteira). Pura e testável sem
 * DOM: não lê foco real do navegador — isso é `useFocoGrade`, mais abaixo.
 *
 * Prioridade: o cartão em voo (`emVoo`) > o selecionado (gaveta aberta) > o
 * último ativo (`anterior`, sticky — evita saltar quando um dado não
 * relacionado muda, por exemplo outro cartão sendo executado) > o padrão
 * (`primeiroItemDoQuadro`), usado quando os três primeiros são nulos ou o id
 * memorizado já não existe mais em `porId`.
 */
export function decidirCartaoAtivo({
  anterior,
  emVoo,
  selecionado,
  grade,
  porId,
}: {
  anterior: number | null;
  emVoo: number | null;
  selecionado: number | null;
  grade: Grade;
  /** Só a EXISTÊNCIA importa aqui — o roving tabindex não olha o conteúdo do
   *  item, só se ele ainda está na lista. */
  porId: ReadonlyMap<number, unknown>;
}): number | null {
  const alvo = emVoo ?? selecionado ?? anterior;
  if (alvo != null && porId.has(alvo)) return alvo;
  return primeiroItemDoQuadro(grade);
}

/**
 * Roving tabindex (`idAtivo`) + restauração de foco da grade inteira
 * (trilho + calha). Extraído de `quadro-semana.tsx` porque são as duas
 * únicas partes do arquivo que mexem com foco/refs de DOM — isolar isso
 * também isola as supressões do eslint que essa mexida exige (ver abaixo).
 */
export function useFocoGrade({
  grade,
  emVoo,
  selecionado,
  porId,
}: {
  grade: Grade;
  emVoo: number | null;
  selecionado: number | null;
  porId: ReadonlyMap<number, unknown>;
}): {
  idAtivo: number | null;
  refCartao: (id: number) => (no: HTMLElement | null) => void;
} {
  const refsCartoes = useRef(new Map<number, HTMLElement>());

  // Sticky por padrão: o valor guardado só muda quando `emVoo`/`selecionado`
  // apontam para outra coisa, ou quando o id guardado deixa de existir.
  // `null` no primeiro render dá o mesmo resultado que uma inicialização
  // preguiçosa via `decidirCartaoAtivo` daria (`anterior: null` também ali),
  // então o estado nasce simples e o cálculo abaixo já resolve certo na
  // primeira passada, sem duplicar a chamada.
  const [focoId, setFocoId] = useState<number | null>(null);
  const idAtivo = decidirCartaoAtivo({ anterior: focoId, emVoo, selecionado, grade, porId });
  if (idAtivo !== focoId) setFocoId(idAtivo);

  /* O cartão remonta em outro pai depois de um movimento, então o foco se
     perde — inclusive de novo na reversão do `useOptimistic`, que chega bem
     depois, num commit próprio. Por isso o efeito não tem array de
     dependências (roda em TODO commit) e NÃO pode gatear por `emVoo`: ele já
     volta a `null` no MESMO commit em que o cartão troca de pai (o `fechar()`
     do arrasto e a atualização otimista são despachados juntos no mesmo
     evento), então um contador ou uma dependência em `emVoo` perderia
     justamente o commit em que a restauração é necessária. `idFocoRef` guarda
     o último id em voo e sobrevive a essa transição. A guarda testa
     `isConnected`/`document.body`, nunca `refQuadro.contains`: o segundo é
     falso para qualquer portal e roubaria o foco de dentro da gaveta de
     detalhe. */
  const idFocoRef = useRef<number | null>(null);
  // A regra `react-hooks/refs` supõe o React Compiler, que este projeto não
  // liga (ver o mesmo disable em `usar-arrasto.ts`). Escrever aqui, e não num
  // efeito, é o ponto inteiro do padrão: precisa valer no MESMO commit em que
  // `emVoo` ainda é o id antigo, antes de o efeito de restauração (sem deps,
  // logo abaixo) já ver `emVoo` de volta a `null`.
  // eslint-disable-next-line react-hooks/refs
  if (emVoo != null) idFocoRef.current = emVoo;
  useLayoutEffect(() => {
    if (selecionado != null) return;
    const alvo = idFocoRef.current;
    if (alvo == null) return;
    const ativo = document.activeElement;
    if (ativo && ativo !== document.body && ativo.isConnected) return;
    refsCartoes.current.get(alvo)?.focus({ preventScroll: true });
  });

  /* `refCartao(id)` precisa devolver A MESMA função entre renders para o
     mesmo id, ou o `memo` de todo cartão quebra a cada render (a prop não é o
     `ref` especial de JSX, é uma prop comum, sujeita a `Object.is`). O cache
     mora num `Map` que não é recriado — só cresce, o que é aceitável na
     escala de agendamentos deste painel. */
  const cacheRefCartao = useRef(new Map<number, (no: HTMLElement | null) => void>());
  const refCartao = useCallback((id: number) => {
    let fn = cacheRefCartao.current.get(id);
    if (!fn) {
      fn = (no: HTMLElement | null) => {
        if (no) refsCartoes.current.set(id, no);
        else refsCartoes.current.delete(id);
      };
      cacheRefCartao.current.set(id, fn);
    }
    return fn;
  }, []);

  return { idAtivo, refCartao };
}
