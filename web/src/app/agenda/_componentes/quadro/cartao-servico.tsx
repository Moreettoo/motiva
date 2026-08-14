"use client";

import { memo } from "react";
import { GripVertical, OctagonAlert, Undo2 } from "lucide-react";

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
 * 450 ms não piscaria nada — o anel estaria lá, parado no fim da animação, com
 * `opacity: 0`. Trocar a classe troca o `animation-name` (as duas keyframes de
 * `globals.css` são idênticas e existem só para isso) e o navegador reinicia.
 *
 * O que isto evita é um remonte: `key` novo reiniciaria a animação também, e
 * levaria o foco embora junto — a restauração de foco desta grade é delicada
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
  /** Este é o serviço aberto na gaveta de detalhe agora — não tem relação com o
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
   *  recebe foco — via Tab, clique do mouse, ou o cursor virtual de um
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

  /* O `relative` do `<li>` abaixo existe para o ANEL DE ERRO: `.anel-erro::after`
     é `position: absolute` e, sem ancestral posicionado, sobe até o viewport.
     Fica no `<li>` porque o `<div>` de dentro tem `overflow-hidden` — o filete de
     risco e os cantos arredondados dependem dele — e uma caixa que recorta corta
     um pseudoelemento em `inset: -2px`.

     Consequência aceita: com o "Desfazer" montado, o anel envolve o `<li>`
     inteiro, botão incluso. Só acontece dentro dos 8 s de um desfazer já
     oferecido — uma alocação que deu certo e uma escrita seguinte que falhou, ou
     o próprio desfazer falhando — e o anel continua dizendo a verdade: os dois
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
      {/* Container puro: nenhum papel, nenhum tabIndex, nenhum onKeyDown aqui.
          Um <button> (abrir detalhe) dentro de um role="button" (o antigo host
          de foco) era aninhamento interativo — indefinido entre leitores de
          tela. Os dois controles reais agora são irmãos: a alça e o botão de
          detalhe, nessa ordem no DOM. */}
      {/* Cartão encerrado em `ink-2`, não `ink-3`: medido, `ink-3` sobre
          `surface-3` dá 4,57:1 no claro e 4,14:1 no escuro — abaixo do piso de
          4,5:1 para texto pequeno, e este cartão carrega rodovia, faixa de km e
          prazo em `text-2xs`. `ink-2` sobre o mesmo fundo dá 5,55:1 e 7,12:1.
          Subir um passo na escada de tinta em vez de mexer no token: `--ink-3` é
          consumido em toda a base e mudá-lo obrigaria a remedir cada par. Mesma
          correção já aplicada no cabeçalho do dia (ver `cabecalho-dia.tsx`). */}
      <div
        style={{
          backgroundColor: encerrado ? "var(--surface-3)" : token.fundo,
          color: encerrado ? "var(--ink-2)" : token.tinta,
          borderColor: `color-mix(in oklab, ${token.cor} ${encerrado ? 28 : 55}%, transparent)`,
        }}
        className={cn(
          "group relative flex min-w-0 items-stretch gap-1 overflow-hidden rounded-sm border",
          "transition-transform duration-150 ease-[var(--ease-out-quint)] hover:-translate-y-px",
          selecionado && "ring-2 ring-accent",
        )}
      >
        <span aria-hidden="true" className="w-1 shrink-0" style={{ backgroundColor: token.cor }} />

        {encerrado ? null : (
          <button
            ref={refCartao}
            type="button"
            /* Rótulo com faixa de km, não só a rodovia: com 50 trechos, vários
               cartões da mesma rodovia coexistem na tela, e "Arrastar BR-101"
               repetido não desambigua nada na navegação por lista do leitor
               de tela. `carga.rotulo` já é essa frase — reaproveitada. */
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
            onPointerDown={salvando ? undefined : (evento) => aoPegar(evento, carga)}
            onKeyDown={salvando ? undefined : (evento) => aoTeclar(evento, carga)}
            /* A alça é `text-current` — a tinta do RISCO — sobre o fundo do
               RISCO, então a `opacity` do botão compõe as duas: a cor efetiva é
               `tinta*a + fundo*(1-a)`. Medido contra o fundo, para os quatro
               riscos, nos dois temas, contra o piso de 3:1 de WCAG 1.4.11
               (informação visual necessária para IDENTIFICAR um componente de
               interface — a alça é o que identifica o controle de arrastar; ela é
               `aria-hidden` e o nome acessível vive no `<button>`, então não cai
               no piso de texto):

                 opacidade   pior par (claro)   pior par (escuro)
                 30%              1,56               1,83
                 45%              2,01               2,59     ← repouso anterior
                 60%              2,65               3,60
                 70%              3,23               4,42     ← repouso agora
                 80%              3,93               5,32     ← sobrevoo anterior
                100%              5,86               7,60     ← sobrevoo agora

               70% é o MÍNIMO que limpa o piso nos dois temas; 60% ainda falha no
               claro. O sobrevoo foi para 100% para continuar existindo como
               PASSO: de 70% para 80% a tinta efetiva muda pouco demais para se
               ver, e a 100% a alça fica exatamente com a tinta do risco, o mesmo
               peso do ícone ao lado.

               E não é só conformidade. A alça existe porque é DESCOBRÍVEL, ao
               contrário da pressão longa (spec §3): a 45% ela era quase
               invisível em repouso, o que contrariava a própria razão de ela
               estar ali — quem não passa o mouse (toque, ou olho de passagem)
               não descobria que o cartão se arrasta.

               O `opacity-30` de "salvando" fica: 1,56:1 e 1,83:1 estão longe do
               piso, mas neste estado o botão tem `aria-disabled` e nenhum
               handler (nem `onPointerDown` nem `onKeyDown`), e 1.4.11 dispensa
               componente INATIVO. O estado dura uma ida ao servidor e tem outro
               canal: o `animate-pulse` do ícone. */
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
          aria-label={rotuloCompleto(item)}
          aria-pressed={selecionado}
          tabIndex={tabIndex}
          onClick={aoAbrir.bind(null, item.id)}
          onClickCapture={engolirClique}
          className="min-w-0 flex-1 py-1.5 pr-2 text-left"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <IconeDominio
              nome={encerrado ? STATUS[item.status].icone : token.icone}
              className="size-3.5 shrink-0"
            />
            <span className="block truncate text-2xs font-medium">{t.rodovia}</span>
            {/* Compacto (linha "Propostas da IA") não tem altura sobrando para
                o chip de baixo: só o ícone, decorativo — `rotuloCompleto`
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
              de risco sobre o fundo suave, é pior — no claro os quatro riscos ficam
              entre 3,23 e 4,29:1 a 80%, e entre 3,23 e 3,52:1 a 70%.
              São faixa de km, carga em km e prazo: texto informativo, não enfeite,
              e é a informação que decide o serviço. A hierarquia dentro do cartão
              não depende da veladura — ela já vem do peso e da família (rodovia em
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

          {compacto || !item.atrasado ? null : (
            <span className="mt-1 block">
              <Chip tom="critical" tamanho="sm" icone={<OctagonAlert />}>
                Data vencida
              </Chip>
            </span>
          )}
        </button>

        {item.diasServico > 1 ? (
          <span className="tnum absolute top-1 right-1 rounded-xs bg-surface-2/70 px-1 font-mono text-2xs text-ink-2">
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
