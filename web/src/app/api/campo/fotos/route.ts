import { NextResponse, type NextRequest } from "next/server";

import { obterSessao } from "@/lib/auth/sessao";
import { LIMITES } from "@/lib/campo/contratos";
import { podeAgirNoChamado } from "@/lib/campo/servidor";
import { db } from "@/lib/supabase";

/**
 * A foto sobe ANTES do evento a que pertence, uma requisicao por foto.
 *
 * A ordem nao e estetica: `ia.registrar_evento_chamado` conta as fotos com o
 * mesmo `evento_id` antes de aceitar `iniciado`/`finalizado` (errcode P0004). Se
 * o evento subisse primeiro, ele seria recusado e a fila encalharia.
 *
 * Uma foto por requisicao porque a rede de beira de estrada cai no meio: perder
 * um upload de 300 KB e recomecar so ele e barato; perder um lote de 2 MB nao.
 *
 * NAO le `?equipe=`: a autorizacao sai do `chamado_id` do corpo, via
 * `podeAgirNoChamado`. Ver o comentario dessa funcao — exigir o parametro aqui
 * travava a fila de Admin e Super Admin em `400`, e a equipe do chamado e um
 * fato do banco, nao uma dica do cliente.
 */

const BYTES_MAX = 2_097_152; // = o `file_size_limit` do bucket `chamados`
const PAPEIS = ["medida", "extensao", "resultado", "extra"] as const;
const ETAPAS = ["inicio", "fim"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function texto(corpo: FormData, campo: string): string {
  const v = corpo.get(campo);
  return typeof v === "string" ? v.trim() : "";
}

/** Inteiro positivo ou `null`: dimensao de foto nao e negativa nem fracionaria. */
function inteiro(corpo: FormData, campo: string): number | null {
  const n = Number(texto(corpo, campo));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Coordenada e opcional de verdade: sem satelite a foto vale, so entra sem posicao. */
function decimalOpcional(corpo: FormData, campo: string): number | null {
  const bruto = texto(corpo, campo);
  if (!bruto) return null;
  const n = Number(bruto);
  return Number.isFinite(n) ? n : null;
}

function dataIso(valor: string): string | null {
  if (!valor) return null;
  const t = Date.parse(valor);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export async function POST(request: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ erro: "Sessão necessária." }, { status: 401 });

  let corpo: FormData;
  try {
    corpo = await request.formData();
  } catch {
    return NextResponse.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
  }

  const arquivo = corpo.get("arquivo");
  if (!(arquivo instanceof File)) return NextResponse.json({ erro: "Envie a foto no campo `arquivo`." }, { status: 400 });
  if (arquivo.type !== "image/jpeg") return NextResponse.json({ erro: "A foto tem que ser JPEG." }, { status: 415 });
  if (arquivo.size === 0) return NextResponse.json({ erro: "A foto chegou vazia." }, { status: 400 });
  if (arquivo.size > BYTES_MAX) {
    return NextResponse.json({ erro: `A foto passou de 2 MB. Comprima antes de enviar (o app usa ${LIMITES.ladoMaximoPx} px no lado maior).` }, { status: 413 });
  }

  const chamadoId = inteiro(corpo, "chamado_id");
  const eventoId = texto(corpo, "evento_id");
  const etapa = texto(corpo, "etapa");
  const papel = texto(corpo, "papel");
  const larguraPx = inteiro(corpo, "largura_px");
  const alturaPx = inteiro(corpo, "altura_px");
  const capturadaEm = dataIso(texto(corpo, "capturada_em"));

  if (chamadoId == null) return NextResponse.json({ erro: "`chamado_id` inválido." }, { status: 400 });
  if (!UUID.test(eventoId)) return NextResponse.json({ erro: "`evento_id` tem que ser um UUID." }, { status: 400 });
  if (!ETAPAS.includes(etapa as (typeof ETAPAS)[number])) return NextResponse.json({ erro: "`etapa` tem que ser `inicio` ou `fim`." }, { status: 400 });
  if (!PAPEIS.includes(papel as (typeof PAPEIS)[number])) return NextResponse.json({ erro: "`papel` desconhecido." }, { status: 400 });
  if (larguraPx == null || alturaPx == null) return NextResponse.json({ erro: "`largura_px` e `altura_px` são obrigatórias." }, { status: 400 });
  if (capturadaEm == null) return NextResponse.json({ erro: "`capturada_em` tem que ser uma data ISO." }, { status: 400 });

  const recusa = await podeAgirNoChamado(sessao, chamadoId);
  if (recusa) return NextResponse.json({ erro: recusa.erro }, { status: recusa.status });

  /* Idempotencia por (evento_id, papel, capturada_em) e nao por `foto_id`: o
     aparelho reenvia a MESMA foto depois de uma rede que caiu no meio do upload,
     e nesse caso o `201` anterior pode nem ter chegado nele. As tres colunas
     juntas identificam a foto sem depender de o cliente lembrar do que gravou. */
  const { data: existente } = await db
    .from("chamado_fotos")
    .select("id, caminho")
    .eq("evento_id", eventoId)
    .eq("papel", papel)
    .eq("capturada_em", capturadaEm)
    .maybeSingle();
  if (existente) return NextResponse.json({ id: existente.id, caminho: existente.caminho }, { status: 200 });

  const caminho = `chamados/${chamadoId}/${eventoId}/${crypto.randomUUID()}.jpg`;
  const bytes = Buffer.from(await arquivo.arrayBuffer());

  const { error: erroUpload } = await db.storage.from("chamados").upload(caminho, bytes, { contentType: "image/jpeg", upsert: false });
  if (erroUpload) return NextResponse.json({ erro: `Não foi possível guardar a foto: ${erroUpload.message}` }, { status: 502 });

  const { data: gravada, error } = await db
    .from("chamado_fotos")
    .insert({
      chamado_id: chamadoId,
      evento_id: eventoId,
      etapa,
      papel,
      caminho,
      largura_px: larguraPx,
      altura_px: alturaPx,
      bytes: bytes.byteLength,
      latitude: decimalOpcional(corpo, "latitude"),
      longitude: decimalOpcional(corpo, "longitude"),
      precisao_m: decimalOpcional(corpo, "precisao_m"),
      capturada_em: capturadaEm,
      autor_id: sessao.usuarioId,
    })
    .select("id, caminho")
    .single();

  if (error) {
    /* A linha nao entrou, mas o objeto ja esta no bucket: sem esta limpeza o
       reenvio geraria um segundo arquivo orfao a cada tentativa. */
    await db.storage.from("chamados").remove([caminho]);
    return NextResponse.json({ erro: `Não foi possível registrar a foto: ${error.message}` }, { status: 502 });
  }

  return NextResponse.json({ id: gravada.id, caminho: gravada.caminho }, { status: 201 });
}
