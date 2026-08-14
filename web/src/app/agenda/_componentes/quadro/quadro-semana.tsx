"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, FilterX, OctagonAlert, RotateCcw } from "lucide-react";

import { Botao, BotaoIcone } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/vazio";
import { IconeDominio, Legenda } from "@/components/viz/legenda";
import { ORDEM_RISCO, RISCO } from "@/lib/dominio";
import { fmt, inicioDaSemana, somarDias } from "@/lib/format";
import type { Equipe } from "@/lib/types";
import { cn } from "@/lib/utils";

import {
  chaveDia,
  linhaAtenuada,
  previaDoMovimento,
  type ChaveCelula,
  type Grade,
  type ItemAgenda,
  type Ocupacao,
  type ResumoDia,
} from "../dados";
import { CabecalhoDia } from "./cabecalho-dia";
import { CartaoServico } from "./cartao-servico";
import { LinhaTurma } from "./linha-turma";
import { MiniMapa } from "./mini-mapa";
import { alvoPropostas, ehAlvoPropostas } from "./navegacao";
import { Sobrevoo } from "./sobrevoo";
import { TrilhoResponsivo, useTrilhoEstreito } from "./trilho-responsivo";
import { useArrasto, type Alvo, type CargaArrasto } from "./usar-arrasto";
import { useFocoGrade } from "./usar-foco-grade";

/** Teto de cartões renderizados no trilho de uma vez — o custo é o CUSTO por
 *  quadro do arrasto (mais uma subárvore no hit-test de cada `pointermove`),
 *  não poupar pixel. Vivia dentro de `trilho-fila.tsx`; subiu pra cá para
 *  `useFocoGrade` (via `filaVisivel`) enxergar exatamente quais ids têm
 *  cartão montado — um id além do teto não tinha cartão nenhum na tela, mas
 *  o roving tabindex não sabia disso e podia zerar a parada de Tab da grade
 *  inteira ao apontar pra ele. */
const TETO_TRILHO = 25;

/** Espaço de largura zero (U+200B), acrescentado e retirado do fim do texto de
 *  uma região viva para o nó SEMPRE mudar. Não entra na fala: não está nos
 *  dicionários de símbolos de NVDA, JAWS ou VoiceOver, então nenhum deles
 *  verbaliza nada a mais; e não ocupa pixel — o que aqui é detalhe, as duas
 *  regiões são `sr-only`. Escrito como escape, nunca como o caractere literal:
 *  um invisível colado no código não sobrevive a uma revisão nem a um `grep`. */
const MARCA_RENOVACAO = "\u200B";

/** Id que NENHUMA equipe tem \u2014 `ia.equipes.id` \u00E9 `serial`, sempre positivo.
 *  Existe para perguntar a `linhaAtenuada` (dados.tsx) s\u00F3 a metade da regra que
 *  n\u00E3o depende da linha \u2014 "h\u00E1 destaque, e ele tem linha nesta semana?" \u2014 sem
 *  reescrever essa pergunta aqui. Ver o memo `atenuadas`, mais abaixo. */
const EQUIPE_INEXISTENTE = -1;

/**
 * Quantos cart\u00F5es a PISTA monta: a linha de "Propostas da IA" mais as c\u00E9lulas
 * das linhas de turma \u2014 exatamente os dois `map` que este componente renderiza
 * (o do trilho n\u00E3o conta, ele \u00E9 outro tab stop e vive fora da pista).
 *
 * \u00C9 contagem de N\u00D3 MONTADO, n\u00E3o regra de dom\u00EDnio, e \u00E9 por isso que mora aqui em
 * vez de `dados.tsx`: quem responde "o quadro est\u00E1 vazio?" \u00E9 quem desenha o
 * quadro, e a resposta muda se um dia a pista renderizar menos do que a grade
 * traz (como o trilho j\u00E1 faz, com `TETO_TRILHO`).
 *
 * O que ela N\u00C3O \u00E9: `idAtivo == null`. As duas coisas divergem nas duas
 * dire\u00E7\u00F5es \u2014 `idAtivo` \u00E9 nulo com a pista cheia (nenhum cart\u00E3o ainda adotado,
 * ou o \u00FAnico cart\u00E3o em voo) e pode ser n\u00E3o-nulo com a pista vazia \u2014 e amarrar a
 * rede de Tab a ele a ligaria na hora errada.
 */
function contarCartoesDaPista(grade: Grade): number {
  let total = 0;
  for (const lista of grade.propostas.values()) total += lista.length;
  for (const linha of grade.linhas) for (const celula of linha.celulas) total += celula.itens.length;
  return total;
}

/* Adjacência que precisa ficar dita, senão as duas derivam em silêncio:
   `idsDoQuadro` (em `usar-foco-grade.ts`) percorre exatamente estas mesmas duas
   fontes, e `idsDoQuadro(grade).size === 0` é equivalente a
   `contarCartoesDaPista(grade) === 0`. Não são a mesma função porque respondem a
   perguntas diferentes — lá é o universo de elegibilidade do roving tabindex,
   aqui é quantos nós este componente monta —, e só coincidem no zero. Quem
   mudar as fontes de uma tem que mudar as da outra: divergindo, a rede de Tab
   aparece com cartão na tela, ou fica escondida sem nenhum. */

/**
 * O que escrever numa região viva para o nó mudar mesmo quando a frase REPETE.
 *
 * Sem isto existe um caso de silêncio: se o texto novo for IGUAL ao que a região
 * já continha, o React não reescreve o nó, o DOM não muda, e o leitor de tela
 * não repete nada.
 *
 * A espera de 150 ms do passo (`ANUNCIO_MS`, em `usar-arrasto.ts`) é o que
 * tornou isso comum: uma ida-e-volta de setas mais rápida que ela emite UM texto
 * no fim, e esse texto descreve a célula de onde se saiu. Antes da espera, cada
 * passo de um movimento escrevia um texto diferente em sequência — mas o caso já
 * existia na BORDA, onde a frase repete por natureza: bater duas vezes no último
 * dia da semana emite a mesma frase duas vezes, e a segunda era muda. No lado
 * polite a repetição também é alcançável: uma escrita que falha, reverte e é
 * refeita para a MESMA célula produz duas vezes a mesma frase de desfecho.
 *
 * A marca ALTERNA (entra e sai), não acumula: acrescentar sempre daria o mesmo
 * texto na terceira repetição seguida e o silêncio voltaria.
 *
 * Os três limites que isto respeita: a fala não muda (nada visível nem audível
 * entra na frase); a região não é REMONTADA, só o texto do mesmo `<p>` muda —
 * inserir uma região viva junto com o texto não é anunciado de forma confiável
 * (ver `conversa.tsx`); e funciona com `aria-atomic="true"`, que relê a região
 * inteira a cada mudança e por isso não exige que a marca seja percebida como
 * conteúdo novo.
 */
function renovarAnuncio(anterior: string, texto: string): string {
  const marcado = anterior.endsWith(MARCA_RENOVACAO);
  if ((marcado ? anterior.slice(0, -1) : anterior) !== texto) return texto;
  return marcado ? texto : texto + MARCA_RENOVACAO;
}

/**
 * A frase que descreve o destaque de equipe. Fala "equipe", não "turma", de
 * propósito: ela narra o controle do nível da PÁGINA ("Destacar equipe", em
 * `controles.tsx`) que a pessoa acabou de mexer, e não o rótulo de dentro do
 * quadro — ver o comentário do canto da grade, mais abaixo.
 *
 * Pura, e é ela que serve de "valor anterior" da guarda de mudança: comparar a
 * frase pronta responde exatamente à pergunta que interessa — a narração seria
 * diferente? — sem inventar uma chave composta que precise de separador.
 */
function textoDoDestaque(nome: string | null, visivelNaSemana: boolean): string {
  if (!nome) return "Destaque de equipe removido.";
  return visivelNaSemana
    ? `${nome} em destaque. As demais equipes aparecem atenuadas no quadro.`
    : `${nome} em destaque. Nenhum serviço desta equipe nesta semana — nada atenuado.`;
}

export function QuadroSemana({
  grade,
  itens,
  equipes,
  hoje,
  semana,
  equipeFoco,
  totalAtrasados,
  semanaAtraso,
  servicosNaSemanaSemFiltro,
  selecionado,
  salvandoIds,
  desfazerPorId,
  anelErroPorId,
  resumo28dias,
  aoNavegar,
  aoIrParaAtrasados,
  aoSelecionar,
  aoAlocar,
  aoDevolver,
  aoRestaurar,
}: {
  grade: Grade;
  itens: ItemAgenda[];
  equipes: Equipe[];
  hoje: string;
  semana: string;
  /** id da equipe em destaque (seletor de `controles.tsx`), ou `null` sem
   *  destaque. Escalar de propósito: desce até `CelulaEquipe` (memo) e não
   *  pode virar objeto/função recriada a cada render, sob pena de derrubar o
   *  memo dos ~130 cartões durante o `pointermove` do arrasto. */
  equipeFoco: number | null;
  /** Da malha inteira, não só da semana visível — ver o comentário em
   *  `planejamento.tsx`. */
  totalAtrasados: number;
  /** Segunda-feira da semana do atrasado mais antigo; `null` sem nenhum. */
  semanaAtraso: string | null;
  /** Serviços cuja data cai na semana visível IGNORANDO o filtro de status —
   *  o único número que o quadro não consegue derivar de `grade` (que nasce de
   *  `visiveis`, já filtrada). Escalar de propósito, como `equipeFoco`. Serve a
   *  UMA pergunta: com a pista sem nenhum cartão, foi o filtro que escondeu a
   *  semana ou a semana está mesmo vazia? Ver a rede de Tab, no fim do arquivo. */
  servicosNaSemanaSemFiltro: number;
  selecionado: number | null;
  salvandoIds: ReadonlySet<number>;
  desfazerPorId: ReadonlyMap<number, () => void>;
  /** id → geração do último erro de escrita (`0`/ausente = nenhum). É o passo 3
   *  da reversão (spec §4): o cartão que voltou para a origem pisca um anel
   *  `--critical`. A coleção desce inteira, como `salvandoIds`, e cada cartão
   *  recebe só o escalar `anelErro` — a geração existe para que uma segunda
   *  falha do mesmo cartão dentro dos 450 ms reinicie a animação sem remontar o
   *  nó (ver `classeAnelErro`, em `cartao-servico.tsx`). */
  anelErroPorId: ReadonlyMap<number, number>;
  resumo28dias: ResumoDia[];
  aoNavegar: (semana: string) => void;
  /** Clique em "X vencidos · ir para a semana". Diferente de `aoNavegar`
   *  puro: "atrasado" só existe em `sugerido`/`aprovado` (ver `dados.tsx`),
   *  então quem chama também precisa garantir os dois no filtro de status —
   *  senão o número promete um cartão que o filtro escondeu, e o clique leva
   *  a uma semana onde ele não está na grade. */
  aoIrParaAtrasados: () => void;
  aoSelecionar: (id: number) => void;
  aoAlocar: (item: ItemAgenda, dia: string, equipe: Equipe) => void;
  aoDevolver: (item: ItemAgenda) => void;
  /** O MESMO "Restaurar padrão" de `controles.tsx` (`aoRestaurar` lá). A rede de
   *  Tab o oferece quando o filtro de status escondeu a semana inteira: sem uma
   *  saída no lugar onde o problema aparece, o gestor tem de subir a tela até os
   *  chips para desfazer o que acabou de fazer. Precisa ser estável (memoizado
   *  em `planejamento.tsx`) — ver o comentário das portas de anúncio. */
  aoRestaurar: () => void;
}) {
  const [passo, setPasso] = useState("");
  /** Desfecho da escrita E destaque de equipe, na MESMA região polite — o
   *  porquê está no comentário das regiões vivas, no fim do arquivo. */
  const [desfecho, setDesfecho] = useState("");
  const [filaExpandida, setFilaExpandida] = useState(false);
  // Fechada por padrão: a doca não deveria cobrir a grade assim que a página
  // abre no estreito. Independente de `filaExpandida` — ver o comentário em
  // `TrilhoResponsivo` sobre por que são dois eixos, não um.
  const [docaAberta, setDocaAberta] = useState(false);

  /* As duas portas de escrita das regiões vivas. Passam por `renovarAnuncio`
     (forma de atualização, para ler o texto anterior sem depender dele) e são
     ESTÁVEIS: `narrarPasso` desce para `useArrasto` como `anunciar`, que a
     embute em `aoTeclar`, que desce até os ~130 cartões — uma closure nova a
     cada render derrubaria o `memo` de todos eles no meio de um arrasto. */
  const narrarPasso = useCallback((texto: string) => {
    setPasso((anterior) => renovarAnuncio(anterior, texto));
  }, []);
  const narrarDesfecho = useCallback((texto: string) => {
    setDesfecho((anterior) => renovarAnuncio(anterior, texto));
  }, []);

  const estreito = useTrilhoEstreito();
  // Abaixo de `lg`, o trilho só é um alvo de navegação alcançável quando a
  // doca está aberta — colapsada ele é `inert` (ver `TrilhoResponsivo`).
  // Sem isto, `proximoAlvo` continuaria oferecendo "fila" como destino de
  // Shift+seta/seta simples e `validar` aceitaria, apontando para um cartão
  // que existe no DOM mas não pode receber foco.
  const filaDisponivel = !estreito || docaAberta;
  const porId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);
  const equipePorId = useMemo(() => new Map(equipes.map((e) => [e.id, e])), [equipes]);
  const equipeFocoNome = equipeFoco != null ? (equipePorId.get(equipeFoco)?.nome ?? null) : null;

  /* A regra do destaque é a de `linhaAtenuada` (dados.tsx) — a função TESTADA.
     Este arquivo reimplementava a mesma regra à mão em dois lugares (um memo de
     "o foco tem linha nesta semana" e a expressão que decidia `atenuada` por
     linha) enquanto a função não tinha consumidor de produção nenhum: duas
     cópias que concordavam, e a que rodava não era a coberta por teste.

     Um memo com o conjunto pronto, e não uma chamada solta dentro do `map` das
     linhas: `linhaAtenuada` varre `linhas` por dentro para responder "a equipe
     em foco aparece nesta semana?", então chamá-la por linha é O(n²) — e há
     render a cada quadro do `pointermove`. Cada `<LinhaTurma>` continua
     recebendo só um booleano, como antes.

     `destaqueTemLinha` é a MESMA pergunta, feita à MESMA função: com um id que
     nenhuma equipe tem, o último termo da regra (`equipeId !== focoEquipeId`) é
     sempre verdadeiro e sobra exatamente "existe destaque E ele tem linha
     aqui". Não é `atenuadas.size > 0`: com uma linha só, e ela sendo a em foco,
     nada atenua e o destaque ainda assim está na tela — o anúncio diria que a
     equipe não tem serviço na semana quando ela tem. */
  const { atenuadas, destaqueTemLinha } = useMemo(() => {
    const conjunto = new Set<number>();
    for (const linha of grade.linhas) {
      if (linhaAtenuada(linha.equipe.id, equipeFoco, grade.linhas)) conjunto.add(linha.equipe.id);
    }
    return {
      atenuadas: conjunto,
      destaqueTemLinha: linhaAtenuada(EQUIPE_INEXISTENTE, equipeFoco, grade.linhas),
    };
  }, [equipeFoco, grade.linhas]);

  /* Quem não vê a tela não percebe a opacidade das linhas atenuadas — só a
     região viva conta essa história. Ela depende de `destaqueTemLinha`, não
     só do nome: trocar de SEMANA com o MESMO destaque ativo pode fazer a equipe
     em foco ganhar ou perder a linha, e a narração precisa reavaliar nesse
     momento, não só quando o destaque em si muda.

     "É uma MUDANÇA?" é uma pergunta sobre DADO: guarda-se em estado a frase já
     vista e compara-se durante o render — o mesmo padrão de `selecionadoVisto` /
     `adotarSelecionado`, em `usar-foco-grade.ts`. O estado nasce com a frase
     atual, então o primeiro commit nunca anuncia: estado inicial não é mudança.

     O desenho anterior perguntava sobre CICLO DE VIDA — um `useRef` levantado no
     primeiro efeito para pular o primeiro commit — e falava "Destaque de equipe
     removido." com a página recém-aberta e nenhum `?equipe=` na URL: o ref
     sobrevive à dupla invocação de efeitos do StrictMode (o React monta,
     desmonta e remonta os efeitos sem recriar o ref), então na segunda passada a
     guarda já estava levantada e o efeito anunciava. O sintoma observado era de
     DESENVOLVIMENTO — em produção o StrictMode não faz isso. O padrão novo não
     depende disso para estar certo: comparar frases não pergunta em que commit
     estamos, então vale em qualquer ordem de montagem, e um remonte por outro
     motivo (troca de rota, Suspense) também não passa a narrar um destaque que
     ninguém mexeu. */
  const textoDestaque = textoDoDestaque(equipeFocoNome, destaqueTemLinha);
  const [destaqueVisto, setDestaqueVisto] = useState(textoDestaque);
  if (textoDestaque !== destaqueVisto) {
    setDestaqueVisto(textoDestaque);
    narrarDesfecho(textoDestaque);
  }

  const filaVisivel = useMemo(
    () => (filaExpandida ? grade.fila : grade.fila.slice(0, TETO_TRILHO)),
    [grade.fila, filaExpandida],
  );

  const validar = useCallback(
    (carga: CargaArrasto, alvo: Alvo): string | null => {
      if (alvo === carga.origem) return null;
      if (alvo === "fila") {
        return porId.get(carga.id)?.equipeId == null
          ? "Este serviço já está na fila."
          : null;
      }
      // Pseudo-alvo da linha "Propostas da IA" (ver `alvoPropostas`, em
      // `navegacao.ts`): nunca um destino real, `grade.porCelula` não o
      // conhece. A regra 4 da spec (§1) proíbe marcar um dia sem equipe —
      // esta é a frase literal que ela pede.
      if (ehAlvoPropostas(alvo)) return "Escolha uma equipe — um dia só é marcado com turma.";
      const celula = grade.porCelula.get(alvo);
      if (!celula) return "Essa célula não existe mais. Recarregue a página.";
      if (celula.dia < hoje) return "Esse dia já passou.";
      if (!celula.aceitaSolta) return "Essa turma está desativada e não recebe serviço novo.";
      return null;
    },
    [grade, hoje, porId],
  );

  const descrever = useCallback(
    (alvo: Alvo, carga: CargaArrasto): string => {
      if (alvo === "fila") return "Fila de decisão. Soltar aqui tira a turma.";
      const celula = grade.porCelula.get(alvo);
      if (!celula) return "";
      const equipe = equipePorId.get(celula.equipeId);
      const item = porId.get(carga.id);
      const previa = item ? previaDoMovimento(grade, item, alvo, equipes).get(alvo) : null;
      const leitura = previa ?? celula;

      return `${fmt.dataLonga(celula.dia)}. ${equipe?.nome ?? "Turma"}. ${fmt.km(leitura.km)} de ${fmt.km(celula.capacidade)} no dia.${leitura.excedida ? " Acima da capacidade." : ""}`;
    },
    [grade, equipePorId, equipes, porId],
  );

  const soltar = useCallback(
    (carga: CargaArrasto, alvo: Alvo) => {
      const item = porId.get(carga.id);
      if (!item) return;

      if (alvo === "fila") {
        aoDevolver(item);
        narrarDesfecho(`${carga.rotulo} devolvido para a fila.`);
        return;
      }

      const celula = grade.porCelula.get(alvo);
      const equipe = celula ? equipePorId.get(celula.equipeId) : undefined;
      if (!celula || !equipe) return;

      aoAlocar(item, celula.dia, equipe);
      narrarDesfecho(`${carga.rotulo} alocado para ${fmt.dataLonga(celula.dia)}, ${equipe.nome}.`);
    },
    [porId, grade, equipePorId, aoAlocar, aoDevolver, narrarDesfecho],
  );

  const navegarSemana = useCallback(
    (delta: -1 | 1) => aoNavegar(chaveDia(somarDias(semana, delta * 7))),
    [aoNavegar, semana],
  );

  const { estado, iniciar, aoTeclar, engolirClique } = useArrasto({
    grade,
    validar,
    aoSoltar: soltar,
    descrever,
    anunciar: narrarPasso,
    aoNavegarSemana: navegarSemana,
    filaDisponivel,
  });

  const emVoo =
    estado.fase === "arrastando" || estado.fase === "carregando" ? estado.carga.id : null;
  const itemEmVoo = emVoo == null ? null : (porId.get(emVoo) ?? null);
  const alvoAtual = estado.fase === "arrastando" || estado.fase === "carregando" ? estado.alvo : null;
  const recusaAtual =
    estado.fase === "arrastando" || estado.fase === "carregando" ? estado.recusa : null;

  const previa = useMemo<Map<ChaveCelula, Ocupacao>>(() => {
    if (!itemEmVoo || !alvoAtual || alvoAtual === "fila" || recusaAtual) return new Map();
    return previaDoMovimento(grade, itemEmVoo, alvoAtual, equipes);
  }, [grade, itemEmVoo, alvoAtual, recusaAtual, equipes]);

  // Roving tabindex (`idAtivo`) + restauração de foco pós-remonte: extraído
  // para `usar-foco-grade.ts` porque é a única parte deste arquivo que mexe
  // com foco/refs de DOM, e separá-la também isola as supressões do eslint
  // que essa mexida exige.
  const { idAtivo, idAtivoNoTrilho, refCartao, aoFocar } = useFocoGrade({
    grade,
    filaVisivel,
    emVoo,
    selecionado,
    filaDisponivel,
  });

  // `TrilhoFila`/`LinhaTurma` recebem `refCartao`/`aoFocar` de aridade 1 — a
  // região de cada chamador é fixa, então só falta fechar o id por chamada.
  // Estáveis porque os dois hooks são estáveis; o cache real mora neles,
  // chaveado por (região, id) — ver `usar-foco-grade.ts`.
  const refCartaoTrilho = useCallback((id: number) => refCartao("trilho", id), [refCartao]);
  const refCartaoGrid = useCallback((id: number) => refCartao("grid", id), [refCartao]);
  const aoFocarTrilho = useCallback((id: number) => aoFocar("trilho", id), [aoFocar]);
  const aoFocarGrid = useCallback((id: number) => aoFocar("grid", id), [aoFocar]);

  const desfazerDe = useCallback(
    (id: number) => desfazerPorId.get(id) ?? null,
    [desfazerPorId],
  );

  /* A REDE DE TAB da pista (spec §5, "o quadro nunca fica sem tab stop").
     Toda parada de Tab da pista é um CARTÃO — o roving tabindex só sabe apontar
     para cartão —, então sem nenhum cartão montado a pista inteira sai da ordem
     de Tab: 77 células e nada em que parar. Não é hipótese: `?status=executado`
     esvazia a grade inteira em dois cliques, porque `montarGrade` só põe em
     célula e em propostas o que está em aberto.

     A condição é a CONTAGEM DE CARTÃO MONTADO (ver `contarCartoesDaPista`, no
     alto), nunca `idAtivo == null` — as duas divergem nas duas direções, e o
     comentário da função explica.

     A spec propunha dar `tabIndex` ao "`<h4>` do primeiro grupo". Não existe
     `<h4>` no quadro, e o rótulo do grupo em `celula-equipe.tsx` é um `<span
     aria-hidden="true">`: focar um nó `aria-hidden` é violação e não anuncia
     nada. Daí um nó próprio.

     Ele fica DENTRO da pista e como ÚLTIMO item da grade (`col-span-full`,
     que é `grid-column: 1 / -1` — a grade tem 8 colunas), não acima dela: assim
     chegar nele por Tab ROLA a pista para a vista, o que um aviso pendurado
     fora do rolador não faria.

     Sem `role="status"` nem nenhuma região viva: o nó troca de texto a cada
     mudança de semana, e uma região viva narraria isso por cima do movimento em
     curso. Quem lê a frase é quem chega nela por Tab — por isso `tabIndex={0}` e
     nome acessível, e nada de foco automático. */
  const cartoesDaPista = useMemo(() => contarCartoesDaPista(grade), [grade]);

  /* As duas frases, e a diferença entre elas é o valor real desta rede: hoje o
     gestor desmarca dois chips, vê a semana branca e conclui que não há serviço
     nenhum para planejar. Se a pista está vazia e a semana TEM serviço, ele está
     todo fora do filtro — não há terceira explicação, porque serviço em aberto
     com data na janela sempre ganha lugar (célula, se tem turma; propostas, se
     não tem).

     A segunda frase fala em "data nesta semana", não em "serviço nesta semana",
     e a diferença é medida: uma fatia de CONTINUAÇÃO (serviço que começou antes
     da segunda e se estende para dentro da janela) carrega km numa célula sem
     desenhar cartão nenhum — ver `Celula.continuacoes`, em `dados.tsx`. A rede
     ainda tem de aparecer, porque não há cartão em que parar, e a frase continua
     verdadeira: a data daquele serviço está na semana anterior, e é isso que
     `servicosNaSemanaSemFiltro` mede. */
  const vazio =
    cartoesDaPista > 0
      ? null
      : servicosNaSemanaSemFiltro > 0
        ? {
            icone: <FilterX />,
            titulo: "O filtro de status esconde a semana inteira.",
            descricao: `Esta semana tem ${fmt.contar(servicosNaSemanaSemFiltro, "serviço")}, e nenhum deles está nos status escolhidos agora.`,
          }
        : {
            icone: <CalendarDays />,
            titulo: "Nenhum serviço com data nesta semana.",
            descricao:
              "Arraste um cartão da fila de decisão para um dia e uma turma, ou navegue para outra semana.",
          };

  const idTitulo = useId();

  return (
    <section aria-labelledby={idTitulo} className="flex min-w-0 flex-col gap-3">
      {/* `linha-do-tempo.tsx`/`fila-decisao.tsx` (apagados) tinham cada um o
          próprio `<h2>`; sem eles a página pulava de `<h1>` direto para o
          `<h3>` do trilho — um vão que só quem navega por cabeçalhos sente.
          `sr-only` porque o cabeçalho visual já é a navegação de semana logo
          abaixo; o texto existe para a árvore de heading, não para a tela. */}
      <h2 id={idTitulo} className="sr-only">
        Quadro da semana
      </h2>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <BotaoIcone rotulo="Semana anterior" tamanho="sm" onClick={() => navegarSemana(-1)}>
            <ChevronLeft />
          </BotaoIcone>
          {/* Sem `aria-live`, de propósito: esta faixa é o RÓTULO do controle que
              a própria pessoa acabou de acionar (‹, ›, Hoje, ou uma coluna do
              mini-mapa), o foco permanece no botão e o passo do movimento já
              narra a chegada. Viva, ela só competia com as duas regiões do fim do
              arquivo — um Shift+seta durante um movimento por teclado disparava
              três anúncios de uma vez. */}
          <p className="tnum min-w-0 font-mono text-sm text-ink">
            {fmt.dataCurta(grade.janela.inicio)} – {fmt.dataMedia(grade.janela.fim)}
          </p>
          <BotaoIcone rotulo="Próxima semana" tamanho="sm" onClick={() => navegarSemana(1)}>
            <ChevronRight />
          </BotaoIcone>
          <Botao
            tamanho="sm"
            variante="fantasma"
            onClick={() => aoNavegar(chaveDia(inicioDaSemana(hoje)))}
          >
            Hoje
          </Botao>

          {totalAtrasados > 0 && semanaAtraso ? (
            <Botao
              tamanho="sm"
              variante="perigo"
              iconeEsquerda={<OctagonAlert />}
              onClick={aoIrParaAtrasados}
            >
              {fmt.contar(totalAtrasados, "vencido")} · ir para a semana
            </Botao>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col items-start gap-2">
          <Legenda
            itens={ORDEM_RISCO.map((risco) => ({
              rotulo: RISCO[risco].rotulo,
              cor: RISCO[risco].cor,
              icone: <IconeDominio nome={RISCO[risco].icone} />,
            }))}
          />
          <p className="text-2xs text-ink-3">
            Hachura vermelha marca o dia em que a equipe passa da capacidade.
          </p>
        </div>
      </div>

      <MiniMapa
        resumos={resumo28dias}
        janela={grade.janela.dias}
        aoEscolherSemana={(dia) => aoNavegar(chaveDia(inicioDaSemana(dia)))}
      />

      <div className="flex min-w-0 overflow-hidden rounded-lg border border-border bg-surface">
        <TrilhoResponsivo
          docaAberta={docaAberta}
          aoAlternarDoca={() => setDocaAberta((atual) => !atual)}
          itens={filaVisivel}
          total={grade.fila.length}
          expandido={filaExpandida}
          aoExpandir={() => setFilaExpandida(true)}
          janelaFim={grade.janela.fim}
          realcado={alvoAtual === "fila" && !recusaAtual}
          idEmVoo={emVoo}
          idAtivo={idAtivoNoTrilho}
          selecionado={selecionado}
          salvandoIds={salvandoIds}
          anelErroPorId={anelErroPorId}
          aoPegar={iniciar}
          aoTeclar={aoTeclar}
          aoAbrir={aoSelecionar}
          engolirClique={engolirClique}
          refCartao={refCartaoTrilho}
          aoFocar={aoFocarTrilho}
        />

        <div className="quadro-pista scroll-thin max-h-[min(78vh,760px)] min-w-0 flex-1">
          <div
            className="quadro-grade"
            style={{ "--linhas": Math.max(1, grade.linhas.length) } as React.CSSProperties}
          >
            {/* Três valores de z-index, escolhidos para o canto vencer sempre:
                canto (grudado nos dois eixos) = 30; eixo horizontal grudado
                (calha da equipe, em toda linha, inclusive a de "Propostas")
                = 10; eixo vertical grudado (cabeçalho do dia, em
                `cabecalho-dia.tsx`) = 20. 30 > 20 e 30 > 10 nas duas
                direções — sem essa folga o canto seria recortado numa das
                rolagens, a depender só da ordem do DOM.

                O canto NÃO leva `data-obstaculo`, embora grude nos dois eixos: o
                cabeçalho do dia já reserva a faixa de cima e a calha a da
                esquerda, por borda fica o MAIOR (ver `usar-arrasto.ts`), e o canto
                não é mais alto que um cabeçalho nem mais largo que uma calha —
                marcá-lo não mudaria um pixel dos insets. */}
            <div className="sticky top-0 left-0 z-30 border-r border-b border-border bg-surface px-2 py-1.5">
              {/* "Turma", não "Equipe": dentro do quadro o rótulo de interface é
                  TURMA — é o que dizem a calha ao lado (`sem turma`), os textos de
                  recusa e a ajuda do trilho, e duas palavras para a mesma coisa na
                  MESMA faixa de cabeçalho não têm defesa. "Equipe" continua sendo
                  o nome da ENTIDADE no código (`Equipe`, `equipeId`, `ia.equipes`)
                  e o rótulo dos controles no nível da PÁGINA ("Destacar equipe",
                  "Equipes mobilizadas"), que não são parte do quadro. */}
              <span className="block text-2xs tracking-widest text-ink-3 uppercase">Turma</span>
            </div>

            {grade.janela.dias.map((dia, i) => (
              <CabecalhoDia key={dia} dia={dia} hoje={hoje} resumo={grade.porDia[i]} />
            ))}

            {/* `data-obstaculo="esquerda"`: esta calha é `sticky left-0` na mesma
                coluna de 144px, DENTRO da `.quadro-pista`, então come a faixa
                esquerda da área em que se solta um cartão — mesma convenção do
                cabeçalho do dia e da calha da turma (ver `usar-arrasto.ts`).
                Marcar aqui também, e não só em `linha-turma.tsx`, não é
                redundância: quando nenhuma turma ganha linha na semana (filtro de
                equipes, ou toda turma desativada e sem serviço na janela — ver
                `equipesComLinha`), esta é a ÚNICA calha na tela, e sem o atributo
                os 144px ficariam sem inset. */}
            <div
              data-obstaculo="esquerda"
              className="sticky left-0 z-10 border-r border-b border-border bg-surface px-2 py-1.5"
            >
              <span className="block text-2xs font-medium text-ink-2">Propostas da IA</span>
              <span className="block text-2xs text-ink-3">sem turma</span>
            </div>

            {grade.janela.dias.map((dia) => {
              // A linha de Propostas nunca aceita solta (regra 4, spec §1):
              // soltar aqui marcaria um dia sem equipe. `data-celula-recusada`
              // deixa o hit-test do ponteiro reconhecer a região SEM que ela
              // vire um alvo válido — o mesmo atributo que `CelulaEquipe` usa
              // para célula passada/turma desativada, ver `usar-arrasto.ts`.
              const alvo = alvoPropostas(dia);
              const recusadaAqui = alvoAtual === alvo && recusaAtual != null;
              return (
                <div
                  key={`prop-${dia}`}
                  data-celula-recusada={alvo}
                  className={cn(
                    "border-b border-l border-grid p-1.5",
                    recusadaAqui && "ring-2 ring-ink-3 ring-inset cursor-not-allowed",
                  )}
                >
                  <ul className="flex min-w-0 flex-col gap-1">
                    {(grade.propostas.get(dia) ?? []).map((item) => (
                      <CartaoServico
                        key={item.id}
                        item={item}
                        origem="fila"
                        compacto
                        fantasma={item.id === emVoo}
                        selecionado={item.id === selecionado}
                        salvando={salvandoIds.has(item.id)}
                        anelErro={anelErroPorId.get(item.id) ?? 0}
                        ativo={item.id === idAtivo}
                        desfazer={null}
                        aoPegar={iniciar}
                        aoTeclar={aoTeclar}
                        aoAbrir={aoSelecionar}
                        engolirClique={engolirClique}
                        refCartao={refCartao("propostas", item.id)}
                        aoFocar={aoFocar("propostas", item.id)}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}

            {grade.linhas.map((linha) => (
              <LinhaTurma
                key={linha.equipe.id}
                linha={linha}
                atenuada={atenuadas.has(linha.equipe.id)}
                previa={previa}
                alvoAtual={alvoAtual}
                recusaAtual={recusaAtual}
                emVoo={emVoo}
                selecionado={selecionado}
                idAtivo={idAtivo}
                salvandoIds={salvandoIds}
                anelErroPorId={anelErroPorId}
                aoPegar={iniciar}
                aoTeclar={aoTeclar}
                aoAbrir={aoSelecionar}
                engolirClique={engolirClique}
                refCartao={refCartaoGrid}
                aoFocar={aoFocarGrid}
                desfazerDe={desfazerDe}
              />
            ))}

            {vazio ? (
              /* `role="group"` e não `status`/`region`: um grupo focável anuncia
                 o próprio nome ao receber foco e não entra no rotor de
                 landmarks nem interrompe fala nenhuma. O nome repete título e
                 descrição porque é a frase inteira que precisa chegar a quem
                 ouve — o texto visível é o mesmo, palavra por palavra. */
              <div
                role="group"
                tabIndex={0}
                aria-label={`${vazio.titulo} ${vazio.descricao}`}
                className="col-span-full p-3"
              >
                <EstadoVazio
                  icone={vazio.icone}
                  titulo={vazio.titulo}
                  descricao={vazio.descricao}
                  acao={
                    servicosNaSemanaSemFiltro > 0 ? (
                      <Botao
                        tamanho="sm"
                        variante="fantasma"
                        iconeEsquerda={<RotateCcw />}
                        onClick={aoRestaurar}
                      >
                        Restaurar padrão
                      </Botao>
                    ) : null
                  }
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Sobrevoo estado={estado} item={itemEmVoo} />

      {/* DUAS regiões vivas, e a divisão é por urgência, não por assunto.

          `assertive` é só o passo do movimento: ele INTERROMPE, porque um passo
          que chega depois do próximo descreve uma célula onde o cartão já não
          está. Nada mais entra aqui.

          `polite` é uma região só para desfecho da escrita E destaque de equipe.
          As duas coisas narram desfecho e nunca precisam soar juntas; com duas
          regiões polite montadas ao mesmo tempo, duas mensagens quase simultâneas
          COMPETEM em vez de enfileirar. Numa região só, a segunda espera a
          primeira terminar — que é o comportamento certo.

          O preço de uma região só é que o último a escrever vence DENTRO de um
          mesmo commit, e isso custa algo em UM caso: se uma solta muda o destaque
          no mesmo evento — o destaque aponta para uma turma desativada e o serviço
          movido era o último dela na semana, o único jeito de `destaqueTemLinha`
          virar, já que turma ativa sempre tem linha — a frase do destaque cobre a
          do desfecho, porque a guarda do destaque roda no render que a própria
          solta provocou. Aceitável: a frase que sobra descreve a consequência da
          mesma ação ("nenhum serviço desta equipe nesta semana"), e o cartão
          mudou de lugar na tela. Duas regiões não consertavam isso — trocavam por
          duas falas disputando o canal, que é justamente o que se veio corrigir.

          As duas ficam MONTADAS desde o início, com texto vazio: inserir uma
          região viva junto com o texto não é anunciado de forma confiável (ver
          `conversa.tsx`). Por isso também é que a repetição de frase precisa de
          `renovarAnuncio` em vez de um remonte. */}
      <p aria-live="assertive" aria-atomic="true" className="sr-only">
        {passo}
      </p>
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {desfecho}
      </p>
    </section>
  );
}
