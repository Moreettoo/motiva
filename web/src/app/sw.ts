/* Este arquivo NAO roda no navegador da pagina: roda no service worker, onde
   `ServiceWorkerGlobalScope`, `ExtendableEvent` e `clients` existem e `window`
   nao. O `tsconfig.json` do painel declara so as libs de DOM, entao a lib de
   worker entra por aqui, num arquivo so, em vez de virar global do projeto. */
/// <reference lib="webworker" />

import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

import { sincronizarFila } from "@/lib/campo/sincronizar";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

type EventoSync = ExtendableEvent & { tag: string };

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  // Abrir a frio sem rede: qualquer navegacao sob /campo recebe a casca precacheada.
  fallbacks: {
    entries: [
      {
        url: "/campo",
        matcher({ request }) {
          return request.mode === "navigate" && new URL(request.url).pathname.startsWith("/campo");
        },
      },
    ],
  },
});

serwist.addEventListeners();

/* Background Sync: o Chrome acorda o worker quando a rede volta, mesmo com o app
   fechado. Se ha uma aba aberta, ela sincroniza (tem o estado na tela); se nao,
   o proprio worker envia a fila. */
self.addEventListener("sync", (evento) => {
  const e = evento as EventoSync;
  if (e.tag !== "campo-sincronizar") return;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abas) => {
      if (abas.length > 0) {
        abas.forEach((aba) => aba.postMessage({ tipo: "sincronizar" }));
        return;
      }
      return sincronizarFila({ origem: "worker" }).then(() => undefined);
    }),
  );
});
