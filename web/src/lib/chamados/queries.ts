import "server-only";

import { cache } from "react";

import { ordemRisco } from "../dominio";
import { db } from "../supabase";
import type { ChamadoAdiamento, ChamadoDetalhado, ChamadoEvento, ChamadoFoto, Notificacao, StatusChamado } from "../types";

function erro(contexto: string, e: { message: string } | null): never {
  throw new Error(`Falha ao ler ${contexto}: ${e?.message ?? "erro desconhecido"}`);
}

/* Uma consulta so, com os embeds resolvidos: a tela de chamados nunca faz N+1. */
const SELECT_CHAMADO = `
  *,
  agendamento:agendamentos!inner ( id, data_sugerida, prioridade, justificativa, origem, equipe_id,
    equipe:equipes ( id, nome, lider:perfis!equipes_lider_id_fkey ( nome ) ) ),
  trecho:trechos!inner ( id, rodovia, km_inicio, km_fim, uf, sentido, latitude, longitude, altura_limite_cm, observacoes )
`;

type Bruto = Omit<ChamadoDetalhado, "agendamento"> & {
  agendamento: ChamadoDetalhado["agendamento"] & { equipe: { id: number; nome: string; lider: { nome: string } | { nome: string }[] | null } | null };
};

function normalizar(linha: Bruto): ChamadoDetalhado {
  const eq = linha.agendamento.equipe;
  const lider = eq ? (Array.isArray(eq.lider) ? eq.lider[0]?.nome : eq.lider?.nome) : null;
  return { ...linha, agendamento: { ...linha.agendamento, equipe: eq ? { id: eq.id, nome: eq.nome, lider_nome: lider ?? null } : null } };
}

const ORDEM_STATUS: StatusChamado[] = ["aguardando_aprovacao", "adiamento_solicitado", "devolvido", "em_andamento", "aberto", "concluido", "cancelado"];

export const listarChamados = cache(
  async (f?: { status?: StatusChamado[]; equipeId?: number; rodovia?: string; de?: string; ate?: string; busca?: string }): Promise<ChamadoDetalhado[]> => {
    let q = db.from("chamados").select(SELECT_CHAMADO);
    if (f?.status?.length) q = q.in("status", f.status);
    if (f?.equipeId) q = q.eq("agendamento.equipe_id", f.equipeId);
    if (f?.rodovia) q = q.eq("trecho.rodovia", f.rodovia);
    if (f?.de) q = q.gte("agendamento.data_sugerida", f.de);
    if (f?.ate) q = q.lte("agendamento.data_sugerida", f.ate);
    if (f?.busca) q = q.ilike("numero", `%${f.busca.trim()}%`);
    const { data, error } = await q.order("atualizado_em", { ascending: false });
    if (error) erro("os chamados", error);
    return (data as unknown as Bruto[]).map(normalizar).sort(
      (a, b) =>
        ORDEM_STATUS.indexOf(a.status) - ORDEM_STATUS.indexOf(b.status) ||
        ordemRisco(a.agendamento.prioridade) - ordemRisco(b.agendamento.prioridade) ||
        a.agendamento.data_sugerida.localeCompare(b.agendamento.data_sugerida),
    );
  },
);

export const obterChamado = cache(async (id: number) => {
  const [{ data, error }, eventos, fotos, adiamento] = await Promise.all([
    db.from("chamados").select(SELECT_CHAMADO).eq("id", id).maybeSingle(),
    db.from("chamado_eventos").select("*").eq("chamado_id", id).order("registrado_em"),
    db.from("chamado_fotos").select("*").eq("chamado_id", id).order("capturada_em"),
    db.from("chamado_adiamentos").select("*").eq("chamado_id", id).is("decisao", null).maybeSingle(),
  ]);
  if (error) erro(`o chamado ${id}`, error);
  if (!data) return null;
  if (eventos.error) erro(`os eventos do chamado ${id}`, eventos.error);
  if (fotos.error) erro(`as fotos do chamado ${id}`, fotos.error);
  return {
    ...normalizar(data as unknown as Bruto),
    eventos: (eventos.data ?? []) as unknown as ChamadoEvento[],
    fotos: (fotos.data ?? []) as unknown as ChamadoFoto[],
    adiamento_pendente: (adiamento.data as unknown as ChamadoAdiamento | null) ?? null,
  };
});

export const filaDeDecisao = cache(async (hoje: string) => {
  const abertos = await listarChamados({ status: ["aguardando_aprovacao", "adiamento_solicitado", "aberto"] });
  const { data: pendentes } = await db.from("chamado_adiamentos").select("*").is("decisao", null);
  const porChamado = new Map(((pendentes ?? []) as unknown as ChamadoAdiamento[]).map((a) => [a.chamado_id, a]));
  return {
    aguardando: abertos.filter((c) => c.status === "aguardando_aprovacao").sort((a, b) => (a.finalizado_em ?? "").localeCompare(b.finalizado_em ?? "")),
    adiamentos: abertos
      .filter((c) => c.status === "adiamento_solicitado" && porChamado.has(c.id))
      .map((c) => ({ ...c, adiamento: porChamado.get(c.id)! })),
    atrasados: abertos
      .filter((c) => c.status === "aberto" && c.agendamento.data_sugerida < hoje)
      .sort((a, b) => a.agendamento.data_sugerida.localeCompare(b.agendamento.data_sugerida)),
  };
});

export const contarNaoLidas = cache(async (usuarioId: string): Promise<number> => {
  const { count } = await db.from("notificacoes").select("id", { count: "exact", head: true }).eq("destinatario_id", usuarioId).is("lida_em", null);
  return count ?? 0;
});

export const listarNotificacoes = cache(async (usuarioId: string, limite = 20): Promise<Notificacao[]> => {
  const { data, error } = await db.from("notificacoes").select("*").eq("destinatario_id", usuarioId).order("criado_em", { ascending: false }).limit(limite);
  if (error) erro("as notificações", error);
  return (data ?? []) as unknown as Notificacao[];
});
