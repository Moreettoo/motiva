import { NextResponse, type NextRequest } from "next/server";

import { obterSessao } from "@/lib/auth/sessao";
import type { EventoCampo, ResultadoEvento, TipoEventoCampo } from "@/lib/campo/contratos";
import { podeAgirNoChamado } from "@/lib/campo/servidor";
import { mensagemDoBanco } from "@/lib/chamados/erros";
import { db } from "@/lib/supabase";

/**
 * A boca do funil: tudo o que o aparelho decidiu passa por aqui e o SERVIDOR da
 * a palavra final.
 *
 * A rota responde `200` mesmo quando cada evento do lote foi recusado, e a
 * situacao de cada um vai no corpo. Nao e frouxidao com codigo HTTP: um `4xx`
 * global faria a fila tratar como falha de rede e reenviar para sempre um evento
 * que o banco nunca vai aceitar. Quem decide o que sai da fila e `sincronizar.ts`,
 * e para isso ele precisa de UMA resposta por evento.
 *
 * NAO le `?equipe=`: cada evento traz o seu `chamado_id`, e a autorizacao sai
 * dele por `podeAgirNoChamado`. Ver o comentario dessa funcao.
 */

const MAX_EVENTOS = 50;
const TIPOS: readonly TipoEventoCampo[] = ["iniciado", "finalizado", "adiamento_solicitado"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ErroDoBanco = { code?: string; message: string; details?: string | null };

function invalido(e: unknown): string | null {
  const v = e as Partial<EventoCampo> | null;
  if (!v || typeof v !== "object") return "um evento vazio";
  if (typeof v.evento_id !== "string" || !UUID.test(v.evento_id)) return "um `evento_id` inválido";
  if (!Number.isInteger(v.chamado_id) || (v.chamado_id as number) <= 0) return "um `chamado_id` inválido";
  if (!TIPOS.includes(v.tipo as TipoEventoCampo)) return "um tipo de evento que ele não registra";
  if (typeof v.ocorrido_em !== "string" || Number.isNaN(Date.parse(v.ocorrido_em))) return "um `ocorrido_em` inválido";
  return null;
}

export async function POST(request: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ erro: "Sessão necessária." }, { status: 401 });

  let entrada: unknown;
  try {
    entrada = await request.json();
  } catch {
    return NextResponse.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
  }

  const eventos = (entrada as { eventos?: unknown })?.eventos;
  if (!Array.isArray(eventos)) return NextResponse.json({ erro: "Mande `eventos` como lista." }, { status: 400 });
  if (eventos.length === 0) return NextResponse.json({ resultados: [] });
  if (eventos.length > MAX_EVENTOS) return NextResponse.json({ erro: `Máximo de ${MAX_EVENTOS} eventos por lote.` }, { status: 413 });

  const resultados: ResultadoEvento[] = [];

  /* Sequencial, nunca em paralelo: `iniciado` e `finalizado` do mesmo chamado
     podem estar no mesmo lote, e a maquina de estados so aceita o segundo depois
     do primeiro. `Promise.all` aqui recusaria metade dos lotes de fim de dia. */
  for (const bruto of eventos) {
    const problema = invalido(bruto);
    const evento = bruto as EventoCampo;
    const eventoId = typeof evento?.evento_id === "string" ? evento.evento_id : "";

    if (problema) {
      resultados.push({ evento_id: eventoId, situacao: "recusado", erro: `O app mandou ${problema}.` });
      continue;
    }

    const recusa = await podeAgirNoChamado(sessao, evento.chamado_id);
    if (recusa) {
      resultados.push({ evento_id: eventoId, situacao: "recusado", erro: recusa.erro });
      continue;
    }

    /* A funcao SQL ja e idempotente (mesmo `evento_id` devolve o chamado sem
       gravar), mas ela nao distingue "aplicado agora" de "ja estava lá". A
       consulta antes existe para a fila poder dizer `repetido` e nao contar o
       envio duas vezes no relatorio. */
    const { data: jaExiste } = await db.from("chamado_eventos").select("id").eq("evento_id", evento.evento_id).maybeSingle();
    if (jaExiste) {
      resultados.push({ evento_id: eventoId, situacao: "repetido" });
      continue;
    }

    const { error } = await db.rpc("registrar_evento_chamado", {
      p_chamado_id: evento.chamado_id,
      p_evento_id: evento.evento_id,
      p_tipo: evento.tipo,
      p_autor: sessao.usuarioId,
      p_origem: "campo",
      p_payload: evento.payload ?? {},
      p_ocorrido_em: evento.ocorrido_em,
    });

    if (!error) {
      resultados.push({ evento_id: eventoId, situacao: "aplicado" });
      continue;
    }

    const e = error as ErroDoBanco;
    if (e.code === "P0003") {
      // O chamado ja tinha terminado. O evento FICOU gravado como fora de ordem
      // e os admins foram avisados: reenviar nao muda nada, entao sai da fila.
      resultados.push({ evento_id: eventoId, situacao: "fora_de_ordem", erro: mensagemDoBanco(e) });
      continue;
    }

    /* O indice `ux_adiamento_pendente_por_chamado` deixa um pedido pendente por
       chamado. Isso chega como violacao de unicidade, nao como errcode da funcao,
       e `mensagemDoBanco` diria so "O banco recusou", que nao ajuda ninguem. */
    const jaPediu = e.code === "23505" && e.message.includes("adiamento_pendente");
    resultados.push({
      evento_id: eventoId,
      situacao: "recusado",
      erro: jaPediu ? "Já há um pedido de adiamento aguardando o gestor neste chamado." : mensagemDoBanco(e),
    });
  }

  return NextResponse.json({ resultados }, { headers: { "Cache-Control": "private, no-store" } });
}
