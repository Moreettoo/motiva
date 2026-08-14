"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { ChevronDown, CircleAlert, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

/* O arquivo inteiro é cliente por causa da `Busca` (estado controlado + botão de
   limpar). `Entrada`, `AreaTexto` e `Selecao` não guardam estado; podem ser
   usados de um Server Component normalmente — viram apenas fronteira.

   `Campo` é a exceção, e não por estado: ele injeta id e descritores no filho
   com `isValidElement` + `cloneElement` (ver `comAcessibilidade`), e children
   vindo de um Server Component NÃO é um elemento durante o SSR — atravessa a
   fronteira RSC como referência preguiçosa e só vira elemento depois de
   desserializado no cliente. A decisão então muda entre as duas passadas e o
   React acusa mismatch de hidratação. Foi exatamente esse o defeito medido na
   `Dica`, que usava o mesmo padrão; lá ele está resolvido com
   `useSyncExternalStore`. Os quatro usos atuais de `Campo` estão todos em
   componentes `"use client"`, então o problema não existe hoje — mas o primeiro
   uso a partir de um Server Component vai precisar da mesma correção. */

const BASE_CONTROLE =
  "w-full rounded-md border border-border bg-surface-2 text-sm text-ink placeholder:text-ink-3 " +
  "hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-60 " +
  // O Tailwind não traz `aria-invalid` entre as variantes prontas.
  "aria-[invalid=true]:border-critical aria-[invalid=true]:hover:border-critical";

type PropsExtras = Record<string, unknown>;

/** Injeta id/descrição no primeiro filho de elemento, sem sobrescrever o que o autor já passou. */
function comAcessibilidade(filhos: ReactNode, extras: PropsExtras): ReactNode {
  let aplicado = false;

  return Children.map(filhos, (filho) => {
    if (aplicado || !isValidElement(filho)) return filho;
    aplicado = true;

    const atuais = filho.props as PropsExtras;
    const novos: PropsExtras = {};
    for (const [chave, valor] of Object.entries(extras)) {
      if (atuais[chave] === undefined) novos[chave] = valor;
    }
    return cloneElement(filho as ReactElement<PropsExtras>, novos);
  });
}

export function Campo({
  rotulo,
  dica,
  erro,
  obrigatorio,
  children,
  id,
}: {
  rotulo: string;
  dica?: string;
  erro?: string;
  obrigatorio?: boolean;
  children: ReactNode;
  id?: string;
}) {
  const automatico = useId();
  const idCampo = id ?? automatico;
  const idDica = `${idCampo}-dica`;
  const idErro = `${idCampo}-erro`;

  const descritores = [dica ? idDica : null, idErro].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={idCampo} className="text-xs font-medium text-ink-2">
        {rotulo}
        {obrigatorio && (
          <>
            <span aria-hidden="true" className="ml-1 text-critical-ink">
              *
            </span>
            <span className="sr-only"> (obrigatório)</span>
          </>
        )}
      </label>

      {dica && (
        <p id={idDica} className="text-2xs text-ink-3">
          {dica}
        </p>
      )}

      {comAcessibilidade(children, {
        id: idCampo,
        "aria-describedby": descritores || undefined,
        "aria-invalid": erro ? true : undefined,
        required: obrigatorio || undefined,
      })}

      {/* Região viva sempre montada: inserir o parágrafo só na hora do erro não
          seria anunciado por leitor de tela. Sem erro ela sai do fluxo. */}
      <p
        id={idErro}
        aria-live="polite"
        className={cn(
          erro ? "flex items-start gap-1.5 text-xs text-critical-ink" : "sr-only",
        )}
      >
        {erro && <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />}
        <span className="min-w-0">{erro}</span>
      </p>
    </div>
  );
}

export function Entrada({
  className,
  invalido,
  "aria-invalid": ariaInvalido,
  ...props
}: React.ComponentProps<"input"> & { invalido?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={ariaInvalido ?? (invalido || undefined)}
      className={cn(BASE_CONTROLE, "h-9 px-3", className)}
    />
  );
}

export function AreaTexto({
  className,
  invalido,
  "aria-invalid": ariaInvalido,
  rows = 4,
  ...props
}: React.ComponentProps<"textarea"> & { invalido?: boolean }) {
  return (
    <textarea
      {...props}
      rows={rows}
      aria-invalid={ariaInvalido ?? (invalido || undefined)}
      className={cn(BASE_CONTROLE, "min-h-20 resize-y px-3 py-2 leading-5 scroll-thin", className)}
    />
  );
}

export function Selecao({
  className,
  invalido,
  "aria-invalid": ariaInvalido,
  children,
  ...props
}: React.ComponentProps<"select"> & { invalido?: boolean }) {
  return (
    <span className="relative flex w-full items-center">
      <select
        {...props}
        aria-invalid={ariaInvalido ?? (invalido || undefined)}
        className={cn(
          BASE_CONTROLE,
          "h-9 appearance-none pr-9 pl-3",
          // O menu nativo do Windows ignora a herança: sem cor explícita na
          // <option> o texto sai preto sobre preto no tema escuro.
          "[&>option]:bg-surface-2 [&>option]:text-ink [&>optgroup]:bg-surface-2 [&>optgroup]:text-ink",
          className,
        )}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 size-4 text-ink-3"
      />
    </span>
  );
}

export function Busca({
  valor,
  aoMudar,
  placeholder = "Buscar…",
  rotulo,
  className,
}: {
  valor: string;
  aoMudar: (valor: string) => void;
  placeholder?: string;
  rotulo: string;
  className?: string;
}) {
  const entrada = useRef<HTMLInputElement>(null);

  function limpar() {
    aoMudar("");
    entrada.current?.focus();
  }

  return (
    <div className={cn("relative flex items-center", className)}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-ink-3" />
      <input
        ref={entrada}
        type="search"
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        onKeyDown={(evento) => {
          if (evento.key === "Escape" && valor) {
            evento.preventDefault();
            limpar();
          }
        }}
        aria-label={rotulo}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        className={cn(
          BASE_CONTROLE,
          "h-9 pr-9 pl-9",
          // A lupa nativa do WebKit duplicaria o ícone que já desenhamos.
          "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none",
        )}
      />
      {valor && (
        <button
          type="button"
          onClick={limpar}
          aria-label="Limpar busca"
          className="absolute right-1.5 inline-flex size-6 items-center justify-center rounded-sm text-ink-3 hover:bg-surface-3 hover:text-ink"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      )}
    </div>
  );
}
