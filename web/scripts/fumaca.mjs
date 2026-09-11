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

const db = createClient(
  env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_KEY,
  {
    db: { schema: "ia" },
    auth: { persistSession: false },
  },
);

/* A chave publishavel NAO pode ler nada. Se este teste passar a "ok", alguem ligou uma politica
   permissiva ou desligou o RLS, e o banco inteiro voltou a ser publico. */
const publico = createClient(env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
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
  precisaTer(["id", "rodovia", "km_inicio", "risco", "ocupacao_pct", "dias_ate_limite", "extensao_km", "chamado_id", "chamado_numero", "chamado_status"]),
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

/* A chave publishavel nao le NENHUMA tabela de `ia`, e a lista e explicita em vez de uma amostra:
   `trechos` sozinho provava o RLS de `trechos`, e as nove tabelas da semana de acesso e chamados
   entraram DEPOIS desse teste — cada uma delas e um lugar novo onde uma politica permissiva
   passaria despercebida. As mais sensiveis da lista nao sao as de vegetacao: `perfis` diz quem
   trabalha aqui, `convites` e `redefinicoes_senha` guardam hash de token, `chamado_fotos` carrega
   GPS e caminho de arquivo, e `notificacoes` e o que cada pessoa recebeu.

   O teste exige o errcode 42501 (permission denied) e NAO aceita "voltou vazio sem erro". Os dois
   sao seguros hoje, mas significam coisas diferentes: 42501 e a ausencia de GRANT, que e o desenho
   atual (`revoke all from anon, authenticated`); vazio-sem-erro seria grant concedido com RLS
   filtrando, ou seja, alguem mexeu. Medido em 11/09/2026: as 15 respondem 42501.

   Se este teste falhar porque o projeto passou a ler do navegador com a chave publishavel, a
   correcao e reescrever ESTE teste de proposito — nao afrouxa-lo para "qualquer erro serve". */
const FECHADAS_PARA_O_PUBLICO = [
  "trechos", "agendamentos", "previsoes", "medicoes", "execucoes", "equipes", "zonas_clima",
  "perfis", "convites", "redefinicoes_senha",
  "chamados", "chamado_eventos", "chamado_fotos", "chamado_adiamentos", "notificacoes",
];

await checar(
  "publishavel nao le nenhuma tabela de ia",
  async () => {
    const abertas = [];
    for (const tabela of FECHADAS_PARA_O_PUBLICO) {
      const { data, error } = await publico.from(tabela).select("*").limit(1);
      if (!error) abertas.push(`${tabela}: LEU (${data?.length ?? 0} linha(s), sem erro)`);
      else if (error.code !== "42501") abertas.push(`${tabela}: recusou com ${error.code}, esperado 42501`);
    }
    return { data: abertas.length ? null : [{ bloqueado: FECHADAS_PARA_O_PUBLICO.length }], error: abertas.length ? { message: abertas.join(" | ") } : null };
  },
);

/* Ler e so metade: a migracao revogou tambem insert/update/delete. Um grant de escrita sem grant de
   leitura e improvavel por acidente e devastador de proposito — `notificacoes` e `chamado_eventos`
   sao append-only e alimentam o historico que ninguem confere linha a linha. */
await checar(
  "publishavel nao ESCREVE em ia",
  async () => {
    const tentativas = [
      ["notificacoes", () => publico.from("notificacoes").insert({ tipo: "fumaca" })],
      ["chamado_eventos", () => publico.from("chamado_eventos").insert({ chamado_id: -1, tipo: "comentario" })],
      ["perfis", () => publico.from("perfis").update({ cargo: "super_admin" }).eq("usuario_id", "00000000-0000-0000-0000-000000000000")],
      ["trechos", () => publico.from("trechos").delete().eq("id", -1)],
    ];
    const passaram = [];
    for (const [nome, fn] of tentativas) {
      const { error } = await fn();
      if (!error) passaram.push(`${nome}: ESCREVEU`);
      else if (error.code !== "42501") passaram.push(`${nome}: recusou com ${error.code}, esperado 42501`);
    }
    return { data: passaram.length ? null : [{ bloqueado: tentativas.length }], error: passaram.length ? { message: passaram.join(" | ") } : null };
  },
);

/* A view tambem: ela e `security_invoker = on` desde 10/09/2026, entao ler por ela passa pelo RLS
   das tabelas. Antes disso era `SECURITY DEFINER` e a view era o furo que contornava tudo. */
await checar(
  "publishavel nao le a view vw_trecho_status",
  async () => {
    const { error } = await publico.from("vw_trecho_status").select("id").limit(1);
    return { data: error ? [{ bloqueado: true }] : null, error: error ? null : { message: "a chave publishavel leu a view" } };
  },
);
await checar("perfis", () => db.from("perfis").select("usuario_id, cargo, ativo").limit(5), (d) => (Array.isArray(d) ? null : "forma inesperada"));
await checar("convites", () => db.from("convites").select("id, email, expira_em").limit(5), (d) => (Array.isArray(d) ? null : "forma inesperada"));

/* Chamados: tabela vazia e resultado valido — a Fase 2 nasce sem nenhum chamado. O que se
   checa aqui e a FORMA do embed e a existencia das colunas, que e onde o PostgREST quebra. */
const listaOk = (d) => (Array.isArray(d) ? null : "forma inesperada");
await checar("chamados", () => db.from("chamados").select("id, numero, status, agendamento_id, trecho_id").limit(5), listaOk);
await checar("chamado_eventos", () => db.from("chamado_eventos").select("id, chamado_id, evento_id, tipo, origem").limit(5), listaOk);
await checar("chamado_fotos", () => db.from("chamado_fotos").select("id, chamado_id, etapa, papel, caminho").limit(5), listaOk);
await checar("chamado_adiamentos", () => db.from("chamado_adiamentos").select("id, chamado_id, motivo, decisao").limit(5), listaOk);
await checar("notificacoes", () => db.from("notificacoes").select("id, destinatario_id, tipo, lida_em").limit(5), listaOk);

await checar("bucket chamados privado", async () => {
  const { data, error } = await db.storage.getBucket("chamados");
  return { data: data ? [data] : null, error };
}, (d) => (d?.[0] && d[0].public === false ? null : "bucket ausente ou publico"));

/* O embed que a tela de chamados usa, com o LIDER aninhado dois niveis abaixo. E o caso que o
   TypeScript nao pega: `perfis!equipes_lider_id_fkey` e um nome de constraint, e se ele mudar a
   gaveta abre vazia em runtime. Espelha SELECT_CHAMADO de src/lib/chamados/queries.ts. */
const SELECT_CHAMADO = `
  *,
  agendamento:agendamentos!inner ( id, data_sugerida, prioridade, justificativa, origem, equipe_id,
    equipe:equipes ( id, nome, lider:perfis!equipes_lider_id_fkey ( nome ) ) ),
  trecho:trechos!inner ( id, rodovia, km_inicio, km_fim, uf, sentido, latitude, longitude, altura_limite_cm, observacoes )
`;

await checar(
  "chamado + agendamento/equipe/lider/trecho",
  () => db.from("chamados").select(SELECT_CHAMADO).limit(5),
  (data) => {
    if (!data?.length) return null; // base sem chamado ainda e valido
    if (!data[0].agendamento) return "embed de agendamento vazio — a FK sumiu?";
    if (!data[0].trecho) return "embed de trecho vazio — a FK sumiu?";
    if (!("equipe" in data[0].agendamento)) return "embed de equipe ausente";
    return null;
  },
);

/* Filtro sobre coluna EMBUTIDA: o PostgREST so aceita isso com `!inner`, e a lista de chamados
   filtra por equipe, rodovia e data assim. */
await checar(
  "filtros da lista sobre colunas embutidas",
  async () => {
    const alvos = [
      db.from("chamados").select(SELECT_CHAMADO).eq("agendamento.equipe_id", 1),
      db.from("chamados").select(SELECT_CHAMADO).eq("trecho.rodovia", "BR-116 Via Dutra"),
      db.from("chamados").select(SELECT_CHAMADO).gte("agendamento.data_sugerida", "2026-01-01"),
    ];
    for (const alvo of alvos) {
      const { error } = await alvo;
      if (error) return { data: null, error };
    }
    return { data: [{ ok: true }], error: null };
  },
);

/* O embed de /api/fotos/[id]: e por ele que a rota decide se o rocador lidera a equipe do chamado. */
await checar(
  "embed de permissao de /api/fotos/[id]",
  () =>
    db
      .from("chamado_fotos")
      .select("caminho, chamado:chamados!inner ( agendamento:agendamentos!inner ( equipe:equipes ( lider_id ) ) )")
      .limit(1),
  (d) => (Array.isArray(d) ? null : "forma inesperada"),
);

/* As quatro funcoes SQL alcancaveis por `db.rpc` com a chave secreta. A migracao revoga EXECUTE de
   public, e `service_role` NAO herda nada por ser service_role: sem o grant explicito estas quatro
   respondem "permission denied" e toda decisao do gestor para de funcionar. Chamamos cada uma com
   argumento que ela DEVE recusar: o que se prova e que ela existe, roda e recusa com o errcode
   proprio (P000x) em vez de 42501. */
await checar(
  "as rpc de chamado respondem com a chave secreta",
  async () => {
    // O errcode que cada uma devolve para id inexistente, MEDIDO em 10/09/2026. So
    // `registrar_evento_chamado` usa `if not found` e responde P0002; as outras caem no
    // proximo `raise` porque `NULL <> 'x'` e NULL, nao TRUE. Nada e gravado em nenhum caso.
    const esperado = {
      registrar_evento_chamado: "P0002",
      aprovar_chamado: "P0004",
      decidir_adiamento: "P0004",
      encerrar_chamado_admin: "P0004",
    };
    const args = {
      registrar_evento_chamado: {
        p_chamado_id: -1, p_evento_id: crypto.randomUUID(), p_tipo: "comentario", p_autor: null,
        p_origem: "painel", p_payload: {}, p_ocorrido_em: new Date().toISOString(),
      },
      aprovar_chamado: { p_chamado_id: -1, p_autor: null, p_km_rocados: 1, p_custo_reais: null, p_observacao: null },
      decidir_adiamento: { p_adiamento_id: -1, p_autor: null, p_aceito: true, p_nova_data: null, p_resposta: null },
      encerrar_chamado_admin: { p_chamado_id: -1, p_autor: null, p_data_execucao: "2026-01-01", p_altura_depois_cm: null, p_observacao: "" },
    };
    const negadas = [];
    for (const [nome, params] of Object.entries(args)) {
      const { error } = await db.rpc(nome, params);
      if (!error) negadas.push(`${nome}: aceitou argumento invalido`);
      else if (error.code === "42501" || /permission denied/i.test(error.message)) negadas.push(`${nome}: sem EXECUTE para a chave secreta`);
      else if (error.code !== esperado[nome]) negadas.push(`${nome}: recusou com ${error.code}, esperado ${esperado[nome]}`);
    }
    return { data: negadas.length ? null : [{ ok: true }], error: negadas.length ? { message: negadas.join(" | ") } : null };
  },
);

/* A chave publishavel nao executa NENHUMA das quatro decisoes. A leitura de `ia.chamados` ja esta
   coberta acima; o que sobra aqui e o EXECUTE, que e grant separado e foi revogado separado. */
await checar(
  "publishavel nao decide chamado",
  async () => {
    const chamadas = [
      ["aprovar_chamado", { p_chamado_id: 1, p_autor: null, p_km_rocados: 1, p_custo_reais: null, p_observacao: null }],
      ["encerrar_chamado_admin", { p_chamado_id: 1, p_autor: null, p_data_execucao: "2026-01-01", p_altura_depois_cm: null, p_observacao: "x" }],
      ["decidir_adiamento", { p_adiamento_id: 1, p_autor: null, p_aceito: true, p_nova_data: null, p_resposta: null }],
      ["registrar_evento_chamado", { p_chamado_id: 1, p_evento_id: crypto.randomUUID(), p_tipo: "comentario", p_autor: null, p_origem: "painel", p_payload: {}, p_ocorrido_em: new Date().toISOString() }],
    ];
    /* Exige 42501 (sem EXECUTE), pelo mesmo motivo das tabelas: "deu erro" tambem acontece quando a
       funcao RODA e recusa o argumento (P0001..P0004), e ai o grant ja teria sido concedido.
       Medido em 11/09/2026: as quatro respondem "permission denied for function". */
    const passaram = [];
    for (const [nome, params] of chamadas) {
      const { error } = await publico.rpc(nome, params);
      if (!error) passaram.push(`${nome}: EXECUTOU`);
      else if (error.code !== "42501") passaram.push(`${nome}: recusou com ${error.code}, esperado 42501 — a funcao RODOU`);
    }
    return { data: passaram.length ? null : [{ bloqueado: chamadas.length }], error: passaram.length ? { message: passaram.join(" | ") } : null };
  },
);

/* O bucket `chamados` guarda foto de faixa de dominio: placa, rosto e coordenada. O teste mira o
   que vaza de verdade — BAIXAR um arquivo cujo caminho o atacante ja tenha, e ASSINAR um link novo.
   `list()` nao entra como falha: com RLS ligada e zero politica ele volta `[]` sem erro (medido em
   11/09/2026), o que revela a existencia do bucket e nenhum nome de arquivo. */
await checar("publishavel nao baixa nem assina foto do bucket", async () => {
  const { data: foto } = await db.from("chamado_fotos").select("caminho").limit(1).maybeSingle();
  if (!foto) return { data: [{ vazio: true }], error: null }; // sem foto no banco, nada a provar
  const baixou = await publico.storage.from("chamados").download(foto.caminho);
  const assinou = await publico.storage.from("chamados").createSignedUrl(foto.caminho, 60);
  const problemas = [];
  if (!baixou.error) problemas.push("BAIXOU o arquivo");
  if (!assinou.error) problemas.push("ASSINOU uma URL");
  return { data: problemas.length ? null : [{ bloqueado: true }], error: problemas.length ? { message: problemas.join(" e ") } : null };
});

console.log(falhas ? `\n${falhas} verificação(ões) falharam.\n` : "\nTudo certo.\n");
process.exit(falhas ? 1 : 0);
