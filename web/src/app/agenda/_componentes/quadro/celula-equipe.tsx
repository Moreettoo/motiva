"use client";

import { memo } from "react";
import { OctagonAlert } from "lucide-react";

import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

import { HACHURA_EXCESSO, idDoGrupo, type Celula, type ItemAgenda, type Ocupacao } from "../dados";

/** A carga que esta célula tem sem cartão para explicá-la. Um serviço: nomeia a
 *  rodovia e o dia em que começou, porque um km sem dono no rótulo é pior que
 *  rótulo nenhum. Mais de um: conta, para o nome do grupo não virar uma lista
 *  falada de rodovias. Só é chamada com a lista NÃO vazia. */
function fraseDaContinuacao(itens: ItemAgenda[]): string {
  if (itens.length === 1) {
    return `continuação de ${itens[0].ag.trecho.rodovia}, que começou em ${fmt.dataLonga(itens[0].data)}`;
  }
  return `${fmt.contar(itens.length, "continuação", "continuações")} de serviços que começaram em outro dia`;
}

/**
 * O corpo do rótulo falado, em TRÊS estados: o quarto, a célula vazia de
 * verdade, é a ausência do rótulo (ver `nomeada`, abaixo).
 *
 * O estado do meio é o que não existia: sem cartão e com carga, o dia de
 * continuação de um serviço de mais de um dia. Ele caía no ramo "Sem serviço.",
 * que não carrega km nem capacidade, e ainda recebia " Acima da capacidade."
 * quando a carga passava: literalmente "Sem serviço. Acima da capacidade.",
 * com um "2,5/4,5" visível ao lado que ninguém ouvia. Por isso a frase nomeia o
 * serviço e o dia em que ele começou: o km precisa de dono, senão a célula
 * confessa uma carga que não explica.
 *
 * O separador antes da carga muda de vírgula para ponto quando há frase de
 * continuação, e não é preciosismo: a frase já termina numa data com vírgula
 * dentro ("quarta-feira, 12 de agosto"), e mais uma vírgula emendaria a data com
 * o km numa enumeração sem fim para quem ouve.
 */
function falaDaCelula(celula: Celula, km: number): string {
  const carga = `${fmt.km(km)} de ${fmt.km(celula.capacidade)} no dia.`;
  if (celula.itens.length === 0) {
    return `Nenhum serviço começa neste dia: ${fraseDaContinuacao(celula.continuacoes)}. ${carga}`;
  }
  const cartoes = fmt.contar(celula.itens.length, "serviço", "serviços");
  if (celula.continuacoes.length > 0) {
    return `${cartoes} e ${fraseDaContinuacao(celula.continuacoes)}. ${carga}`;
  }
  return `${cartoes}, ${carga}`;
}

export const CelulaEquipe = memo(function CelulaEquipe({
  celula,
  equipeNome,
  previa,
  realcada,
  recusada,
  destacada,
  children,
}: {
  celula: Celula;
  equipeNome: string;
  /** Ocupação projetada enquanto um cartão paira; `null` fora do arrasto. */
  previa: Ocupacao | null;
  realcada: boolean;
  recusada: boolean;
  /** ESTA é a equipe escolhida no seletor de destaque. Era o inverso
   *  (`atenuada`, nas outras) e não dava sinal visível: ver `linhaDestacada`,
   *  em `dados.tsx`, para as medições. */
  destacada: boolean;
  children: React.ReactNode;
}) {
  const leitura = previa ?? celula;
  const largura = Math.min(100, leitura.ocupacao);
  const idRotulo = idDoGrupo(celula.dia, celula.equipeId);

  /* "Tem algo a dizer" são DOIS casos, não um: a célula com cartão, e a célula
     de CONTINUAÇÃO: sem cartão e com carga, porque `montarGrade` chaveia os
     itens pelo dia de INÍCIO e o segundo dia de um serviço de 2 dias só herda
     km. Condicionar em `itens.length` sozinho silenciaria justamente a célula em
     que o número visível "2,5/4,5" não tem nenhum cartão ao lado para explicá-lo.

     O teste é o estado REAL da célula, nunca `leitura` (a prévia do arrasto): um
     grupo que nasce e morre a cada `pointermove` trocaria papel e nome no meio
     do gesto, e durante o arrasto quem narra é a região `aria-live`. */
  const temCartao = celula.itens.length > 0;
  const nomeada = temCartao || celula.continuacoes.length > 0;

  return (
    <div
      /* Grupo nomeado por par (dia, equipe), SÓ nas células que têm algo a
         dizer. O ganho é o nome COMPUTADO e falado na ENTRADA: por isso ele sai
         de `aria-labelledby` e não de mover o `sr-only` para ANTES dos cartões,
         a posição física do rótulo no DOM deixa de importar, e ele pode
         continuar no fim, sem disputar espaço com a coluna de cartões. Sem
         grupo, o rótulo era um `sr-only` DEPOIS dos cartões e quem ouve a tela
         recebia "BR-101…" antes de saber de que dia e de que equipe.

         Mas isso é tudo que `group` compra: navegação, não. Não é um dos
         landmarks da ARIA 1.2: a definição dele é uma exclusão explícita, um
         conjunto de objetos "not intended to be included in a page summary or
         table of contents by assistive technologies", o Core-AAM mapeia para
         `ROLE_SYSTEM_GROUPING` / Control Type `Group` SEM Landmark Type (nem
         `ROLE_PANEL`, nem `AXGroup`), a lista de elementos do NVDA (`NVDA+F7`)
         tem cinco tipos fechados e nenhum é grouping, e o rotor do VoiceOver
         lista seis landmarks. O custo, ao contrário, vem ligado por padrão:
         `reportGroupings` é `true` no NVDA (ao contrário de `reportArticles`), a
         SAÍDA do grupo também é anunciada, o JAWS fala o rótulo TRÊS vezes
         ("[rótulo] group start … group end [rótulo]") e a visão geral de
         elementos prefixa o rótulo do grupo em cada filho. Com grupo em toda
         célula eram 70 nomes longos e ~140 fronteiras faladas num varrimento, e
         ~63 das 70 células de uma semana estão vazias: a maioria dessas
         fronteiras entregava "… Sem serviço." e saía.

         Célula vazia volta a ser `<div>` mudo, e nada se perde: `data-celula` não
         muda (ela continua alvo de solta pelo ponteiro) e no caminho de teclado
         quem narra é `descrever`/`validar`, em `quadro-semana.tsx`, que já falam
         dia, equipe, carga e o motivo da recusa a cada passo, inclusive o "Essa
         equipe está desativada e não recebe serviço novo." que o rótulo daqui
         carrega quando a célula é nomeada.

         NÃO `region`: seria estritamente pior, inundaria a única lista onde a
         navegação de fato acontece. NÃO `<section>`: 70 landmarks afogariam o
         rotor de quem navega por região. NÃO `role="grid"`: o eixo aqui é
         transposto (colunas = dias, linhas = equipes) e não se expressa sem um
         `role="row"` por equipe, que é o oposto da ordem do DOM desta grade
         plana. */
      role={nomeada ? "group" : undefined}
      aria-labelledby={nomeada ? idRotulo : undefined}
      /* Célula que não aceita solta NÃO emite `data-celula`, essa é a
         defesa da regra de negócio no nível do DOM, e não deve relaxar.
         Em vez disso emite `data-celula-recusada`, um atributo PRÓPRIO que o
         hit-test (`alvoSob`, em `usar-arrasto.ts`) sabe ler sem tratar como
         destino válido: carrega a MESMA `celula.chave`, então `validar`
         (que já sabe dizer "Esse dia já passou."/"Essa equipe está
         desativada…") roda normalmente e o estado de recusa é desenhado de
         verdade, em vez de resolver para `null` e a solta virar um no-op
         silencioso. */
      data-celula={celula.aceitaSolta ? celula.chave : undefined}
      data-celula-recusada={celula.aceitaSolta ? undefined : celula.chave}
      className={cn(
        "quadro-celula relative flex min-w-0 flex-col gap-1 border-b border-l border-grid p-1.5",
        /* O realce da equipe em destaque: um tom de MARCA na célula, e não uma
           veladura nas outras. Aqui está o que a versão anterior errava.

           Ela escurecia as nove linhas FORA de foco com `bg-velatura`
           (preto puro) a 3%. O raciocínio de escolher 3% está preservado abaixo
           porque a conclusão dele importa; o que ele nunca mediu é se 3%
           PRODUZ diferença. Produz quase nada no claro (1,072:1) e nada no
           escuro (1,007:1, e ainda 1,030:1 a 20%, porque preto sobre
           quase-preto não tem para onde ir). Era um controle que respondia sem
           dar sinal.

           `bg-accent-soft` resolve por matiz em vez de luminância: 1,067:1 de
           luminância no claro e 1,224:1 no escuro, mas com desvio de MATIZ nos
           dois: verde pálido contra quase-branco, verde escuro contra
           quase-preto, que é o canal que o olho lê em áreas grandes e
           adjacentes. E custa zero contraste de texto: o único texto que pousa
           direto no fundo da célula é o rótulo `km/capacidade`, e ele carrega
           `bg-surface` próprio (ver mais abaixo), então nem toca esta camada.

           O raciocínio antigo, mantido porque continua verdadeiro sobre os
           CARTÕES: eles pintam com o par do RISCO, calibrado perto do piso de
           4,5:1, então mexer na opacidade deles arriscaria furar o piso sem
           rodar o validador de paleta de novo. Nada aqui mexe neles.

           `ring-accent` do alvo de arrasto continua vencendo visualmente: ele é
           um anel de 2px por dentro, desenhado sobre este fundo. E a hachura de
           excesso é pintada DEPOIS no DOM, então um alerta de capacidade não
           desaparece por causa de destaque nenhum. */
        destacada && "bg-accent-soft",
        realcada && "ring-2 ring-accent ring-inset",
        recusada && "ring-2 ring-ink-3 ring-inset cursor-not-allowed",
      )}
    >

      {leitura.excedida ? (
        <span
          aria-hidden="true"
          style={{ backgroundImage: HACHURA_EXCESSO }}
          className="pointer-events-none absolute inset-0"
        />
      ) : null}

      <ul className="relative flex min-w-0 flex-col gap-1">{children}</ul>

      {/* O `<p>` inteiro é `aria-hidden`, não só a barra. A barra já era, 70
          `role="progressbar"` é o mesmo ruído que fez rejeitar `listbox` para a
          grade, mas o número ao lado dela não, e o nome do grupo acima já diz
          o MESMO fato em forma falada ("3,0 km de 11,0 km no dia"). Quem ouve a
          tela recebia os dois: a frase com unidade e, de novo, um "3,0/11,0"
          solto que não quer dizer nada fora da coluna. Isto só vale porque o
          rótulo do grupo existe em TODA célula que chega a pintar este `<p>` com
          carga: inclusive a de continuação, que não tem cartão nenhum (ver
          `nomeada`, acima). Se o grupo deixar de cobrir um desses casos, este
          `aria-hidden` passa a ser o único motivo de um número visível ficar
          inaudível.

          O número carrega o PRÓPRIO fundo (`bg-surface`), mesma técnica já usada
          no ícone de excesso, e pelo mesmo motivo: a hachura é `absolute
          inset-0` e pinta ANTES no DOM, este `<p>` é `relative` e pinta DEPOIS,
          então o número ficava por cima da hachura, justo no estado em que ele
          mais importa. Medido, `ink-3` sobre a faixa opaca do gradiente: 3,42:1
          no claro e 3,84:1 no escuro (3,22:1 e 3,87:1 com a veladura de
          atenuação por baixo), contra o piso de 4,5:1 para texto pequeno. Com a
          placa opaca o par volta a ser o único que a base já mede, `ink-3`
          sobre `surface`, 4,99:1 no claro e 4,87:1 no escuro, e para de depender
          do que estiver atrás (hachura, veladura ou nada). A placa também tapa a
          veladura de 3% naquele retângulo, diferença imperceptível e o motivo de
          o par ser sempre o limpo. Ela contrasta pouco com a hachura de propósito
          (1,46:1 no claro, 1,27:1 no escuro): o trabalho dela é limpar a textura
          debaixo dos glifos, não virar mais um chip para ler. Pintar o número em
          `critical-ink` sobre a hachura também passaria (4,83:1 e 6,45:1), mas
          põe cor de status num nó `aria-hidden` e amarra o contraste do TEXTO ao
          valor de `--critical` e à porcentagem da mistura da hachura. */}
      {celula.capacidade > 0 && (leitura.km > 0 || realcada) ? (
        <p aria-hidden="true" className="relative mt-auto flex items-center gap-1">
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
            <span
              className={cn(
                "block h-full origin-left rounded-full",
                "transition-transform duration-150 ease-[var(--ease-out-quint)]",
                leitura.excedida ? "bg-critical" : "bg-ink-3",
              )}
              style={{ transform: `scaleX(${largura / 100})` }}
            />
          </span>
          <span className="tnum shrink-0 rounded-xs bg-surface px-0.5 font-mono text-2xs text-ink-3">
            {fmt.d1(leitura.km)}/{fmt.d1(celula.capacidade)}
          </span>
        </p>
      ) : null}

      {/* Cor de status nunca aparece sozinha (spec §2): a hachura acima é só
          textura, e a barra de capacidade só troca de cor. O ícone é o sinal
          visível de verdade, mesmo padrão de `cabecalho-dia.tsx` (ícone
          visível + `aria-hidden`, rótulo falado à parte; aqui ele é o "Acima da
          capacidade." do nome do grupo). O único caso em que este ícone aparece
          sem grupo para falá-lo é a célula VAZIA sob a prévia do arrasto, e ali
          quem fala é a região `aria-live`: `descrever` termina com a mesma frase.
          Depois do `<ul>`/`<p>` no DOM, não antes: os três são `relative`
          (positioned), e entre positioned a ordem de pintura é a ordem do
          DOM: antes deles, um cartão no canto superior direito da célula
          cobriria o ícone.
          Ficar por cima é justamente o que tornava o contraste imprevisível: o
          fundo atrás do ícone podia ser a célula, a hachura, ou o `fundo` de
          RISCO do cartão que ele cobre: quatro valores por tema, cada um
          mudando com o risco. O ícone carrega o próprio fundo, no par que o
          design system já reserva para isto (`Chip tom="critical"`:
          `bg-critical-soft` + `text-critical-ink`), então há UM par a medir por
          tema e ele não se move quando um risco novo entrar na tabela: 5,96:1
          no claro e 7,60:1 no escuro, contra o piso de 3:1 de elemento gráfico
          não textual (WCAG 1.4.11): o rótulo falado vive no nome do grupo,
          então aqui o ícone é reforço visual, não o único canal. */}
      {leitura.excedida ? (
        <span
          aria-hidden="true"
          /* `flex`, não o `<span>` cru: absolutamente posicionado ele viraria
             um bloco com linha de texto dentro, e a folga do descendente
             deixaria uma tira do fundo sobrando embaixo do ícone. */
          className="pointer-events-none absolute top-1 right-1 flex rounded-xs bg-critical-soft p-px text-critical-ink"
        >
          <OctagonAlert className="size-3 shrink-0" />
        </span>
      ) : null}

      {/* O rótulo do grupo. `aria-hidden` porque este MESMO texto é o nome do
          grupo: sem isso ele seria falado na entrada e DE NOVO como conteúdo lá
          dentro. O que a computação de nome acessível ignora, em accname 1.2, é
          a ocultação da RAIZ da travessia, o nó diretamente referenciado por
          `aria-labelledby`, que é este `<span>`, e a ocultação PROPAGA para a
          subárvore dele. Os dois lados têm caso de teste normativo: referenciado
          OCULTO com filho normal dá o nome completo (o nosso caso), mas
          referenciado VISÍVEL com filho oculto DESCARTA o filho. Ou seja, mover
          este `aria-hidden` para um filho que carregue texto, a refatoração
          óbvia de quem quiser esconder só um pedaço do rótulo, trunca o nome
          sem quebrar nada visível e sem erro nenhum. O atributo fica na raiz.
          E `sr-only` recorta (`clip`), não `display: none`: sai da tela sem tirar
          o texto do alcance de quem calcula o nome. */}
      {nomeada ? (
        <span id={idRotulo} aria-hidden="true" className="sr-only">
          {equipeNome}, {fmt.dataLonga(celula.dia)}. {falaDaCelula(celula, leitura.km)}
          {leitura.excedida ? " Acima da capacidade." : ""}
          {celula.aceitaSolta ? "" : " Não recebe serviço novo."}
        </span>
      ) : null}
    </div>
  );
});
