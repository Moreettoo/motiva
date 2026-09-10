import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { ehRotaPublica, podeVerRota, rotaInicial } from "@/lib/auth/permissoes";
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

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
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
    },
  );

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

  // Logado em /entrar ou /esqueci-a-senha: nao ha o que fazer la.
  if (cargo && (caminho === "/entrar" || caminho === "/esqueci-a-senha")) {
    return NextResponse.redirect(new URL(rotaInicial(cargo), request.url));
  }

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
