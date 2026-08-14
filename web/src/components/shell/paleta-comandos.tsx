"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CornerDownLeft, Search } from "lucide-react";

import { ChipRisco } from "@/components/ui/chip";
import { RISCO, ordemRisco } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import type { Risco, UF } from "@/lib/types";
import { cn } from "@/lib/utils";

import { NAVEGACAO } from "./barra-lateral";

/** O mínimo que a paleta precisa saber de um trecho. Carregado no servidor e
 *  entregue por prop — a paleta nunca vai ao banco. */
export type TrechoNaPaleta = {
  id: number;
  rodovia: string;
  km_inicio: number;
  km_fim: number;
  uf: UF;
  risco: Risco;
};

const MAXIMO_TRECHOS = 8;

/* O portal só existe depois da hidratação (não há `document.body` no servidor). */
const semAssinatura = () => () => {};
const verdadeiro = () => true;
const falso = () => false;

/* A busca precisa achar "SP-330 88" digitado sem hífen, sem acento e com o km
   solto. Três normalizações resolvem isso sem biblioteca: tirar acento, tirar
   pontuação e testar o número contra a faixa de km do trecho. */
const DIACRITICOS = /[\u0300-\u036f]/g;

function semAcento(s: string): string {
  return s.normalize("NFD").replace(DIACRITICOS, "").toLowerCase();
}

function compacto(s: string): string {
  return semAcento(s).replace(/[^a-z0-9]/g, "");
}

function pontuarTrecho(trecho: TrechoNaPaleta, termos: string[]): number {
  const texto = semAcento(
    `${trecho.rodovia} ${trecho.uf} km ${trecho.km_inicio} ${trecho.km_fim} ${RISCO[trecho.risco].rotulo}`,
  );
  const denso = compacto(`${trecho.rodovia}${trecho.uf}`);
  let total = 0;

  for (const bruto of termos) {
    const termo = semAcento(bruto);
    const termoDenso = compacto(bruto);
    let pontos = 0;

    if (termoDenso && denso.startsWith(termoDenso)) pontos = 4;
    else if (termoDenso && denso.includes(termoDenso)) pontos = 3;
    else if (texto.includes(termo)) pontos = 2;

    const numero = Number(termo.replace(",", "."));
    if (
      termo !== "" &&
      Number.isFinite(numero) &&
      numero >= trecho.km_inicio - 0.001 &&
      numero <= trecho.km_fim + 0.001
    ) {
      pontos = Math.max(pontos, 3);
    }

    // Todo termo digitado precisa casar: quem escreve "SP-330 88" quer os dois.
    if (pontos === 0) return 0;
    total += pontos;
  }

  return total;
}

type Opcao = {
  chave: string;
  href: string;
  rotulo: string;
  apoio: string;
  /** Coordenada (rodovia, km) lê como instrumento; nome de tela, não. */
  mono: boolean;
  risco?: Risco;
};

function trechoParaOpcao(trecho: TrechoNaPaleta): Opcao {
  return {
    chave: `trecho-${trecho.id}`,
    // A seleção de trecho vive na URL da malha: o gestor manda o link pronto para a equipe.
    href: `/malha?trecho=${trecho.id}`,
    rotulo: trecho.rodovia,
    apoio: `${fmt.faixaKm(trecho.km_inicio, trecho.km_fim)} · ${trecho.uf}`,
    mono: true,
    risco: trecho.risco,
  };
}

/**
 * Casca da paleta: só o atalho global e a presença. O conteúdo é desmontado ao
 * fechar, e é isso que zera busca e seleção — não há estado velho para limpar.
 */
export function PaletaComandos({
  trechos,
  aberta,
  aoAbrir,
  aoFechar,
}: {
  trechos: TrechoNaPaleta[];
  aberta: boolean;
  aoAbrir: () => void;
  aoFechar: () => void;
}) {
  const reduzido = useReducedMotion();
  const montado = useSyncExternalStore(semAssinatura, verdadeiro, falso);

  /* ⌘K / Ctrl+K vale em qualquer lugar do painel: o gestor pula de trecho em
     trecho sem tirar a mão do teclado. */
  useEffect(() => {
    function aoTeclar(evento: globalThis.KeyboardEvent) {
      if ((evento.metaKey || evento.ctrlKey) && evento.key.toLowerCase() === "k") {
        evento.preventDefault();
        if (aberta) aoFechar();
        else aoAbrir();
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberta, aoAbrir, aoFechar]);

  if (!montado) return null;

  return createPortal(
    <AnimatePresence>
      {aberta && (
        <>
          <motion.div
            key="fundo"
            aria-hidden="true"
            onClick={aoFechar}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduzido ? 0 : 0.18 }}
            className="fixed inset-0 z-50 bg-bg/75 backdrop-blur-[2px]"
          />

          {/* O filho direto da AnimatePresence é um `motion` — é ele que
              garante o fim da animação de saída. O conteúdo mora um nível
              abaixo justamente para ser desmontado junto. */}
          <motion.div
            key="paleta"
            role="dialog"
            aria-modal="true"
            aria-label="Busca de trechos e comandos"
            initial={{ opacity: 0, y: -8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.985 }}
            transition={reduzido ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "fixed inset-x-4 top-4 z-50 mx-auto flex max-h-[85dvh] max-w-2xl flex-col overflow-hidden",
              "rounded-lg border border-border-strong bg-surface shadow-lg",
              "sm:top-[12vh] sm:max-h-[70dvh]",
            )}
          >
            <ConteudoPaleta trechos={trechos} aoFechar={aoFechar} />
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function ConteudoPaleta({
  trechos,
  aoFechar,
}: {
  trechos: TrechoNaPaleta[];
  aoFechar: () => void;
}) {
  const id = useId();
  const router = useRouter();

  const [busca, setBusca] = useState("");
  const [indice, setIndice] = useState(0);

  const entrada = useRef<HTMLInputElement>(null);

  const termos = useMemo(() => busca.trim().split(/\s+/).filter(Boolean), [busca]);

  const rotas: Opcao[] = useMemo(() => {
    const itens: Opcao[] = NAVEGACAO.map((item) => ({
      chave: `rota-${item.rotulo}`,
      href: item.href,
      rotulo: item.rotulo,
      apoio: item.descricao,
      mono: false,
    }));

    if (termos.length === 0) return itens;

    return itens.filter((item) => {
      const texto = semAcento(`${item.rotulo} ${item.apoio}`);
      return termos.every((termo) => texto.includes(semAcento(termo)));
    });
  }, [termos]);

  const achados: Opcao[] = useMemo(() => {
    if (termos.length === 0) {
      // Sem busca a paleta já abre útil: os trechos mais urgentes no topo.
      return [...trechos]
        .sort((a, b) => ordemRisco(a.risco) - ordemRisco(b.risco) || a.km_inicio - b.km_inicio)
        .slice(0, MAXIMO_TRECHOS)
        .map(trechoParaOpcao);
    }

    return trechos
      .map((trecho) => ({ trecho, pontos: pontuarTrecho(trecho, termos) }))
      .filter((linha) => linha.pontos > 0)
      .sort(
        (a, b) =>
          b.pontos - a.pontos ||
          ordemRisco(a.trecho.risco) - ordemRisco(b.trecho.risco) ||
          a.trecho.rodovia.localeCompare(b.trecho.rodovia, "pt-BR") ||
          a.trecho.km_inicio - b.trecho.km_inicio,
      )
      .slice(0, MAXIMO_TRECHOS)
      .map((linha) => trechoParaOpcao(linha.trecho));
  }, [termos, trechos]);

  const opcoes = useMemo(() => [...rotas, ...achados], [rotas, achados]);
  // Derivado, nunca corrigido em efeito: a lista encolhe enquanto se digita.
  const ativa: Opcao | undefined = opcoes[Math.min(indice, opcoes.length - 1)];

  const idOpcao = (chave: string) => `${id}-${chave}`;

  // Guarda quem abriu e devolve o foco ao fechar — sem isso o teclado volta para
  // o topo do documento e o gestor perde o lugar na tela.
  useEffect(() => {
    const gatilho = document.activeElement as HTMLElement | null;
    const quadro = requestAnimationFrame(() => entrada.current?.focus());

    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(quadro);
      document.body.style.overflow = anterior;
      gatilho?.focus?.();
    };
  }, []);

  // O item selecionado nunca pode sair da área visível ao navegar com as setas.
  const chaveAtiva = ativa?.chave;
  useEffect(() => {
    if (!chaveAtiva) return;
    document.getElementById(`${id}-${chaveAtiva}`)?.scrollIntoView({ block: "nearest" });
  }, [chaveAtiva, id]);

  function aoTeclarNaEntrada(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "Escape") {
      evento.preventDefault();
      aoFechar();
      return;
    }

    // A entrada é o único alvo focável do diálogo: Tab não pode escapar para a
    // página que está atrás. Esc continua sendo a saída.
    if (evento.key === "Tab") {
      evento.preventDefault();
      return;
    }

    if (opcoes.length === 0) return;
    const atual = Math.min(indice, opcoes.length - 1);

    switch (evento.key) {
      case "ArrowDown":
        evento.preventDefault();
        setIndice((atual + 1) % opcoes.length);
        break;
      case "ArrowUp":
        evento.preventDefault();
        setIndice((atual - 1 + opcoes.length) % opcoes.length);
        break;
      case "Home":
        evento.preventDefault();
        setIndice(0);
        break;
      case "End":
        evento.preventDefault();
        setIndice(opcoes.length - 1);
        break;
      case "Enter":
        if (ativa) {
          evento.preventDefault();
          aoFechar();
          router.push(ativa.href);
        }
        break;
    }
  }

  const idLista = `${id}-lista`;
  const idRotas = `${id}-grupo-rotas`;
  const idTrechos = `${id}-grupo-trechos`;

  return (
    <>
      <div aria-hidden="true" className="h-0.5 w-full shrink-0 bg-accent-line" />

      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4">
        <Search aria-hidden="true" className="size-4 shrink-0 text-ink-3" />
        <input
          ref={entrada}
          type="text"
          role="combobox"
          value={busca}
          onChange={(evento) => {
            setBusca(evento.target.value);
            setIndice(0);
          }}
          onKeyDown={aoTeclarNaEntrada}
          aria-label="Buscar trecho, rodovia, km ou tela"
          aria-expanded="true"
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={ativa ? idOpcao(ativa.chave) : undefined}
          placeholder="Rodovia, km ou tela — “SP-330 88”"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="busca-paleta h-12 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-3"
        />
        <kbd
          aria-hidden="true"
          className="hidden shrink-0 rounded-sm border border-border bg-surface-3 px-1.5 py-0.5 font-mono text-2xs text-ink-3 sm:block"
        >
          Esc
        </kbd>
      </div>

      <div
        id={idLista}
        role="listbox"
        aria-label="Resultados"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 scroll-thin"
      >
        {rotas.length > 0 && (
          <div role="group" aria-labelledby={idRotas}>
            <p id={idRotas} className="px-2.5 pt-1 pb-1.5 text-2xs tracking-widest text-ink-3 uppercase">
              Ir para
            </p>
            {rotas.map((opcao) => (
              <LinhaOpcao
                key={opcao.chave}
                opcao={opcao}
                id={idOpcao(opcao.chave)}
                ativa={ativa?.chave === opcao.chave}
                aoApontar={() => setIndice(opcoes.indexOf(opcao))}
                aoEscolher={aoFechar}
              />
            ))}
          </div>
        )}

        {achados.length > 0 && (
          <div role="group" aria-labelledby={idTrechos} className={rotas.length > 0 ? "mt-2" : undefined}>
            <p id={idTrechos} className="px-2.5 pt-1 pb-1.5 text-2xs tracking-widest text-ink-3 uppercase">
              {termos.length === 0 ? "Trechos mais urgentes" : "Trechos"}
            </p>
            {achados.map((opcao) => (
              <LinhaOpcao
                key={opcao.chave}
                opcao={opcao}
                id={idOpcao(opcao.chave)}
                ativa={ativa?.chave === opcao.chave}
                aoApontar={() => setIndice(opcoes.indexOf(opcao))}
                aoEscolher={aoFechar}
              />
            ))}
          </div>
        )}

        {opcoes.length === 0 && (
          <p className="px-3 py-10 text-center text-sm text-ink-2">
            {termos.length > 0
              ? `Nenhum trecho encontrado para “${busca.trim()}”. Tente só a rodovia ou só o km.`
              : "Nenhum trecho cadastrado ainda."}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-4 border-t border-border bg-surface-2 px-4 py-2 text-2xs text-ink-3">
        <span className="flex items-center gap-1.5">
          <CornerDownLeft aria-hidden="true" className="size-3" />
          Abrir
        </span>
        <span className="hidden items-center gap-1.5 sm:flex">
          <span aria-hidden="true" className="font-mono">
            ↑ ↓
          </span>
          Navegar
        </span>
        {/* Região viva: a contagem é o retorno de que a busca respondeu. */}
        <span className="tnum ml-auto" aria-live="polite">
          {opcoes.length === 1 ? "1 resultado" : `${fmt.n(opcoes.length)} resultados`}
        </span>
      </div>
    </>
  );
}

function LinhaOpcao({
  opcao,
  id,
  ativa,
  aoApontar,
  aoEscolher,
}: {
  opcao: Opcao;
  id: string;
  ativa: boolean;
  aoApontar: () => void;
  aoEscolher: () => void;
}) {
  return (
    <Link
      id={id}
      href={opcao.href}
      role="option"
      aria-selected={ativa}
      tabIndex={-1}
      onPointerMove={aoApontar}
      onClick={aoEscolher}
      className={cn(
        "flex items-center gap-3 rounded-md px-2.5 py-2",
        ativa ? "bg-surface-3" : "bg-transparent",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm text-ink", opcao.mono && "font-mono")}>
          {opcao.rotulo}
        </span>
        <span className="mt-0.5 block truncate text-xs text-ink-3">{opcao.apoio}</span>
      </span>

      {opcao.risco ? <ChipRisco risco={opcao.risco} tamanho="sm" /> : null}
    </Link>
  );
}
