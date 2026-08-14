"use client";

import { memo } from "react";
import { OctagonAlert } from "lucide-react";

import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

import { HACHURA_EXCESSO, type Celula, type Ocupacao } from "../dados";

export const CelulaEquipe = memo(function CelulaEquipe({
  celula,
  equipeNome,
  previa,
  realcada,
  recusada,
  atenuada,
  filhos,
}: {
  celula: Celula;
  equipeNome: string;
  /** Ocupação projetada enquanto um cartão paira; `null` fora do arrasto. */
  previa: Ocupacao | null;
  realcada: boolean;
  recusada: boolean;
  /** Outra equipe está em destaque (`controles.tsx`) e não é esta. */
  atenuada: boolean;
  filhos: React.ReactNode;
}) {
  const leitura = previa ?? celula;
  const largura = Math.min(100, leitura.ocupacao);

  return (
    <div
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
      {/* Atenuação de "fora de destaque": SÓ o fundo, nunca `filhos`. Os
          cartões pintam com o par do RISCO (`token.fundo`/`token.tinta`),
          calibrado perto do piso de contraste de 4.5:1 (ver a nota de
          paleta no CLAUDE.md — vários pares já estão no limite); reduzir a
          opacidade DELES arriscaria furar esse piso sem rodar de novo
          `validate_palette.js`. Uma camada decorativa ATRÁS dos cartões
          (`aria-hidden`, sem texto, pintada antes deles no DOM para ficar
          por baixo) atenua o quadro sem esse risco. A hachura de excesso,
          pintada DEPOIS, fica por cima de propósito: um alerta de
          capacidade não deveria sumir só porque outra equipe está em foco. */}
      {/* `bg-velatura` (preto puro nos dois temas), nao `bg-ink`: no escuro
          `--ink` e quase branco, e sombrear com ele CLAREIA a linha fora de
          foco em vez de recua-la — o olho e puxado pro lado errado. Preto
          sempre escurece, nos dois temas. O `<p>` de capacidade MAIS ABAIXO
          pinta por cima desta veladura (texto real, `text-ink-3`) sempre que
          a célula tem carga — por isso a opacidade aqui precisa da MESMA
          medida de `linha-turma.tsx` (3%, não os 10% de antes: 10% media
          ~3,99:1, abaixo do piso de 4.5:1 para texto pequeno). */}
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

      <ul className="relative flex min-w-0 flex-col gap-1">{filhos}</ul>

      {celula.capacidade > 0 && (leitura.km > 0 || realcada) ? (
        <p className="relative mt-auto flex items-center gap-1">
          <span
            aria-hidden="true"
            className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3"
          >
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
          visível + `aria-hidden`, rótulo completo no `sr-only` abaixo).
          Depois do `<ul>`/`<p>` no DOM, não antes: os três são `relative`
          (positioned), e entre positioned a ordem de pintura é a ordem do
          DOM — antes deles, um cartão no canto superior direito da célula
          cobriria o ícone. */}
      {leitura.excedida ? (
        <OctagonAlert
          aria-hidden="true"
          className="pointer-events-none absolute top-1 right-1 size-3 shrink-0 text-critical-ink"
        />
      ) : null}

      <span className="sr-only">
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
