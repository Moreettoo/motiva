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
 * ids de todo item que a grade efetivamente RENDERIZA: a fila inteira (o
 * trilho) e as células da semana visível. A lista INTEIRA de itens (de
 * qualquer semana) NÃO serve para este teste — é exatamente o oposto do que
 * este módulo existe para garantir: um id que só a lista conhece, mas que
 * nenhum cartão na tela representa, faz `idAtivo` apontar para o nada e todo
 * cartão renderizado cair em `tabIndex={-1}` — nenhuma parada de Tab na
 * grade inteira. Isso acontecia ao abrir a gaveta de um serviço COM turma e
 * trocar de semana: o selecionado sai da grade nova, mas a lista inteira
 * continuava validando-o.
 *
 * IMPERFEITO num sentido, aceito e não resolvido aqui: um item que está na
 * fila mas além do teto de exibição do próprio trilho (`TETO`, em
 * `trilho-fila.tsx` — estado de EXIBIÇÃO daquele componente, invisível
 * daqui) "existe" para este teste mas não tem cartão nenhum montado. Isso só
 * afetaria o caminho STICKY (nem em voo, nem selecionado, e o anterior caiu
 * além do teto só porque itens novos empurraram a fila) — um caso raro, e
 * mesmo nele o próximo Tab simplesmente não acha nada para focar, sem
 * quebrar o resto da grade.
 */
function idsDoQuadro(grade: Grade): Set<number> {
  const ids = new Set<number>();
  for (const item of grade.fila) ids.add(item.id);
  for (const linha of grade.linhas) {
    for (const celula of linha.celulas) {
      for (const item of celula.itens) ids.add(item.id);
    }
  }
  return ids;
}

/** ids que aparecem na linha "Propostas da IA" da semana visível — sempre um
 *  subconjunto de `grade.fila` (ver `montarGrade`), mas só ESTES têm um
 *  SEGUNDO cartão de verdade na tela, além do que o trilho já mostra (ver
 *  `idAtivoNoTrilho`, abaixo). */
function idsNasPropostas(grade: Grade): Set<number> {
  const ids = new Set<number>();
  for (const doDia of grade.propostas.values()) {
    for (const item of doDia) ids.add(item.id);
  }
  return ids;
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
 * resolvido já não existe entre os cartões que a grade RENDERIZA (ver
 * `idsDoQuadro` acima — não a lista inteira de itens).
 */
export function decidirCartaoAtivo({
  anterior,
  emVoo,
  selecionado,
  grade,
}: {
  anterior: number | null;
  emVoo: number | null;
  selecionado: number | null;
  grade: Grade;
}): number | null {
  const alvo = emVoo ?? selecionado ?? anterior;
  if (alvo != null && idsDoQuadro(grade).has(alvo)) return alvo;
  return primeiroItemDoQuadro(grade);
}

/**
 * `idAtivo`, mas `null` quando o mesmo id também aparece nas Propostas desta
 * semana. Um serviço sem turma cuja data cai na semana visível monta em DUAS
 * regiões ao mesmo tempo — trilho (backlog inteiro) e propostas (recorte da
 * semana) — desenho explícito da spec, não acidente. Sem este desempate, os
 * dois gêmeos ficariam `ativo` juntos, dobrando as duas paradas de Tab do
 * cartão para quatro na grade inteira.
 *
 * As Propostas "ganham" o desempate: ao contrário do trilho (que tem um teto
 * de exibição interno — `TETO`, em `trilho-fila.tsx`, invisível daqui — e
 * pode não estar de fato renderizando o gêmeo), o recorte da semana em
 * `grade.propostas` não tem teto, então sabemos com certeza que aquele
 * gêmeo está montado. Favorecer o trilho arriscaria as DUAS cópias caindo em
 * `tabIndex={-1}` se o id estivesse além do teto dele.
 */
export function idAtivoNoTrilho(idAtivo: number | null, grade: Grade): number | null {
  if (idAtivo == null) return null;
  return idsNasPropostas(grade).has(idAtivo) ? null : idAtivo;
}

/** As três regiões onde um cartão pode montar. `refCartao` chaveia por
 *  região porque um serviço sem turma cuja data cai na semana visível monta
 *  em DUAS delas (trilho e propostas) ao mesmo tempo: com uma única entrada
 *  de cache por id, as duas montagens brigam pela MESMA entrada, e quando só
 *  uma delas desmonta (por exemplo, trocar de semana tira a de propostas e
 *  mantém a do trilho, que independe da semana), o `else
 *  refsCartoes.current.delete(id)` apaga a entrada mesmo com a outra ainda
 *  montada — a restauração de foco daquele cartão vira um no-op silencioso,
 *  exatamente a falha que este módulo existe para impedir. */
export type RegiaoFoco = "trilho" | "propostas" | "grid";

/**
 * Roving tabindex (`idAtivo`/`idAtivoNoTrilho`) + restauração de foco da
 * grade inteira (trilho + calha). Separado de `quadro-semana.tsx` porque são
 * as únicas partes do arquivo que mexem com foco/refs de DOM — isolar isso
 * também isola as supressões do eslint que essa mexida exige.
 */
export function useFocoGrade({
  grade,
  emVoo,
  selecionado,
}: {
  grade: Grade;
  emVoo: number | null;
  selecionado: number | null;
}): {
  idAtivo: number | null;
  idAtivoNoTrilho: number | null;
  refCartao: (regiao: RegiaoFoco, id: number) => (no: HTMLElement | null) => void;
} {
  const refsCartoes = useRef(new Map<string, HTMLElement>());

  // Sticky por padrão: o valor guardado só muda quando `emVoo`/`selecionado`
  // apontam para outra coisa, ou quando o id guardado deixa de existir entre
  // os cartões renderizados. `null` no primeiro render dá o mesmo resultado
  // que uma inicialização preguiçosa via `decidirCartaoAtivo` daria
  // (`anterior: null` também ali), então o estado nasce simples e o cálculo
  // abaixo já resolve certo na primeira passada, sem duplicar a chamada.
  const [focoId, setFocoId] = useState<number | null>(null);
  const idAtivo = decidirCartaoAtivo({ anterior: focoId, emVoo, selecionado, grade });
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
    // O cartão que remonta pode ter pousado na calha (o caso comum, depois
    // de um `soltar`) ou de volta na fila/propostas (depois de um
    // `devolver`) — tenta as três regiões nessa ordem de probabilidade, e
    // foca a primeira que tiver um nó de verdade montado.
    const no =
      refsCartoes.current.get(`grid:${alvo}`) ??
      refsCartoes.current.get(`propostas:${alvo}`) ??
      refsCartoes.current.get(`trilho:${alvo}`);
    no?.focus({ preventScroll: true });
  });

  /* `refCartao(regiao, id)` precisa devolver A MESMA função entre renders
     para o mesmo (região, id), ou o `memo` de todo cartão quebra a cada
     render (a prop não é o `ref` especial de JSX, é uma prop comum, sujeita
     a `Object.is`). O cache mora num `Map` que não é recriado — só cresce, o
     que é aceitável na escala de agendamentos deste painel. Chaveado por
     região (ver `RegiaoFoco` acima), não só por id: um serviço sem turma
     cuja data cai na semana visível tem DOIS nós de verdade na tela ao mesmo
     tempo, e cada um precisa da sua própria entrada — chavear só por id fazia
     os dois brigarem pela mesma entrada e o desmonte de um apagar o foco do
     outro. */
  const cacheRefCartao = useRef(new Map<string, (no: HTMLElement | null) => void>());
  const refCartao = useCallback((regiao: RegiaoFoco, id: number) => {
    const chave = `${regiao}:${id}`;
    let fn = cacheRefCartao.current.get(chave);
    if (!fn) {
      fn = (no: HTMLElement | null) => {
        if (no) refsCartoes.current.set(chave, no);
        else refsCartoes.current.delete(chave);
      };
      cacheRefCartao.current.set(chave, fn);
    }
    return fn;
  }, []);

  return { idAtivo, idAtivoNoTrilho: idAtivoNoTrilho(idAtivo, grade), refCartao };
}
