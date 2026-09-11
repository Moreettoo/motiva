import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { ehRotaPublica, podeVerRota } from "@/lib/auth/permissoes";
import type { Cargo } from "@/lib/types";

/**
 * Refresca a sessao e redireciona. NAO e camada de seguranca: Server Actions e
 * route handlers passam por fora do matcher, e a doc do Next 16 manda checar
 * em cada um deles (`permitir`, `exigirCargo`).
 *
 * O cargo lido aqui vem de `app_metadata` do token, copia gravada pela action
 * de convite. Ele so decide REDIRECIONAMENTO; a decisao de acesso e do perfil.
 */
export async function proxy(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  /* Sem as duas variaveis nao ha sessao para refrescar, e o `!` que estava aqui
     transformava isso num 500 de dentro do `@supabase/ssr` -- em TODA URL, o
     matcher pega tudo, entao nem /entrar abria para dizer o que faltava. E o
     `.env.example` distribui as duas VAZIAS, de modo que um deploy novo cai
     nesse estado sem nada de errado no codigo.

     Seguir em frente e a resposta certa porque este arquivo e conveniencia de
     navegacao e nao camada de seguranca: quem precisa de sessao chama
     `exigirCargo`/`permitir` na propria pagina ou action, e la `configPublica()`
     levanta com a mensagem que diz qual variavel falta. A falha continua
     fechada, e passa a ser legivel. */
  const urlSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chaveSupabase = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!urlSupabase || !chaveSupabase) return resposta;

  const supabase = createServerClient(urlSupabase, chaveSupabase, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(paraGravar) {
        paraGravar.forEach(({ name, value }) => request.cookies.set(name, value));
        resposta = NextResponse.next({ request });
        paraGravar.forEach(({ name, value, options }) => resposta.cookies.set(name, value, options));
      },
    },
  });

  // Nada entre criar o cliente e `getClaims()`: a doc do Supabase avisa que
  // codigo no meio pode deixar a sessao sem refrescar.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; app_metadata?: { cargo?: string } } | undefined;

  const caminho = request.nextUrl.pathname;
  const ehApi = caminho.startsWith("/api/");
  const publica = ehRotaPublica(caminho);

  if (!claims?.sub) {
    if (publica) return resposta;
    if (ehApi) return NextResponse.json({ erro: "Sessão necessária." }, { status: 401 });
    const destino = request.nextUrl.clone();
    destino.pathname = "/entrar";
    destino.search = "";
    if (caminho !== "/") destino.searchParams.set("proximo", caminho);
    return NextResponse.redirect(destino);
  }

  const cargo = claims.app_metadata?.cargo as Cargo | undefined;

  /* NAO desviar de rota publica com base no token.
     O token vive até uma hora e sobrevive à desativação da conta; o perfil, que
     é a verdade, some no mesmo instante. Quando os dois discordam — conta
     desativada com cookie ainda válido — um desvio de `/entrar` daqui fecha um
     ciclo: o layout do painel manda para `/entrar` (perfil inativo) e o proxy
     manda de volta para a rota inicial (token válido), e o navegador para em
     ERR_TOO_MANY_REDIRECTS. Medido em 10/09 desativando um usuário logado.

     Quem leva o usuário logado embora de `/entrar` e de `/esqueci-a-senha` são
     as próprias páginas, com `obterSessao()`, que lê o perfil. */

  if (cargo && !ehApi && !publica && !podeVerRota(cargo, caminho)) {
    const destino = cargo === "rocador" ? "/campo" : "/sem-acesso";
    return NextResponse.redirect(new URL(destino, request.url));
  }

  return resposta;
}

export const config = {
  matcher: [
    // Tudo, menos estaticos, o service worker, os icones, o manifesto e o assetlinks do APK.
    "/((?!_next/static|_next/image|favicon.ico|serwist|icones|\\.well-known|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
