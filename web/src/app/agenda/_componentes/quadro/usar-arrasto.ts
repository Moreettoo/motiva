"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Grade } from "../dados";
import { alvoNaBordaDaSemana, proximoAlvo, realinharAlvo, type Alvo, type Direcao } from "./navegacao";

// Os componentes importam interação de um lugar só; espalhar o conhecimento de
// que existem dois módulos (navegação pura + hook) seria pior.
export type { Alvo, Direcao } from "./navegacao";

/** Deslocamento em px que compromete o gesto no mouse e na caneta. */
const LIMIAR_PX = 8;
/** Pressão longa que compromete o gesto no toque, sem competir com a rolagem. */
const PRESSAO_MS = 250;
/** Faixa que dispara auto-rolagem DENTRO da área útil, e velocidade máxima em px
 *  por quadro. Fora da área útil — o ponteiro atrás de um obstáculo grudado, ou
 *  fora do rolador — não há faixa: a rolagem é a máxima direto. As duas metades
 *  e a aritmética que fixa os 24px estão em `velocidadeDeRolagem`, no fim deste
 *  arquivo; um número só para as duas era o defeito que isto conserta. */
const FAIXA_INTERNA_PX = 24;
const VELOCIDADE_MAX = 18;
/** Espera do anúncio de PASSO na região assertiva (ver `anunciarPasso`). Uma
 *  região `assertive` INTERROMPE a fala em curso, e a seta repete ~30 vezes por
 *  segundo com a tecla presa: sem espera, cada anúncio cortava o anterior na
 *  primeira sílaba e nenhuma frase chegava inteira em quem ouve a tela. */
const ANUNCIO_MS = 150;

export type CargaArrasto = {
  id: number;
  origem: Alvo;
  /** Frase curta para o anúncio e para o sobrevoo. Nunca o item inteiro. */
  rotulo: string;
};

export type EstadoArrasto =
  | { fase: "ocioso" }
  | { fase: "candidato"; carga: CargaArrasto }
  | { fase: "arrastando"; carga: CargaArrasto; alvo: Alvo | null; recusa: string | null; x: number; y: number }
  | { fase: "carregando"; carga: CargaArrasto; alvo: Alvo; recusa: string | null };

type OpcoesArrasto = {
  grade: Grade;
  /** `null` aceita; texto em pt-BR recusa e vira o motivo mostrado. */
  validar: (carga: CargaArrasto, alvo: Alvo) => string | null;
  aoSoltar: (carga: CargaArrasto, alvo: Alvo) => void;
  /** Frase lida a cada passo do teclado. */
  descrever: (alvo: Alvo, carga: CargaArrasto) => string;
  anunciar: (texto: string) => void;
  aoNavegarSemana: (delta: -1 | 1) => void;
  /** `false` com o trilho colapsado numa doca fora da tela — ver o mesmo
   *  parâmetro em `proximoAlvo` (`navegacao.ts`). Default `true`. */
  filaDisponivel?: boolean;
};

/** Elementos roláveis que participam da auto-rolagem, do mais interno ao mais externo. */
function roladores(alvo: Element | null): HTMLElement[] {
  const lista: HTMLElement[] = [];
  for (let no = alvo; no instanceof HTMLElement; no = no.parentElement) {
    const estilo = getComputedStyle(no);
    if (/(auto|scroll)/.test(estilo.overflowX + estilo.overflowY)) lista.push(no);
  }
  return lista;
}

/* ---------------------------------------------------------------------------
   `data-obstaculo` — a área útil de um rolador
   ---------------------------------------------------------------------------
   O atributo marca um elemento GRUDADO (`sticky`/`fixed`) que cobre uma borda
   do rolador em que ele vive e esconde parte da área visível. O valor lista as
   bordas que ele come, separadas por espaço: `topo`, `baixo`, `esquerda`,
   `direita`. Onde ele vai, no quadro da semana:

     cabeçalho do dia    `sticky top-0`, ~52px   → data-obstaculo="topo"
     calha da turma      `sticky left-0`, 144px  → data-obstaculo="esquerda"
     cabeçalho da fila   `sticky top-0`          → data-obstaculo="topo"
     canto do quadro     gruda nos dois eixos    → data-obstaculo="topo esquerda"

   O canto é opcional: o cabeçalho já cobre a faixa de cima inteira e a calha a
   da esquerda, e por borda fica o MAIOR. Quem lê é o rolador em que o elemento
   está DENTRO — só faz sentido em elemento que gruda na borda de um rolador,
   nunca num que gruda na viewport por cima de outro.

   Token desconhecido é ignorado, e sem NENHUM elemento marcado os insets ficam
   todos em zero — a auto-rolagem volta exatamente ao que era antes disto
   existir, o que mantém a árvore de pé enquanto os componentes ainda não
   carregam o atributo.

   Por que existe: sem descontar o grudado, a faixa que dispara auto-rolagem
   nasce na borda da caixa CRUA, e ali ela cai quase toda atrás do obstáculo. A
   1920px, medido: dos 56px de faixa que existiam, 49 ficavam escondidos sob o
   cabeçalho do dia e sobravam 7 sobre conteúdo; na horizontal os 56 caíam
   inteiros dentro dos 144px da calha, e só o terço esquerdo dela rolava. Ou
   seja, a faixa mirava o lugar errado nos dois eixos.

   Descontado o grudado, o ponteiro atrás dele passa a dar distância NEGATIVA, e
   é esse o sinal que a auto-rolagem precisava: quem aponta para o cabeçalho está
   apontando para a célula que ele esconde. A faixa que sobra SOBRE o conteúdo é
   outra coisa, e é bem menor — ver `FAIXA_INTERNA_PX` e as duas metades de
   `velocidadeDeRolagem`. */

const BORDAS_OBSTACULO = ["topo", "baixo", "esquerda", "direita"] as const;
export type BordaObstaculo = (typeof BORDAS_OBSTACULO)[number];

/** Os quatro lados de um retângulo: o que `getBoundingClientRect` devolve e o
 *  que um teste monta à mão, sem DOM. */
export type Caixa = { top: number; right: number; bottom: number; left: number };
export type Insets = Record<BordaObstaculo, number>;
export type Obstaculo = { bordas: string | null | undefined; caixa: Caixa };

function ehBorda(token: string): token is BordaObstaculo {
  return (BORDAS_OBSTACULO as readonly string[]).includes(token);
}

/** Quanto UM obstáculo cobre de UMA borda: a distância da borda até o fim dele,
 *  limitada à extensão dele próprio. Ver `insetsDeObstaculos` para o porquê do
 *  limite. */
function coberturaDaBorda(rolador: Caixa, caixa: Caixa, borda: BordaObstaculo): number {
  const vertical = borda === "topo" || borda === "baixo";
  const extensao = vertical
    ? Math.max(0, caixa.bottom - caixa.top)
    : Math.max(0, caixa.right - caixa.left);
  const distancia =
    borda === "topo"
      ? caixa.bottom - rolador.top
      : borda === "baixo"
        ? rolador.bottom - caixa.top
        : borda === "esquerda"
          ? caixa.right - rolador.left
          : rolador.right - caixa.left;
  return Math.min(Math.max(0, distancia), extensao);
}

/**
 * Quanto cada borda do rolador está coberta — o MAIOR por borda, porque os
 * obstáculos se repetem: a calha existe em toda linha (11 elementos de mesma
 * largura) e o cabeçalho em toda coluna.
 *
 * O limite pela extensão do obstáculo não é decoração. `sticky` não está sempre
 * onde a gente acha:
 *  - um obstáculo que ainda NÃO colou (há conteúdo acima dele e a rolagem está
 *    em zero) fica no meio do rolador; só a distância diria que a área útil
 *    começa depois dele, reservando quase a pista inteira. Limitado, ele
 *    reserva a própria altura, que é o pior caso honesto;
 *  - um obstáculo rolado para FORA dá distância negativa e cai para zero;
 *  - `display: none` (a navegação móvel no desktop) dá caixa toda zerada: a
 *    extensão é zero, então o inset é zero mesmo quando a caixa do rolador está
 *    acima da viewport — situação em que só a distância inventaria um número
 *    grande, porque `rolador.top` é negativo;
 *  - um rolador com borda ou `padding` empurra o grudado para dentro do próprio
 *    scrollport, e a distância passaria da altura dele por essa folga.
 *
 * O limite também é o que segura o estrago se um obstáculo de rolador ANINHADO
 * entrar na conta do rolador de fora (hoje a pista e o trilho são irmãos, não
 * aninhados): reserva a altura de um cabeçalho, não meia tela.
 */
export function insetsDeObstaculos(rolador: Caixa, obstaculos: readonly Obstaculo[]): Insets {
  const insets: Insets = { topo: 0, baixo: 0, esquerda: 0, direita: 0 };

  for (const { bordas, caixa } of obstaculos) {
    for (const token of (bordas ?? "").split(/\s+/)) {
      if (!ehBorda(token)) continue;
      insets[token] = Math.max(insets[token], coberturaDaBorda(rolador, caixa, token));
    }
  }

  return insets;
}

/**
 * A caixa do rolador menos o que os obstáculos cobrem.
 *
 * Se um eixo COLAPSA (obstáculo maior que o rolador, ou uma medida inventada),
 * aquele eixo volta à caixa crua: uma área invertida deixaria as duas
 * distâncias negativas e travaria a auto-rolagem na velocidade máxima numa
 * direção só. Voltar à caixa crua degrada para o comportamento de antes deste
 * conserto, não para um defeito novo.
 */
export function areaUtil(rolador: Caixa, insets: Insets): Caixa {
  const top = rolador.top + insets.topo;
  const bottom = rolador.bottom - insets.baixo;
  const left = rolador.left + insets.esquerda;
  const right = rolador.right - insets.direita;
  const verticalOk = top < bottom;
  const horizontalOk = left < right;

  return {
    top: verticalOk ? top : rolador.top,
    bottom: verticalOk ? bottom : rolador.bottom,
    left: horizontalOk ? left : rolador.left,
    right: horizontalOk ? right : rolador.right,
  };
}

/**
 * Mede os obstáculos de um rolador. Lê layout — a aritmética pura está em
 * `insetsDeObstaculos`, e `getBoundingClientRect` (não `offsetHeight`) porque a
 * conta precisa da mesma geometria de viewport de `s.x`/`s.y`: `offsetHeight` é
 * px de layout arredondado e ignora qualquer `transform` de ancestral.
 *
 * UMA vez por rolador por gesto, guardado em `Vivo.insets`. Não é economia
 * cega: o inset é uma medida RELATIVA (borda do obstáculo menos borda do
 * rolador), e as duas coisas que mudam 60 vezes por segundo durante um arrasto
 * não a mexem — rolar a PÁGINA move rolador e obstáculo juntos, e rolar a PISTA
 * mantém o obstáculo colado na borda (no quadro o cabeçalho é a primeira linha
 * da grade e a calha a primeira coluna, então elas estão na borda também com a
 * rolagem em zero). Reler 18 retângulos por quadro — 7 cabeçalhos e 11 calhas —
 * mais um `querySelectorAll` numa subárvore de ~200 nós recalcularia uma
 * constante, em cima do `elementsFromPoint` que o mesmo quadro já paga.
 *
 * O que a medida por gesto ERRA: um refluxo no meio do arrasto — girar o
 * celular, abrir a doca da fila, a container query trocar a densidade da
 * coluna — muda a altura do cabeçalho, e o inset fica velho até o fim daquele
 * gesto (um a três segundos), com a zona morta errada pela diferença de altura.
 * É aceitável porque o mesmo refluxo já moveu todas as células debaixo do
 * ponteiro: a zona morta uns pixels fora de lugar é o menor dos problemas, e o
 * gesto seguinte mede de novo.
 */
function medirInsets(no: HTMLElement, caixa: Caixa): Insets {
  const obstaculos: Obstaculo[] = [];
  for (const el of no.querySelectorAll<HTMLElement>("[data-obstaculo]")) {
    obstaculos.push({ bordas: el.dataset.obstaculo, caixa: el.getBoundingClientRect() });
  }
  return insetsDeObstaculos(caixa, obstaculos);
}

/**
 * Alvo sob o ponteiro.
 *
 * `elementsFromPoint` no PLURAL: devolve a pilha inteira em ordem de pintura, o
 * que atravessa o cabeçalho grudado e a barra superior sem precisar mexer no CSS
 * deles. Coordenadas de viewport, então a auto-rolagem sai de graça — um cache
 * de `getBoundingClientRect` ficaria inválido a cada quadro justamente enquanto
 * o quadro rola, que é quando ele mais seria usado.
 */
function alvoSob(x: number, y: number): Alvo | null {
  for (const no of document.elementsFromPoint(x, y)) {
    const celula = no.closest<HTMLElement>("[data-celula]");
    if (celula?.dataset.celula) return celula.dataset.celula;
    if (no.closest("[data-trilho]")) return "fila";
    // `data-celula-recusada` NUNCA é um destino de solta válido — é o outro
    // atributo, de propósito (ver o comentário em `celula-equipe.tsx`): uma
    // célula que não aceita solta, ou a linha de "Propostas da IA", carregam
    // aqui a MESMA string que `validar` já sabe recusar (uma `ChaveCelula`
    // de verdade para a primeira, `propostas:${dia}` para a segunda). Sem
    // isto, pairar sobre essas regiões resolvia para `null` e a recusa
    // nunca chegava a ser DESENHADA — o alvo continuava existindo (a região
    // sob o ponteiro), só não era um alvo QUE ACEITA, e `validar` (chamado
    // de qualquer forma, com este alvo) devolve o motivo certo.
    const recusada = no.closest<HTMLElement>("[data-celula-recusada]");
    if (recusada?.dataset.celulaRecusada) return recusada.dataset.celulaRecusada as Alvo;
  }
  return null;
}

type Vivo = {
  carga: CargaArrasto;
  ponteiroId: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  comprometido: boolean;
  temporizador: number | null;
  quadro: number | null;
  /** Insets por rolador, medidos na primeira vez que cada um participa DESTE
   *  gesto (ver `medirInsets`). Mora aqui, e não num ref à parte, para morrer
   *  com o gesto: `fechar()` zera `vivo.current` e o cache vai junto. Não entra
   *  em `limparRecursos`, que existe para soltar recurso do navegador
   *  (temporizador, rAF, atributo no `<html>`), não memória. */
  insets: Map<HTMLElement, Insets>;
};

export type DecisaoSolta =
  | { tipo: "recusa"; motivo: string }
  | { tipo: "sem-mudanca" }
  | { tipo: "soltar" };

/**
 * Decide o que fazer ao CONFIRMAR uma solta por teclado (Enter, ou Espaço de
 * novo enquanto já em `"carregando"`) — pura, sem efeito colateral. Usada
 * por `soltarOuAvisar`, dentro de `aoTeclar`.
 *
 * `alvo === origem` é um caso à parte de `recusa`: `validar` aceita voltar
 * para a própria origem de propósito (não seria certo recusar enquanto o
 * gestor só está OLHANDO ao redor com as setas), então a recusa chega
 * `null` nesse caso — mas confirmar mesmo assim dispararia uma escrita
 * idêntica ao estado atual, com anúncio de sucesso e um "Desfazer" para um
 * no-op (o caminho do ponteiro já guarda contra isto, em `soltar` abaixo).
 */
export function decidirSolta(alvo: Alvo, origem: Alvo, recusa: string | null): DecisaoSolta {
  if (recusa) return { tipo: "recusa", motivo: recusa };
  if (alvo === origem) return { tipo: "sem-mudanca" };
  return { tipo: "soltar" };
}

export type DecisaoRevalidacao = { tipo: "nada" } | { tipo: "anunciar" } | { tipo: "corrigir-e-anunciar" };

/**
 * Decide o que fazer quando a grade muda enquanto um movimento está em
 * `"carregando"` — pura, sem efeito colateral. `chegada` sinaliza que
 * acabamos de atravessar semana (Shift+seta ou seta simples na borda) e
 * AINDA não anunciamos onde o cartão pousou: cruzar semana troca dia, turma
 * e capacidade sem anunciar nada na hora (a grade nova só existe no próximo
 * render), e sem este sinal esse anúncio nunca aconteceria quando o destino
 * se confirma VÁLIDO — a recusa ao vivo, nesse caso, não muda (era `null`
 * antes do cruzamento, otimista, e continua `null` depois, confirmado).
 */
export function decidirRevalidacao(
  recusaAoVivo: string | null,
  recusaFresca: string | null,
  chegada: boolean,
): DecisaoRevalidacao {
  if (recusaFresca === recusaAoVivo && !chegada) return { tipo: "nada" };
  return { tipo: recusaFresca === recusaAoVivo ? "anunciar" : "corrigir-e-anunciar" };
}

/**
 * Cancela o que um gesto deixou pendente — temporizador, rAF, o atributo que
 * trava cursor e seleção — sem tocar em `estado`. Uma cópia só, dois
 * chamadores: o fim normal do gesto (`fechar`) e o desmonte do componente.
 * `iniciar` também chama, para o gesto ANTERIOR, quando um segundo ponteiro
 * chega antes de o primeiro soltar — sem isto o temporizador do primeiro
 * sobrevive à troca e compromete o ponteiro errado quando dispara.
 */
function limparRecursos(s: Vivo | null): void {
  if (!s) return;
  if (s.temporizador != null) clearTimeout(s.temporizador);
  if (s.quadro != null) cancelAnimationFrame(s.quadro);
  delete document.documentElement.dataset.arrastando;
}

/** Relógio injetável: o teste passa o dele e não depende de temporizador de
 *  verdade nem de `window`, que não existe no ambiente `node` do vitest. */
export type Relogio = {
  agendar: (efeito: () => void, ms: number) => number;
  cancelar: (id: number) => void;
};

/** Arrow, e não a referência crua de `window.setTimeout`: método de WebIDL
 *  chamado sem o `this` do `window` estoura "Illegal invocation" no navegador. */
const RELOGIO: Relogio = {
  agendar: (efeito, ms) => window.setTimeout(efeito, ms),
  cancelar: (id) => window.clearTimeout(id),
};

export type Diferidor = {
  /** Agenda para `ms` adiante; um `diferir` novo antes do prazo descarta o anterior. */
  diferir: (efeito: () => void) => void;
  /** Roda agora e DESCARTA o pendente — ver `anunciarAgora`, em `useArrasto`. */
  agora: (efeito: () => void) => void;
  cancelar: () => void;
};

/**
 * Debounce de BORDA DE SAÍDA: emite o último da rajada, nunca o primeiro. Uma
 * instância guarda um agendamento só — é uma vaga, não uma fila, e é isso que
 * transforma trinta setas por segundo num anúncio no fim.
 *
 * Fábrica em vez de hook para poder ser testada sem React e sem DOM; o relógio
 * entra por parâmetro pelo mesmo motivo.
 */
export function criarDiferidor(relogio: Relogio, ms: number): Diferidor {
  let pendente: number | null = null;

  function cancelar(): void {
    if (pendente != null) relogio.cancelar(pendente);
    pendente = null;
  }

  return {
    diferir(efeito) {
      cancelar();
      pendente = relogio.agendar(() => {
        // Zera ANTES de rodar: `pendente != null` significa "há fala
        // esperando", e um id já disparado não representa mais isso —
        // deixá-lo ali faria `agora()` e `cancelar()` mentirem sobre o que
        // existe para descartar.
        pendente = null;
        efeito();
      }, ms);
    },
    agora(efeito) {
      cancelar();
      efeito();
    },
    cancelar,
  };
}

export function useArrasto({
  grade,
  validar,
  aoSoltar,
  descrever,
  anunciar,
  aoNavegarSemana,
  filaDisponivel = true,
}: OpcoesArrasto) {
  const [estado, setEstado] = useState<EstadoArrasto>({ fase: "ocioso" });

  // Espelho de `estado` para leitura em `aoTeclar` sem entrar no array de
  // deps: durante um arrasto por ponteiro, `laco()` chama `definirEstado` a
  // ~60 quadros por segundo, e `estado` no array recriaria `aoTeclar` junto —
  // o mesmo furo que o comentário abaixo já evita para o próprio `laco`.
  // Atualizado sempre no mesmo lugar em que `estado` muda, nunca à parte.
  const estadoRef = useRef<EstadoArrasto>({ fase: "ocioso" });
  const definirEstado = useCallback((novo: EstadoArrasto) => {
    estadoRef.current = novo;
    setEstado(novo);
  }, []);

  // Tudo que o loop de animação lê mora em ref: ler de estado recriaria os
  // callbacks a cada quadro e derrubaria o `memo` dos ~130 cartões.
  const vivo = useRef<Vivo | null>(null);

  /* Sobrevive a `fechar()` — que zera `vivo.current` ANTES de o navegador
     sintetizar o `click` do `pointerup`. `engolirClique` roda via
     `onClickCapture` do cartão depois desse `click`, então ler
     `vivo.current?.houveArrasto` ali sempre achava `undefined`: a guarda
     nunca disparava, e todo arrasto por mouse terminava com a gaveta de
     detalhe abrindo por cima do quadro que acabou de mudar — exatamente o
     cenário que `comprometer()` já documenta (capturar o ponteiro só ali
     para não perder o clique).
     Consumido em `engolirClique` quando o clique cai num botão de detalhe —
     mas NEM todo fim de gesto passa por ali (solta recusada, solta no vão
     da célula, solta no trilho, `pointercancel`, soltar fora do quadro):
     nesses casos `engolirClique` nunca roda, e limpar só ali deixava o
     sinal armado até o PRÓXIMO clique num botão de detalhe — inclusive uma
     ativação por TECLADO, que sintetiza `click` sem `pointerdown` na alça.
     Por isso `fechar()` também agenda a limpeza, em diferido (ver o
     `setTimeout` lá) — diferido, e não síncrono ali, porque o `click`
     sintético do MESMO gesto ainda precisa ver o sinal armado quando
     chegar. */
  const ultimoGestoArrastou = useRef(false);

  /* id do `setTimeout` que `fechar()` agenda para zerar `ultimoGestoArrastou`
     (ver abaixo). Guardado para poder CANCELAR: sem isto, um timer do gesto
     ANTERIOR ainda pendente dispara depois de `comprometer()` do gesto
     SEGUINTE já ter armado a flag de novo, apagando-a no meio do segundo
     arrasto — e o clique terminal desse segundo gesto volta a abrir a
     gaveta, que é exatamente o bug que a flag existe para impedir. */
  const temporizadorLimpezaClique = useRef<number | null>(null);

  /* Sinaliza uma chegada de semana pendente de anúncio (ver o efeito de
     revalidação mais abaixo). Zerado em `fechar()`: nenhuma sessão de
     arrasto deveria deixar um sinal pendente vazando para a próxima. */
  const precisaAnunciarChegada = useRef(false);

  /* A vaga única de fala da região assertiva. Criada na PRIMEIRA fala e não no
     render: escrever em ref durante o render é exatamente o que a regra de refs
     proíbe, e toda fala sai de evento ou de efeito — nunca de render — então a
     hora de criar sempre chega antes de a primeira precisar dela. */
  const diferidor = useRef<Diferidor | null>(null);
  const obterDiferidor = useCallback(() => {
    diferidor.current ??= criarDiferidor(RELOGIO, ANUNCIO_MS);
    return diferidor.current;
  }, []);

  /* Duas portas para o mesmo `anunciar`, e a escolha entre elas é de conteúdo.

     `anunciarPasso` é o passo do movimento: a seta, a borda da semana, a
     chegada depois de cruzar semana. Passa pelo debounce porque a seta REPETE
     com a tecla presa e a região é `assertive`, que interrompe a fala em curso
     — sem espera, cada anúncio cortava o anterior na primeira sílaba.

     `anunciarAgora` é o que fecha um ciclo e não faz sentido atrasado: pegar o
     cartão, cancelar, a recusa e o "nada mudou" do Enter. Não é medo de
     PERDER o anúncio (um debounce de saída sempre emite o último); é ordem e
     latência. São respostas a uma ação deliberada e única — ninguém repete
     Enter trinta vezes por segundo —, e um passo pendente que falasse 150 ms
     DEPOIS de "movimento cancelado" descreveria a célula para onde o cartão já
     não vai. Por isso `agora` também descarta o pendente. */
  const anunciarPasso = useCallback(
    (texto: string) => obterDiferidor().diferir(() => anunciar(texto)),
    [obterDiferidor, anunciar],
  );
  const anunciarAgora = useCallback(
    (texto: string) => obterDiferidor().agora(() => anunciar(texto)),
    [obterDiferidor, anunciar],
  );

  const fechar = useCallback(() => {
    limparRecursos(vivo.current);
    vivo.current = null;
    precisaAnunciarChegada.current = false;
    /* Passo pendente não sobrevive ao fim do gesto. Numa solta bem sucedida
       quem anuncia o desfecho é a região polite (`quadro-semana.tsx`), e a
       assertiva INTERROMPE a polite: o passo atrasado entraria por cima de
       "alocado para quinta…" descrevendo a célula de onde o cartão já saiu. */
    diferidor.current?.cancelar();
    // Diferido, não síncrono: o `click` sintético de um gesto arrastado (se
    // houver um) é despachado na MESMA tarefa deste `fechar()` — zerar aqui
    // apagaria o sinal ANTES de `engolirClique` (que roda nesse `click`) ter
    // a chance de lê-lo, reabrindo o bug original. `setTimeout(…, 0)`
    // empurra a limpeza para depois dessa tarefa: sobrevive ao `click` deste
    // gesto, mas não vaza para o PRÓXIMO clique legítimo.
    if (temporizadorLimpezaClique.current != null) {
      window.clearTimeout(temporizadorLimpezaClique.current);
    }
    temporizadorLimpezaClique.current = window.setTimeout(() => {
      ultimoGestoArrastou.current = false;
      temporizadorLimpezaClique.current = null;
    }, 0);
    definirEstado({ fase: "ocioso" });
  }, [definirEstado]);

  const laco = useCallback(() => {
    const s = vivo.current;
    if (!s || !s.comprometido) return;

    // LER antes de ESCREVER: `elementsFromPoint` depois de mexer no transform do
    // sobrevoo seria leitura de layout logo após escrita, no mesmo quadro.
    const alvo = alvoSob(s.x, s.y);
    const recusa = alvo == null ? null : validar(s.carga, alvo);

    definirEstado({ fase: "arrastando", carga: s.carga, alvo, recusa, x: s.x, y: s.y });

    // Auto-rolagem nos dois eixos. `scroll-behavior: auto` local no container
    // (globals.css) — o `smooth` global animaria cada quadro deste laço.
    // As distâncias medem contra a ÁREA ÚTIL, não contra a caixa crua: o que
    // está atrás do cabeçalho grudado e da calha não é área onde se solta, e é
    // de lá que sai a distância NEGATIVA que manda rolar na velocidade máxima
    // (ver as duas metades em `velocidadeDeRolagem`).
    for (const no of roladores(document.elementFromPoint(s.x, s.y))) {
      const caixa = no.getBoundingClientRect();
      // Ainda na fase de LEITURA deste quadro: os retângulos dos obstáculos
      // saem antes do `scrollBy` abaixo, nunca depois. Uma medida por rolador
      // por gesto — ver `medirInsets` para por que uma basta.
      let insets = s.insets.get(no);
      if (!insets) {
        insets = medirInsets(no, caixa);
        s.insets.set(no, insets);
      }
      const util = areaUtil(caixa, insets);
      const dx = velocidadeDeRolagem(s.x - util.left, util.right - s.x);
      const dy = velocidadeDeRolagem(s.y - util.top, util.bottom - s.y);
      if (dx || dy) {
        no.scrollBy(dx, dy);
        break;
      }
    }

    // O laço se rechama por closure — o React Compiler não está ligado neste
    // projeto (ver `next.config.ts`), então a regra de imutabilidade do
    // compilador não se aplica aqui; é o idioma padrão de loop de rAF autorreferente.
    // eslint-disable-next-line react-hooks/immutability
    s.quadro = requestAnimationFrame(laco);
  }, [validar, definirEstado]);

  const comprometer = useCallback(() => {
    const s = vivo.current;
    if (!s || s.comprometido) return;
    if (s.temporizador != null) clearTimeout(s.temporizador);

    // A CAPTURA ENTRA SÓ AQUI. Capturar no `pointerdown` redireciona os eventos
    // de mouse de compatibilidade para quem capturou, e o `click` passa a ter o
    // quadro como alvo — o cartão nunca o vê e abrir o detalhe some da tela.
    document.documentElement.setPointerCapture?.(s.ponteiroId);
    document.documentElement.dataset.arrastando = "";

    s.comprometido = true;
    ultimoGestoArrastou.current = true;
    s.quadro = requestAnimationFrame(laco);
    anunciarAgora(`${s.carga.rotulo} pego.`);
  }, [laco, anunciarAgora]);

  const iniciar = useCallback(
    (evento: React.PointerEvent<HTMLElement>, carga: CargaArrasto) => {
      if (evento.button !== 0 && evento.pointerType === "mouse") return;
      evento.preventDefault();

      // Um segundo ponteiro pode chegar antes de o primeiro soltar ou
      // cancelar: sem limpar aqui, o temporizador do gesto anterior (ainda
      // não comprometido) sobrevive à troca e comprometeria o ponteiro ERRADO
      // quando disparasse. Não é suporte a dois dedos — é não vazar recurso.
      limparRecursos(vivo.current);
      // Defensivo: se o `click` sintético do gesto anterior nunca chegou a
      // disparar `engolirClique` (que o consome), não deveria sobreviver até
      // este gesto novo. Cancela também o `setTimeout` de `fechar()` que
      // zeraria isto de novo mais tarde — ver o comentário na declaração de
      // `temporizadorLimpezaClique` para o cenário que isto evita.
      ultimoGestoArrastou.current = false;
      if (temporizadorLimpezaClique.current != null) {
        window.clearTimeout(temporizadorLimpezaClique.current);
        temporizadorLimpezaClique.current = null;
      }

      vivo.current = {
        carga,
        ponteiroId: evento.pointerId,
        x0: evento.clientX,
        y0: evento.clientY,
        x: evento.clientX,
        y: evento.clientY,
        comprometido: false,
        temporizador:
          evento.pointerType === "mouse"
            ? null
            : window.setTimeout(comprometer, PRESSAO_MS),
        quadro: null,
        insets: new Map(),
      };

      definirEstado({ fase: "candidato", carga });
    },
    [comprometer, definirEstado],
  );

  // Os ouvintes ficam em `window` e não no quadro: entre o `pointerdown` e o
  // `comprometer()` ainda não há captura, e sem isto o fim do gesto se perde se
  // o ponteiro sair do elemento.
  useEffect(() => {
    function mover(evento: PointerEvent) {
      const s = vivo.current;
      if (!s || evento.pointerId !== s.ponteiroId) return;

      s.x = evento.clientX;
      s.y = evento.clientY;

      if (!s.comprometido) {
        const dist = Math.hypot(s.x - s.x0, s.y - s.y0);
        if (dist > LIMIAR_PX) comprometer();
        return;
      }
      evento.preventDefault();
    }

    function soltar(evento: PointerEvent) {
      const s = vivo.current;
      if (!s || evento.pointerId !== s.ponteiroId) return;

      if (s.comprometido) {
        // Re-testar o alvo AQUI, não confiar no último realce: o amortecimento
        // visual atrasa o realce e faria todo arrasto curto no toque ser recusado.
        const alvo = alvoSob(evento.clientX, evento.clientY);
        const recusa = alvo == null ? "" : validar(s.carga, alvo);
        if (alvo != null && !recusa && alvo !== s.carga.origem) aoSoltar(s.carga, alvo);
      }

      document.documentElement.releasePointerCapture?.(evento.pointerId);
      fechar();
    }

    function cancelar(evento: PointerEvent) {
      if (vivo.current?.ponteiroId === evento.pointerId) fechar();
    }

    window.addEventListener("pointermove", mover, { passive: false });
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", cancelar);
    window.addEventListener("lostpointercapture", cancelar);

    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", cancelar);
      window.removeEventListener("lostpointercapture", cancelar);
    };
  }, [comprometer, fechar, validar, aoSoltar]);

  /* `Esc` cancela um arrasto por PONTEIRO, não só por teclado. `aoTeclar`
     (mais abaixo) só existe no `onKeyDown` do cartão, e um gesto de
     mouse/toque não move o foco para lá — `comprometer()` captura o
     ponteiro, não o foco, e `iniciar()` chama `preventDefault()` no
     `pointerdown`, que em boa parte dos navegadores também suprime o foco
     automático do clique. Sem este ouvinte em `window`, o único jeito de
     desistir de um arrasto por mouse era soltar sobre um alvo que recusa —
     e antes deste conserto isso não desenhava nada (ver o estado de recusa,
     abaixo), então `Esc` era a única saída perceptível e não funcionava. */
  useEffect(() => {
    function teclado(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      if (estadoRef.current.fase !== "arrastando") return;
      evento.preventDefault();
      anunciarAgora("Movimento cancelado. O serviço continua onde estava.");
      fechar();
    }
    window.addEventListener("keydown", teclado);
    return () => window.removeEventListener("keydown", teclado);
  }, [anunciarAgora, fechar]);

  // Efeito só de desmontagem: cancela temporizador e rAF pendentes, e solta o
  // atributo de cursor, se o quadro sumir da tela no meio de um arrasto (troca
  // de rota, por exemplo). Sem isto o laço de `requestAnimationFrame`
  // continuaria se rechamando para sempre — os ouvintes de `window` já
  // teriam sumido, então nada mais o pararia — e `data-arrastando` ficaria
  // preso no `<html>`, travando cursor e seleção para a próxima página.
  // Separado do efeito acima porque aquele reexecuta a cada troca de callback;
  // cancelar o arrasto nesse momento derrubaria um gesto em andamento à toa.
  // O `setTimeout` de `fechar()` (`temporizadorLimpezaClique`) entra aqui pelo
  // mesmo motivo: sem cancelar, ele ainda dispara depois do desmonte e escreve
  // num ref que sobrevive à troca de página, mas que ninguém mais lê. O passo
  // pendente do `diferidor` é o terceiro caso do mesmo padrão — ele escreveria
  // numa região `aria-live` que já saiu da árvore.
  useEffect(() => {
    return () => {
      limparRecursos(vivo.current);
      if (temporizadorLimpezaClique.current != null) {
        window.clearTimeout(temporizadorLimpezaClique.current);
      }
      diferidor.current?.cancelar();
    };
  }, []);

  /** Espalhar no botão de detalhe do cartão: engole o clique que fecha um
   *  arrasto. Lê `ultimoGestoArrastou`, não `vivo.current?.houveArrasto`:
   *  `fechar()` já zerou `vivo.current` antes de o navegador sintetizar
   *  este `click` (ver o comentário na declaração do ref). Consome o sinal
   *  (zera) de qualquer forma — é de um clique só, e não pode engolir o
   *  PRÓXIMO clique que não seja precedido de arrasto nenhum. */
  const engolirClique = useCallback((evento: React.MouseEvent) => {
    if (ultimoGestoArrastou.current) {
      evento.preventDefault();
      evento.stopPropagation();
    }
    ultimoGestoArrastou.current = false;
  }, []);

  /* Realinha `estado.alvo` para a semana nova ao atravessar semana em pleno
     movimento por SHIFT+seta (que significa "uma semana"; a seta simples no
     fim/início da semana significa "um dia" e usa `alvoNaBordaDaSemana` mais
     abaixo, não isto): mesmo dia da semana, mesma turma (ver `realinharAlvo`,
     em `navegacao.ts`, para a aritmética e a razão do bug sem isto).
     Otimista — a grade nova só existe no próximo render, então não dá para
     validar a chave nova aqui contra dado fresco; ela é determinística
     (±7 dias) e `recusa: null` assume que continua valendo o que valia antes
     de cruzar a semana. Marca `precisaAnunciarChegada` para o efeito de
     revalidação (mais abaixo) saber que há uma chegada pendente de anúncio,
     mesmo que a suposição otimista se confirme certa. */
  const realinhar = useCallback(
    (atual: { carga: CargaArrasto; alvo: Alvo }, delta: -1 | 1) => {
      definirEstado({
        fase: "carregando",
        carga: atual.carga,
        alvo: realinharAlvo(atual.alvo, delta),
        recusa: null,
      });
      precisaAnunciarChegada.current = true;
    },
    [definirEstado],
  );

  /* A troca de semana em pleno movimento (`realinhar` acima e o ramo
     "semana" abaixo) seta `recusa: null` de forma otimista, ANTES de existir
     grade nova para validar contra. Essa suposição alimenta o DESENHO, não só
     o Enter: `recusa` vira o anel de aceitação na célula (`realcada`) — uma
     suposição errada pinta a célula como válida quando não é (por exemplo,
     "Esse dia já passou." depois de um Shift+← comum, que quase sempre cai
     no passado) e o erro ficaria escondido até a PRÓXIMA seta, que pode
     nunca vir. E mesmo quando a suposição se confirma CERTA, cruzar semana
     não anunciava nada na região assertiva — quem só ouve a tela não sabia
     onde o cartão foi parar.
     Este efeito corrige os dois: revalida de verdade assim que a grade nova
     chega e, via `decidirRevalidacao` (pura, testada), decide se corrige o
     estado, se só anuncia a chegada (destino confirmado válido), ou se não
     há nada a fazer. `precisaAnunciarChegada` é o único sinal de "há uma
     chegada pendente" — SEM cache de (alvo, recusa) algum: um cache assim
     comparava contra sessões de arrasto ANTERIORES e podia abortar uma
     correção de verdade só por coincidência de valores entre duas travessias
     de semana diferentes (era exatamente esse o bug de uma versão anterior
     deste efeito). A guarda contra `estadoRef` ao vivo (dentro de
     `decidirRevalidacao`) já basta sozinha porque `definirEstado` escreve
     `estadoRef` de forma síncrona. */
  useEffect(() => {
    const atual = estadoRef.current;
    if (atual.fase !== "carregando") return;

    const recusa = validar(atual.carga, atual.alvo);
    const decisao = decidirRevalidacao(atual.recusa, recusa, precisaAnunciarChegada.current);
    if (decisao.tipo === "nada") return;

    precisaAnunciarChegada.current = false;
    if (decisao.tipo === "corrigir-e-anunciar") {
      definirEstado({ fase: "carregando", carga: atual.carga, alvo: atual.alvo, recusa });
    }
    // Passo, não terminal: é a chegada de uma travessia de semana, e Shift+seta
    // também repete com a tecla presa. Pela vaga única do diferidor, uma rajada
    // de travessias fala só onde o cartão parou.
    anunciarPasso(recusa ?? descrever(atual.alvo, atual.carga));
  }, [grade, validar, definirEstado, anunciarPasso, descrever]);

  const aoTeclar = useCallback(
    (evento: React.KeyboardEvent<HTMLElement>, carga: CargaArrasto) => {
      // Lido do espelho, não de `estado`: `estado` recriaria este callback a
      // cada quadro de um arrasto por ponteiro em andamento (ver `estadoRef`).
      const atual = estadoRef.current.fase === "carregando" ? estadoRef.current : null;

      // Confirma a solta (Espaço de novo, ou Enter) — compartilhado pelos
      // dois porque os dois tinham o MESMO buraco: nenhum guardava contra
      // destino igual à origem (o caminho do ponteiro guarda, logo abaixo em
      // `soltar`). Sem isto, Espaço-Enter sem mover nenhuma seta disparava
      // `aoAlocar` idêntico ao estado atual, com "alocado para…" e um
      // "Desfazer" para um no-op. A decisão em si é `decidirSolta` (pura,
      // testada); esta função só executa o efeito colateral correspondente.
      function soltarOuAvisar() {
        if (!atual) return;
        const decisao = decidirSolta(atual.alvo, atual.carga.origem, atual.recusa);
        if (decisao.tipo === "recusa") {
          anunciarAgora(decisao.motivo);
          return;
        }
        if (decisao.tipo === "sem-mudanca") {
          anunciarAgora("Nada mudou. O serviço já estava aqui.");
          fechar();
          return;
        }
        aoSoltar(atual.carga, atual.alvo);
        fechar();
      }

      if (evento.key === " " || evento.key === "Spacebar") {
        evento.preventDefault();
        if (atual) {
          soltarOuAvisar();
          return;
        }
        definirEstado({ fase: "carregando", carga, alvo: carga.origem, recusa: null });
        anunciarAgora(`${carga.rotulo} pego. Setas escolhem o dia e a equipe, Enter solta.`);
        return;
      }

      if (!atual) return;

      if (evento.key === "Escape") {
        evento.preventDefault();
        anunciarAgora("Movimento cancelado. O serviço continua onde estava.");
        fechar();
        return;
      }

      // `preventDefault` no Enter: sem ele, soltar também dispara o botão de
      // detalhe e a gaveta abre por cima do quadro que acabou de mudar.
      if (evento.key === "Enter") {
        evento.preventDefault();
        soltarOuAvisar();
        return;
      }

      const direcoes: Record<string, Direcao> = {
        ArrowLeft: "esquerda",
        ArrowRight: "direita",
        ArrowUp: "cima",
        ArrowDown: "baixo",
      };
      const direcao = direcoes[evento.key];
      if (!direcao) return;

      evento.preventDefault();

      if (evento.shiftKey && (direcao === "esquerda" || direcao === "direita")) {
        const delta = direcao === "direita" ? 1 : -1;
        aoNavegarSemana(delta);
        realinhar(atual, delta);
        return;
      }

      const passo = proximoAlvo(grade, atual.alvo, direcao, filaDisponivel);

      if (passo.tipo === "semana") {
        aoNavegarSemana(passo.delta);
        // Seta SIMPLES: "um dia", não "uma semana" — pousa na borda da
        // semana nova (ver `alvoNaBordaDaSemana`), nunca em `realinharAlvo`
        // (que é só para o Shift+seta acima e pularia a semana inteira).
        definirEstado({
          fase: "carregando",
          carga: atual.carga,
          alvo: alvoNaBordaDaSemana(grade, atual.alvo, passo.delta),
          recusa: null,
        });
        precisaAnunciarChegada.current = true;
        return;
      }
      if (passo.tipo === "borda") {
        // "Fim da semana" só faz sentido no eixo horizontal. No vertical (uma
        // ponta da coluna de equipes) e a partir do trilho (que não tem
        // eixo vertical e só sai pela direita) o motivo é outro — dizer "fim
        // da semana" ali confundiria quem usa leitor de tela à toa.
        const semEixoHorizontal = direcao === "cima" || direcao === "baixo" || atual.alvo === "fila";
        const sufixo = semEixoHorizontal
          ? "Não há equipe nessa direção."
          : "Fim da semana; Shift e seta para a próxima.";
        anunciarPasso(`${descrever(passo.alvo, atual.carga)} ${sufixo}`);
        return;
      }

      const recusa = validar(atual.carga, passo.alvo);
      definirEstado({ fase: "carregando", carga: atual.carga, alvo: passo.alvo, recusa });
      // A rajada mora aqui: tecla presa em auto-repetição. Note que a RECUSA de
      // um passo também é passo — ela descreve onde o cartão está pairando, não
      // o desfecho de uma confirmação, e atrasar junto mantém as duas na mesma
      // ordem em que aconteceram.
      anunciarPasso(recusa ?? descrever(passo.alvo, atual.carga));
    },
    [
      grade,
      validar,
      aoSoltar,
      descrever,
      anunciarPasso,
      anunciarAgora,
      aoNavegarSemana,
      fechar,
      definirEstado,
      realinhar,
      filaDisponivel,
    ],
  );

  return { estado, iniciar, aoTeclar, engolirClique, cancelar: fechar };
}

/**
 * Velocidade da auto-rolagem num eixo: 0 no meio, cresce ao chegar na borda da
 * ÁREA ÚTIL. Chamava-se `passo`; ganhou nome próprio ao virar export para
 * teste, porque `passo` já é o resultado de `proximoAlvo` dentro de `aoTeclar`.
 *
 * DUAS METADES, e é de propósito que elas não compartilham mais um número só.
 *
 * 1. Distância NEGATIVA — o ponteiro está atrás de um obstáculo grudado (o
 *    cabeçalho do dia, a calha da turma) ou fora do rolador. Rola na velocidade
 *    máxima, sem rampa: é o caso inequívoco, porque quem aponta para o grudado
 *    está apontando para a célula que ele esconde, e trazê-la à tela é a única
 *    resposta possível. O teto em `VELOCIDADE_MAX` (o `min(1, …)` abaixo) segura
 *    a razão, que passa de 1 aqui — 500px atrás do obstáculo dariam ~160px por
 *    quadro, uma pista que foge do ponteiro.
 *
 * 2. Distância POSITIVA, dentro da área útil — o ponteiro está sobre conteúdo em
 *    que se SOLTA um cartão, e por isso a faixa aqui tem que ser pequena. O
 *    critério é o centro da célula: é onde as pessoas miram, e ele precisa ficar
 *    fora da faixa. `--altura-linha` é 4.5rem (72px) e é um PISO (`minmax`), então
 *    uma linha inteira colada na borda da área útil tem o centro a 36px dela; na
 *    horizontal `--dia-min` é 6.5rem (104px) e o centro fica a 52px. Os 24px
 *    ficam 12px abaixo do pior dos dois, e essa folga não é enfeite: o inset é
 *    medido UMA vez por gesto (ver `medirInsets`), e um refluxo que ENCURTE o
 *    cabeçalho no meio do arrasto empurra a faixa para baixo, para dentro do
 *    conteúdo, pela diferença de altura. Até 12px de cabeçalho a menos, o centro
 *    continua parado. 24 também é um terço redondo da linha de 72px: o terço de
 *    cima rola, os dois de baixo são alvo de solta.
 *
 * O que estava errado antes: as duas metades eram os mesmos 56px. Medir contra a
 * área útil está certo, mas na mesma largura a faixa deixou de cobrir o obstáculo
 * e passou a cobrir o CONTEÚDO — 56 dos 72px da primeira linha visível, o centro
 * dela incluído, que rolava a 6px por quadro em vez de esperar a solta. Com
 * `scrollTop` em zero o `scrollBy` é no-op e ninguém sentia; no meio da lista, a
 * pista fugia do ponteiro exatamente onde ele mirava.
 *
 * Onde se aponta para rolar, então: no eixo que tem obstáculo, no obstáculo — 49px
 * de cabeçalho e 144px de calha, medidos, e são elementos VISÍVEIS, alvo melhor
 * que uma faixa invisível de 56px descoberta por acidente. Nas bordas sem
 * obstáculo (o fim da pista, embaixo e à direita) sobram os 24px, e é só ali que
 * a mudança custa alcance; em troca é ali que a ÚLTIMA linha inteira parou de
 * fugir do ponteiro — o mesmo defeito da primeira, que ninguém notou porque no
 * fim da lista o `scrollBy` também costuma ser no-op.
 */
export function velocidadeDeRolagem(distanciaInicio: number, distanciaFim: number): number {
  if (distanciaInicio < FAIXA_INTERNA_PX) return -passoDaBorda(distanciaInicio);
  if (distanciaFim < FAIXA_INTERNA_PX) return passoDaBorda(distanciaFim);
  return 0;
}

/** A rampa: 1px por quadro na entrada da faixa, `VELOCIDADE_MAX` na borda da
 *  área útil e em qualquer distância negativa — é o `min(1, …)` que junta a
 *  segunda metade com a primeira numa conta só. */
function passoDaBorda(distancia: number): number {
  return Math.round(Math.min(1, (FAIXA_INTERNA_PX - distancia) / FAIXA_INTERNA_PX) * VELOCIDADE_MAX);
}
