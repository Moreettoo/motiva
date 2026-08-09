"use server";

import { revalidatePath } from "next/cache";

import { API_URL, db } from "./supabase";
import type { StatusAgendamento } from "./types";

/**
 * Escritas.
 *
 * Tudo aqui roda no servidor com a service_role. O cliente so manda o id e a
 * intencao; nenhuma decisao de permissao depende do que o navegador enviou.
 */

export type Resultado<T = void> = { ok: true; dados: T } | { ok: false; erro: string };

const STATUS_VALIDOS: StatusAgendamento[] = ["sugerido", "aprovado", "executado", "descartado"];

function revalidarTudo() {
  revalidatePath("/", "layout");
}

export async function mudarStatusAgendamento(
  agendamentoId: number,
  status: StatusAgendamento,
): Promise<Resultado<{ id: number; status: StatusAgendamento }>> {
  if (!STATUS_VALIDOS.includes(status)) {
    return { ok: false, erro: `Status inválido: ${status}` };
  }

  const { data, error } = await db
    .from("agendamentos")
    .update({ status, atualizado_em: new Date().toISOString() })
    .eq("id", agendamentoId)
    .select("id, status")
    .maybeSingle();

  if (error) return { ok: false, erro: `Não foi possível atualizar: ${error.message}` };
  if (!data) return { ok: false, erro: "Agendamento não encontrado. Recarregue a página." };

  revalidarTudo();
  return { ok: true, dados: data as { id: number; status: StatusAgendamento } };
}

export async function atribuirEquipe(agendamentoId: number, equipeId: number | null): Promise<Resultado> {
  const { error } = await db
    .from("agendamentos")
    .update({ equipe_id: equipeId, atualizado_em: new Date().toISOString() })
    .eq("id", agendamentoId);

  if (error) return { ok: false, erro: `Não foi possível atribuir a equipe: ${error.message}` };

  revalidarTudo();
  return { ok: true, dados: undefined };
}

export async function remarcarAgendamento(agendamentoId: number, novaData: string): Promise<Resultado> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) {
    return { ok: false, erro: "Data inválida. Use o formato AAAA-MM-DD." };
  }

  const { error } = await db
    .from("agendamentos")
    .update({ data_sugerida: novaData, atualizado_em: new Date().toISOString() })
    .eq("id", agendamentoId);

  if (error) return { ok: false, erro: `Não foi possível remarcar: ${error.message}` };

  revalidarTudo();
  return { ok: true, dados: undefined };
}

export async function registrarMedicao(trechoId: number, alturaCm: number, data?: string): Promise<Resultado> {
  if (!Number.isFinite(alturaCm) || alturaCm < 0 || alturaCm > 300) {
    return { ok: false, erro: "Altura fora da faixa esperada (0 a 300 cm)." };
  }

  const { error } = await db.from("medicoes").insert({
    trecho_id: trechoId,
    altura_cm: alturaCm,
    ...(data ? { data } : {}),
  });

  if (error) return { ok: false, erro: `Não foi possível registrar a medição: ${error.message}` };

  revalidarTudo();
  return { ok: true, dados: undefined };
}

/**
 * Dispara a analise no backend Python (modelo .pkl + decisao da LLM).
 *
 * O Next nao carrega o modelo: quem faz isso e o `main.py`. Aqui so
 * encaminhamos e devolvemos um erro legivel se o servico estiver fora do ar,
 * que e o caso mais comum durante uma demonstracao.
 */
export async function analisarTrecho(trechoId: number): Promise<Resultado<unknown>> {
  try {
    const resposta = await fetch(`${API_URL}/analisar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trecho_id: trechoId, gravar: true }),
      signal: AbortSignal.timeout(120_000),
      cache: "no-store",
    });

    if (!resposta.ok) {
      const texto = await resposta.text();
      return { ok: false, erro: `O serviço de análise respondeu ${resposta.status}: ${texto.slice(0, 200)}` };
    }

    revalidarTudo();
    return { ok: true, dados: await resposta.json() };
  } catch {
    return {
      ok: false,
      erro: `Serviço de análise indisponível em ${API_URL}. Suba o backend com \`uvicorn main:app --reload\` na raiz do projeto.`,
    };
  }
}

export async function analisarMalhaInteira(): Promise<Resultado<unknown>> {
  try {
    const resposta = await fetch(`${API_URL}/analisar-todos`, {
      method: "POST",
      signal: AbortSignal.timeout(600_000),
      cache: "no-store",
    });

    if (!resposta.ok) {
      const texto = await resposta.text();
      return { ok: false, erro: `O serviço de análise respondeu ${resposta.status}: ${texto.slice(0, 200)}` };
    }

    revalidarTudo();
    return { ok: true, dados: await resposta.json() };
  } catch {
    return {
      ok: false,
      erro: `Serviço de análise indisponível em ${API_URL}. Suba o backend com \`uvicorn main:app --reload\` na raiz do projeto.`,
    };
  }
}

/** Pergunta em portugues sobre a malha — encaminhada ao endpoint /perguntar. */
export async function perguntarAoCopiloto(texto: string): Promise<Resultado<{ resposta: string }>> {
  const pergunta = texto.trim();
  if (pergunta.length < 3) return { ok: false, erro: "Escreva uma pergunta um pouco mais completa." };

  try {
    const resposta = await fetch(`${API_URL}/perguntar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: pergunta }),
      signal: AbortSignal.timeout(120_000),
      cache: "no-store",
    });

    if (!resposta.ok) {
      const corpo = await resposta.text();
      return { ok: false, erro: `O copiloto respondeu ${resposta.status}: ${corpo.slice(0, 200)}` };
    }

    return { ok: true, dados: (await resposta.json()) as { resposta: string } };
  } catch {
    return {
      ok: false,
      erro: `Copiloto indisponível em ${API_URL}. Suba o backend com \`uvicorn main:app --reload\` na raiz do projeto.`,
    };
  }
}
