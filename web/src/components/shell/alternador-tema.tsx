"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { BotaoIcone } from "@/components/ui/botao";
import { ItemMenu, Menu } from "@/components/ui/menu";

/** Os três valores são lidos pelo script inline de `app/layout.tsx`. Trocar
 *  qualquer string aqui faz o tema piscar no carregamento. */
export type Tema = "claro" | "escuro" | "sistema";

const CHAVE = "solo-tema";

const OPCOES: { valor: Tema; rotulo: string; icone: LucideIcon }[] = [
  { valor: "claro", rotulo: "Claro", icone: Sun },
  { valor: "escuro", rotulo: "Escuro", icone: Moon },
  { valor: "sistema", rotulo: "Sistema", icone: Monitor },
];

function ehTema(valor: string | null): valor is Tema {
  return valor === "claro" || valor === "escuro" || valor === "sistema";
}

/* O tema mora no localStorage, não no React: quem manda no `data-theme` é o
   script inline que roda antes da primeira pintura. Aqui ele é lido como store
   externo — assim o componente não precisa sincronizar nada em efeito. */
const ouvintes = new Set<() => void>();
let cache: Tema | null = null;

function ler(): Tema {
  if (cache === null) {
    try {
      const salvo = localStorage.getItem(CHAVE);
      cache = ehTema(salvo) ? salvo : "sistema";
    } catch {
      cache = "sistema";
    }
  }
  return cache;
}

function avisarTodos() {
  for (const ouvinte of ouvintes) ouvinte();
}

/** O evento `storage` só chega nas OUTRAS abas — é o que mantém duas janelas
 *  do painel com o mesmo tema. */
function aoTrocarEmOutraAba(evento: StorageEvent) {
  if (evento.key !== CHAVE) return;
  cache = ehTema(evento.newValue) ? evento.newValue : "sistema";
  aplicar(cache);
  avisarTodos();
}

function assinar(avisar: () => void) {
  ouvintes.add(avisar);
  window.addEventListener("storage", aoTrocarEmOutraAba);
  return () => {
    ouvintes.delete(avisar);
    if (ouvintes.size === 0) window.removeEventListener("storage", aoTrocarEmOutraAba);
  };
}

/** Marcação do servidor: neutra, porque não há como saber a escolha salva. */
function noServidor(): Tema {
  return "sistema";
}

function gravar(tema: Tema) {
  cache = tema;
  try {
    localStorage.setItem(CHAVE, tema);
  } catch {
    // Sem persistência a escolha vale só para esta sessão.
  }
  avisarTodos();
}

function aplicar(tema: Tema) {
  const escuro =
    tema === "escuro" ||
    (tema === "sistema" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = escuro ? "dark" : "light";
}

export function AlternadorTema() {
  const tema = useSyncExternalStore(assinar, ler, noServidor);

  // Em "sistema" o painel acompanha a troca do SO enquanto está aberto.
  useEffect(() => {
    if (tema !== "sistema") return;
    const consulta = window.matchMedia("(prefers-color-scheme: dark)");
    const acompanhar = () => aplicar("sistema");
    consulta.addEventListener("change", acompanhar);
    return () => consulta.removeEventListener("change", acompanhar);
  }, [tema]);

  const escolher = useCallback((novo: Tema) => {
    gravar(novo);
    aplicar(novo);
  }, []);

  const atual = OPCOES.find((opcao) => opcao.valor === tema) ?? OPCOES[2];
  const IconeAtual = atual.icone;

  return (
    /* O balão do Menu abre para baixo por padrão, e este gatilho vive no rodapé
       da lateral — a poucos pixels do fim da tela. A variante inverte a âncora
       sem tocar na primitiva compartilhada. */
    <div className="[&_[role=menu]]:top-auto [&_[role=menu]]:bottom-full [&_[role=menu]]:mt-0 [&_[role=menu]]:mb-1 [&_[role=menu]]:origin-bottom">
      <Menu
        alinhamento="esquerda"
        gatilho={
          <BotaoIcone rotulo={`Tema: ${atual.rotulo}. Trocar tema`} variante="fantasma" tamanho="sm">
            <IconeAtual />
          </BotaoIcone>
        }
      >
        {OPCOES.map((opcao) => {
          const Icone = opcao.icone;
          const ativo = opcao.valor === tema;

          return (
            <ItemMenu key={opcao.valor} icone={<Icone />} aoEscolher={() => escolher(opcao.valor)}>
              <span className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {opcao.rotulo}
                  {ativo ? <span className="sr-only"> (em uso)</span> : null}
                </span>
                {ativo ? <Check aria-hidden="true" className="size-3.5 shrink-0 text-accent" /> : null}
              </span>
            </ItemMenu>
          );
        })}
      </Menu>
    </div>
  );
}
