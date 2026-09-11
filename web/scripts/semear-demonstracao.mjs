/**
 * Semeia a demonstração: usuários de cada cargo e um chamado em cada estado.
 *
 *   node scripts/semear-demonstracao.mjs            # semeia (idempotente)
 *   node scripts/semear-demonstracao.mjs --limpar   # desfaz tudo o que semeou
 *
 * Le web/.env.local como o teste de fumaça. A senha unica sai de SEED_SENHA
 * (obrigatoria, sem valor de reserva) e e impressa no fim.
 *
 * ------------------------------------------------------------------------
 * POR QUE ELE PRECISA DESFAZER DE VERDADE
 * ------------------------------------------------------------------------
 * Este banco tambem e o de producao da demonstracao. Um seed que so escreve
 * vira sujeira permanente: chamado de mentira na fila de decisao, execucao de
 * mentira no historico e — pior — MEDICAO de mentira, que e entrada do modelo e
 * mudaria a agenda de um trecho real. Por isso `--limpar` remove tambem o que a
 * funcao `ia.aprovar_chamado` cria por tabela (execucao e medicao) e devolve o
 * `lider_id` das equipes ao nulo em que estava.
 *
 * ------------------------------------------------------------------------
 * COMO A IDEMPOTENCIA E GARANTIDA
 * ------------------------------------------------------------------------
 * Duas marcas, e nenhuma delas depende de coluna nova:
 *   - agendamento: `justificativa` comeca com "Demonstração:" e `origem` e
 *     'manual'. E o que `--limpar` procura.
 *   - evento: o `evento_id` de cada passo e DERIVADO do trecho e do nome do
 *     passo (UUID v5 sobre uma semente fixa). `ia.registrar_evento_chamado`
 *     devolve o chamado sem alterar nada quando o `evento_id` ja existe, entao
 *     rodar duas vezes nao empilha historico.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);

const db = createClient(
  env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_KEY,
  { db: { schema: "ia" }, auth: { persistSession: false } },
);

const LIMPAR = process.argv.includes("--limpar");
const DOMINIO = "demo.highwai.com.br";
/* Sem valor de reserva, e isto e deliberado. O literal que ficava aqui era a
   senha de `super.demo@demo.highwai.com.br`, que nasce `super_admin` com
   `senha_provisoria: false`, NO MESMO BANCO da demonstracao e de producao: quem
   lesse este arquivo abria a URL da Vercel e entrava como Super Admin. Pior,
   `garantirUsuario` redefine a senha a cada execucao, entao troca-la a mao no
   painel nao grudava. Agora ela vem de SEED_SENHA (no `.env.local`, que e
   gitignored) e falhar aqui e melhor que o silencio. */
const SENHA = process.env.SEED_SENHA || env.SEED_SENHA;
if (!SENHA || SENHA.length < 10) {
  console.error("SEED_SENHA nao definida, ou com menos de 10 caracteres.");
  console.error('Defina-a em web/.env.local, e ela nao pode ser commitada:  SEED_SENHA="..."');
  process.exit(1);
}

const MARCA = "Demonstração:"; // prefixo da justificativa: e a marca que --limpar procura
const BALDE = "chamados";

/* ----------------------------------------------------------------------
   Utilidades
   ---------------------------------------------------------------------- */

/**
 * "Hoje" em Brasília, pelo mesmo motivo de `isoHoje()` no painel e de
 * `hoje_brasilia()` no lote: das 21 h à meia-noite o relógio de um servidor em
 * UTC já virou o dia, e um chamado marcado para hoje nasceria vencido.
 *
 * `en-CA` porque ele formata AAAA-MM-DD, que é o formato que o banco recebe.
 * O deslocamento é feito em UTC sobre a data já resolvida no fuso — passar por
 * `new Date(string local)` reintroduziria exatamente o erro que isto evita.
 */
const diaEmBrasilia = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function isoData(deslocamentoEmDias = 0) {
  const [ano, mes, dia] = diaEmBrasilia.format(new Date()).split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia + deslocamentoEmDias));
  return d.toISOString().slice(0, 10);
}

/**
 * UUID determinístico (v5 sobre SHA-1) — o mesmo `evento_id` em toda rodada.
 * Sem isso, uma segunda execução empilharia histórico no mesmo chamado.
 */
function uuidDeterminado(semente) {
  const h = createHash("sha1").update(`motiva-demo:${semente}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const s = h.subarray(0, 16).toString("hex");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

function parar(mensagem, erro) {
  console.error(`\nFALHOU: ${mensagem}${erro ? ` — ${erro.message ?? erro}` : ""}`);
  process.exit(1);
}

/** Erro do PostgREST/RPC vira parada com contexto; sucesso devolve o dado. */
function ou(resultado, mensagem) {
  if (resultado.error) parar(mensagem, resultado.error);
  return resultado.data;
}

const fmt = (n) => new Intl.NumberFormat("pt-BR").format(n);

/* ----------------------------------------------------------------------
   Usuários
   ---------------------------------------------------------------------- */

/** Nome curto da equipe: "Equipe Roçada SP-Interior 01" -> "SP-Interior 01". */
const nomeCurto = (nome) => nome.replace(/^Equipe\s+Ro[çc]ada\s+/i, "").trim();

/**
 * Cria — ou reativa, se `--limpar` a desativou — a conta de demonstração.
 * Reativar importa: sem isso, semear depois de limpar devolveria um painel com
 * usuarios listados e nenhum deles capaz de entrar.
 */
async function garantirUsuario({ email, nome, cargo }) {
  const existente = ou(
    await db.from("perfis").select("usuario_id, ativo, cargo").eq("email", email).maybeSingle(),
    `consultar perfil ${email}`,
  );

  if (existente) {
    const { error } = await db.auth.admin.updateUserById(existente.usuario_id, {
      password: SENHA,
      email_confirm: true,
      app_metadata: { cargo },
      user_metadata: { nome },
    });
    if (error) parar(`atualizar ${email} no Auth`, error);
    ou(
      await db
        .from("perfis")
        .update({ nome, cargo, ativo: true, senha_provisoria: false, desativado_em: null, desativado_por: null })
        .eq("usuario_id", existente.usuario_id),
      `reativar perfil ${email}`,
    );
    return { usuarioId: existente.usuario_id, email, nome, cargo, acao: existente.ativo ? "ja existia" : "reativado" };
  }

  const { data: criado, error } = await db.auth.admin.createUser({
    email,
    password: SENHA,
    email_confirm: true,
    app_metadata: { cargo },
    user_metadata: { nome },
  });
  if (error) parar(`criar ${email} no Auth`, error);

  ou(
    await db.from("perfis").insert({
      usuario_id: criado.user.id,
      nome,
      email,
      cargo,
      ativo: true,
      senha_provisoria: false, // conta de demonstracao nao pode cair em /definir-senha no meio da apresentacao
    }),
    `criar perfil ${email}`,
  );
  return { usuarioId: criado.user.id, email, nome, cargo, acao: "criado" };
}

async function semearUsuarios() {
  const pessoas = [];
  pessoas.push(await garantirUsuario({ email: `super.demo@${DOMINIO}`, nome: "Super Demo", cargo: "super_admin" }));
  pessoas.push(await garantirUsuario({ email: `admin.demo@${DOMINIO}`, nome: "Admin Demo", cargo: "admin" }));
  pessoas.push(await garantirUsuario({ email: `analista.demo@${DOMINIO}`, nome: "Analista Demo", cargo: "analista" }));

  const equipes = ou(
    await db.from("equipes").select("id, nome, lider_id").eq("ativo", true).order("id"),
    "listar equipes ativas",
  );

  const lideres = new Map();
  for (const equipe of equipes) {
    const pessoa = await garantirUsuario({
      email: `lider.${equipe.id}.demo@${DOMINIO}`,
      nome: `Líder ${nomeCurto(equipe.nome)}`,
      cargo: "rocador",
    });
    // So preenche o que estava vazio: uma equipe com lider de verdade nao e
    // sequestrada pela demonstracao.
    if (!equipe.lider_id) {
      ou(await db.from("equipes").update({ lider_id: pessoa.usuarioId }).eq("id", equipe.id), `ligar líder à equipe ${equipe.id}`);
      pessoa.acao += ", líder da equipe";
    }
    lideres.set(equipe.id, pessoa.usuarioId);
    pessoas.push(pessoa);
  }

  return { pessoas, equipes, lideres };
}

/* ----------------------------------------------------------------------
   Fotos
   ---------------------------------------------------------------------- */

const ARQUIVOS = {
  medida: "foto-medida.jpg",
  extensao: "foto-extensao.jpg",
  resultado: "foto-resultado.jpg",
  "extensao-fim": "foto-extensao-fim.jpg",
};

function lerFixture(chave) {
  try {
    return readFileSync(new URL(`./fixtures/${ARQUIVOS[chave]}`, import.meta.url));
  } catch {
    return parar(
      `a foto scripts/fixtures/${ARQUIVOS[chave]} não existe. ` +
        "Sem as quatro fotos o chamado não passa de 'aberto' — a função SQL exige duas por etapa.",
    );
  }
}

/**
 * Sobe as duas fotos de uma etapa e registra as linhas de `chamado_fotos`.
 * O caminho é determinístico (`<chamado>/<evento>/<papel>.jpg`) para o `upsert`
 * substituir o objeto em vez de acumular um por rodada.
 */
async function subirFotos({ chamadoId, eventoId, etapa, papeis, trecho, autorId }) {
  for (const [papel, chave] of papeis) {
    const bytes = lerFixture(chave);
    const caminho = `${chamadoId}/${eventoId}/${papel}.jpg`;

    const { error } = await db.storage.from(BALDE).upload(caminho, bytes, { contentType: "image/jpeg", upsert: true });
    if (error) parar(`subir ${caminho} para o balde ${BALDE}`, error);

    const capturada = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 h atrás
    ou(
      await db.from("chamado_fotos").upsert(
        {
          chamado_id: chamadoId,
          evento_id: eventoId,
          etapa,
          papel,
          caminho,
          largura_px: 1600,
          altura_px: 1200,
          bytes: bytes.length,
          // GPS a poucos metros do ponto medio do trecho: a gaveta mostra a
          // distancia, e distancia zero pareceria coordenada copiada.
          latitude: Number(trecho.latitude) + 0.001,
          longitude: Number(trecho.longitude) - 0.001,
          precisao_m: 8,
          capturada_em: capturada,
          autor_id: autorId,
        },
        { onConflict: "caminho" },
      ),
      `registrar a foto ${papel} do chamado ${chamadoId}`,
    );
  }
}

/* ----------------------------------------------------------------------
   Chamados
   ---------------------------------------------------------------------- */

/** Um evento pelas funções SQL, com `evento_id` derivado do trecho e do passo. */
async function evento({ chamadoId, trechoId, passo, tipo, autorId, origem, payload = {}, ocorridoEm }) {
  const eventoId = uuidDeterminado(`${trechoId}:${passo}`);
  const { error } = await db.rpc("registrar_evento_chamado", {
    p_chamado_id: chamadoId,
    p_evento_id: eventoId,
    p_tipo: tipo,
    p_autor: autorId,
    p_origem: origem,
    p_payload: payload,
    p_ocorrido_em: ocorridoEm ?? new Date().toISOString(),
  });
  if (error) parar(`registrar ${tipo} no chamado ${chamadoId}`, error);
  return eventoId;
}

/** Insere o agendamento aprovado com equipe; o gatilho cria o chamado. */
async function abrirChamado({ trecho, equipeId, estado, dataSugerida }) {
  const agendamento = ou(
    await db
      .from("agendamentos")
      .insert({
        trecho_id: trecho.id,
        data_sugerida: dataSugerida,
        prioridade: "alta",
        justificativa: `${MARCA} ${estado}`,
        status: "aprovado",
        equipe_id: equipeId,
        origem: "manual",
      })
      .select("id")
      .single(),
    `criar o agendamento de demonstração do trecho ${trecho.id}`,
  );

  const chamado = ou(
    await db.from("chamados").select("id, numero, status").eq("agendamento_id", agendamento.id).single(),
    `achar o chamado que o gatilho criou para o agendamento ${agendamento.id}`,
  );
  return { agendamentoId: agendamento.id, ...chamado };
}

async function levarAoEstado({ estado, chamado, trecho, liderId, adminId }) {
  const iniciar = async () => {
    const eventoId = uuidDeterminado(`${trecho.id}:iniciado`);
    await subirFotos({
      chamadoId: chamado.id,
      eventoId,
      etapa: "inicio",
      papeis: [["medida", "medida"], ["extensao", "extensao"]],
      trecho,
      autorId: liderId,
    });
    await evento({ chamadoId: chamado.id, trechoId: trecho.id, passo: "iniciado", tipo: "iniciado", autorId: liderId, origem: "campo" });
  };

  const finalizar = async () => {
    const eventoId = uuidDeterminado(`${trecho.id}:finalizado`);
    await subirFotos({
      chamadoId: chamado.id,
      eventoId,
      etapa: "fim",
      papeis: [["resultado", "resultado"], ["extensao", "extensao-fim"]],
      trecho,
      autorId: liderId,
    });
    await evento({
      chamadoId: chamado.id,
      trechoId: trecho.id,
      passo: "finalizado",
      tipo: "finalizado",
      autorId: liderId,
      origem: "campo",
      payload: { altura_final_cm: 6 },
    });
  };

  switch (estado) {
    case "aberto":
    case "aberto-atrasado":
      break;

    case "em_andamento":
      await iniciar();
      break;

    case "aguardando_aprovacao":
      await iniciar();
      await finalizar();
      break;

    case "devolvido":
      await iniciar();
      await finalizar();
      await evento({
        chamadoId: chamado.id,
        trechoId: trecho.id,
        passo: "devolvido",
        tipo: "devolvido",
        autorId: adminId,
        origem: "painel",
        payload: { comentario: "Foto do resultado escura; refazer" },
      });
      break;

    case "adiamento_solicitado":
      await evento({
        chamadoId: chamado.id,
        trechoId: trecho.id,
        passo: "adiamento",
        tipo: "adiamento_solicitado",
        autorId: liderId,
        origem: "campo",
        payload: { motivo: "chuva", detalhe: "Chuva forte desde as 9 h", data_sugerida: isoData(3) },
      });
      break;

    case "concluido": {
      await iniciar();
      await finalizar();
      const { error } = await db.rpc("aprovar_chamado", {
        p_chamado_id: chamado.id,
        p_autor: adminId,
        p_km_rocados: Number(trecho.km_fim) - Number(trecho.km_inicio),
        p_custo_reais: 4200,
        p_observacao: `${MARCA} conclusão`,
      });
      if (error) parar(`aprovar o chamado ${chamado.numero}`, error);
      break;
    }

    case "cancelado":
      // Descartar o agendamento e o caminho REAL do cancelamento: quem cancela
      // e o gatilho, com origem `lote`. Chamar `cancelado` direto pularia isso.
      ou(
        await db.from("agendamentos").update({ status: "descartado", atualizado_em: new Date().toISOString() }).eq("id", chamado.agendamentoId),
        `descartar o agendamento ${chamado.agendamentoId}`,
      );
      break;

    default:
      parar(`estado desconhecido: ${estado}`);
  }
}

const ROTEIRO = [
  { estado: "aberto", rotulo: "aberto (amanhã)", dias: 1 },
  { estado: "aberto-atrasado", rotulo: "aberto e atrasado", dias: -4 },
  { estado: "em_andamento", rotulo: "em andamento", dias: 0 },
  { estado: "aguardando_aprovacao", rotulo: "aguardando aprovação", dias: 0 },
  { estado: "devolvido", rotulo: "devolvido", dias: -1 },
  { estado: "adiamento_solicitado", rotulo: "adiamento pedido", dias: 1 },
  { estado: "concluido", rotulo: "concluído", dias: -2 },
  { estado: "cancelado", rotulo: "cancelado", dias: 2 },
];

async function semearChamados({ equipes, lideres, adminId }) {
  const jaSemeados = ou(
    await db.from("agendamentos").select("id").like("justificativa", `${MARCA}%`).limit(1),
    "procurar agendamentos de demonstração",
  );
  if (jaSemeados.length) {
    console.log("  chamados: já semeados (há agendamento com justificativa \"Demonstração:\"). Nada a fazer.");
    return [];
  }

  // Trecho sem agendamento aberto: o indice unico parcial
  // `ux_agendamento_aberto_por_trecho` recusaria um segundo.
  const ocupados = new Set(
    ou(
      await db.from("agendamentos").select("trecho_id").in("status", ["sugerido", "aprovado"]),
      "listar trechos com agendamento aberto",
    ).map((a) => a.trecho_id),
  );
  const livres = ou(
    await db.from("trechos").select("id, rodovia, km_inicio, km_fim, latitude, longitude").order("id"),
    "listar trechos",
    // Sem coordenada nao da para posicionar a foto, e a gaveta mostra a
    // distancia do GPS ao ponto medio do trecho — "0 m de um ponto nulo" seria
    // a tela inventando precisao.
  ).filter((t) => !ocupados.has(t.id) && t.latitude !== null && t.longitude !== null);

  if (livres.length < ROTEIRO.length) {
    parar(`só há ${livres.length} trecho(s) sem agendamento aberto; o roteiro precisa de ${ROTEIRO.length}`);
  }

  const criados = [];
  for (const [i, passo] of ROTEIRO.entries()) {
    const trecho = livres[i];
    const equipe = equipes[i % equipes.length];
    const chamado = await abrirChamado({
      trecho,
      equipeId: equipe.id,
      estado: passo.rotulo,
      dataSugerida: isoData(passo.dias),
    });

    await levarAoEstado({
      estado: passo.estado,
      chamado,
      trecho,
      liderId: lideres.get(equipe.id),
      adminId,
    });

    const final = ou(await db.from("chamados").select("status").eq("id", chamado.id).single(), `reler o chamado ${chamado.numero}`);
    criados.push({
      numero: chamado.numero,
      estado: final.status,
      trecho: `${trecho.rodovia} km ${trecho.km_inicio}-${trecho.km_fim}`,
      equipe: equipe.nome,
      data: isoData(passo.dias),
    });
  }
  return criados;
}

/* ----------------------------------------------------------------------
   Limpeza
   ---------------------------------------------------------------------- */

async function limpar() {
  const agendamentos = ou(
    await db.from("agendamentos").select("id").like("justificativa", `${MARCA}%`),
    "procurar agendamentos de demonstração",
  );
  const idsAgendamento = agendamentos.map((a) => a.id);
  console.log(`  agendamentos de demonstração: ${idsAgendamento.length}`);

  if (idsAgendamento.length) {
    const chamados = ou(
      await db.from("chamados").select("id, numero").in("agendamento_id", idsAgendamento),
      "listar os chamados de demonstração",
    );
    const idsChamado = chamados.map((c) => c.id);
    console.log(`  chamados: ${idsChamado.length} (${chamados.map((c) => c.numero).join(", ") || "nenhum"})`);

    if (idsChamado.length) {
      const fotos = ou(await db.from("chamado_fotos").select("caminho").in("chamado_id", idsChamado), "listar as fotos");
      if (fotos.length) {
        const { error } = await db.storage.from(BALDE).remove(fotos.map((f) => f.caminho));
        if (error) parar("apagar as fotos do balde", error);
      }
      console.log(`  fotos apagadas do balde: ${fotos.length}`);
    }

    // A execucao e a MEDICAO que `ia.aprovar_chamado` gravou. A medicao e a que
    // mais importa: ela e entrada do modelo, e deixada para tras mudaria a
    // agenda de um trecho real na rodada seguinte do lote.
    const execucoes = ou(
      await db.from("execucoes").select("id, trecho_id, data_execucao, altura_depois_cm, criado_em").in("agendamento_id", idsAgendamento),
      "listar as execuções de demonstração",
    );
    let medicoesApagadas = 0;
    for (const e of execucoes) {
      const alvo = ou(
        await db
          .from("medicoes")
          .select("id")
          .eq("trecho_id", e.trecho_id)
          .eq("data", e.data_execucao)
          .eq("altura_cm", e.altura_depois_cm)
          .gte("criado_em", e.criado_em)
          .order("id", { ascending: false })
          .limit(1),
        "achar a medição gerada pela aprovação",
      );
      if (alvo.length) {
        ou(await db.from("medicoes").delete().eq("id", alvo[0].id), "apagar a medição de demonstração");
        medicoesApagadas += 1;
      }
    }
    if (execucoes.length) ou(await db.from("execucoes").delete().in("agendamento_id", idsAgendamento), "apagar as execuções");
    console.log(`  execuções apagadas: ${execucoes.length} | medições apagadas: ${medicoesApagadas}`);

    // Chamados antes dos agendamentos: a FK e `on delete restrict`. Eventos,
    // fotos, adiamentos e notificacoes saem em cascata com o chamado.
    if (idsChamado.length) ou(await db.from("chamados").delete().in("id", idsChamado), "apagar os chamados");
    ou(await db.from("agendamentos").delete().in("id", idsAgendamento), "apagar os agendamentos");
  }

  const perfis = ou(
    await db.from("perfis").select("usuario_id, email, ativo").like("email", `%@${DOMINIO}`),
    "listar os perfis de demonstração",
  );
  const ids = perfis.map((p) => p.usuario_id);
  if (ids.length) {
    // Devolve as equipes ao lider nulo em que estavam antes do seed.
    ou(await db.from("equipes").update({ lider_id: null }).in("lider_id", ids), "soltar o líder das equipes");
    ou(
      await db.from("perfis").update({ ativo: false, desativado_em: new Date().toISOString() }).in("usuario_id", ids),
      "desativar os perfis de demonstração",
    );
  }
  console.log(`  usuários @${DOMINIO} desativados: ${ids.length} (as contas ficam, sem acesso)`);
  console.log("\nLimpeza concluída.");
}

/* ----------------------------------------------------------------------
   Principal
   ---------------------------------------------------------------------- */

console.log(`\nSeed de demonstração — ${LIMPAR ? "LIMPANDO" : "semeando"}\n`);

if (LIMPAR) {
  await limpar();
} else {
  const { pessoas, equipes, lideres } = await semearUsuarios();
  const adminId = pessoas.find((p) => p.cargo === "admin").usuarioId;
  const chamados = await semearChamados({ equipes, lideres, adminId });

  console.log("\nUsuários");
  console.log("  " + "e-mail".padEnd(36) + "cargo".padEnd(14) + "situação");
  for (const p of pessoas) console.log("  " + p.email.padEnd(36) + p.cargo.padEnd(14) + p.acao);
  console.log(`\n  Senha de todos: ${SENHA}`);

  if (chamados.length) {
    console.log("\nChamados");
    console.log("  " + "número".padEnd(15) + "estado".padEnd(24) + "data".padEnd(12) + "trecho");
    for (const c of chamados) console.log("  " + c.numero.padEnd(15) + c.estado.padEnd(24) + c.data.padEnd(12) + c.trecho);
    console.log(`\n  ${fmt(chamados.length)} chamado(s). Veja em /chamados.`);
  }

  console.log("\nPara desfazer: npm run semear:demonstracao -- --limpar");
}
