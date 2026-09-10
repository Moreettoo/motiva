import { NextResponse, type NextRequest } from "next/server";

import { obterSessao } from "@/lib/auth/sessao";
import { urlAssinadaDaFoto } from "@/lib/chamados/fotos";
import { db } from "@/lib/supabase";

/** `<img src="/api/fotos/123">` no painel e no app. Quem pode ver: gestao, ou o lider da equipe do chamado. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/fotos/[id]">) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ erro: "Sessão necessária." }, { status: 401 });

  const { id } = await ctx.params;
  const fotoId = Number(id);
  if (!Number.isInteger(fotoId) || fotoId <= 0) return NextResponse.json({ erro: "Foto inválida." }, { status: 400 });

  const { data: foto } = await db
    .from("chamado_fotos")
    .select("caminho, chamado:chamados!inner ( agendamento:agendamentos!inner ( equipe:equipes ( lider_id ) ) )")
    .eq("id", fotoId)
    .maybeSingle();
  if (!foto) return NextResponse.json({ erro: "Foto não encontrada." }, { status: 404 });

  if (sessao.cargo === "rocador") {
    const equipe = (foto.chamado as unknown as { agendamento: { equipe: { lider_id: string | null } | null } }).agendamento.equipe;
    if (equipe?.lider_id !== sessao.usuarioId) return NextResponse.json({ erro: "Sem acesso a esta foto." }, { status: 403 });
  } else if (sessao.cargo === "analista") {
    return NextResponse.json({ erro: "Sem acesso a esta foto." }, { status: 403 });
  }

  const url = await urlAssinadaDaFoto(foto.caminho as string);
  if (!url) return NextResponse.json({ erro: "Não foi possível assinar a foto." }, { status: 502 });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
}
