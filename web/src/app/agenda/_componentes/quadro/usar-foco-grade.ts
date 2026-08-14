"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Grade, ItemAgenda } from "../dados";

/**
 * Primeiro cartão DA REGIÃO DO QUADRO em ordem de leitura — as células, linha
 * por linha — e nunca a fila do trilho. É o padrão do roving tabindex quando
 * nada foi arrastado nem selecionado ainda, e o reserva quando o cartão
 * memorizado sumiu da lista. Sem isso o quadro ficaria sem NENHUM ponto de
 * entrada por Tab na primeira visita.
 *
 * A fila não entra porque o trilho é outra REGIÃO, com a sua própria parada de
 * Tab e o seu próprio sticky (ver `focoTrilhoId` em `useFocoGrade`, e
 * `decidirCartaoAtivoTrilho`, que é o padrão DELE). Enquanto ela entrava aqui,
 * o padrão do quadro podia ser um id cujo único cartão está no trilho — e
 * então nenhum cartão do quadro casava `item.id === idAtivo`: as 7 colunas e
 * todas as raias de equipe ficavam com ZERO paradas de Tab, e o estado se
 * sustentava nos renders seguintes porque o sticky também validava aquele id
 * como elegível. Bastava a primeira visita em que `grade.fila[0]` cai fora da
 * semana visível, um `›` até uma semana vazia, ou abrir a gaveta num item que
 * só existe no trilho.
 *
 * Uma coleção só, e antes eram duas: a linha "Propostas da IA" vinha primeiro,
 * porque no DOM ela vinha antes das raias. A linha saiu do quadro (duplicava a
 * fila de decisão), e com ela sumiu a única fonte de cartão GÊMEO — um mesmo
 * serviço montado em duas regiões ao mesmo tempo. Toda a maquinaria de
 * desempate que existia por causa disso saiu junto; ver `useFocoGrade`.
 *
 * `null` é resultado legítimo: nenhuma célula de nenhuma equipe tem cartão —
 * semana de fato vazia, ainda que o trilho esteja cheio. Não há o que focar, e
 * mentir um id do trilho era exatamente o defeito. A rede para esse caso é do
 * lado do DOM (spec §5: um nó do quadro ganha `tabIndex={0}` para a região
 * nunca ficar sem parada), não deste cálculo.
 */
function primeiroItemDoQuadro(grade: Grade): number | null {
  for (const linha of grade.linhas) {
    for (const celula of linha.celulas) {
      if (celula.itens[0]) return celula.itens[0].id;
    }
  }
  return null;
}

/**
 * ids de todo cartão que a REGIÃO DO QUADRO renderiza, e só ela: as células da
 * semana visível. A MESMA coleção que `primeiroItemDoQuadro` percorre — e essa
 * igualdade é o que sustenta o argumento em `useFocoGrade` de que um id
 * inelegível não sobrevive a um render: o conjunto que valida o sticky e o
 * universo de onde sai o padrão precisam ser o mesmo, ou o primeiro ramo de
 * `decidirCartaoAtivo` aprova um id que o segundo nunca escolheria.
 *
 * A fila do trilho NÃO entra. Ela é a outra região, com parada de Tab e sticky
 * próprios (ver `focoTrilhoId` em `useFocoGrade`), e enquanto entrava aqui era
 * possível o quadro ficar com ZERO paradas de Tab por adotar um id cujo único
 * cartão está no trilho — ver `primeiroItemDoQuadro`, onde o estrago está
 * descrito. `grade.fila` INTEIRA já era errada por um motivo mais simples e
 * mais antigo (o bug original): um id que só a lista completa conhece, mas que
 * nenhum cartão na tela representa, fazia `idAtivo` apontar para o nada e todo
 * cartão renderizado cair em `tabIndex={-1}`.
 *
 * Exportada para `useFocoGrade` poder memoizar (`useMemo`) sem recalcular a
 * cada quadro de um arrasto por ponteiro, e para o teste poder montar o
 * conjunto sem duplicar a lógica.
 */
export function idsDoQuadro(grade: Grade): Set<number> {
  const ids = new Set<number>();
  for (const linha of grade.linhas) {
    for (const celula of linha.celulas) {
      for (const item of celula.itens) ids.add(item.id);
    }
  }
  return ids;
}

/**
 * ids que o TRILHO aceita ADOTAR da gaveta de detalhe (ver
 * `adotarSelecionado`): os da fatia visível do trilho, e só eles.
 *
 * Sem este critério, um id da GRADE (com equipe, logo nunca presente em
 * `filaVisivel`) entrava no sticky do trilho, o cálculo do trilho o recusava
 * por não achá-lo em `filaVisivel`, caía no PADRÃO — e o cartão que a pessoa
 * tinha acabado de focar no trilho perdia o tab stop para o primeiro item da
 * fila.
 *
 * Havia uma segunda metade nesta regra ("e não é gêmeo das Propostas desta
 * semana"), que saiu com a linha "Propostas da IA": um serviço sem equipe
 * montava em duas regiões ao mesmo tempo, e adotar o gêmeo apagava o tab stop
 * do trilho em vez de movê-lo. Sem a linha não há gêmeo, e a regra volta a ser
 * uma pergunta só.
 */
export function idsElegiveisNoTrilho(filaVisivel: ItemAgenda[]): Set<number> {
  return new Set(filaVisivel.map((item) => item.id));
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
 * primeiros são nulos ou o id resolvido já não existe entre os cartões que o
 * QUADRO renderiza (`idsRenderizados` — propostas + células, nunca a lista
 * inteira de itens e nunca a fila do trilho, que é região própria e tem o seu
 * próprio cálculo em `decidirCartaoAtivoTrilho`).
 *
 * Nem `filaVisivel` nem `filaDisponivel` entram aqui, e é por construção: se a
 * fila não é candidata do quadro, saber quantos cartões dela estão montados ou
 * se o nó está `inert` não muda nada nesta decisão. O gate existia para
 * impedir que o quadro apontasse para um cartão que o Tab não alcança no
 * trilho; agora o quadro não alcança a fila nem quando ela está bem visível, o
 * que é a mesma garantia sem depender de um sinal de layout.
 *
 * A gaveta de detalhe não aparece nesta precedência de propósito: ela chega
 * já embutida em `anterior`, uma vez só, por `adotarSelecionado` — que é onde
 * está o argumento de por que ela não pode ficar aqui.
 */
export function decidirCartaoAtivo({
  anterior,
  emVoo,
  grade,
  idsRenderizados,
}: {
  /** Já passado por `adotarSelecionado` em `useFocoGrade`. */
  anterior: number | null;
  emVoo: number | null;
  grade: Grade;
  /** O conjunto da região do QUADRO — `idsDoQuadro(grade)`. */
  idsRenderizados: ReadonlySet<number>;
}): number | null {
  const alvo = emVoo ?? anterior;
  if (alvo != null && idsRenderizados.has(alvo)) return alvo;
  return primeiroItemDoQuadro(grade);
}

/**
 * Como `decidirCartaoAtivo`, mas escopado ao TRILHO: o único universo de
 * candidatos é `filaVisivel`, nunca a grade. Existe porque o trilho é uma
 * REGIÃO própria (spec §5, "um tab stop por região") — com um único sticky
 * global compartilhado entre as duas regiões (o desenho anterior), sempre que o
 * foco resolve para um item da grade (com equipe, portanto nunca presente em
 * `filaVisivel`) o trilho ficava sem NENHUM cartão ativo, e vice-versa: as duas
 * regiões brigavam pelo mesmo valor e só uma por vez podia ganhar. Este cálculo
 * independente é o que garante ao trilho um tab stop mesmo quando o "quadro"
 * está ativo num cartão que mora numa célula.
 *
 * Como em `decidirCartaoAtivo`, a gaveta de detalhe não entra na precedência:
 * chega em `anterior` por `adotarSelecionado`, filtrada por
 * `idsElegiveisNoTrilho`.
 *
 * O padrão é o topo cru da fila. Ele já foi mais complicado: enquanto existia a
 * linha "Propostas da IA", o topo da fila quase sempre era um GÊMEO (a fila vem
 * por urgência, e o mais urgente costuma cair na semana visível), o desempate
 * anulava esse id logo em seguida e o trilho ficava com ZERO parada de Tab no
 * caso comum. Sem a linha não há gêmeo, e `[0]` é a resposta certa.
 */
export function decidirCartaoAtivoTrilho({
  anterior,
  emVoo,
  filaVisivel,
}: {
  /** Já passado por `adotarSelecionado` em `useFocoGrade`. */
  anterior: number | null;
  emVoo: number | null;
  filaVisivel: ItemAgenda[];
}): number | null {
  const ids = new Set(filaVisivel.map((i) => i.id));
  const alvo = emVoo ?? anterior;
  if (alvo != null && ids.has(alvo)) return alvo;
  return filaVisivel[0]?.id ?? null;
}

/** As duas regiões onde um cartão pode montar. `refCartao` chaveia por região,
 *  e não só por id, porque as duas mantêm caches de nó independentes: o trilho
 *  independe da semana visível e a calha não, então trocar de semana desmonta
 *  um lado e mantém o outro. Com uma entrada única por id, o `else
 *  refsCartoes.current.delete(id)` do lado que desmonta apagaria a entrada do
 *  lado que ficou, e a restauração de foco daquele cartão viraria um no-op
 *  silencioso — exatamente a falha que este módulo existe para impedir.
 *
 *  Eram TRÊS enquanto existia a linha "Propostas da IA", e ali o motivo era
 *  mais forte: um mesmo serviço montava em duas regiões AO MESMO TEMPO. Essa
 *  fonte de gêmeo acabou; o argumento do cache por região, não. */
export type RegiaoFoco = "trilho" | "grid";

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
}: {
  grade: Grade;
  filaVisivel: ItemAgenda[];
  emVoo: number | null;
  selecionado: number | null;
  /**
   * `false` com a doca do trilho fechada no estreito. Aceito, e de propósito
   * SEM efeito nenhum aqui: `quadro-semana.tsx` calcula esse sinal uma vez e o
   * entrega aos três consumidores do mesmo `filaDisponivel` (`proximoAlvo` em
   * `navegacao.ts`, `usar-arrasto.ts` e este hook), e tirá-lo da assinatura
   * obrigaria a mexer na chamada por um ganho de zero.
   *
   * Ele governava o padrão e a elegibilidade do QUADRO enquanto a fila era
   * candidata deles — "não aponte para um cartão que o Tab não alcança no
   * trilho `inert`". Com a região do quadro reduzida a propostas + células, o
   * quadro não aponta para a fila em nenhuma largura, esteja ela `inert` ou
   * não: a garantia passou a ser estrutural, e um gate por sinal de layout em
   * cima dela só teria como errar. No trilho o sinal continua sem papel por
   * outro motivo — um cartão com `tabIndex={0}` dentro de subárvore `inert`
   * está fora da ordem de tabulação de todo jeito, e manter o sticky é o que
   * devolve o foco ao lugar certo quando a doca reabre.
   */
  filaDisponivel?: boolean;
}): {
  idAtivo: number | null;
  /** O ativo do TRILHO, calculado à parte do `idAtivo` do quadro — as duas
   *  regiões têm cada uma o seu tab stop. Já foi um valor derivado do outro,
   *  anulado quando os dois apontavam para o mesmo cartão em duas regiões; sem
   *  a linha "Propostas da IA" isso não acontece mais. */
  idAtivoTrilho: number | null;
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
  // em `quadro-semana.tsx` já memoizam): os `Set` abaixo cobrem ~100 ids,
  // custo desprezível mesmo recalculado sempre, mas este hook reexecuta a ~60
  // quadros/segundo durante um arrasto por ponteiro, e recalcular à toa
  // contraria a disciplina do módulo, não corrige um bug de performance real.
  //
  // O do QUADRO depende só de `grade`, e a lista de dependências é a própria
  // fronteira da região: as células saem inteiras de `grade`, então nem
  // `filaVisivel` nem `filaDisponivel` entram — o corte de exibição do trilho e
  // a doca fechada mudam o que o TRILHO mostra, e o trilho tem os seus
  // `idsElegiveisTrilho` logo abaixo. A coerência que este `useMemo` precisa
  // manter é com `primeiroItemDoQuadro`: as duas funções percorrem a MESMA
  // coleção, e é essa igualdade que impede o primeiro ramo de
  // `decidirCartaoAtivo` de aprovar um id que o segundo jamais escolheria.
  const idsRenderizados = useMemo(() => idsDoQuadro(grade), [grade]);
  const idsElegiveisTrilho = useMemo(() => idsElegiveisNoTrilho(filaVisivel), [filaVisivel]);

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
    // qualquer alvo — e isso só passou a ser garantia quando `idsDoQuadro` e
    // `primeiroItemDoQuadro` viraram as MESMAS duas coleções (propostas +
    // células). Antes o conjunto também aceitava a fila do trilho, e a defesa
    // escrita aqui ("adotar um id sem cartão montado seria desfeito pelo
    // próprio ramo de fallback") era falsa pela ambiguidade de "montado":
    // montado em ALGUM lugar, não montado NO QUADRO. Um id cujo único cartão
    // estava no trilho passava no primeiro ramo de `decidirCartaoAtivo`, o
    // fallback nunca rodava, e as 7 colunas, a linha de Propostas e as raias de
    // equipe ficavam com ZERO paradas de Tab — estado que o próprio sticky
    // revalidava render após render, porque o id continuava "elegível".
    anterior: adotarSelecionado({
      anterior: focoId,
      selecionado,
      selecionadoVisto,
      elegiveis: idsRenderizados,
    }),
    emVoo,
    grade,
    idsRenderizados,
  });
  if (idAtivo !== focoId) setFocoId(idAtivo);

  const [focoTrilhoId, setFocoTrilhoId] = useState<number | null>(null);
  const idAtivoTrilho = decidirCartaoAtivoTrilho({
    anterior: adotarSelecionado({
      anterior: focoTrilhoId,
      selecionado,
      selecionadoVisto,
      elegiveis: idsElegiveisTrilho,
    }),
    emVoo,
    filaVisivel,
  });
  if (idAtivoTrilho !== focoTrilhoId) setFocoTrilhoId(idAtivoTrilho);

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
    // O cartão que remonta pode ter pousado na calha (o caso comum, depois de
    // um `soltar`) ou de volta na fila (depois de um `devolver`) — tenta as
    // duas regiões nessa ordem de probabilidade, e foca a primeira que tiver
    // um nó de verdade montado.
    const no =
      refsCartoes.current.get(`grid:${alvo}`) ?? refsCartoes.current.get(`trilho:${alvo}`);
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
     região (ver `RegiaoFoco` acima), não só por id: um serviço sem equipe
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

  return { idAtivo, idAtivoTrilho, refCartao, aoFocar };
}
