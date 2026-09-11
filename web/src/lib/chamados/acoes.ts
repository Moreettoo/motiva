"use server";

import { revalidatePath } from "next/cache";

import { permitir } from "../auth/sessao";
import { isoHoje } from "../format";
import { enfileirarAnalise } from "../github";
import type { Resultado } from "../resultado";
import { db } from "../supabase";
import { mensagemDoBanco } from "./erros";

function revalidar() {
  revalidatePath("/", "layout");
}

async function registrar(chamadoId: number, tipo: string, autor: string, payload: Record<string, unknown>): Promise<Resultado> {
  const { error } = await db.rpc("registrar_evento_chamado", {
    p_chamado_id: chamadoId,
    p_evento_id: crypto.randomUUID(),
    p_tipo: tipo,
    p_autor: autor,
    p_origem: "painel",
    p_payload: payload,
    p_ocorrido_em: new Date().toISOString(),
  });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar();
  return { ok: true, dados: undefined };
}

export async function aprovarChamado(e: {
  chamadoId: number;
  kmRocados: number;
  custoReais: number | null;
  observacao: string;
  reanalisar: boolean;
}): Promise<Resultado<{ execucaoId: number; reanalise: string | null }>> {
  const s = await permitir("super_admin", "admin");
  if (!s.ok) return s;
  if (!Number.isFinite(e.kmRocados) || e.kmRocados <= 0 || e.kmRocados > 500) return { ok: false, erro: "Informe os km roçados (entre 0 e 500)." };
  if (e.custoReais != null && (!Number.isFinite(e.custoReais) || e.custoReais < 0)) return { ok: false, erro: "Custo inválido." };

  const { data: chamado } = await db.from("chamados").select("trecho_id").eq("id", e.chamadoId).maybeSingle();
  if (!chamado) return { ok: false, erro: "Chamado não encontrado. Recarregue a página." };

  const { data, error } = await db.rpc("aprovar_chamado", {
    p_chamado_id: e.chamadoId,
    p_autor: s.dados.usuarioId,
    p_km_rocados: e.kmRocados,
    p_custo_reais: e.custoReais,
    p_observacao: e.observacao.trim() || null,
  });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar();

  // A rocada muda `dias_desde_rocada_inicio`, feature do modelo: reanalisar e o padrao.
  // Se o GitHub recusar (ja ha execucao em voo), o chamado continua aprovado e a tela avisa.
  let reanalise: string | null = null;
  if (e.reanalisar) {
    const r = await enfileirarAnalise(chamado.trecho_id as number);
    reanalise = r.ok ? `Reanálise do trecho enfileirada (${r.dados.nome}).` : `Chamado aprovado; a reanálise não foi disparada: ${r.erro}`;
  }
  return { ok: true, dados: { execucaoId: data as number, reanalise } };
}

export async function devolverChamado(e: { chamadoId: number; comentario: string }): Promise<Resultado> {
  const s = await permitir("super_admin", "admin");
  if (!s.ok) return s;
  const comentario = e.comentario.trim();
  if (comentario.length < 3) return { ok: false, erro: "Diga à equipe o que precisa ser refeito." };
  return registrar(e.chamadoId, "devolvido", s.dados.usuarioId, { comentario });
}

export async function decidirAdiamento(e: { adiamentoId: number; aceito: boolean; novaData: string | null; resposta: string }): Promise<Resultado> {
  const s = await permitir("super_admin", "admin");
  if (!s.ok) return s;
  if (e.aceito && !(e.novaData && /^\d{4}-\d{2}-\d{2}$/.test(e.novaData))) return { ok: false, erro: "Escolha a nova data." };
  const { error } = await db.rpc("decidir_adiamento", {
    p_adiamento_id: e.adiamentoId,
    p_autor: s.dados.usuarioId,
    p_aceito: e.aceito,
    p_nova_data: e.aceito ? e.novaData : null,
    p_resposta: e.resposta.trim() || null,
  });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar();
  return { ok: true, dados: undefined };
}

export async function encerrarAdministrativamente(e: {
  chamadoId: number;
  dataExecucao: string;
  alturaDepoisCm: number | null;
  observacao: string;
}): Promise<Resultado> {
  const s = await permitir("super_admin", "admin");
  if (!s.ok) return s;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.dataExecucao)) return { ok: false, erro: "Informe a data em que a roçada aconteceu." };
  /* A mesma recusa de `registrarMedicao`, e pelo mesmo motivo. O formulario ja
     a tinha, e o cabecalho de `formularios-decisao.tsx` declara que as duas
     validacoes precisam ser iguais -- mas num arquivo "use server" toda action
     e um POST alcancavel, e a tela nao guarda nada. `encerrar_chamado_admin`
     escreve em `ia.execucoes(data_execucao)` E em `ia.medicoes(data)`, que sao
     entrada do modelo: uma data futura vira a medicao mais recente do trecho,
     `dias_desde_rocada_inicio` fica negativo e a janela [ultima medicao, hoje)
     de onde sai `altura_atual_cm` inverte. Numero plausivel e errado, em
     silencio. */
  if (e.dataExecucao > isoHoje()) return { ok: false, erro: "A data da roçada não pode estar no futuro." };
  if (e.observacao.trim().length < 5) return { ok: false, erro: "A observação é obrigatória: por que está encerrando sem a evidência de campo?" };
  /* `Number.isFinite` junto com a faixa, como em `aprovarChamado`: sem ele, NaN
     passa -- `NaN < 0` e `NaN > 300` sao ambos falsos -- e chega ao banco. */
  if (e.alturaDepoisCm != null && (!Number.isFinite(e.alturaDepoisCm) || e.alturaDepoisCm < 0 || e.alturaDepoisCm > 300)) {
    return { ok: false, erro: "Altura fora da faixa (0 a 300 cm)." };
  }
  const { error } = await db.rpc("encerrar_chamado_admin", {
    p_chamado_id: e.chamadoId,
    p_autor: s.dados.usuarioId,
    p_data_execucao: e.dataExecucao,
    p_altura_depois_cm: e.alturaDepoisCm,
    p_observacao: e.observacao.trim(),
  });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar();
  return { ok: true, dados: undefined };
}

/** Cancelar = descartar o agendamento. O gatilho cancela o chamado; o motivo entra antes, como comentario. */
export async function cancelarChamado(e: { chamadoId: number; motivo: string }): Promise<Resultado> {
  const s = await permitir("super_admin", "admin");
  if (!s.ok) return s;
  const motivo = e.motivo.trim();
  if (motivo.length < 3) return { ok: false, erro: "Escreva por que o chamado está sendo cancelado." };
  const { data: chamado } = await db.from("chamados").select("agendamento_id").eq("id", e.chamadoId).maybeSingle();
  if (!chamado) return { ok: false, erro: "Chamado não encontrado. Recarregue a página." };
  const comentario = await registrar(e.chamadoId, "comentario", s.dados.usuarioId, { texto: `Cancelamento: ${motivo}` });
  if (!comentario.ok) return comentario;
  const { error } = await db.from("agendamentos").update({ status: "descartado", atualizado_em: new Date().toISOString() }).eq("id", chamado.agendamento_id);
  if (error) return { ok: false, erro: `Não foi possível descartar o agendamento: ${error.message}` };
  revalidar();
  return { ok: true, dados: undefined };
}

export async function informarAlturaInicial(e: { chamadoId: number; alturaCm: number }): Promise<Resultado> {
  const s = await permitir("super_admin", "admin");
  if (!s.ok) return s;
  if (!Number.isFinite(e.alturaCm) || e.alturaCm < 0 || e.alturaCm > 300) return { ok: false, erro: "Altura fora da faixa (0 a 300 cm)." };
  return registrar(e.chamadoId, "altura_inicial_alterada", s.dados.usuarioId, { altura_inicial_cm: e.alturaCm });
}

export async function marcarNotificacoesLidas(ids: number[]): Promise<Resultado> {
  const s = await permitir("super_admin", "admin", "analista", "rocador");
  if (!s.ok) return s;
  if (ids.length === 0) return { ok: true, dados: undefined };
  const { error } = await db.from("notificacoes").update({ lida_em: new Date().toISOString() }).in("id", ids).eq("destinatario_id", s.dados.usuarioId);
  if (error) return { ok: false, erro: `Não foi possível marcar: ${error.message}` };
  revalidatePath("/", "layout");
  return { ok: true, dados: undefined };
}
