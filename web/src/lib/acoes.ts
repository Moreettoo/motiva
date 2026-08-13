"use server";

import { revalidatePath } from "next/cache";

import { isoHoje } from "./format";
import { enfileirarAnalise, situacaoDaExecucao } from "./github";
import { db } from "./supabase";
import type { ExecucaoAnalise, StatusAgendamento } from "./types";

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
  const { data, error } = await db
    .from("agendamentos")
    .update({ equipe_id: equipeId, atualizado_em: new Date().toISOString() })
    .eq("id", agendamentoId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, erro: `Não foi possível atribuir a equipe: ${error.message}` };
  if (!data) return { ok: false, erro: "Agendamento não encontrado. Recarregue a página." };

  revalidarTudo();
  return { ok: true, dados: undefined };
}

/**
 * Grava data e equipe de uma vez.
 *
 * NÃO é exportada de propósito: num arquivo `"use server"` todo export vira
 * endpoint alcançável pela rede, e `permitirPassado` precisa continuar sendo
 * uma decisão do servidor. O desfazer legítimo entra por `desfazerAlocacao`.
 */
async function gravarAlocacao(
  agendamentoId: number,
  data: string,
  equipeId: number | null,
  opcoes: { permitirPassado: boolean },
): Promise<Resultado> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return { ok: false, erro: "Data inválida. Use o formato AAAA-MM-DD." };
  }
  if (!opcoes.permitirPassado && data < isoHoje()) {
    return { ok: false, erro: "Não dá para agendar para um dia que já passou." };
  }

  if (equipeId != null) {
    const { data: equipe, error: erroEquipe } = await db
      .from("equipes")
      .select("id, ativo")
      .eq("id", equipeId)
      .maybeSingle();

    if (erroEquipe) return { ok: false, erro: `Não foi possível ler a equipe: ${erroEquipe.message}` };
    if (!equipe) return { ok: false, erro: "Equipe não encontrada. Recarregue a página." };
    if (!equipe.ativo && !opcoes.permitirPassado) {
      return { ok: false, erro: "Essa turma está desativada e não recebe serviço novo." };
    }
  }

  // `.in(status)` + `.maybeSingle()` juntos: sem eles, um id inexistente ou um
  // serviço já executado devolve ok e o cartão fica no lugar novo na tela e no
  // lugar velho no banco — que é exatamente o que a ação única existe para evitar.
  const { data: linha, error } = await db
    .from("agendamentos")
    .update({ data_sugerida: data, equipe_id: equipeId, atualizado_em: new Date().toISOString() })
    .eq("id", agendamentoId)
    .in("status", ["sugerido", "aprovado"])
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, erro: `Não foi possível agendar: ${error.message}` };
  if (!linha) {
    return { ok: false, erro: "Serviço não encontrado ou já encerrado. Recarregue a página." };
  }

  revalidarTudo();
  return { ok: true, dados: undefined };
}

/** Soltar um serviço numa célula (dia, equipe) do quadro. */
export async function alocarAgendamento(
  agendamentoId: number,
  data: string,
  equipeId: number,
): Promise<Resultado> {
  return gravarAlocacao(agendamentoId, data, equipeId, { permitirPassado: false });
}

/**
 * Desfazer volta o serviço ao estado anterior, e esse estado pode ser um dia que
 * já passou — 26 dos 62 serviços da fila têm data vencida. Sem esta porta, o
 * desfazer morreria justamente nos cartões que mais serão arrastados.
 */
export async function desfazerAlocacao(
  agendamentoId: number,
  data: string,
  equipeId: number | null,
): Promise<Resultado> {
  return gravarAlocacao(agendamentoId, data, equipeId, { permitirPassado: true });
}

/** Soltar no trilho: tira a turma e o serviço volta a ser proposta da IA. */
export async function devolverParaFila(agendamentoId: number): Promise<Resultado> {
  const { data, error } = await db
    .from("agendamentos")
    .update({ equipe_id: null, atualizado_em: new Date().toISOString() })
    .eq("id", agendamentoId)
    .in("status", ["sugerido", "aprovado"])
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, erro: `Não foi possível devolver para a fila: ${error.message}` };
  if (!data) return { ok: false, erro: "Serviço não encontrado ou já encerrado. Recarregue a página." };

  revalidarTudo();
  return { ok: true, dados: undefined };
}

export async function remarcarAgendamento(agendamentoId: number, novaData: string): Promise<Resultado> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) {
    return { ok: false, erro: "Data inválida. Use o formato AAAA-MM-DD." };
  }

  const { data, error } = await db
    .from("agendamentos")
    .update({ data_sugerida: novaData, atualizado_em: new Date().toISOString() })
    .eq("id", agendamentoId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, erro: `Não foi possível remarcar: ${error.message}` };
  if (!data) return { ok: false, erro: "Agendamento não encontrado. Recarregue a página." };

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
 * Enfileira a reanalise de um trecho no GitHub Actions.
 *
 * Nao existe mais reanalise da malha inteira sob demanda: o lote roda todo dia
 * as 06:00 e a janela de previsao do Open-Meteo e a mesma de 16 dias, entao
 * reprocessar 50 trechos a tarde custava sete minutos para nao mudar quase nada.
 * O caso que pede reanalise pontual e outro — registrar uma medicao nova de
 * campo, que muda `altura_atual_cm` e portanto o prazo.
 */
export async function enfileirarAnaliseDoTrecho(trechoId: number): Promise<Resultado<ExecucaoAnalise>> {
  const resultado = await enfileirarAnalise(trechoId);
  return resultado.ok ? { ok: true, dados: resultado.dados } : { ok: false, erro: resultado.erro };
}

/** Consulta o andamento. O cliente chama em intervalo enquanto a execucao vive. */
export async function consultarAnalise(execucaoId: number): Promise<Resultado<ExecucaoAnalise>> {
  const resultado = await situacaoDaExecucao(execucaoId);
  if (!resultado.ok) return { ok: false, erro: resultado.erro };

  // Terminou: o banco mudou por fora do Next, entao a tela precisa reler.
  if (resultado.dados.situacao === "completed") revalidarTudo();

  return { ok: true, dados: resultado.dados };
}

/** Teto de contexto do copiloto: os agendamentos mais recentes cabem no prompt. */
const AGENDAMENTOS_NO_CONTEXTO = 60;

const SISTEMA_COPILOTO =
  "Você responde perguntas de gestores da Motiva sobre o planejamento de roçada. " +
  "Use apenas os dados fornecidos. Seja direto, cite rodovia e km. " +
  "Se o dado não estiver na lista, diga que não tem.";

/**
 * Pergunta em portugues sobre a malha.
 *
 * Diferente de `analisarTrecho`, esta acao nao passa pelo backend Python: ela
 * so precisa de agendamentos e da OpenAI, nunca do `.pkl`. Manter o copiloto
 * aqui e o que permite o painel rodar sozinho na Vercel.
 */
export async function perguntarAoCopiloto(texto: string): Promise<Resultado<{ resposta: string }>> {
  const pergunta = texto.trim();
  if (pergunta.length < 3) return { ok: false, erro: "Escreva uma pergunta um pouco mais completa." };

  const chave = process.env.OPENAI_API_KEY;
  if (!chave) {
    return {
      ok: false,
      erro: "O copiloto precisa da variável OPENAI_API_KEY. Configure-a no ambiente do painel (web/.env.local ou nas variáveis do deploy).",
    };
  }

  const { data, error } = await db
    .from("agendamentos")
    .select("*, trechos(rodovia, km_inicio, km_fim, uf, tipo_pista)")
    .order("criado_em", { ascending: false })
    .limit(AGENDAMENTOS_NO_CONTEXTO);

  if (error) return { ok: false, erro: `Não foi possível ler os agendamentos: ${error.message}` };
  if (!data || data.length === 0) {
    return { ok: true, dados: { resposta: "Ainda não há análises. Rode a análise em lote primeiro." } };
  }

  let resposta: Response;
  try {
    resposta = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
        messages: [
          { role: "system", content: SISTEMA_COPILOTO },
          { role: "user", content: `Dados:\n${JSON.stringify(data)}\n\nPergunta: ${pergunta}` },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, erro: "Não foi possível falar com a OpenAI. Verifique a conexão e tente de novo." };
  }

  if (!resposta.ok) {
    const corpo = await resposta.text();
    return { ok: false, erro: `A OpenAI respondeu ${resposta.status}: ${corpo.slice(0, 200)}` };
  }

  const corpo = (await resposta.json()) as { choices?: { message?: { content?: string | null } }[] };
  const conteudo = corpo.choices?.[0]?.message?.content;
  if (!conteudo) return { ok: false, erro: "A OpenAI respondeu sem conteúdo. Tente perguntar de novo." };

  return { ok: true, dados: { resposta: conteudo } };
}
