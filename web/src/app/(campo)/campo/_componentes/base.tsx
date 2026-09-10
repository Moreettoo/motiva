"use client";

import type * as React from "react";
import { useEffect, useState } from "react";
import {
  Bell,
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  CalendarX,
  Camera,
  Check,
  ChevronLeft,
  CircleCheck,
  CircleSlash,
  Clock,
  Flag,
  Hourglass,
  LoaderCircle,
  MessageSquare,
  OctagonAlert,
  Play,
  Plus,
  Ruler,
  ShieldCheck,
  TriangleAlert,
  Undo2,
  Users,
  WifiOff,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A base das telas do campo: a escala tipografica, o botao de 56 px e o mapa de
 * icones.
 *
 * Existe separado porque a escala do campo NAO e a do painel e a diferenca tem
 * motivo fisico: a tela e lida a um braco de distancia, no sol, por alguem de
 * luva. Espalhar `text-[17px]` e `h-14` por dez arquivos faria a escala virar
 * numero magico repetido, e a primeira revisao ja acharia dois valores
 * diferentes para a mesma coisa.
 */

/* Um passo acima do painel em toda a escala. `--text-sm` (13 px) e `--text-base`
   (15 px) do design system continuam existindo aqui, mas sobem um degrau de
   funcao: o que no painel e corpo, aqui e metadado. */
export const ESCALA = {
  /** Rotulo de secao e de campo. O menor texto que o campo aceita. */
  rotulo: "text-sm",
  /** Metadado de cartao: faixa de km, sentido, data. */
  meta: "text-base",
  /** Corpo. 17 px vem do wrapper do layout; declarado aqui para quem sobrescreve. */
  corpo: "text-[17px] leading-6",
  /** Titulo de cartao: a rodovia, que e como o rocador reconhece o servico. */
  cartao: "text-[20px] leading-7 font-semibold tracking-tight",
  /** Titulo de tela. */
  tela: "text-xl font-semibold tracking-tight",
  /** O numero da altura, unico numero grande do app. */
  numero: "text-2xl leading-none font-semibold tnum",
} as const;

/**
 * Alvo de toque minimo: 56 px.
 *
 * Nao e o minimo de acessibilidade (44 px) nem escolha estetica: e o alvo que
 * um dedo com luva de rocada acerta na primeira tentativa. Vale para BOTAO e
 * para qualquer linha clicavel.
 */
export const ALVO = "min-h-14";

/**
 * COR DE BORDA VAI POR `style`, NUNCA POR CLASSE. Medido no navegador.
 *
 * `globals.css` tem `* { border-color: var(--border) }` escrito FORA de
 * `@layer`, e CSS sem camada vence toda regra dentro de uma camada, qualquer que
 * seja a especificidade. As utilities do Tailwind v4 moram em
 * `@layer utilities`, entao `border-ink`, `border-accent`, `border-critical` e
 * mesmo `border-transparent` resolvem TODAS para `--border`: sao classes mortas.
 * E por isto que `components/ui/aviso.tsx` pinta o filete com
 * `style={{ borderLeftColor }}`.
 *
 * Onde a cor pretendida E `--border`, a classe continua servindo (acerta por
 * coincidencia); onde a borda carrega informacao, use `borda()`.
 */
export function borda(cor: string): React.CSSProperties {
  return { borderColor: cor };
}

const VARIANTES = {
  primario: { classe: "bg-accent text-accent-ink active:bg-accent-hover", cor: "transparent" },
  secundario: { classe: "bg-surface-2 text-ink active:bg-surface-3", cor: "var(--border-strong)" },
  fantasma: { classe: "bg-transparent text-ink-2 active:bg-surface-3", cor: "transparent" },
} as const;

const BASE_BOTAO =
  "relative inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border " +
  "px-4 text-[17px] font-medium select-none transition-[background-color,border-color,transform] " +
  "duration-150 ease-[var(--ease-out-quint)] active:translate-y-px " +
  "disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-5 [&_svg]:shrink-0";

/**
 * O botao do campo: 56 px, largura toda, e NUNCA um giro sozinho.
 *
 * `carregando` troca o rotulo por `rotuloCarregando`, que e obrigatorio. Um
 * spinner sem palavra, num app que grava offline, nao diz a coisa que a pessoa
 * precisa saber: se aquilo ficou no aparelho ou foi para o servidor.
 */
export function BotaoCampo({
  variante = "secundario",
  carregando = false,
  rotuloCarregando,
  icone,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & {
  variante?: keyof typeof VARIANTES;
  carregando?: boolean;
  rotuloCarregando?: string;
  icone?: React.ReactNode;
}) {
  return (
    <button
      type={type}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      style={borda(VARIANTES[variante].cor)}
      className={cn(BASE_BOTAO, "h-14", VARIANTES[variante].classe, className)}
      {...props}
    >
      {carregando ? (
        <>
          <LoaderCircle aria-hidden="true" className="animate-spin" />
          <span>{rotuloCarregando ?? "Guardando…"}</span>
        </>
      ) : (
        <>
          {icone ? <span aria-hidden="true" className="inline-flex">{icone}</span> : null}
          <span className="truncate">{children}</span>
        </>
      )}
    </button>
  );
}

/**
 * Rotulo de secao e de bloco.
 *
 * Maiusculas e espacejamento largo: no plano da Fase 3 e assim de proposito, e
 * a 13 px num corpo de 17 px ele le como divisor estrutural, nao como titulo
 * competindo com o conteudo.
 */
export function Rotulo({ children, contagem, className }: { children: React.ReactNode; contagem?: number; className?: string }) {
  return (
    <h2 className={cn(ESCALA.rotulo, "font-medium tracking-wide text-ink-3 uppercase", className)}>
      {children}
      {contagem != null ? <span className="tnum ml-2 font-normal normal-case">{contagem}</span> : null}
    </h2>
  );
}

/**
 * Icones do dominio, com a assinatura do campo.
 *
 * `IconeDominio` (viz/legenda.tsx) nao serve aqui por dois motivos: nao conhece
 * `Play`, `Hourglass`, `Undo2` nem `CalendarClock`, os icones de STATUS_CHAMADO_
 * TOKEN, e cairia no `?? Circle`, que na tela le como icone que nao carregou; e
 * fixa `size-3.5` (14 px), pequeno demais para esta escala.
 */
const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  Bell, CalendarCheck, CalendarClock, CalendarRange, CalendarX, Camera, Check, ChevronLeft,
  CircleCheck, CircleSlash, Clock, Flag, Hourglass, MessageSquare, OctagonAlert, Play, Plus, Ruler,
  ShieldCheck, TriangleAlert, Undo2, Users, WifiOff,
};

export function Icone({ nome, className }: { nome: string; className?: string }) {
  const Componente = ICONES[nome];
  if (!Componente) return null;
  return <Componente aria-hidden="true" className={cn("size-5 shrink-0", className)} />;
}

/** Chip do campo: icone + rotulo sempre juntos, porque cor sozinha nao e canal. */
export function ChipCampo({
  icone,
  tinta,
  fundo,
  children,
  className,
}: {
  icone?: string;
  tinta?: string;
  fundo?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      style={{ color: tinta, backgroundColor: fundo }}
      className={cn(
        ESCALA.rotulo,
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 font-medium whitespace-nowrap",
        tinta ? undefined : "bg-surface-3 text-ink-2",
        className,
      )}
    >
      {icone ? <Icone nome={icone} className="size-4" /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * A previa de uma foto que ainda esta no aparelho.
 *
 * UM lugar no app cria `URL.createObjectURL`, e e aqui: o quadro de captura e a
 * tela de revisao mostram a mesma foto, e duas implementacoes divergiriam
 * justamente no que importa — revogar a URL. Sao 300 KB por foto e ate 6 fotos
 * por evento, num app que a equipe deixa aberto o turno inteiro.
 *
 * A URL nao pode nascer no render (criar em render vaza: o StrictMode monta
 * duas vezes e a primeira URL fica sem dono) nem existir antes da montagem,
 * porque ela precisa de um `revokeObjectURL` no desmonte. Entao o `setState` no
 * efeito e a forma correta, e a regra abaixo e a mesma que
 * `usar-sincronizacao.ts` desliga, pelo mesmo motivo.
 */
export function PreviaFoto({ blob, alt, className }: { blob: Blob; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(u);
    return () => {
      URL.revokeObjectURL(u);
      setUrl(null);
    };
  }, [blob]);

  if (!url) return null;
  // `next/image` nao serve para blob local: nao ha URL para o otimizador
  // trabalhar, e o loader tentaria buscar o blob pelo proxy de imagens.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={cn("size-full object-cover", className)} />;
}
