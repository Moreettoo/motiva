/**
 * Teste de fumaça da camada de dados.
 *
 * Bate em cada consulta que o painel faz, contra o banco de verdade, e falha se
 * alguma voltar erro, vazia onde nao deveria, ou com forma diferente da esperada.
 * Existe porque um erro de embed do PostgREST so aparece em runtime — o
 * TypeScript nao pega, e a tela quebra na frente do usuario.
 *
 *   node scripts/fumaca.mjs
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
  db: { schema: "ia" },
  auth: { persistSession: false },
});

let falhas = 0;

async function checar(nome, fn, validar) {
  try {
    const { data, error } = await fn();
    if (error) throw new Error(error.message);
    const problema = validar?.(data);
    if (problema) throw new Error(problema);
    const n = Array.isArray(data) ? data.length : data ? 1 : 0;
    console.log(`  ok    ${nome.padEnd(34)} ${n} registro(s)`);
  } catch (e) {
    falhas += 1;
    console.log(`  FALHA ${nome.padEnd(34)} ${e.message}`);
  }
}

const precisaTer = (campos) => (data) => {
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha) return "nenhum registro voltou";
  const faltando = campos.filter((c) => !(c in linha));
  return faltando.length ? `campos ausentes: ${faltando.join(", ")}` : null;
};

console.log("\nTeste de fumaça — camada de dados do painel Solo\n");

await checar(
  "vw_trecho_status",
  () => db.from("vw_trecho_status").select("*").limit(5),
  precisaTer(["id", "rodovia", "km_inicio", "risco", "ocupacao_pct", "dias_ate_limite", "extensao_km"]),
);

await checar("trechos", () => db.from("trechos").select("*").limit(5), precisaTer(["id", "rodovia", "especie"]));
await checar("medicoes", () => db.from("medicoes").select("*").limit(5), precisaTer(["trecho_id", "data", "altura_cm"]));
await checar(
  "previsoes",
  () => db.from("previsoes").select("*").limit(5),
  precisaTer(["trecho_id", "crescimento_cm_dia", "dias_ate_limite"]),
);
await checar("equipes", () => db.from("equipes").select("*").limit(5), precisaTer(["id", "nome", "capacidade_km_dia"]));
await checar(
  "execucoes",
  () => db.from("execucoes").select("*").limit(5),
  precisaTer(["trecho_id", "data_execucao", "km_rocados"]),
);
await checar("zonas_clima", () => db.from("zonas_clima").select("*").limit(5), precisaTer(["rodovia", "extensao_km"]));

await checar(
  "agendamentos + trecho/equipe/previsao",
  () =>
    db
      .from("agendamentos")
      .select(
        "id, data_sugerida, prioridade, status, fatores, trecho:trechos!inner(id,rodovia,km_inicio,km_fim,uf), equipe:equipes(id,nome,base_uf), previsao:previsoes(crescimento_cm_dia,dias_ate_limite)",
      )
      .limit(5),
  (data) => {
    if (!data?.length) return "nenhum agendamento";
    if (!data[0].trecho) return "embed de trecho vazio — a FK sumiu?";
    return null;
  },
);

await checar(
  "previsoes + especie do trecho",
  () => db.from("previsoes").select("data_previsao, crescimento_cm_dia, trechos!inner(especie)").limit(5),
  (data) => (data?.[0]?.trechos?.especie ? null : "embed de especie vazio"),
);

// Coerencia que o painel assume e que quebra a tela em silencio se nao valer.
await checar(
  "todo agendamento aponta para previsao do mesmo trecho",
  async () => {
    const { data, error } = await db
      .from("agendamentos")
      .select("id, trecho_id, previsao:previsoes(trecho_id)")
      .not("previsao_id", "is", null);
    if (error) return { data: null, error };
    const errados = data.filter((a) => a.previsao && a.previsao.trecho_id !== a.trecho_id);
    return { data: errados, error: null };
  },
  (data) => (data.length ? `${data.length} agendamento(s) ligados a previsao de outro trecho` : null),
);

await checar(
  "todo trecho tem pelo menos uma medicao",
  async () => {
    const [{ data: trechos }, { data: medicoes }] = await Promise.all([
      db.from("trechos").select("id"),
      db.from("medicoes").select("trecho_id"),
    ]);
    const comMedicao = new Set(medicoes.map((m) => m.trecho_id));
    return { data: trechos.filter((t) => !comMedicao.has(t.id)), error: null };
  },
  (data) => (data.length ? `${data.length} trecho(s) sem nenhuma medicao` : null),
);

await checar(
  "existe trecho em cada faixa de risco",
  async () => db.from("vw_trecho_status").select("risco"),
  (data) => {
    const vistos = new Set(data.map((t) => t.risco));
    const faltando = ["critica", "alta", "media", "baixa"].filter((r) => !vistos.has(r));
    return faltando.length ? `nenhum trecho com risco: ${faltando.join(", ")}` : null;
  },
);

console.log(falhas ? `\n${falhas} verificação(ões) falharam.\n` : "\nTudo certo.\n");
process.exit(falhas ? 1 : 0);
