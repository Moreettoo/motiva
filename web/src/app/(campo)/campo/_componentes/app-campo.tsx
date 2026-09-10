"use client";

/**
 * Versao minima: so a casca que o service worker precacheia. A Task 6 troca
 * este corpo pela lista, pelo detalhe e pelos tres fluxos.
 *
 * Cliente puro e sem dado no primeiro render de proposito: o HTML que sai do
 * build tem que servir para qualquer equipe, porque e ele que fica guardado no
 * aparelho e e ele que aparece quando o app abre sem sinal.
 */
export function AppCampo() {
  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Campo</h1>
      <p className="mt-2 text-ink-2">Carregando os chamados da sua equipe…</p>
    </main>
  );
}
