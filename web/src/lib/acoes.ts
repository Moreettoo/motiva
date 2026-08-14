"use server";

import { revalidatePath } from "next/cache";

import { erroFaltaEquipe } from "./dominio";
import { fmt, isoHoje } from "./format";
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

  // Aprovar ou concluir sem equipe é o estado que essa trava existe pra
  // evitar — ver `erroFaltaEquipe`. Descartar e reabrir não têm essa exigência.
  if (status === "aprovado" || status === "executado") {
    const { data: atual, error: erroAtual } = await db
      .from("agendamentos")
      .select("equipe_id")
      .eq("id", agendamentoId)
      .maybeSingle();

    if (erroAtual) return { ok: false, erro: `Não foi possível verificar o agendamento: ${erroAtual.message}` };
    if (!atual) return { ok: false, erro: "Agendamento não encontrado. Recarregue a página." };

    const erroEquipe = erroFaltaEquipe(atual.equipe_id, status);
    if (erroEquipe) return { ok: false, erro: erroEquipe };
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
 * Confere se a equipe existe e pode receber serviço novo.
 *
 * Compartilhada entre `gravarAlocacao` (arrastar no quadro) e `aprovarAgendamento`
 * (atribuir já na aprovação): as duas gravam `equipe_id` numa linha que ainda
 * está em aberto, então a mesma regra vale nos dois lugares.
 */
async function equipeUtilizavel(equipeId: number, permitirInativa: boolean): Promise<Resultado> {
  const { data: equipe, error } = await db
    .from("equipes")
    .select("id, ativo")
    .eq("id", equipeId)
    .maybeSingle();

  if (error) return { ok: false, erro: `Não foi possível ler a equipe: ${error.message}` };
  if (!equipe) return { ok: false, erro: "Equipe não encontrada. Recarregue a página." };
  if (!equipe.ativo && !permitirInativa) {
    return { ok: false, erro: "Essa equipe está desativada e não recebe serviço novo." };
  }
  return { ok: true, dados: undefined };
}

/**
 * Aprova a sugestão da IA, com data e equipe ajustáveis na hora.
 *
 * Existe pra aprovar deixar de ser um clique cego na sugestão: o gestor pode
 * manter a data como a IA sugeriu (mesmo vencida — por isso, ao contrário de
 * `gravarAlocacao`, não há checagem de data passada aqui), mas a equipe não é
 * opcional — ver `erroFaltaEquipe`. Só mexe em quem ainda está "sugerido" —
 * pela mesma razão de `gravarAlocacao`: evitar reescrever uma decisão que já
 * saiu da fila.
 */
export async function aprovarAgendamento(
  agendamentoId: number,
  ajustes: { data: string; equipeId: number | null },
): Promise<Resultado> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ajustes.data)) {
    return { ok: false, erro: "Data inválida. Use o formato AAAA-MM-DD." };
  }

  const erroEquipe = erroFaltaEquipe(ajustes.equipeId, "aprovado");
  if (erroEquipe) return { ok: false, erro: erroEquipe };

  const checagem = await equipeUtilizavel(ajustes.equipeId as number, false);
  if (!checagem.ok) return checagem;

  const { data, error } = await db
    .from("agendamentos")
    .update({
      status: "aprovado",
      data_sugerida: ajustes.data,
      equipe_id: ajustes.equipeId,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", agendamentoId)
    .eq("status", "sugerido")
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, erro: `Não foi possível aprovar: ${error.message}` };
  if (!data) return { ok: false, erro: "Sugestão não encontrada ou já decidida. Recarregue a página." };

  revalidarTudo();
  return { ok: true, dados: undefined };
}

/** Teto do texto livre do motivo. `justificativa` é `text` e nada no banco
 *  impede um despejo; 500 caracteres cabem uma reclamação inteira e ainda
 *  cabem na gaveta sem virar rolagem. */
const MOTIVO_MAX = 500;

/**
 * Cria uma roçada que a IA não propôs.
 *
 * NASCE `aprovado`, e isso não é conveniência — é a única forma de a linha
 * sobreviver ao lote das 06:00. `analisar_lote.py` mantém um agendamento aberto
 * por trecho: se encontra um `sugerido`, REESCREVE a linha no lugar (data,
 * justificativa e prioridade da LLM por cima), e `fechar_obsoletos` descarta
 * todo `sugerido` de trecho com mais de `LIMIAR_FECHAR_DIAS` de folga. Trecho
 * folgado é justamente o caso que se agenda na mão — reclamação de motorista,
 * obra, evento —, então uma roçada manual `sugerido` seria apagada na manhã
 * seguinte pela mesma máquina que ela existe para contornar. Em `aprovado` com
 * data futura o lote imprime "data mantida" e não toca: ele não desfaz decisão
 * humana.
 *
 * Consequência aceita: equipe é obrigatória (mesma regra de `aprovarAgendamento`
 * — ver `erroFaltaEquipe`) e o trecho para de receber sugestão da IA enquanto
 * esta roçada estiver aberta. O segundo é o comportamento que aprovar uma
 * sugestão já tem hoje.
 *
 * `previsao_id` e `modelo_usado` ficam nulos porque nenhuma previsão e nenhum
 * modelo originaram esta decisão. `origem` é quem carrega o fato — ver o
 * comentário de `Origem`, em `types.ts`, para por que não se deduz dos nulos.
 */
export async function criarRocadaManual(entrada: {
  trechoId: number;
  data: string;
  equipeId: number | null;
  motivo: string;
}): Promise<Resultado<{ id: number; data: string }>> {
  const { trechoId, data, equipeId } = entrada;
  const motivo = entrada.motivo.trim();

  if (!Number.isInteger(trechoId) || trechoId <= 0) {
    return { ok: false, erro: "Escolha o trecho que vai ser roçado." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return { ok: false, erro: "Data inválida. Use o formato AAAA-MM-DD." };
  }
  // Mesma trava de `gravarAlocacao`, e não a de `aprovarAgendamento`: aprovar
  // aceita data vencida porque a data já existia e é da IA. Aqui a data está
  // sendo escolhida agora, e escolher o passado nunca é intenção.
  if (data < isoHoje()) {
    return { ok: false, erro: "Não dá para agendar para um dia que já passou." };
  }
  if (motivo.length === 0) {
    return { ok: false, erro: "Escreva por que esta roçada foi marcada." };
  }
  if (motivo.length > MOTIVO_MAX) {
    return { ok: false, erro: `O motivo passou de ${MOTIVO_MAX} caracteres. Resuma um pouco.` };
  }

  const erroEquipe = erroFaltaEquipe(equipeId, "aprovado");
  if (erroEquipe) return { ok: false, erro: erroEquipe };

  const checagem = await equipeUtilizavel(equipeId as number, false);
  if (!checagem.ok) return checagem;

  // A view, e não `ia.trechos`: ela valida a existência do trecho E entrega o
  // `risco` já calculado, que é de onde sai a `prioridade`. A prioridade nunca
  // vem do gestor — a regra é "risco vem do prazo, não de opinião", e isso não
  // muda porque quem agendou foi gente.
  const { data: trecho, error: erroTrecho } = await db
    .from("vw_trecho_status")
    .select("id, risco, rodovia")
    .eq("id", trechoId)
    .maybeSingle();

  if (erroTrecho) return { ok: false, erro: `Não foi possível ler o trecho: ${erroTrecho.message}` };
  if (!trecho) return { ok: false, erro: "Trecho não encontrado. Recarregue a página." };

  const { data: aberto, error: erroAberto } = await db
    .from("agendamentos")
    .select("data_sugerida")
    .eq("trecho_id", trechoId)
    .in("status", ["sugerido", "aprovado"])
    .order("data_sugerida")
    .limit(1)
    .maybeSingle();

  if (erroAberto) {
    return { ok: false, erro: `Não foi possível conferir o trecho: ${erroAberto.message}` };
  }
  if (aberto) {
    return {
      ok: false,
      erro: `${trecho.rodovia} já tem uma roçada em aberto para ${fmt.dataMedia(aberto.data_sugerida)}. Ajuste aquela em vez de criar outra.`,
    };
  }

  const { data: linha, error } = await db
    .from("agendamentos")
    .insert({
      trecho_id: trechoId,
      previsao_id: null,
      data_sugerida: data,
      prioridade: trecho.risco,
      justificativa: motivo,
      fatores: null,
      status: "aprovado",
      origem: "manual",
      modelo_usado: null,
      equipe_id: equipeId,
    })
    .select("id, data_sugerida")
    .maybeSingle();

  if (error) {
    // 23505: o índice único parcial `ux_agendamento_aberto_por_trecho`. Chega
    // aqui quando alguém criou o agendamento do mesmo trecho entre a conferência
    // acima e este insert — a janela de corrida que o índice existe para fechar,
    // e a razão de ela virar recusa legível em vez de linha duplicada.
    if (error.code === "23505") {
      return {
        ok: false,
        erro: "Esse trecho acabou de receber uma roçada em aberto. Recarregue a página.",
      };
    }
    return { ok: false, erro: `Não foi possível agendar: ${error.message}` };
  }
  if (!linha) return { ok: false, erro: "A roçada não foi criada. Tente de novo." };

  revalidarTudo();
  return { ok: true, dados: { id: linha.id as number, data: linha.data_sugerida as string } };
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
    const checagem = await equipeUtilizavel(equipeId, opcoes.permitirPassado);
    if (!checagem.ok) return checagem;
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

/** Soltar no trilho: tira a equipe e o serviço volta a ser proposta da IA. */
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
