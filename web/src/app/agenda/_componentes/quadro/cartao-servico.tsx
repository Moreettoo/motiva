"use client";

import { memo } from "react";
import { CircleSlash, GripVertical, OctagonAlert, Undo2 } from "lucide-react";

import { Chip } from "@/components/ui/chip";
import { IconeDominio } from "@/components/viz/legenda";
import { RISCO, STATUS } from "@/lib/dominio";
import { fmt, relativoEmDias } from "@/lib/format";
import { cn } from "@/lib/utils";

import { textoServico, type ItemAgenda } from "../dados";
import type { Alvo, CargaArrasto } from "./usar-arrasto";

export function cargaDoItem(item: ItemAgenda, origem: Alvo): CargaArrasto {
  const t = item.ag.trecho;
  return {
    id: item.id,
    origem,
    rotulo: `${t.rodovia}, ${fmt.faixaKm(Number(t.km_inicio), Number(t.km_fim))}`,
  };
}

/**
 * Qual classe de anel de erro o cartão veste, dada a GERAÇÃO de erro dele
 * (`0` = nenhum erro; ver `anelErroPorId`, em `planejamento.tsx`).
 *
 * Alterna entre duas classes de propósito. Uma animação CSS não reinicia porque
 * a classe já está aplicada, então uma segunda falha do MESMO cartão dentro dos
 * 450 ms não piscaria nada: o anel estaria lá, parado no fim da animação, com
 * `opacity: 0`. Trocar a classe troca o `animation-name` (as duas keyframes de
 * `globals.css` são idênticas e existem só para isso) e o navegador reinicia.
 *
 * O que isto evita é um remonte: `key` novo reiniciaria a animação também, e
 * levaria o foco embora junto, a restauração de foco desta grade é delicada
 * (ver `usar-foco-grade.ts`).
 */
export function classeAnelErro(geracao: number): string | null {
  if (geracao <= 0) return null;
  return geracao % 2 === 1 ? "anel-erro" : "anel-erro-alt";
}

function rotuloCompleto(item: ItemAgenda): string {
  const t = item.ag.trecho;
  const partes = [
    `${t.rodovia}, ${fmt.faixaKm(Number(t.km_inicio), Number(t.km_fim))}, ${t.uf}`,
    `Roçada para ${fmt.dataMedia(item.data)}`,
    `Situação: ${STATUS[item.status].rotulo}`,
    `Risco: ${RISCO[item.risco].rotulo}`,
    `Estimativa: ${textoServico(item.diasServico)}`,
    item.equipeNome ? `Equipe: ${item.equipeNome}` : "Sem equipe atribuída",
  ];
  // O botão tem `aria-label` explícito: qualquer texto visível dentro dele
  // (o chip "Vencida", por exemplo) é IGNORADO no cálculo do nome acessível.
  // Por isso o aviso de atraso entra aqui, não só no chip visual abaixo.
  if (item.atrasado) partes.push("Data vencida");
  // Os DOIS, e não o que o chip escolheu mostrar: o cartão tem quatro linhas e
  // precisa priorizar, mas uma frase falada não tem esse limite, omitir aqui
  // esconderia de quem usa leitor de tela um fato que a tela só não mostra por
  // falta de espaço.
  if (item.dispensavel) partes.push("O trecho não precisa mais desta roçada");
  return partes.join(". ");
}

export const CartaoServico = memo(function CartaoServico({
  item,
  origem,
  compacto = false,
  fantasma,
  selecionado,
  salvando,
  anelErro,
  ativo,
  desfazer,
  aoPegar,
  aoTeclar,
  aoAbrir,
  engolirClique,
  refCartao,
  aoFocar,
}: {
  item: ItemAgenda;
  origem: Alvo;
  compacto?: boolean;
  /** O cartão saiu para o sobrevoo: reserva a caixa e some, sem colapsar a linha. */
  fantasma: boolean;
  /** Este é o serviço aberto na gaveta de detalhe agora, não tem relação com o
   *  arrasto. Pinta o anel de seleção do cartão; quem decide qual id está
   *  selecionado é `painel-agendamento.tsx`, este componente só reflete. */
  selecionado: boolean;
  salvando: boolean;
  /** Geração do último erro de escrita DESTE serviço (`0` = nenhum). Escalar de
   *  propósito, como `salvando`: ~130 cartões dependem do `memo`, e um valor
   *  recriado a cada render derrubaria todos no meio de um `pointermove`. Quem
   *  conta as gerações e apaga o anel depois de 450 ms é `planejamento.tsx`. */
  anelErro: number;
  /** Roving tabindex da grade: só o cartão ativo entra no Tab (os outros ~129
   *  ficam em -1). Calculado em `usar-foco-grade.ts`; este componente só
   *  consome o resultado pronto. */
  ativo: boolean;
  desfazer: (() => void) | null;
  aoPegar: (e: React.PointerEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoTeclar: (e: React.KeyboardEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoAbrir: (id: number) => void;
  engolirClique: (e: React.MouseEvent) => void;
  refCartao: (no: HTMLElement | null) => void;
  /** Dispara quando QUALQUER controle interno (alça ou botão de detalhe)
   *  recebe foco: via Tab, clique do mouse, ou o cursor virtual de um
   *  leitor de tela. Promove este cartão a ativo da sua região; ver
   *  `usar-foco-grade.ts`. No `<li>`, não em cada botão: `onFocus` do React
   *  delega para `focusin`, que sobe pelos dois controles igual. */
  aoFocar: () => void;
}) {
  const token = RISCO[item.risco];
  const encerrado = item.status === "executado" || item.status === "descartado";
  const carga = cargaDoItem(item, origem);
  const t = item.ag.trecho;
  const tabIndex = ativo ? 0 : -1;

  /* PREENCHIMENTO RESERVADO À CRÍTICA, a decisão de cor deste componente.
     Ver `docs/superpowers/specs/2026-08-14-agenda-clean-design.md`, §4.

     Antes todo cartão era preenchido com a cor do risco. Com quatro faixas e
     algumas dezenas de cartões na tela, o quadro virava um campo de cor onde
     NADA se destaca porque tudo está pintado, o oposto do que uma escala de
     status serve para fazer.

     A primeira tentativa de conserto foi cartão neutro com a tarja em
     `token.cor`, e a medição a reprovou: no tema claro, `--warning` sobre
     branco dá 1,83:1 e `--serious` dá 2,64:1, abaixo do piso de 3:1 para
     elemento gráfico. Não é surpresa, `globals.css` avisa que os dois ficam
     abaixo de 3:1 DE PROPÓSITO, e a mitigação é ícone + rótulo. O que isso
     revela é que o preenchimento suave nunca foi enfeite: era ele que carregava
     o risco no claro.

     O desenho que sobreviveu à medição usa `token.tinta`, o passo legível da
     escala, como cor da tarja e do ícone. Medido sobre `--surface-2`:
     6,90 a 7,54:1 no claro, 7,60 a 10,76:1 no escuro. Passa nos dois temas, nas
     quatro faixas, com folga.

     E o preenchimento fica só na CRÍTICA, que é onde alarme é a mensagem certa.
     Medido no cartão crítico: tarja `--critical` sobre `--critical-soft` 3,92:1
     no claro e 3,59:1 no escuro (piso 3,0); texto `--critical-ink` 5,96:1 e
     7,60:1 (piso 4,5).

     Quem DELIMITA o cartão é a tarja, não a borda: cartão `--surface-2` sobre
     célula `--surface` é quase o mesmo tom no claro, e nenhuma borda tintada
     resolve isso: medi `token.tinta` a 35%, 45% e 55% e o melhor caso no claro
     é 2,89:1, abaixo do piso. A borda fica em `--border`, que é o que todo o
     resto do sistema usa sobre `--surface`; a tarja sólida de 4 px a 7:1 é a
     aresta forte, e ela carrega o risco de quebra. */
  const critico = !encerrado && item.risco === "critica";
  const fundo = encerrado ? "var(--surface-3)" : critico ? token.fundo : "var(--surface-2)";
  const tinta = encerrado ? "var(--ink-2)" : critico ? token.tinta : "var(--ink)";
  const corDaTarja = critico ? token.cor : token.tinta;

  /* A PEGA DO ARRASTO É O CARTÃO INTEIRO, não os 20px da alça.
     Mirar uma tira de 20px para mover um serviço era o gesto mais caro do
     quadro, e ela nunca foi a fonte do arrasto, só a superfície que o
     disparava. O gesto continua saindo do MESMO `aoPegar`; o que mudou foi
     onde ele começa.

     No `<div>`, e não no botão de detalhe: o filete de risco e o selo "2 d" não
     são botão, e um cartão que arrasta em toda parte MENOS em duas faixas suas
     é o mesmo defeito de mira em ponto pequeno. Como o `pointerdown` da alça
     BORBULHA até aqui, ela deixou de ter handler próprio, dois no mesmo gesto
     chamariam `iniciar` duas vezes.

     Clicar continua abrindo a gaveta, e não por sorte: `iniciar` só COMPROMETE
     o gesto depois de 8px (mouse/caneta) ou 250ms parado (toque). Abaixo disso
     nada acontece e o `click` segue para o botão de detalhe; acima, o gesto vira
     arrasto e o `click` que o fecha não abre nada: medido no Chrome, ele nem
     chega ao cartão, porque `comprometer()` captura o ponteiro no `<html>` e o
     `click` é redirecionado para lá. `engolirClique` continua montado para os
     fins de gesto em que ele CHEGA (é dele o `onClickCapture` do botão de
     detalhe), e agora com muito mais superfície para cobrir do que quando só
     valia para quem soltava em cima da alça.

     O TOQUE é a exceção, e é limite do navegador, não escolha: para o dedo
     arrastar em vez de rolar, o elemento precisa de `touch-action: none` já no
     `touchstart`, decidido antes de qualquer temporizador nosso. Com isso no
     cartão inteiro, a pista (que rola nos dois eixos e é quase toda coberta por
     cartão) perderia o gesto de rolagem no celular. Então no toque a pega
     continua sendo a alça, que é quem carrega `touch-none`; no ponteiro que não
     é dedo, o cartão todo. */
  const arrastavel = !encerrado && !salvando;

  function pegarNoCartao(evento: React.PointerEvent<HTMLElement>) {
    const alvo = evento.target as Element;
    if (evento.pointerType === "touch" && !alvo.closest("[data-alca]")) return;

    aoPegar(evento, carga);

    /* `iniciar` chama `preventDefault()` no `pointerdown`, e com isso some o
       foco que o clique daria sozinho. Ele importa DEPOIS do clique: a gaveta
       guarda `document.activeElement` ao abrir e o devolve ao fechar
       (`painel-lateral.tsx`), sem isto ela devolveria para o `<body>` e o Tab
       recomeçaria do topo da página, em vez de voltar para o cartão que a
       pessoa acabou de abrir. Repõe exatamente o que o navegador faria: o botão
       pressionado; ou o de detalhe quando o ponteiro caiu no filete de risco ou
       no selo "2 d", que não são botão nenhum e nativamente não focariam nada.
       `preventScroll` porque o alvo já está sob o ponteiro: não há o que trazer
       para a vista, e rolar aqui moveria a pista debaixo do gesto. */
    const foco =
      alvo.closest<HTMLElement>("button") ??
      evento.currentTarget.querySelector<HTMLElement>("[data-detalhe]");
    foco?.focus({ preventScroll: true });
  }

  /* O `relative` do `<li>` abaixo existe para o ANEL DE ERRO: `.anel-erro::after`
     é `position: absolute` e, sem ancestral posicionado, sobe até o viewport.
     Fica no `<li>` porque o `<div>` de dentro tem `overflow-hidden`, o filete de
     risco e os cantos arredondados dependem dele, e uma caixa que recorta corta
     um pseudoelemento em `inset: -2px`.

     Consequência aceita: com o "Desfazer" montado, o anel envolve o `<li>`
     inteiro, botão incluso. Só acontece dentro dos 8 s de um desfazer já
     oferecido: uma alocação que deu certo e uma escrita seguinte que falhou, ou
     o próprio desfazer falhando, e o anel continua dizendo a verdade: os dois
     pertencem a ESTE serviço. Encolher o anel para só o cartão custaria um nó
     posicionado a mais em cada um dos ~130 cartões.

     Nada mais muda de lugar: o `<div>` interno já era `relative`, então o selo
     "2 d" continua se resolvendo contra ele, e o `<li>` posicionado pinta na
     mesma camada em que o `<div>` já pintava. */
  return (
    <li
      aria-busy={salvando || undefined}
      style={{ visibility: fantasma ? "hidden" : undefined }}
      className={cn("relative min-w-0", classeAnelErro(anelErro))}
      onFocus={aoFocar}
    >
      {/* Container puro na ÁRVORE DE ACESSIBILIDADE: nenhum papel, nenhum
          tabIndex, nenhum onKeyDown aqui. Um <button> (abrir detalhe) dentro de
          um role="button" (o antigo host de foco) era aninhamento interativo,
          indefinido entre leitores de tela. Os dois controles reais continuam
          irmãos: a alça e o botão de detalhe, nessa ordem no DOM.
          O `onPointerDown` que ele ganhou não desfaz isso, um ouvinte de
          ponteiro não cria papel, nome nem parada de Tab, e todo o caminho de
          teclado do arrasto segue na alça. Ele é a superfície de MIRA do mouse,
          e só ela. */}
      {/* Cartão encerrado em `ink-2`, não `ink-3`: medido, `ink-3` sobre
          `surface-3` dá 4,57:1 no claro e 4,14:1 no escuro, abaixo do piso de
          4,5:1 para texto pequeno, e este cartão carrega rodovia, faixa de km e
          prazo em `text-2xs`. `ink-2` sobre o mesmo fundo dá 5,55:1 e 7,12:1.
          Subir um passo na escada de tinta em vez de mexer no token: `--ink-3` é
          consumido em toda a base e mudá-lo obrigaria a remedir cada par. Mesma
          correção já aplicada no cabeçalho do dia (ver `cabecalho-dia.tsx`). */}
      <div
        onPointerDown={arrastavel ? pegarNoCartao : undefined}
        style={{
          backgroundColor: fundo,
          color: tinta,
          // Só o cartão crítico ganha borda tintada, e ela é reforço do
          // preenchimento, não o delimitador, ver a nota de cor acima.
          borderColor: critico
            ? `color-mix(in oklab, ${token.cor} 55%, transparent)`
            : "var(--border)",
        }}
        className={cn(
          "group relative flex min-w-0 items-stretch gap-1 overflow-hidden rounded-sm border",
          "transition-transform duration-150 ease-[var(--ease-out-quint)] hover:-translate-y-px",
          // `cursor` HERDA, então o valor posto aqui vale para o botão de
          // detalhe e para o filete junto, que é o ponto: a mão aberta agora
          // anuncia o cartão inteiro, e não uma tira de 20px. Durante o gesto
          // quem manda é `html[data-arrastando] { cursor: grabbing }`, em
          // `globals.css`, que cobre a tela toda.
          arrastavel && "cursor-grab",
          salvando && "cursor-wait",
          selecionado && "ring-2 ring-accent",
        )}
      >
        <span
          aria-hidden="true"
          className="w-1 shrink-0"
          style={{ backgroundColor: corDaTarja, opacity: encerrado ? 0.45 : 1 }}
        />

        {encerrado ? null : (
          <button
            ref={refCartao}
            type="button"
            /* O que a alça ainda é, agora que o cartão inteiro arrasta: a pega
               do TOQUE (é ela que carrega `touch-none`, e por isso o
               `pointerdown` de dedo só vira arrasto quando começa aqui, ver
               `pegarNoCartao`), o alvo do roving tabindex (`refCartao`), a
               entrada do movimento por teclado (`onKeyDown`) e o único sinal
               VISÍVEL de que o serviço se move. O `onPointerDown` saiu: o
               evento borbulha para o `<div>`, que é quem chama `iniciar`. */
            data-alca=""
            /* Rótulo com faixa de km, não só a rodovia: com 50 trechos, vários
               cartões da mesma rodovia coexistem na tela, e "Arrastar BR-101"
               repetido não desambigua nada na navegação por lista do leitor
               de tela. `carga.rotulo` já é essa frase, reaproveitada. */
            aria-label={`Arrastar ${carga.rotulo}`}
            aria-roledescription="serviço arrastável"
            aria-disabled={salvando || undefined}
            tabIndex={tabIndex}
            /* Sem handler em vez de `disabled`: um botão `disabled` sai da
               árvore de foco, e este é o nó que `refCartao` entrega para o
               roving tabindex (`usar-foco-grade.ts`) focar programaticamente
               ao navegar pela grade. Se a escrita ainda estiver em voo bem
               quando este cartão for o "ativo", `disabled` faria o `.focus()`
               falhar em silêncio e destravar o teclado do resto da grade.
               `aria-disabled` avisa o leitor de tela sem tirar o nó do lugar. */
            onKeyDown={salvando ? undefined : (evento) => aoTeclar(evento, carga)}
            /* A alça é `text-current` sobre o fundo do cartão, então a
               `opacity` do botão compõe as duas: a cor efetiva é
               `tinta*a + fundo*(1-a)`. O piso é o 3:1 de WCAG 1.4.11
               (informação visual necessária para IDENTIFICAR um componente de
               interface, a alça é o que identifica o controle de arrastar; ela
               é `aria-hidden` e o nome acessível vive no `<button>`, então não
               cai no piso de texto).

               As medições MUDARAM com o cartão neutro, e para melhor: `current`
               agora é `--ink` na maioria dos cartões, não a tinta de um risco
               sobre um fundo daquele mesmo risco. Medido a 70% (repouso), pior
               caso de cada tema:

                                      claro     escuro
                 cartão neutro         7,20      8,22
                 cartão crítico        3,52      4,42

               Os dois passam com folga onde antes 70% era o MÍNIMO aceitável
               (3,23:1 no claro). O sobrevoo continua em 100%, 19,16:1 e
               15,69:1 no neutro, porque ele é um PASSO percebido, não uma
               correção de contraste.

               A alça existe porque é DESCOBRÍVEL, ao contrário da pressão longa
               (spec §3): quem não passa o mouse (toque, ou olho de passagem)
               precisa ver que o cartão se arrasta.

               O `opacity-30` de "salvando" fica: está longe do piso, mas neste
               estado o botão tem `aria-disabled`, nenhum `onKeyDown`, e o
               `<div>` que o contém já não chama `iniciar` (`arrastavel` inclui
               `!salvando`), então o `pointerdown` que borbulha daqui não vira
               arrasto nenhum, e 1.4.11 dispensa componente INATIVO. O estado
               dura uma ida ao servidor e tem outro canal: o `animate-pulse` do
               ícone. */
            className={cn(
              "flex w-5 shrink-0 touch-none items-center justify-center text-current",
              salvando ? "cursor-wait opacity-30" : "cursor-grab opacity-70 group-hover:opacity-100",
            )}
          >
            <GripVertical aria-hidden="true" className={cn("size-3.5", salvando && "animate-pulse")} />
          </button>
        )}

        <button
          ref={encerrado ? refCartao : undefined}
          type="button"
          /* Onde `pegarNoCartao` repõe o foco quando o ponteiro desce sobre uma
             parte do cartão que não é botão (o filete de risco, o selo "2 d"). */
          data-detalhe=""
          aria-label={rotuloCompleto(item)}
          aria-pressed={selecionado}
          tabIndex={tabIndex}
          onClick={aoAbrir.bind(null, item.id)}
          onClickCapture={engolirClique}
          /* O cursor REPETE o do `<div>` em vez de herdá-lo, e não é redundância:
             a folha do navegador carimba `cursor: default` em `button`, o que
             corta a herança justo no nó que ocupa quase todo o cartão. Medido no
             Chrome com o pai já em `grab`: `getComputedStyle(botão).cursor` volta
             `"default"`. Sem esta linha a mão aberta só apareceria no filete de
             4px e no selo "2 d", a descoberta do arrasto continuaria presa a
             alvos minúsculos, que é o que esta mudança existe para acabar. */
          className={cn(
            "min-w-0 flex-1 py-1.5 pr-2 text-left",
            arrastavel && "cursor-grab",
            salvando && "cursor-wait",
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {/* O ícone leva a tinta do RISCO mesmo no cartão neutro, onde o
                texto é `--ink`: é ele, junto com a tarja, que distingue alta de
                média sem depender de preenchimento. A regra da skill `dataviz`
                continua valendo dos dois lados, as três formas são diferentes
                (`OctagonAlert`, `TriangleAlert`, `Clock`) e a legenda do
                cabeçalho as nomeia, então a cor nunca aparece sozinha. */}
            <IconeDominio
              nome={encerrado ? STATUS[item.status].icone : token.icone}
              className="size-3.5 shrink-0"
              style={encerrado ? undefined : { color: token.tinta }}
            />
            <span className="block truncate text-2xs font-medium">{t.rodovia}</span>
            {/* Compacto (linha "Propostas da IA") não tem altura sobrando para
                o chip de baixo: só o ícone, decorativo, `rotuloCompleto`
                acima já carrega "Data vencida" no nome acessível do botão,
                então nada se perde para quem usa leitor de tela. */}
            {compacto && item.atrasado ? (
              // `title` no `<span>`, não no ícone: `LucideProps` não aceita
              // `title` (colidiria com o `<title>` de acessibilidade do
              // próprio SVG). Quem passa o mouse por cima vê a dica; quem usa
              // leitor de tela já tem "Data vencida" em `rotuloCompleto`.
              <span aria-hidden="true" title="Data vencida">
                <OctagonAlert className="size-3 shrink-0 text-critical-ink" />
              </span>
            ) : null}
          </span>

          {/* Sem `opacity` nestas duas linhas, e não é preferência: `opacity` num
              <span> de TEXTO compõe a tinta com o fundo, e o par efetivo cai muito
              abaixo do piso de 4,5:1. No cartão encerrado, já com a tinta subida
              para `ink-2`: 3,62:1 a 80% e 2,99:1 a 70% no claro, 5,08:1 e 4,24:1 no
              escuro (a 70% falha nos dois temas). Nos cartões ativos, com a tinta
              de risco sobre o fundo suave, é pior, no claro os quatro riscos ficam
              entre 3,23 e 4,29:1 a 80%, e entre 3,23 e 3,52:1 a 70%.
              São faixa de km, carga em km e prazo: texto informativo, não enfeite,
              e é a informação que decide o serviço. A hierarquia dentro do cartão
              não depende da veladura, ela já vem do peso e da família (rodovia em
              `font-medium`, estes dois em `font-mono`), o mesmo argumento escrito na
              escada de tinta de `cabecalho-dia.tsx`. Não há token intermediário
              para atenuar sem cobrar contraste. */}
          {compacto ? null : (
            <span className="tnum mt-0.5 block truncate font-mono text-2xs">
              {fmt.faixaKm(Number(t.km_inicio), Number(t.km_fim))}
            </span>
          )}

          {compacto ? null : (
            <span className="chip-km tnum mt-0.5 block truncate font-mono text-2xs">
              {fmt.km(item.km)} · {relativoEmDias(item.data)}
            </span>
          )}

          {/* Um selo por vez, e "vencida" ganha. Os dois podem ser verdade ao
              mesmo tempo, mas não convivem no mesmo cartão de 4 linhas, e
              vencida é a mais urgente das duas: ela pede ação hoje, enquanto
              "não é mais necessária" pede só uma confirmação. Quem usa leitor
              de tela recebe as DUAS em `rotuloCompleto`, que não tem essa
              restrição de espaço. */}
          {compacto ? null : item.atrasado ? (
            <span className="mt-1 block">
              <Chip tom="critical" tamanho="sm" icone={<OctagonAlert />}>
                Data vencida
              </Chip>
            </span>
          ) : item.dispensavel ? (
            <span className="mt-1 block">
              <Chip tom="neutro" tamanho="sm" icone={<CircleSlash />}>
                Não é mais necessária
              </Chip>
            </span>
          ) : null}
        </button>

        {/* `bg-surface-3` opaco, e não `bg-surface-2/70`: no cartão neutro o
            fundo do selo passou a ser a MESMA cor do cartão (`--surface-2`), e
            o selo sumia. `--ink-2` sobre `--surface-3` mede 5,55:1 no claro e
            7,12:1 no escuro; a borda o separa do fundo crítico, onde os dois
            tons se aproximam. */}
        {item.diasServico > 1 ? (
          <span className="tnum absolute top-1 right-1 rounded-xs border border-border bg-surface-3 px-1 font-mono text-2xs text-ink-2">
            {fmt.n(item.diasServico)} d
          </span>
        ) : null}
      </div>

      {desfazer ? (
        <button
          type="button"
          onClick={desfazer}
          className="mt-1 inline-flex items-center gap-1 rounded-sm px-1 text-2xs text-ink-3 hover:text-ink"
        >
          <Undo2 aria-hidden="true" className="size-3" />
          Desfazer
        </button>
      ) : null}
    </li>
  );
});
