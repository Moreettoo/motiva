import "server-only";

import type { ExecucaoAnalise } from "./types";

/**
 * Disparo da reanálise pelo GitHub Actions.
 *
 * O modelo de crescimento é um `HistGradientBoostingRegressor` serializado em
 * `modelo_vegetacao.pkl`. Rodá-lo exige scikit-learn, scipy e numpy — mais de
 * 250 MB descompactados, acima do teto de bundle de uma função serverless. Em
 * vez de hospedar um segundo serviço só para isso, o painel aciona o workflow
 * que já existe, já tem os segredos e já roda todo dia às 06:00.
 *
 * A contrapartida é que a análise deixa de ser síncrona: aqui só enfileiramos e
 * devolvemos o identificador da execução, e o cliente acompanha por `situacaoDaExecucao`.
 */

const REPO = process.env.GITHUB_REPO ?? "Moreettoo/motiva";
const WORKFLOW = process.env.GITHUB_WORKFLOW_FILE ?? "main.yml";
const RAMO = process.env.GITHUB_REF ?? "main";

const API = "https://api.github.com";

export type ResultadoGitHub<T> = { ok: true; dados: T } | { ok: false; erro: string };

function cabecalhos(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function semToken(): { ok: false; erro: string } {
  return {
    ok: false,
    erro:
      "A reanálise sob demanda precisa da variável GITHUB_TOKEN (token de acesso pessoal " +
      "com permissão Actions: Read and write no repositório). Configure-a no ambiente do painel.",
  };
}

function paraExecucao(r: {
  id: number;
  name?: string | null;
  display_title?: string | null;
  html_url: string;
  status: string | null;
  conclusion: string | null;
  created_at: string;
}): ExecucaoAnalise {
  return {
    id: r.id,
    nome: r.display_title || r.name || "Reanálise",
    url: r.html_url,
    situacao: r.status ?? "queued",
    desfecho: r.conclusion,
    criadaEm: r.created_at,
  };
}

async function listarExecucoes(token: string, limite = 10) {
  const resposta = await fetch(
    `${API}/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=${limite}`,
    { headers: cabecalhos(token), cache: "no-store" },
  );

  if (!resposta.ok) {
    throw new Error(`GitHub respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 160)}`);
  }

  const corpo = (await resposta.json()) as { workflow_runs?: Parameters<typeof paraExecucao>[0][] };
  return (corpo.workflow_runs ?? []).map(paraExecucao);
}

/**
 * Enfileira a reanálise de um trecho e devolve a execução criada.
 *
 * `workflow_dispatch` responde 204 sem corpo — não há id de execução na
 * resposta. Por isso o `run-name` do workflow carrega o id do trecho, e aqui a
 * gente procura a execução recém-criada por esse nome. A janela de 90 s evita
 * casar com uma execução antiga do mesmo trecho.
 */
export async function enfileirarAnalise(trechoId: number): Promise<ResultadoGitHub<ExecucaoAnalise>> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return semToken();

  try {
    const jaRodando = await listarExecucoes(token).then((es) => es.find((e) => e.situacao !== "completed"));
    if (jaRodando) {
      return {
        ok: false,
        erro: `Já existe uma reanálise em andamento (${jaRodando.nome}). Espere ela terminar antes de disparar outra.`,
      };
    }

    const disparo = await fetch(`${API}/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      headers: { ...cabecalhos(token), "Content-Type": "application/json" },
      body: JSON.stringify({ ref: RAMO, inputs: { trecho_id: String(trechoId) } }),
      cache: "no-store",
    });

    if (disparo.status !== 204) {
      const corpo = await disparo.text();
      return { ok: false, erro: `O GitHub recusou o disparo (${disparo.status}): ${corpo.slice(0, 200)}` };
    }

    // A execução não aparece na listagem no mesmo instante do 204.
    //
    // A comparação é pelo FIM do nome, não por `includes`: o id fica no fim do
    // `run-name`, e "…trecho 31" contém "trecho 3" — o trecho 3 casaria com a
    // execução do 31 e o painel acompanharia a análise errada.
    const marca = `trecho ${trechoId}`;
    const limite = Date.now() - 90_000;

    for (let tentativa = 0; tentativa < 8; tentativa += 1) {
      await new Promise((pronto) => setTimeout(pronto, 1_200));

      const recente = (await listarExecucoes(token)).find(
        (e) => e.nome.trimEnd().endsWith(marca) && Date.parse(e.criadaEm) >= limite,
      );
      if (recente) return { ok: true, dados: recente };
    }

    return {
      ok: false,
      erro: "A análise foi enfileirada, mas o GitHub ainda não listou a execução. Confira em Actions no repositório.",
    };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao falar com o GitHub." };
  }
}

export async function situacaoDaExecucao(execucaoId: number): Promise<ResultadoGitHub<ExecucaoAnalise>> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return semToken();

  try {
    const resposta = await fetch(`${API}/repos/${REPO}/actions/runs/${execucaoId}`, {
      headers: cabecalhos(token),
      cache: "no-store",
    });

    if (!resposta.ok) {
      return { ok: false, erro: `GitHub respondeu ${resposta.status} ao consultar a execução.` };
    }

    return { ok: true, dados: paraExecucao(await resposta.json()) };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao consultar a execução." };
  }
}
