"use client";

import { memo } from "react";
import { OctagonAlert } from "lucide-react";

import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

import { HACHURA_EXCESSO, idDoGrupo, type Celula, type Ocupacao } from "../dados";

export const CelulaEquipe = memo(function CelulaEquipe({
  celula,
  equipeNome,
  previa,
  realcada,
  recusada,
  atenuada,
  children,
}: {
  celula: Celula;
  equipeNome: string;
  /** Ocupação projetada enquanto um cartão paira; `null` fora do arrasto. */
  previa: Ocupacao | null;
  realcada: boolean;
  recusada: boolean;
  /** Outra equipe está em destaque (`controles.tsx`) e não é esta. */
  atenuada: boolean;
  children: React.ReactNode;
}) {
  const leitura = previa ?? celula;
  const largura = Math.min(100, leitura.ocupacao);
  const idRotulo = idDoGrupo(celula.dia, celula.equipeId);

  return (
    <div
      /* Um grupo nomeado por par (dia, equipe). NÃO `<section>`: 70 landmarks
         afogariam o rotor de quem navega por região. NÃO `role="grid"`: o eixo
         aqui é transposto (colunas = dias, linhas = equipes) e não se expressa
         sem um `role="row"` por equipe, que é o oposto da ordem do DOM desta
         grade plana.

         O nome sai de `aria-labelledby`, e não de mover o `sr-only` para ANTES
         dos cartões, porque nome de grupo é COMPUTADO e falado quando o leitor
         de tela ENTRA no grupo — a posição física do rótulo no DOM deixa de
         importar, e o rótulo pode continuar no fim, onde não disputa espaço com
         a coluna de cartões. Sem grupo, o rótulo era só um `sr-only` DEPOIS dos
         cartões: quem ouve a tela recebia "BR-101…" antes de saber de que dia e
         de que turma aquele cartão era. Em 70 células com ~130 cartões, isso é
         a diferença entre uma grade navegável e uma lista de rodovias soltas. */
      role="group"
      aria-labelledby={idRotulo}
      /* Célula que não aceita solta NÃO emite `data-celula` — essa é a
         defesa da regra de negócio no nível do DOM, e não deve relaxar.
         Em vez disso emite `data-celula-recusada`, um atributo PRÓPRIO que o
         hit-test (`alvoSob`, em `usar-arrasto.ts`) sabe ler sem tratar como
         destino válido: carrega a MESMA `celula.chave`, então `validar`
         (que já sabe dizer "Esse dia já passou."/"Essa turma está
         desativada…") roda normalmente e o estado de recusa é desenhado de
         verdade — em vez de resolver para `null` e a solta virar um no-op
         silencioso. */
      data-celula={celula.aceitaSolta ? celula.chave : undefined}
      data-celula-recusada={celula.aceitaSolta ? undefined : celula.chave}
      className={cn(
        "quadro-celula relative flex min-w-0 flex-col gap-1 border-b border-l border-grid p-1.5",
        realcada && "ring-2 ring-accent ring-inset",
        recusada && "ring-2 ring-ink-3 ring-inset cursor-not-allowed",
      )}
    >
      {/* Atenuação de "fora de destaque": SÓ o fundo, nunca os cartões. Eles
          pintam com o par do RISCO (`token.fundo`/`token.tinta`), calibrado
          perto do piso de contraste de 4,5:1 (ver a nota de paleta no
          CLAUDE.md — vários pares já estão no limite); reduzir a opacidade
          DELES arriscaria furar esse piso sem rodar de novo o validador de
          paleta. Uma camada decorativa ATRÁS dos cartões (`aria-hidden`, sem
          texto, pintada antes deles no DOM para ficar por baixo) atenua o
          quadro sem esse risco. A hachura de excesso, pintada DEPOIS, fica por
          cima de propósito: um alerta de capacidade não deveria sumir só porque
          outra equipe está em foco. */}
      {/* `bg-velatura` (preto puro nos dois temas), não `bg-ink`: no escuro
          `--ink` é quase branco, e sombrear com ele CLAREIA a linha fora de
          foco em vez de recuá-la — o olho é puxado para o lado errado. Preto
          sempre escurece, nos dois temas. Quem fixa a opacidade em 3% é o `<p>`
          de capacidade mais abaixo, que pinta por cima desta veladura (texto de
          verdade, `text-ink-3`) sempre que a célula tem carga: sobre `surface`
          esse par mede 4,99:1 limpo e 4,66:1 com a veladura, contra o piso de
          4,5:1 para texto pequeno. A 10% — a medida da primeira versão disto —
          o mesmo par cai para 3,99:1 e fura o piso. */}
      {atenuada ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-velatura opacity-[0.03]" />
      ) : null}

      {leitura.excedida ? (
        <span
          aria-hidden="true"
          style={{ backgroundImage: HACHURA_EXCESSO }}
          className="pointer-events-none absolute inset-0"
        />
      ) : null}

      <ul className="relative flex min-w-0 flex-col gap-1">{children}</ul>

      {/* O `<p>` inteiro é `aria-hidden`, não só a barra. A barra já era — 70
          `role="progressbar"` é o mesmo ruído que fez rejeitar `listbox` para a
          grade —, mas o número ao lado dela não, e o nome do grupo acima já diz
          o MESMO fato em forma falada ("3,0 km de 11,0 km no dia"). Quem ouve a
          tela recebia os dois: a frase com unidade e, de novo, um "3,0/11,0"
          solto que não quer dizer nada fora da coluna. */}
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
          <span className="tnum shrink-0 font-mono text-2xs text-ink-3">
            {fmt.d1(leitura.km)}/{fmt.d1(celula.capacidade)}
          </span>
        </p>
      ) : null}

      {/* Cor de status nunca aparece sozinha (spec §2): a hachura acima é só
          textura, e a barra de capacidade só troca de cor. O ícone é o sinal
          visível de verdade — mesmo padrão de `cabecalho-dia.tsx` (ícone
          visível + `aria-hidden`, rótulo falado à parte; aqui ele é o "Acima da
          capacidade." do nome do grupo).
          Depois do `<ul>`/`<p>` no DOM, não antes: os três são `relative`
          (positioned), e entre positioned a ordem de pintura é a ordem do
          DOM — antes deles, um cartão no canto superior direito da célula
          cobriria o ícone.
          Ficar por cima é justamente o que tornava o contraste imprevisível: o
          fundo atrás do ícone podia ser a célula, a hachura, ou o `fundo` de
          RISCO do cartão que ele cobre — quatro valores por tema, cada um
          mudando com o risco. O ícone carrega o próprio fundo, no par que o
          design system já reserva para isto (`Chip tom="critical"`:
          `bg-critical-soft` + `text-critical-ink`), então há UM par a medir por
          tema e ele não se move quando um risco novo entrar na tabela: 5,96:1
          no claro e 7,60:1 no escuro, contra o piso de 3:1 de elemento gráfico
          não textual (WCAG 1.4.11) — o rótulo falado vive no nome do grupo,
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
          dentro. A computação de nome acessível ignora o estado oculto de um nó
          DIRETAMENTE referenciado por `aria-labelledby` — é por isso que
          esconder aqui não apaga o nome lá em cima. E `sr-only` recorta
          (`clip`), não `display: none`: sai da tela sem tirar o texto do alcance
          de quem calcula o nome. */}
      <span id={idRotulo} aria-hidden="true" className="sr-only">
        {equipeNome}, {fmt.dataLonga(celula.dia)}.{" "}
        {celula.itens.length === 0
          ? "Sem serviço."
          : `${fmt.contar(celula.itens.length, "serviço", "serviços")}, ${fmt.km(leitura.km)} de ${fmt.km(celula.capacidade)} no dia.`}
        {leitura.excedida ? " Acima da capacidade." : ""}
        {celula.aceitaSolta ? "" : " Não recebe serviço novo."}
      </span>
    </div>
  );
});
