/** Base dos links que saem por e-mail. Sem barra final; `APP_URL` vem do ambiente. */
export function urlDoApp(caminho: string): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${caminho.startsWith("/") ? caminho : `/${caminho}`}`;
}
