"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  CalendarX,
  Circle,
  CircleCheck,
  CircleSlash,
  Flag,
  MessageSquare,
  Play,
  Plus,
  Ruler,
  ShieldCheck,
  TriangleAlert,
  Undo2,
  Users,
} from "lucide-react";

import { PainelLateral } from "@/components/ui/painel-lateral";
import { marcarNotificacoesLidas } from "@/lib/chamados/acoes";
import { TIPO_EVENTO } from "@/lib/dominio";
import { fmt, relativoEmDias } from "@/lib/format";
import type { Notificacao } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * O sino.
 *
 * Quem grava `ia.notificacoes` são as funções SQL do chamado, não o painel:
 * `finalizado` e `adiamento_solicitado` avisam todos os Admin e Super Admin
 * ativos, e `criado`, `remarcado`, `equipe_alterada`, `devolvido`, `aprovado`,
 * `adiamento_aceito`, `adiamento_recusado`, `cancelado` e `encerrado_admin`
 * avisam o líder da equipe. Este componente só LÊ e marca como lida — nenhuma
 * regra de quem-avisa-quem vive aqui, e é por isso que ela não pode divergir
 * entre o painel e o app de campo, que lê a mesma tabela pela API de estado.
 */

/* Ponte entre o nome de ícone que `TIPO_EVENTO` guarda e o componente, igual ao
   que `icone-cargo.tsx` faz para os cargos: o mapa de
   `components/viz/legenda.tsx` cobre risco, status de agendamento e procedência
   do clima, e nenhum dos quinze tipos de evento do chamado — por lá "Flag"
   resolveria e "CalendarRange" cairia no `?? Circle`, e a lista ficaria com
   metade dos itens marcados por uma bolinha vazia, que lê como ícone que não
   carregou. Quando os tipos entrarem naquele mapa, este bloco sai. */
const ICONES_EVENTO = {
  Plus,
  Play,
  Flag,
  CircleCheck,
  Undo2,
  CalendarClock,
  CalendarCheck,
  CalendarX,
  CalendarRange,
  Users,
  Ruler,
  CircleSlash,
  ShieldCheck,
  TriangleAlert,
  MessageSquare,
} as const;

/** `tipo` é `text` no banco e chega aqui como `string`: o mapa é consultado com
 *  guarda, e um tipo que o banco ganhe antes desta tela não quebra a lista. */
function IconeDoTipo({ tipo }: { tipo: string }) {
  const token = tipo in TIPO_EVENTO ? TIPO_EVENTO[tipo as keyof typeof TIPO_EVENTO] : null;
  const Icone = token ? (ICONES_EVENTO[token.icone as keyof typeof ICONES_EVENTO] ?? Circle) : Circle;
  return <Icone aria-hidden="true" className="size-4 shrink-0 text-ink-3" />;
}

export function Sino({
  naoLidas,
  notificacoes,
}: {
  naoLidas: number;
  notificacoes: Notificacao[];
}) {
  const [aberto, setAberto] = useState(false);
  const [, iniciar] = useTransition();

  /* Quais estavam NÃO LIDAS no instante em que a lista abriu.
     A marca de lida é gravada na abertura, e a revalidação que ela dispara
     devolve `naoLidas: 0` e `lida_em` preenchido em todas: sem este retrato, o
     ponto que distingue "isto é novo" apagaria debaixo do olho de quem acabou
     de abrir o painel para justamente ver o que havia de novo. */
  const [novasAoAbrir, setNovasAoAbrir] = useState<Set<number>>(new Set());

  const abrir = useCallback(() => {
    const naoLidasAgora = notificacoes.filter((n) => n.lida_em == null);
    setNovasAoAbrir(new Set(naoLidasAgora.map((n) => n.id)));
    setAberto(true);

    /* Marca na ABERTURA, e não item por item: o gesto de abrir o sino É o de
       ler. Um botão "marcar como lida" por linha faria o contador sobreviver a
       quem já leu tudo, e o número no ícone existe para dizer "há coisa nova",
       não para ser zerado à mão.

       Sem tratamento de erro visível de propósito: falhar aqui deixa o
       contador como estava, que é o estado verdadeiro. Um toast de erro sobre
       "não consegui marcar como lida" interromperia a leitura para relatar
       uma falha que não perdeu nada. */
    if (naoLidasAgora.length > 0) {
      iniciar(async () => {
        await marcarNotificacoesLidas(naoLidasAgora.map((n) => n.id));
      });
    }
  }, [notificacoes]);

  const fechar = useCallback(() => setAberto(false), []);

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={
          naoLidas > 0
            ? `Notificações: ${fmt.contar(naoLidas, "não lida", "não lidas")}`
            : "Notificações"
        }
        className={cn(
          "relative flex size-9 items-center justify-center rounded-md border border-border bg-surface-2",
          "text-ink-3 transition-[border-color,color] duration-150 ease-[var(--ease-out-quint)]",
          "hover:border-border-strong hover:text-ink-2",
        )}
      >
        <Bell aria-hidden="true" className="size-4 shrink-0" />

        {/* O selo só existe quando há o que contar: um "0" no sino é ruído com
            a forma de alerta. `--critical` com texto branco é o único par da
            escala que aguenta 10 px em cima de qualquer fundo dos dois temas, e
            ele não aparece sozinho — o número É o rótulo, e o nome acessível do
            botão o diz por extenso. */}
        {naoLidas > 0 ? (
          <span
            aria-hidden="true"
            className={cn(
              "tnum absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center",
              "rounded-full bg-critical px-1 font-mono text-2xs font-semibold text-white",
            )}
          >
            {naoLidas > 9 ? "9+" : fmt.n(naoLidas)}
          </span>
        ) : null}
      </button>

      {/* `PainelLateral`, e não um balão ancorado: a gaveta desta base já
          resolve foco preso, Esc, devolução do foco ao gatilho e a largura de
          390 px, e cada item aqui tem título, texto e hora em três linhas —
          conteúdo de lista, não de menu. Um `role="menu"` de `menuitem`
          anunciaria cada notificação como comando executável, e metade delas é
          só aviso. */}
      <PainelLateral
        aberto={aberto}
        aoFechar={fechar}
        largura="sm"
        titulo="Notificações"
        descricao="O que aconteceu nos chamados que são seus."
      >
        {notificacoes.length === 0 ? (
          <p className="text-sm text-ink-3">Nada por enquanto.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {notificacoes.map((n) => (
              <li key={n.id}>
                <ItemNotificacao notificacao={n} nova={novasAoAbrir.has(n.id)} aoNavegar={fechar} />
              </li>
            ))}
          </ul>
        )}
      </PainelLateral>
    </>
  );
}

function ItemNotificacao({
  notificacao: n,
  nova,
  aoNavegar,
}: {
  notificacao: Notificacao;
  nova: boolean;
  aoNavegar: () => void;
}) {
  const corpo = (
    <>
      <IconeDoTipo tipo={n.tipo} />

      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-snug font-medium break-words text-ink">
          {n.titulo}
        </span>
        {n.texto ? (
          <span className="mt-0.5 block text-xs leading-snug break-words text-ink-2">
            {n.texto}
          </span>
        ) : null}
        {/* Hora relativa E data: "há 3 dias" situa, "12 de set." é o que se
            confere contra a linha do tempo do chamado. */}
        <span className="tnum mt-1 block font-mono text-2xs text-ink-3">
          {relativoEmDias(n.criado_em)} · {fmt.dataCurta(n.criado_em)}
        </span>
      </span>

      {/* O ponto, e não negrito no título: negrito já é o peso normal do título
          aqui, e sublinhar o texto de uma notificação lida a faria parecer
          outro tipo de item. */}
      {nova ? (
        <span
          aria-hidden="true"
          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent-line"
        />
      ) : null}
    </>
  );

  const classe = cn(
    "flex w-full items-start gap-2.5 rounded-md p-2 text-left",
    "transition-colors duration-150 ease-[var(--ease-out-quint)]",
    nova ? "bg-surface-2" : "bg-transparent",
  );

  /* Sem `href` a notificação é aviso, não caminho: um `<Link>` para lugar
     nenhum prometeria uma navegação que não acontece. Vira `<div>` sem foco em
     vez de botão morto. */
  if (!n.href) {
    return (
      <div className={classe}>
        {corpo}
        <span className="sr-only">
          {nova ? "Não lida." : ""} Este aviso não leva a nenhuma tela.
        </span>
      </div>
    );
  }

  return (
    <Link href={n.href} onClick={aoNavegar} className={cn(classe, "hover:bg-surface-3")}>
      {corpo}
      {nova ? <span className="sr-only">Não lida.</span> : null}
    </Link>
  );
}
