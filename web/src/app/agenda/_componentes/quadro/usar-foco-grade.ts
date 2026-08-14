"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Grade, ItemAgenda } from "../dados";

/** Primeiro cartão do quadro inteiro (fila visível, senão a grade): o padrão
 *  do roving tabindex quando nada foi arrastado nem selecionado ainda, e o
 *  reserva quando o cartão memorizado sumiu da lista. Sem isso a grade
 *  ficaria sem NENHUM ponto de entrada por Tab na primeira visita.
 *
 *  `filaDisponivel` (default `true`, espelha o mesmo parâmetro de
 *  `proximoAlvo` em `navegacao.ts`) governa só o PRIMEIRO ramo: com a doca do
 *  trilho fechada (estreito, sem abrir), `filaVisivel` existe no DOM mas está
 *  `inert` — usá-la como padrão apontaria o ativo do QUADRO para um id que o
 *  Tab não alcança ali. `false` pula direto para a grade. */
function primeiroItemDoQuadro(
  filaVisivel: ItemAgenda[],
  grade: Grade,
  filaDisponivel: boolean,
): number | null {
  if (filaDisponivel && filaVisivel[0]) return filaVisivel[0].id;
  for (const linha of grade.linhas) {
    for (const celula of linha.celulas) {
      if (celula.itens[0]) return celula.itens[0].id;
    }
  }
  return null;
}

/**
 * ids de todo item que a grade efetivamente RENDERIZA: `filaVisivel` (a
 * fatia do trilho que quem chama decidiu mostrar agora — ver `TETO_TRILHO`
 * em `quadro-semana.tsx`, que é quem corta a lista e por isso é quem sabe a
 * verdade), `grade.propostas` (a linha "Propostas da IA" da semana visível)
 * e as células da semana visível. `grade.fila` INTEIRA não serve — era o
 * bug original: um id que só a lista completa conhece, mas que nenhum
 * cartão na tela representa, fazia `idAtivo` apontar para o nada e todo
 * cartão renderizado cair em `tabIndex={-1}`.
 *
 * `grade.propostas` entra por conta própria, não "de graça" via
 * `filaVisivel`: antes do corte do trilho existir, `grade.fila` era
 * superconjunto de `grade.propostas` (toda proposta também está na fila
 * inteira — ver `montarGrade`), então bastava percorrer a fila. Com
 * `filaVisivel` cortada em `TETO_TRILHO`, um item além do corte cuja data
 * cai na semana visível PERDE essa garantia: ele tem cartão de verdade
 * montado na linha de Propostas, mas `filaVisivel` não o contém mais — sem
 * unir `grade.propostas` aqui, esse id ficaria de fora mesmo tendo cartão
 * na tela, e o roving tabindex apontaria para o cartão errado.
 *
 * Exportada para `useFocoGrade` poder memoizar (`useMemo`) sem recalcular a
 * cada quadro de um arrasto por ponteiro, e para o teste poder montar o
 * conjunto sem duplicar a lógica.
 */
export function idsDoQuadro(filaVisivel: ItemAgenda[], grade: Grade): Set<number> {
  const ids = new Set<number>();
  for (const item of filaVisivel) ids.add(item.id);
  for (const doDia of grade.propostas.values()) {
    for (const item of doDia) ids.add(item.id);
  }
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
 *  `idAtivoNoTrilho`, abaixo). Exportada pelo mesmo motivo de `idsDoQuadro`:
 *  memoização em `useFocoGrade`, montagem direta no teste. */
export function idsNasPropostas(grade: Grade): Set<number> {
  const ids = new Set<number>();
  for (const doDia of grade.propostas.values()) {
    for (const item of doDia) ids.add(item.id);
  }
  return ids;
}

/**
 * ids que o TRILHO aceita ADOTAR da gaveta de detalhe (ver
 * `adotarSelecionado`): mora na fatia visível do trilho E não é gêmeo das
 * Propostas desta semana.
 *
 * Os dois lados do "E" são o critério de elegibilidade da região, e cada um
 * evita um estrago diferente. Sem o primeiro, um id da GRADE (com turma, logo
 * nunca presente em `filaVisivel`) entrava no sticky do trilho, o cálculo do
 * trilho o recusava por não achá-lo em `filaVisivel`, caía no PADRÃO — e o
 * cartão que a pessoa tinha acabado de focar no trilho perdia o tab stop para
 * o primeiro item da fila. Sem o segundo, adotar um gêmeo seria pior que não
 * adotar: `idAtivoNoTrilho` o anula no mesmo render (as Propostas ganham o
 * desempate), então a "adoção" apagaria o único tab stop do trilho em vez de
 * movê-lo. E não há perda nenhuma nisso — o cartão gêmeo daquele id continua
 * sendo o alvo do roving tabindex, só que na região das Propostas, que é
 * exatamente quem deve tê-lo.
 */
export function idsElegiveisNoTrilho(
  filaVisivel: ItemAgenda[],
  idsPropostas: ReadonlySet<number>,
): Set<number> {
  const ids = new Set<number>();
  for (const item of filaVisivel) {
    if (!idsPropostas.has(item.id)) ids.add(item.id);
  }
  return ids;
}

/**
 * O sticky de uma região DEPOIS de considerar a gaveta de detalhe: devolve o
 * id selecionado no render em que a gaveta passou a mostrá-lo, e `anterior`
 * intacto em todo o resto. É a peça que separa "a gaveta abriu neste id" (um
 * evento, que acontece uma vez) de "este é o cartão ativo" (um estado
 * contínuo, que o `onFocus` mantém).
 *
 * Por que não basta pôr `selecionado` na precedência das duas funções de
 * decisão abaixo, que era o desenho anterior: `selecionado` é o `?ag=` da URL
 * e fica IGUAL por muitos renders enquanto a gaveta está aberta. Acima de
 * `anterior`, ele reverte cada `onFocus` no MESMO render — `aoFocar` chama
 * `setFocoId(id)`, o render seguinte recalcula o ativo como `selecionado` de
 * novo e a linha `if (idAtivo !== focoId) setFocoId(idAtivo)` empurra o sticky
 * de volta. O roving tabindex parava de rovar justamente quando ele mais
 * serve: com o detalhe aberto, comparando um cartão com o próximo. No trilho o
 * estrago era maior que congelar — ver `idsElegiveisNoTrilho`.
 *
 * O que a gaveta ainda precisa fazer, e é só isto: quando a página abre em
 * `?ag=123` (ou a gaveta é aberta por qualquer caminho que não passe por
 * foco), aquele cartão vira o alvo do roving tabindex, para o Tab voltar PARA
 * ELE quando a gaveta fechar, em vez de para o primeiro cartão da tela. Uma
 * adoção só, na MUDANÇA — o padrão que o React documenta para ajustar estado
 * quando uma prop muda: guardar em estado o valor já visto e comparar durante
 * o render (`selecionadoVisto`, em `useFocoGrade`).
 *
 * `elegiveis` é o critério da região (`idsRenderizados` no quadro,
 * `idsElegiveisNoTrilho` no trilho). Um id inelegível não é adotado e não é
 * reoferecido depois: a adoção é o evento, e o evento passou. Nada se perde
 * com isso — sem cartão montado, adotar só gastaria o sticky com um id que a
 * decisão logo abaixo recusaria de novo, agora sem `onFocus` nenhum para
 * consertar.
 */
export function adotarSelecionado({
  anterior,
  selecionado,
  selecionadoVisto,
  elegiveis,
}: {
  anterior: number | null;
  selecionado: number | null;
  /** O `selecionado` que esta região já viu — ver `useFocoGrade`. */
  selecionadoVisto: number | null;
  elegiveis: ReadonlySet<number>;
}): number | null {
  if (selecionado == null) return anterior;
  if (selecionado === selecionadoVisto) return anterior;
  return elegiveis.has(selecionado) ? selecionado : anterior;
}

/**
 * Qual cartão é o "ativo" da grade inteira — roving tabindex de uma parada só
 * (ver `cartao-servico.tsx`: duas paradas de Tab NO cartão ativo, alça e
 * botão de detalhe, mas uma parada só na grade inteira). Pura e testável sem
 * DOM: não lê foco real do navegador — isso é `useFocoGrade`, mais abaixo.
 *
 * Prioridade: o cartão em voo (`emVoo`) > o último ativo (`anterior`, sticky —
 * evita saltar quando um dado não relacionado muda, por exemplo outro cartão
 * sendo executado) > o padrão (`primeiroItemDoQuadro`), usado quando os dois
 * primeiros são nulos ou o id resolvido já não existe entre os cartões que a
 * grade RENDERIZA (`idsRenderizados` — não a lista inteira de itens, nem a
 * fila inteira sem o corte de exibição do trilho).
 *
 * A gaveta de detalhe não aparece nesta precedência de propósito: ela chega
 * já embutida em `anterior`, uma vez só, por `adotarSelecionado` — que é onde
 * está o argumento de por que ela não pode ficar aqui.
 */
export function decidirCartaoAtivo({
  anterior,
  emVoo,
  filaVisivel,
  grade,
  idsRenderizados,
  filaDisponivel = true,
}: {
  /** Já passado por `adotarSelecionado` em `useFocoGrade`. */
  anterior: number | null;
  emVoo: number | null;
  filaVisivel: ItemAgenda[];
  grade: Grade;
  idsRenderizados: ReadonlySet<number>;
  /** Ver `primeiroItemDoQuadro`. Default `true` preserva o comportamento de
   *  coluna (trilho sempre montado e interativo). */
  filaDisponivel?: boolean;
}): number | null {
  const alvo = emVoo ?? anterior;
  if (alvo != null && idsRenderizados.has(alvo)) return alvo;
  return primeiroItemDoQuadro(filaVisivel, grade, filaDisponivel);
}

/**
 * Como `decidirCartaoAtivo`, mas escopado ao TRILHO: o único universo de
 * candidatos é `filaVisivel`, nunca a grade. Existe porque o trilho é uma
 * REGIÃO própria (spec §5, "um tab stop por região: trilho, propostas,
 * quadro") — com um único sticky global compartilhado entre as duas regiões
 * (o desenho anterior), sempre que o foco resolve para um item da grade
 * (com equipe, portanto nunca presente em `filaVisivel`) o trilho ficava sem
 * NENHUM cartão ativo, e vice-versa: as duas regiões brigavam pelo mesmo
 * valor e só uma por vez podia ganhar. Este cálculo independente é o que
 * garante ao trilho um tab stop mesmo quando o "quadro" está ativo num
 * cartão que mora numa célula.
 *
 * Como em `decidirCartaoAtivo`, a gaveta de detalhe não entra na precedência:
 * chega em `anterior` por `adotarSelecionado`, filtrada por
 * `idsElegiveisNoTrilho` — o critério de quem o trilho pode adotar sem se
 * apagar.
 */
export function decidirCartaoAtivoTrilho({
  anterior,
  emVoo,
  filaVisivel,
  idsPropostas,
}: {
  /** Já passado por `adotarSelecionado` em `useFocoGrade`. */
  anterior: number | null;
  emVoo: number | null;
  filaVisivel: ItemAgenda[];
  /** Quem monta também nas Propostas desta semana — ver `idAtivoNoTrilho`. */
  idsPropostas: ReadonlySet<number>;
}): number | null {
  const ids = new Set(filaVisivel.map((i) => i.id));
  const alvo = emVoo ?? anterior;
  if (alvo != null && ids.has(alvo)) return alvo;

  // O PADRÃO pula os gêmeos, e é isto que dá ao trilho um tab stop de verdade.
  // `grade.propostas` é o recorte de `grade.fila` que cai na semana visível, e
  // a fila vem ordenada por urgência — então o topo dela quase sempre É um
  // gêmeo. Com o padrão caindo no topo cru, `idAtivoNoTrilho` anulava logo em
  // seguida (as Propostas ganham o desempate, porque não têm teto de exibição)
  // e o trilho ficava com ZERO parada de Tab no caso comum, em vez de uma.
  // Um alvo explícito — em voo, ou o sticky anterior — continua passando pelo
  // desempate normalmente: ali o gêmeo das Propostas é mesmo o que deve
  // receber o foco, e o trilho ficar sem tab stop é o preço certo de um foco
  // que a pessoa pediu. A adoção da gaveta é o caso que NÃO pode pagar esse
  // preço, porque ninguém pediu foco nenhum — por isso ela filtra os gêmeos
  // antes de chegar aqui (`idsElegiveisNoTrilho`).
  return filaVisivel.find((item) => !idsPropostas.has(item.id))?.id ?? null;
}

/**
 * `idAtivo`, mas `null` quando o mesmo id também aparece nas Propostas desta
 * semana. Um serviço sem turma cuja data cai na semana visível monta em DUAS
 * regiões ao mesmo tempo — trilho (backlog inteiro) e propostas (recorte da
 * semana) — desenho explícito da spec, não acidente. Sem este desempate, os
 * dois gêmeos ficariam `ativo` juntos, dobrando as duas paradas de Tab do
 * cartão para quatro na grade inteira.
 *
 * As Propostas "ganham" o desempate: ao contrário do trilho (que agora tem
 * um corte de exibição decidido por fora — `filaVisivel`/`idsDoQuadro` acima
 * — e pode não estar de fato renderizando o gêmeo), o recorte da semana em
 * `grade.propostas` não tem teto, então sabemos com certeza que aquele
 * gêmeo está montado.
 */
export function idAtivoNoTrilho(
  idAtivo: number | null,
  idsPropostas: ReadonlySet<number>,
): number | null {
  if (idAtivo == null) return null;
  return idsPropostas.has(idAtivo) ? null : idAtivo;
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
 *
 * `filaVisivel` (não `grade.fila` inteira) é quem alimenta o roving tabindex
 * do lado da fila — `quadro-semana.tsx` decide o corte de exibição do
 * trilho e passa a fatia já pronta, para este hook enxergar exatamente o que
 * está montado.
 */
export function useFocoGrade({
  grade,
  filaVisivel,
  emVoo,
  selecionado,
  filaDisponivel = true,
}: {
  grade: Grade;
  filaVisivel: ItemAgenda[];
  emVoo: number | null;
  selecionado: number | null;
  /** `false` com a doca do trilho fechada no estreito — ver o mesmo parâmetro
   *  em `proximoAlvo` (`navegacao.ts`) e em `decidirCartaoAtivo` acima. */
  filaDisponivel?: boolean;
}): {
  idAtivo: number | null;
  idAtivoNoTrilho: number | null;
  refCartao: (regiao: RegiaoFoco, id: number) => (no: HTMLElement | null) => void;
  /** Handler de `onFocus` para o `<li>` do cartão: quando o cartão RECEBE
   *  foco (Tab, clique do mouse, ou o cursor virtual de um leitor de tela
   *  passando por um controle focável — nenhum dos três respeita `tabIndex`
   *  da mesma forma que o Tab sequencial), ele passa a ser o ativo da PRÓPRIA
   *  região. Sem isto (o bug original) só `emVoo`/`selecionado` moviam o
   *  sticky, e o roving tabindex nunca "rovia": o único cartão alcançável
   *  por Tab era sempre o padrão inicial.
   *
   *  Existir aqui não bastava: enquanto a gaveta de detalhe pesava mais que o
   *  sticky na precedência, este handler escrevia e era revertido no mesmo
   *  render. Quem o fez valer de verdade foi `adotarSelecionado` — a causa
   *  está lá, o sintoma aparecia aqui. */
  aoFocar: (regiao: RegiaoFoco, id: number) => () => void;
} {
  const refsCartoes = useRef(new Map<string, HTMLElement>());

  // Disciplina "por quadro" do restante do arquivo (`previa`, `porId` etc.
  // em `quadro-semana.tsx` já memoizam): os dois `Set` abaixo cobrem ~100
  // ids, custo desprezível mesmo recalculado sempre, mas este hook reexecuta
  // a ~60 quadros/segundo durante um arrasto por ponteiro, e recalcular à
  // toa contraria a disciplina do módulo, não corrige um bug de performance
  // real.
  const idsRenderizados = useMemo(
    // `filaDisponivel` também gateia AQUI, não só em `primeiroItemDoQuadro`:
    // sem isto, um id que só existe no trilho continuava validando como
    // sticky do QUADRO (via `idsRenderizados.has(alvo)`, o primeiro ramo de
    // `decidirCartaoAtivo`) mesmo com a doca fechada e o nó `inert`.
    () => idsDoQuadro(filaDisponivel ? filaVisivel : [], grade),
    [filaVisivel, grade, filaDisponivel],
  );
  const idsPropostas = useMemo(() => idsNasPropostas(grade), [grade]);
  const idsElegiveisTrilho = useMemo(
    () => idsElegiveisNoTrilho(filaVisivel, idsPropostas),
    [filaVisivel, idsPropostas],
  );

  // O `selecionado` que as duas regiões já viram. Uma variável de estado só
  // para as duas: elas leem o MESMO valor na mesma passada de render, então
  // cada uma tem a sua chance de adotar (com o seu critério) antes de a marca
  // ser escrita — o que uma decide não interfere na outra.
  const [selecionadoVisto, setSelecionadoVisto] = useState<number | null>(null);

  // Sticky por padrão: o valor guardado só muda quando `emVoo` aponta para
  // outra coisa, quando a gaveta de detalhe ADOTA um id novo
  // (`adotarSelecionado`, uma vez por mudança de `?ag=`), quando `onFocus`
  // dispara (ver `aoFocar` abaixo), ou quando o id guardado deixa de existir
  // entre os cartões renderizados. `null` no primeiro render dá o mesmo
  // resultado que uma inicialização preguiçosa via `decidirCartaoAtivo` daria
  // (`anterior: null` também ali), então o estado nasce simples e o cálculo
  // abaixo já resolve certo na primeira passada, sem duplicar a chamada.
  //
  // Dois stickies independentes, não um: `focoId` é do QUADRO (propostas +
  // células — mutuamente exclusivos por item, então compartilhar um valor
  // entre os dois não duplica tab stop nenhum) e `focoTrilhoId` é do
  // TRILHO. Um sticky global único fazia as duas regiões DISPUTAREM o mesmo
  // valor: sempre que o foco resolvia para um item da grade (com equipe,
  // logo ausente de `filaVisivel`), o trilho ficava com ZERO cartões ativos,
  // e vice-versa quando o valor apontava para um item só do trilho — só uma
  // região por vez tinha tab stop, nunca as duas (ver `decidirCartaoAtivoTrilho`).
  const [focoId, setFocoId] = useState<number | null>(null);
  const idAtivo = decidirCartaoAtivo({
    // O critério do QUADRO é o mesmo conjunto contra o qual ele já valida
    // qualquer alvo: adotar um id sem cartão montado seria desfeito pelo
    // próprio ramo de fallback, no mesmo render.
    anterior: adotarSelecionado({
      anterior: focoId,
      selecionado,
      selecionadoVisto,
      elegiveis: idsRenderizados,
    }),
    emVoo,
    filaVisivel,
    grade,
    idsRenderizados,
    filaDisponivel,
  });
  if (idAtivo !== focoId) setFocoId(idAtivo);

  const [focoTrilhoId, setFocoTrilhoId] = useState<number | null>(null);
  const idAtivoTrilhoProprio = decidirCartaoAtivoTrilho({
    anterior: adotarSelecionado({
      anterior: focoTrilhoId,
      selecionado,
      selecionadoVisto,
      elegiveis: idsElegiveisTrilho,
    }),
    emVoo,
    filaVisivel,
    idsPropostas,
  });
  if (idAtivoTrilhoProprio !== focoTrilhoId) setFocoTrilhoId(idAtivoTrilhoProprio);

  // Baixa da adoção, depois das duas regiões terem tido a sua chance — a ordem
  // aqui no corpo não muda o resultado DESTA passada (um `setState` de render
  // só aparece na seguinte, e as duas leituras acima já usaram o valor antigo);
  // ela está aqui porque é assim que o padrão se lê de cima para baixo: ler o
  // evento, usá-lo, dar baixa. A passada seguinte encontra `selecionado ===
  // selecionadoVisto`, a adoção declina, e daí em diante o sticky — logo, o
  // `onFocus` — governa.
  //
  // No render, não num efeito, e isso não é estilo: num efeito a marca só
  // chegaria um commit depois, e QUALQUER render nessa janela (uma transição, a
  // reversão do `useOptimistic`, a passada dupla do StrictMode) reexecutaria a
  // adoção com a marca velha — reafirmando o cartão da gaveta por cima de um
  // foco que já pode ter andado. Ajustar estado durante o render é justamente o
  // que o React recomenda para isso, e tem a propriedade que aqui importa:
  // reexecutar a passada dá o mesmo resultado.
  if (selecionado !== selecionadoVisto) setSelecionadoVisto(selecionado);

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

  // Levantada ENQUANTO o `.focus()` programático abaixo está em curso: esse
  // `.focus()` também dispara `onFocus` no cartão (síncrono), e sem esta
  // guarda o handler de `aoFocar` reescreveria o sticky com o próprio id que
  // a restauração já está usando — inofensivo neste desenho específico, mas
  // é exatamente a receita de um laço se a restauração um dia passar a
  // depender do valor que `aoFocar` escreve.
  const restaurando = useRef(false);
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
    if (!no) return;
    restaurando.current = true;
    no.focus({ preventScroll: true });
    restaurando.current = false;
    // Dívida corrigida: sem isto, `idFocoRef` nunca voltava a `null`, e como
    // o efeito roda em TODO commit (sem array de deps), qualquer commit
    // FUTURO e sem relação nenhuma com um arrasto — fechar a gaveta de
    // detalhe, por exemplo — em que `activeElement` fosse `document.body`
    // reancorava o foco no último cartão arrastado. Zera só quando a
    // restauração de fato encontrou um nó; se `no` não existir ainda (o
    // commit da remontagem não chegou), o próximo commit tenta de novo.
    idFocoRef.current = null;
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

  // Mesmo padrão de cache de `refCartao`, pelo mesmo motivo: o handler desce
  // até ~130 cartões via `memo`, então precisa ser estável por (região, id) —
  // uma closure nova a cada render derrubaria o `memo` do cartão inteiro.
  const cacheAoFocar = useRef(new Map<string, () => void>());
  const aoFocar = useCallback((regiao: RegiaoFoco, id: number) => {
    const chave = `${regiao}:${id}`;
    let fn = cacheAoFocar.current.get(chave);
    if (!fn) {
      fn = () => {
        if (restaurando.current) return;
        if (regiao === "trilho") setFocoTrilhoId(id);
        else setFocoId(id);
      };
      cacheAoFocar.current.set(chave, fn);
    }
    return fn;
  }, []);

  return {
    idAtivo,
    idAtivoNoTrilho: idAtivoNoTrilho(idAtivoTrilhoProprio, idsPropostas),
    refCartao,
    aoFocar,
  };
}
