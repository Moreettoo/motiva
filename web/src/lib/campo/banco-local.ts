import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { EstadoCampo, ForaDeOrdem, FotoLocal, ItemFila } from "./contratos";

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
  fora_de_ordem: { key: string; value: ForaDeOrdem };
}

let promessa: Promise<IDBPDatabase<EsquemaCampo>> | null = null;

/**
 * Versao 2: entrou `fora_de_ordem`.
 *
 * O `upgrade` do `idb` recebe a versao ANTIGA e tem que ser incremental, nao
 * "cria tudo": um aparelho que ja sincronizou na v1 sobe para a v2 com os tres
 * stores dele cheios, e um `createObjectStore("estado")` ali levantaria
 * `ConstraintError` — o app abriria sem nada, com o dia de trabalho intacto no
 * disco e invisivel. Por isso cada store nasce sob o seu proprio `if`.
 */
export function banco() {
  promessa ??= openDB<EsquemaCampo>("highwai-campo", 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("estado")) db.createObjectStore("estado");
      if (!db.objectStoreNames.contains("fila")) {
        const fila = db.createObjectStore("fila", { keyPath: "evento_id" });
        fila.createIndex("por_criacao", "criado_em");
      }
      if (!db.objectStoreNames.contains("fotos")) {
        const fotos = db.createObjectStore("fotos", { keyPath: "foto_id" });
        fotos.createIndex("por_evento", "evento_id");
      }
      if (!db.objectStoreNames.contains("fora_de_ordem")) {
        db.createObjectStore("fora_de_ordem", { keyPath: "evento_id" });
      }
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

/**
 * As fotos de um evento que ja saiu da fila.
 *
 * Sem isto elas ficavam no aparelho para sempre. Sao ~90 KB por foto e ate 6
 * fotos por evento; uma equipe que fecha oito servicos por dia e nao sai da
 * conta acumula dezenas de megabytes por semana, e o unico jeito de limpar era
 * o `sair`. Depois do `200` do servidor o blob nao serve mais para nada: o
 * arquivo esta no bucket e a tela do campo nunca reexibe foto enviada.
 */
export async function apagarFotosDoEvento(eventoId: string) {
  const db = await banco();
  const fotos = await db.getAllFromIndex("fotos", "por_evento", eventoId);
  await Promise.all(fotos.map((f) => db.delete("fotos", f.foto_id)));
}

export async function listarForaDeOrdem() {
  return (await banco()).getAll("fora_de_ordem");
}
export async function marcarForaDeOrdem(f: ForaDeOrdem) {
  await (await banco()).put("fora_de_ordem", f);
}
export async function verForaDeOrdem(eventoId: string) {
  const db = await banco();
  const f = await db.get("fora_de_ordem", eventoId);
  if (f) await db.put("fora_de_ordem", { ...f, visto: true });
}

/** Chamada por `sair`: o aparelho nao guarda dado de quem nao esta mais logado. */
export async function limparTudo() {
  const db = await banco();
  await Promise.all([db.clear("estado"), db.clear("fila"), db.clear("fotos"), db.clear("fora_de_ordem")]);
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
