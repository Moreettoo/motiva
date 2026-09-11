import "server-only";

import { cache } from "react";

import { ordemRisco, prioridadeExibida } from "../dominio";
import { listarTrechos } from "../queries";
import { db } from "../supabase";
import type { ChamadoAdiamento, ChamadoDetalhado, ChamadoEvento, ChamadoFoto, Notificacao, StatusChamado } from "../types";

/**
 * O chamado com o PRAZO VIVO do trecho pendurado.
 *
 * `ia.agendamentos.prioridade` é a palavra que a LLM escreveu no dia em que o
 * agendamento nasceu (ou, em roçada manual, o `risco` copiado naquele dia). Ela
 * envelhece: nesta base, 14 dos 21 chamados carregam uma prioridade que
 * contradiz o risco atual do trecho — inclusive três chamados marcados `baixa`
 * sobre trechos que já passaram do limite. A tela de chamados é a fila em que
 * o gestor decide o que fazer primeiro, então ela precisa do prazo de hoje, e
 * não da opinião de ontem. Ver `prioridadeExibida`.
 *
 * O prazo sai de `listarTrechos()`, que é a mesma view que o resto do painel lê
 * e vem embrulhada em `cache()` do React: numa página que já lista trechos,
 * isto não custa uma consulta a mais.
 */
export type ChamadoNaTela = ChamadoDetalhado & { prazo_dias: number | null };

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

/** `trecho_id` → `dias_ate_limite` de hoje, da mesma view que o painel usa. */
async function prazoPorTrecho(): Promise<Map<number, number | null>> {
  return new Map((await listarTrechos()).map((t) => [t.id, t.dias_ate_limite]));
}

export const listarChamados = cache(
  async (f?: { status?: StatusChamado[]; equipeId?: number; rodovia?: string; de?: string; ate?: string; busca?: string }): Promise<ChamadoNaTela[]> => {
    let q = db.from("chamados").select(SELECT_CHAMADO);
    if (f?.status?.length) q = q.in("status", f.status);
    if (f?.equipeId) q = q.eq("agendamento.equipe_id", f.equipeId);
    if (f?.rodovia) q = q.eq("trecho.rodovia", f.rodovia);
    if (f?.de) q = q.gte("agendamento.data_sugerida", f.de);
    if (f?.ate) q = q.lte("agendamento.data_sugerida", f.ate);
    if (f?.busca) q = q.ilike("numero", `%${f.busca.trim()}%`);
    const [{ data, error }, prazos] = await Promise.all([
      q.order("atualizado_em", { ascending: false }),
      prazoPorTrecho(),
    ]);
    if (error) erro("os chamados", error);
    return (data as unknown as Bruto[])
      .map(normalizar)
      .map((c) => ({ ...c, prazo_dias: prazos.get(c.trecho_id) ?? null }))
      .sort(
        (a, b) =>
          ORDEM_STATUS.indexOf(a.status) - ORDEM_STATUS.indexOf(b.status) ||
          // A fila ordena pelo mesmo risco que ela PINTA. Ordenar pela palavra
          // registrada e pintar o prazo poria o vermelho no meio da lista.
          ordemRisco(riscoDoChamado(a)) - ordemRisco(riscoDoChamado(b)) ||
          a.agendamento.data_sugerida.localeCompare(b.agendamento.data_sugerida),
      );
  },
);

/** O risco que a tela mostra para este chamado. Único ponto que resolve a regra. */
export function riscoDoChamado(c: ChamadoNaTela) {
  return prioridadeExibida(c.prazo_dias, c.agendamento.prioridade, c.agendamento.origem).risco;
}

export const obterChamado = cache(async (id: number) => {
  const [{ data, error }, eventos, fotos, adiamento, prazos] = await Promise.all([
    db.from("chamados").select(SELECT_CHAMADO).eq("id", id).maybeSingle(),
    db.from("chamado_eventos").select("*").eq("chamado_id", id).order("registrado_em"),
    db.from("chamado_fotos").select("*").eq("chamado_id", id).order("capturada_em"),
    db.from("chamado_adiamentos").select("*").eq("chamado_id", id).is("decisao", null).maybeSingle(),
    prazoPorTrecho(),
  ]);
  if (error) erro(`o chamado ${id}`, error);
  if (!data) return null;
  if (eventos.error) erro(`os eventos do chamado ${id}`, eventos.error);
  if (fotos.error) erro(`as fotos do chamado ${id}`, fotos.error);
  const base = normalizar(data as unknown as Bruto);
  return {
    ...base,
    prazo_dias: prazos.get(base.trecho_id) ?? null,
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

/* O `.order("id")` desempata: um `registrar_evento_chamado` escreve varias
   notificacoes na MESMA transacao, entao elas dividem o `criado_em` ao
   microssegundo, e sem ele quais 20 o sino mostra -- e qual e a 21a que ele
   corta -- sai por acaso. */
export const listarNotificacoes = cache(async (usuarioId: string, limite = 20): Promise<Notificacao[]> => {
  const { data, error } = await db.from("notificacoes").select("*").eq("destinatario_id", usuarioId).order("criado_em", { ascending: false }).order("id", { ascending: false }).limit(limite);
  if (error) erro("as notificações", error);
  return (data ?? []) as unknown as Notificacao[];
});
