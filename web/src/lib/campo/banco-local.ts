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
