"use client";

import { OctagonAlert } from "lucide-react";

import { fmt, parseData } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ehFimDeSemana, type ResumoColuna } from "../dados";

export function CabecalhoDia({
  dia,
  hoje,
  resumo,
}: {
  dia: string;
  hoje: string;
  /** `ResumoColuna`, não `ResumoDia`: este cabeçalho não fala mais em serviço
   *  SEM equipe. Ele falava, e o número se conferia contando os cartões da
   *  linha "Propostas da IA" logo abaixo; a linha saiu (duplicava a fila de
   *  decisão) e levou junto o objeto que sustentava a contagem. O tipo é o que
   *  impede o número de voltar sozinho — ver o comentário em `dados.tsx`. */
  resumo: ResumoColuna;
}) {
  const fds = ehFimDeSemana(dia);
  const ehHoje = dia === hoje;
  const passado = dia < hoje;

  /* A tinta secundária desta coluna, e a de ênfase acima dela — esta com TETO
     em `ink-2`.

     A BASE sobe um passo no fim de semana, e o motivo é contraste, não ênfase:
     `surface-3` não sustenta `ink-3`. O token foi calibrado para raspar o piso
     de 4,5:1 em cima de `surface` (mede 4,99:1 no claro e 4,87:1 no escuro) e
     não sobra folga para um fundo elevado. Medido, `ink-3` sobre `surface-3`:
     4,57:1 no claro sem veladura, 4,29:1 com ela, e 4,14:1 no ESCURO — onde a
     veladura não salva (4,19:1), porque preto sobre fundo escuro AFASTA um
     texto claro em vez de aproximá-lo. Isto é, no escuro as duas colunas de fim
     de semana reprovavam em TODA visita, não só ao navegar para uma semana
     passada. Com `ink-2` as quatro combinações passam: 5,55:1 e 5,21:1 no claro
     (futuro/passado), 7,12:1 e 7,20:1 no escuro.

     A ÊNFASE não sobe junto — ela é `ink-2` nas duas colunas. Acompanhando a
     base ela virava `ink` no fim de semana: dois passos acima de `ink-3` onde o
     argumento escrito era de um, e mais forte que o próprio número do dia
     (`ink-2`) — exatamente a inversão que o último parágrafo daqui protege ao
     recusar subir o número. Com o teto em `ink-2`, o passo que falta no fim de
     semana (onde a base já é `ink-2`) vem do PESO, canal ortogonal à escada de
     tinta: `font-semibold` distingue `N s/ equipe` sem mexer em tinta nenhuma, e
     o número do dia continua acima de tudo por TAMANHO e família (`sm` mono
     contra `2xs`). Medido, `ink-2` nas quatro combinações em que a ênfase
     aparece: sobre `surface` 6,07:1 no claro e 8,37:1 no escuro, com a veladura
     de dia passado 5,66:1 e 8,43:1; sobre `surface-3` 5,55:1 e 7,12:1, com a
     veladura 5,21:1 e 7,20:1 — todas acima do piso de 4,5:1 para texto pequeno.

     A INVERSÃO DE HIERARQUIA da BASE é real e é o preço pago aqui: `ink-2` é mais forte
     que `ink-3`, então o rótulo do sábado fica mais proeminente que o da terça —
     o oposto da ênfase que um fim de semana merece. Aceita de propósito:
      - o sinal de fim de semana é o FUNDO elevado, que não muda aqui e marca a
        coluna inteira, de cima a baixo e visível de longe; nunca foi o tom de um
        rótulo de três letras;
      - a inversão é de um passo na escada de tinta, e some ao lado do contraste
        de tamanho e família que já separa rótulo de número (`2xs` caixa-alta
        espaçada contra `sm` mono). Texto abaixo do piso, não: esse é ilegível de
        verdade para quem lê com pouco contraste, e num cabeçalho que carrega o
        dia da semana e a contagem de serviços;
      - não existe token entre `ink-3` e `ink-2` para escolher, e mexer em
        `--ink-3` obrigaria a remedir todo par da base — ele é consumido em
        toda ela.
     O número do dia continua em `ink-2` nas duas colunas (5,21:1 no pior caso) e
     NÃO entra na escada: subi-lo deixaria um sábado comum quase tão forte quanto
     o próprio hoje, que é o único destaque que este cabeçalho precisa manter. */
  const tomSecundario = fds ? "text-ink-2" : "text-ink-3";
  const tomEnfase = "text-ink-2 font-semibold";

  /* `data-obstaculo="topo"`: este `<div>` é `sticky top-0` de ~52px DENTRO da
     `.quadro-pista`, então come a faixa de cima da área em que se solta um
     cartão. Ver o bloco `data-obstaculo` em `usar-arrasto.ts` para a convenção
     (o valor é lista de bordas separada por espaço, e por borda fica o maior).
     Sem o atributo os insets ficam em zero e a auto-rolagem mede contra a caixa
     crua do rolador — com a pista rolada, a primeira linha de equipe visível cai
     inteira dentro da zona morta de 56px e não dá para soltar nela. */
  return (
    <div
      aria-current={ehHoje ? "date" : undefined}
      className={cn(
        "sticky top-0 z-20 border-b border-l border-border bg-surface px-2 py-1.5",
        fds && "bg-surface-3",
      )}
      data-obstaculo="topo"
    >
      {/* Veladura, não `opacity` no container: `opacity` compunha com o TEXTO
          também — `text-ink-3` a 60% cai para 2,36:1 (medido), abaixo do piso, e
          atinge o nome do dia, o número e as contagens em toda coluna já
          passada: de uma a seis na semana que contém hoje, e as sete inteiras
          ao navegar para uma semana anterior. Mesma técnica de `linha-turma.tsx`:
          a camada pinta ATRÁS por estar primeiro no DOM; o texto adiante
          continua opaco por cima.
          Mesmo a 3% ela ainda cobra contraste no claro — dia útil cai de 4,99
          para 4,66:1 — e era ela que empurrava o fim de semana para 4,29:1,
          abaixo do piso. No escuro ela AJUDA de leve (4,87 → 4,90:1), o que é
          justamente por que tirá-la não consertaria o fim de semana lá: ver a
          escada de tinta no topo do componente. */}
      {passado ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-velatura opacity-[0.03]" />
      ) : null}
      {/* Os dois `<p>` visíveis são `aria-hidden`, e o `sr-only` mais abaixo é o
          ÚNICO canal falado deste cabeçalho — não o apague achando que duplica
          o que está na tela: é o contrário, a tela é que duplica ele. Sem isso o
          leitor recebia o mesmo fato duas vezes e na forma pior primeiro: "qui
          13" e "8 · 3 s/ equipe", telegrafados fora de contexto, antes de
          "quinta-feira, 13 de agosto. 8 serviços com equipe, 3 sem equipe.".
          Mesmo padrão da célula irmã (`celula-equipe.tsx`): o que é ícone,
          abreviação ou número solto na tela não fala; quem fala é a frase com
          unidade. */}
      <p aria-hidden="true" className="relative flex items-baseline justify-between gap-1">
        <span
          className={cn(
            "truncate text-2xs tracking-widest uppercase",
            ehHoje ? "text-ink" : tomSecundario,
          )}
        >
          {fmt.diaSemana(dia)}
        </span>
        <span
          className={cn(
            "tnum font-mono text-sm leading-none",
            ehHoje ? "font-semibold text-ink" : "text-ink-2",
          )}
        >
          {fmt.n(parseData(dia).getDate())}
        </span>
      </p>

      <p
        aria-hidden="true"
        className={cn("relative tnum mt-1 flex items-center gap-1 font-mono text-2xs", tomSecundario)}
      >
        {/* A ênfase agora mora no número do próprio dia cheio, e não mais numa
            segunda contagem ao lado dele: `tomEnfase` marca o dia que TEM
            serviço, que é a única distinção que sobrou nesta linha. */}
        <span className={resumo.comEquipe > 0 ? tomEnfase : undefined}>
          {fmt.n(resumo.comEquipe)} {resumo.comEquipe === 1 ? "serviço" : "serviços"}
        </span>
        {resumo.algumaExcedida ? (
          <OctagonAlert aria-hidden="true" className="ml-auto size-3 shrink-0 text-critical-ink" />
        ) : null}
      </p>

      <span className="sr-only">
        {fmt.dataLonga(dia)}. {fmt.contar(resumo.comEquipe, "serviço", "serviços")}.
        {resumo.algumaExcedida ? " Alguma equipe está acima da capacidade." : ""}
        {ehHoje ? " Hoje." : ""}
      </span>

      {ehHoje ? (
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-accent-line" />
      ) : null}
    </div>
  );
}
