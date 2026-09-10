import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Cliente do Supabase que enxerga a SESSAO DO USUARIO pelos cookies do request.
 *
 * Nao confundir com `db` (`@/lib/supabase`): aquele usa a chave secreta e le
 * dados; este usa a publishavel e so serve a autenticacao (quem e, entrar,
 * sair, trocar a propria senha). Um por request: e leve, e a doc do Supabase
 * pede exatamente isso.
 */
export function configPublica(): { url: string; chave: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY sao obrigatorias para a sessao. " +
        "Veja web/.env.example.",
    );
  }
  return { url, chave };
}

export async function clienteSessao() {
  const { url, chave } = configPublica();
  const jarra = await cookies();

  return createServerClient(url, chave, {
    cookies: {
      getAll() {
        return jarra.getAll();
      },
      setAll(paraGravar) {
        try {
          paraGravar.forEach(({ name, value, options }) => jarra.set(name, value, options));
        } catch {
          // Renderizacao de Server Component nao pode gravar cookie. Tudo bem:
          // o proxy ja refrescou a sessao antes de a pagina rodar.
        }
      },
    },
  });
}
