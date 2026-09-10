import "server-only";

import { db } from "../supabase";

/** URL de 60 s: o suficiente para o navegador carregar a imagem, nao para o link circular. */
export async function urlAssinadaDaFoto(caminho: string): Promise<string | null> {
  const { data, error } = await db.storage.from("chamados").createSignedUrl(caminho, 60);
  return error ? null : data.signedUrl;
}
