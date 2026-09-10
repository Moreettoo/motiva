import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { EstadoCampo, FotoLocal, ItemFila } from "./contratos";

/**
 * O aparelho e a fonte da verdade da TELA; o servidor e a fonte da verdade do
 * FATO. Tudo o que a tela mostra sai daqui, inclusive com sinal — assim a
 * pagina e a mesma com e sem rede, e o que muda e so o indicador do topo.
 *
 * Nada de `localStorage`: blob de foto nao cabe la, e escrita sincrona no
 * meio de uma captura trava a interface.
 */

interface EsquemaCampo extends DBSchema {
  estado: { key: string; value: EstadoCampo };
  fila: { key: string; value: ItemFila; indexes: { por_criacao: string } };
  fotos: { key: string; value: FotoLocal; indexes: { por_evento: string } };
}

let promessa: Promise<IDBPDatabase<EsquemaCampo>> | null = null;

export function banco() {
  promessa ??= openDB<EsquemaCampo>("highwai-campo", 1, {
    upgrade(db) {
      db.createObjectStore("estado");
      const fila = db.createObjectStore("fila", { keyPath: "evento_id" });
      fila.createIndex("por_criacao", "criado_em");
      const fotos = db.createObjectStore("fotos", { keyPath: "foto_id" });
      fotos.createIndex("por_evento", "evento_id");
    },
  });
  return promessa;
}

export async function lerEstado() {
  return (await (await banco()).get("estado", "atual")) ?? null;
}
export async function gravarEstado(e: EstadoCampo) {
  await (await banco()).put("estado", e, "atual");
}
export async function listarFila() {
  return (await banco()).getAllFromIndex("fila", "por_criacao");
}
export async function enfileirar(i: ItemFila) {
  await (await banco()).put("fila", i);
}
export async function atualizarItem(i: ItemFila) {
  await (await banco()).put("fila", i);
}
export async function removerDaFila(eventoId: string) {
  await (await banco()).delete("fila", eventoId);
}
export async function guardarFoto(f: FotoLocal) {
  await (await banco()).put("fotos", f);
}
export async function fotosDoEvento(eventoId: string) {
  return (await banco()).getAllFromIndex("fotos", "por_evento", eventoId);
}
export async function marcarFotoEnviada(fotoId: string) {
  const db = await banco();
  const f = await db.get("fotos", fotoId);
  if (f) await db.put("fotos", { ...f, enviada: true });
}

/** Chamada por `sair`: o aparelho nao guarda dado de quem nao esta mais logado. */
export async function limparTudo() {
  const db = await banco();
  await Promise.all([db.clear("estado"), db.clear("fila"), db.clear("fotos")]);
}

/**
 * Este cache pode conter RESPOSTA de servidor, isto e, dado de quem estava
 * logado? Entao ele vai embora no `sair`.
 *
 * A pergunta ao contrario e o que importa: o precache do Serwist e os caches de
 * ativo estatico sao SAIDA DE BUILD — a casca de /campo (estatica, sem cookie) e
 * os ~50 chunks de JS, iguais para todas as equipes. Apagar esses e o que
 * quebrava o app: o Serwist so preenche o precache no install do worker, entao
 * uma vez apagado ele nunca mais volta, e /campo passava a abrir sem sinal
 * travado no esqueleto para sempre. Ver o comentario de `encerrar`, em
 * `cabecalho-campo.tsx`.
 *
 * A regra e por PREFIXO e nao por lista fechada de nomes a apagar, de proposito:
 * o `defaultCache` do @serwist/turbopack pode ganhar um cache novo numa
 * atualizacao, e o erro seguro e apagar demais (perde-se velocidade) e nao de
 * menos (fica dado de sessao no aparelho da equipe).
 */
const PRESERVADOS = ["serwist-precache", "static-"] as const;

export function ehCacheDeResposta(nome: string): boolean {
  return !PRESERVADOS.some((prefixo) => nome.startsWith(prefixo));
}

export async function apagarCachesDeResposta(): Promise<string[]> {
  if (typeof caches === "undefined") return [];
  const apagar = (await caches.keys()).filter(ehCacheDeResposta);
  await Promise.all(apagar.map((k) => caches.delete(k)));
  return apagar;
}
