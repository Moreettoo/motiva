"use client";

import { useState } from "react";
import { Bell, LogOut, X } from "lucide-react";

import { sair } from "@/lib/auth/acoes";
import { limparTudo } from "@/lib/campo/banco-local";
import type { EstadoCampo, ItemFila } from "@/lib/campo/contratos";
import { fmt } from "@/lib/format";

import { ALVO, BotaoCampo, ESCALA, Rotulo } from "./base";

/**
 * Quem esta logado, quantos avisos ha e a saida.
 *
 * O sino le do SNAPSHOT, nao da rede: sem sinal ele continua abrindo a lista
 * que veio na ultima sincronizacao. Um sino que so funciona online seria um
 * botao morto na maior parte do dia de trabalho.
 */

export function CabecalhoCampo({ estado, fila }: { estado: EstadoCampo | null; fila: ItemFila[] }) {
  const [aberto, setAberto] = useState<"sino" | "sair" | null>(null);
  const [saindo, setSaindo] = useState(false);

  const naoLidas = estado?.notificacoesNaoLidas ?? 0;
  const avisos = estado?.notificacoes ?? [];

  /**
   * Sair APAGA o aparelho: IndexedDB e os caches do service worker. Um celular
   * de equipe passa de mao em mao, e a foto de campo tem placa, rosto e
   * coordenada — nao pode sobrar para o proximo que abrir o app.
   *
   * A ordem importa: limpar ANTES de `sair()`, que redireciona e nunca volta.
   */
  async function encerrar() {
    setSaindo(true);
    await limparTudo();
    const chaves = await caches.keys();
    await Promise.all(chaves.map((k) => caches.delete(k)));
    await sair();
  }

  return (
    <header className="border-b border-border bg-bg">
      <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className={`${ESCALA.cartao} truncate`}>{estado?.equipe.nome ?? "Campo"}</p>
          {estado ? <p className={`${ESCALA.meta} truncate text-ink-2`}>líder: {estado.lider.nome}</p> : null}
        </div>

        <button
          type="button"
          onClick={() => setAberto(aberto === "sino" ? null : "sino")}
          aria-label={naoLidas > 0 ? `Avisos, ${fmt.contar(naoLidas, "não lido", "não lidos")}` : "Avisos"}
          aria-expanded={aberto === "sino"}
          className={`${ALVO} relative inline-flex w-14 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-2 active:bg-surface-3`}
        >
          <Bell aria-hidden="true" className="size-6" />
          {naoLidas > 0 ? (
            <span className="tnum absolute top-2 right-2 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-xs font-semibold text-accent-ink">
              {naoLidas}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => setAberto("sair")}
          aria-label="Sair da conta"
          className={`${ALVO} inline-flex w-14 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-2 active:bg-surface-3`}
        >
          <LogOut aria-hidden="true" className="size-6" />
        </button>
      </div>

      {aberto === "sino" ? <ListaAvisos avisos={avisos} aoFechar={() => setAberto(null)} /> : null}

      {aberto === "sair" ? (
        <div className="mx-auto max-w-lg space-y-3 border-t border-border px-4 py-4">
          {fila.length > 0 ? (
            <p role="alert" className={`${ESCALA.corpo} rounded-lg bg-critical-soft p-3 text-critical-ink`}>
              Há {fmt.contar(fila.length, "registro")} ainda não enviados. Se sair agora eles serão apagados.
            </p>
          ) : (
            <p className={`${ESCALA.corpo} text-ink-2`}>Sair apaga do aparelho os chamados e as fotos guardadas.</p>
          )}
          <BotaoCampo variante="primario" carregando={saindo} rotuloCarregando="Apagando do aparelho…" onClick={() => void encerrar()}>
            Sair mesmo assim
          </BotaoCampo>
          <BotaoCampo variante="fantasma" onClick={() => setAberto(null)}>
            Ficar no app
          </BotaoCampo>
        </div>
      ) : null}
    </header>
  );
}

function ListaAvisos({ avisos, aoFechar }: { avisos: EstadoCampo["notificacoes"]; aoFechar: () => void }) {
  const itens = avisos ?? [];

  return (
    <div className="mx-auto max-w-lg border-t border-border px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <Rotulo>Avisos</Rotulo>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar avisos"
          className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-ink-3 active:bg-surface-3"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>

      {itens.length === 0 ? (
        <p className={`${ESCALA.corpo} mt-2 text-ink-2`}>Nenhum aviso do gestor por enquanto.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {itens.map((a) => (
            <li key={a.id} className={`rounded-lg border p-3 ${a.lida_em == null ? "border-border-strong bg-surface-2" : "border-border bg-surface"}`}>
              <p className={`${ESCALA.corpo} font-medium`}>{a.titulo}</p>
              {a.texto ? <p className={`${ESCALA.meta} mt-0.5 text-ink-2`}>{a.texto}</p> : null}
              <p className={`${ESCALA.rotulo} mt-1 text-ink-3`}>{fmt.dataCurta(a.criado_em)}, {fmt.horaMin(a.criado_em)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
