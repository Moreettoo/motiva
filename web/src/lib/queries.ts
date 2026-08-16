import "server-only";

import { cache } from "react";

import { db } from "./supabase";
import { diasEntre, isoHoje, somarDias } from "./format";
import { ordemRisco } from "./dominio";
import { distanciaKm, groupBy, sum } from "./utils";
import type {
  AgendamentoDetalhado,
  Equipe,
  Execucao,
  Medicao,
  Painel,
  Previsao,
  Risco,
  StatusAgendamento,
  Trecho,
  TrechoStatus,
  ZonaClima,
} from "./types";

/**
 * Camada de leitura.
 *
 * Tudo passa por `ia.vw_trecho_status` sempre que da, porque a rota antiga
 * `/trechos` do FastAPI faz N+1 (uma consulta de previsao e uma de agendamento
 * por trecho). Com 50 trechos isso ja eram 101 idas ao banco por carregamento.
 *
 * `cache()` do React deduplica dentro de um mesmo request: varios componentes
 * da mesma pagina podem pedir os trechos sem multiplicar consultas.
 */

function erro(contexto: string, e: { message: string } | null): never {
  throw new Error(`Falha ao ler ${contexto}: ${e?.message ?? "erro desconhecido"}`);
}

export const listarTrechos = cache(async (): Promise<TrechoStatus[]> => {
  const { data, error } = await db.from("vw_trecho_status").select("*");
  if (error) erro("os trechos", error);

  return (data as TrechoStatus[]).sort(
    (a, b) =>
      ordemRisco(a.risco) - ordemRisco(b.risco) ||
      (a.dias_ate_limite ?? 9999) - (b.dias_ate_limite ?? 9999) ||
      a.rodovia.localeCompare(b.rodovia, "pt-BR") ||
      a.km_inicio - b.km_inicio,
  );
});

export const obterTrecho = cache(async (id: number): Promise<TrechoStatus | null> => {
  const { data, error } = await db.from("vw_trecho_status").select("*").eq("id", id).maybeSingle();
  if (error) erro(`o trecho ${id}`, error);
  return (data as TrechoStatus) ?? null;
});

export const listarEquipes = cache(async (): Promise<Equipe[]> => {
  const { data, error } = await db.from("equipes").select("*").order("nome");
  if (error) erro("as equipes", error);
  return data as Equipe[];
});

export const listarZonasClima = cache(async (): Promise<ZonaClima[]> => {
  const { data, error } = await db.from("zonas_clima").select("*").order("rodovia").order("km_inicio");
  if (error) erro("as zonas de clima", error);
  return data as ZonaClima[];
});

export const medicoesDoTrecho = cache(async (trechoId: number, dias = 240): Promise<Medicao[]> => {
  const desde = somarDias(new Date(), -dias).toISOString().slice(0, 10);
  const { data, error } = await db
    .from("medicoes")
    .select("id, trecho_id, data, altura_cm")
    .eq("trecho_id", trechoId)
    .gte("data", desde)
    .order("data");
  if (error) erro(`as medicoes do trecho ${trechoId}`, error);
  return data as Medicao[];
});

export const previsoesDoTrecho = cache(async (trechoId: number, limite = 60): Promise<Previsao[]> => {
  const { data, error } = await db
    .from("previsoes")
    .select("*")
    .eq("trecho_id", trechoId)
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (error) erro(`as previsoes do trecho ${trechoId}`, error);
  return (data as Previsao[]).reverse();
});

export const execucoesDoTrecho = cache(async (trechoId: number): Promise<Execucao[]> => {
  const { data, error } = await db
    .from("execucoes")
    .select("*")
    .eq("trecho_id", trechoId)
    .order("data_execucao", { ascending: false });
  if (error) erro(`as execucoes do trecho ${trechoId}`, error);
  return data as Execucao[];
});

const SELECT_AGENDAMENTO = `
  id, trecho_id, previsao_id, data_sugerida, prioridade, justificativa, fatores,
  status, origem, modelo_usado, equipe_id, atualizado_em, criado_em,
  trecho:trechos!inner ( id, rodovia, km_inicio, km_fim, uf, sentido, especie, tipo_pista, altura_limite_cm, latitude, longitude ),
  equipe:equipes ( id, nome, base_uf ),
  previsao:previsoes ( crescimento_cm_dia, altura_atual_cm, dias_ate_limite, chuva_total_mm, temperatura_media_c )
`;

export const listarAgendamentos = cache(
  async (filtros?: { status?: StatusAgendamento[]; desde?: string; ate?: string }): Promise<AgendamentoDetalhado[]> => {
    let q = db.from("agendamentos").select(SELECT_AGENDAMENTO);
    if (filtros?.status?.length) q = q.in("status", filtros.status);
    if (filtros?.desde) q = q.gte("data_sugerida", filtros.desde);
    if (filtros?.ate) q = q.lte("data_sugerida", filtros.ate);

    const { data, error } = await q.order("data_sugerida");
    if (error) erro("os agendamentos", error);

    return (data as unknown as AgendamentoDetalhado[]).sort(
      (a, b) => a.data_sugerida.localeCompare(b.data_sugerida) || ordemRisco(a.prioridade) - ordemRisco(b.prioridade),
    );
  },
);

export const agendamentosDoTrecho = cache(async (trechoId: number): Promise<AgendamentoDetalhado[]> => {
  const { data, error } = await db
    .from("agendamentos")
    .select(SELECT_AGENDAMENTO)
    .eq("trecho_id", trechoId)
    .order("criado_em", { ascending: false });
  if (error) erro(`os agendamentos do trecho ${trechoId}`, error);
  return data as unknown as AgendamentoDetalhado[];
});

/** Numeros do topo do painel. Calculados em memoria: 50 trechos nao justificam RPC. */
export const montarPainel = cache(async (): Promise<Painel> => {
  const [trechos, agendamentos] = await Promise.all([
    listarTrechos(),
    listarAgendamentos(),
  ]);

  const hoje = isoHoje();
  const porRisco = { critica: 0, alta: 0, media: 0, baixa: 0 } as Record<Risco, number>;
  for (const t of trechos) porRisco[t.risco] += 1;

  const crescimentos = trechos.map((t) => t.crescimento_cm_dia ?? 0).filter((v) => v > 0);
  const pendentes = agendamentos.filter((a) => a.status === "sugerido");
  const aprovados = agendamentos.filter((a) => a.status === "aprovado");

  return {
    trechos_total: trechos.length,
    km_monitorados: sum(trechos.map((t) => Number(t.extensao_km) || 0)),
    por_risco: porRisco,
    pendentes: pendentes.length,
    aprovados: aprovados.length,
    executados_30d: agendamentos.filter(
      (a) => a.status === "executado" && diasEntre(a.data_sugerida, hoje) <= 30 && diasEntre(a.data_sugerida, hoje) >= 0,
    ).length,
    rocadas_proximos_7d: [...pendentes, ...aprovados].filter((a) => {
      const d = diasEntre(hoje, a.data_sugerida);
      return d >= 0 && d <= 7;
    }).length,
    crescimento_medio_cm_dia: crescimentos.length ? sum(crescimentos) / crescimentos.length : 0,
    crescimento_maximo_cm_dia: crescimentos.length ? Math.max(...crescimentos) : 0,
    trechos_acima_do_limite: trechos.filter((t) => (t.altura_atual_cm ?? 0) >= t.altura_limite_cm).length,
  };
});

/**
 * Trechos agrupados por rodovia, ordenados por km, a base da regua da malha.
 *
 * A chave inclui a UF de proposito. A mesma designacao atravessa estados em
 * faixas de km completamente diferentes: a BR-101 Rio-Santos vai do km 450 ao
 * 527 no RJ e do km 22 ao 25 em SP. Numa chave so por nome, a regua teria que
 * cobrir do km 22 ao 527 com 400 km de vao vazio no meio, o que nao informa
 * nada. Cada faixa continua sendo uma linha de regua propria.
 */
export const trechosPorRodovia = cache(async () => {
  const trechos = await listarTrechos();
  const grupos = groupBy(trechos, (t) => `${t.rodovia} · ${t.uf}`);

  return [...grupos.entries()]
    .map(([chave, lista]) => {
      const ordenados = [...lista].sort((a, b) => a.km_inicio - b.km_inicio);
      return {
        chave,
        rodovia: ordenados[0].rodovia,
        uf: ordenados[0].uf,
        trechos: ordenados,
        kmMin: Math.min(...ordenados.map((t) => t.km_inicio)),
        kmMax: Math.max(...ordenados.map((t) => t.km_fim)),
        extensao: sum(ordenados.map((t) => Number(t.extensao_km) || 0)),
        piorRisco: ordenados.reduce<Risco>(
          (pior, t) => (ordemRisco(t.risco) < ordemRisco(pior) ? t.risco : pior),
          "baixa",
        ),
        criticos: ordenados.filter((t) => t.risco === "critica").length,
      };
    })
    .sort((a, b) => ordemRisco(a.piorRisco) - ordemRisco(b.piorRisco) || a.rodovia.localeCompare(b.rodovia, "pt-BR"));
});

/**
 * Serie diaria de crescimento medio da malha nos ultimos N dias.
 * Uma linha por especie: sao 3, dentro do limite de series validado.
 */
export const serieCrescimentoPorEspecie = cache(async (dias = 45) => {
  const desde = somarDias(new Date(), -dias).toISOString().slice(0, 10);
  const { data, error } = await db
    .from("previsoes")
    .select("data_previsao, crescimento_cm_dia, trecho_id, trechos!inner ( especie )")
    .gte("data_previsao", desde)
    .order("data_previsao");
  if (error) erro("a serie de crescimento", error);

  type Linha = { data_previsao: string; crescimento_cm_dia: number; trechos: { especie: string } };
  const linhas = data as unknown as Linha[];

  const porData = groupBy(linhas, (l) => l.data_previsao);
  const especies = [...new Set(linhas.map((l) => l.trechos.especie))].sort();

  const pontos = [...porData.entries()]
    .map(([data, itens]) => {
      const ponto: { data: string } & Record<string, number | string> = { data };
      for (const esp of especies) {
        const doGrupo = itens.filter((i) => i.trechos.especie === esp).map((i) => Number(i.crescimento_cm_dia));
        ponto[esp] = doGrupo.length ? sum(doGrupo) / doGrupo.length : 0;
      }
      return ponto;
    })
    .sort((a, b) => a.data.localeCompare(b.data));

  return { especies, pontos };
});

/** Carga por equipe nos proximos 21 dias, quem esta sobrecarregado. */
export const cargaDasEquipes = cache(async () => {
  const [equipes, agendamentos] = await Promise.all([
    listarEquipes(),
    listarAgendamentos({ status: ["aprovado", "sugerido"] }),
  ]);

  const hoje = isoHoje();
  const janela = agendamentos.filter((a) => {
    const d = diasEntre(hoje, a.data_sugerida);
    return d >= 0 && d <= 21;
  });

  return equipes.map((eq) => {
    const meus = janela.filter((a) => a.equipe_id === eq.id);
    const km = sum(meus.map((a) => Number(a.trecho.km_fim) - Number(a.trecho.km_inicio)));
    const capacidade = Number(eq.capacidade_km_dia) * 15; // ~15 dias uteis em 21 corridos
    return {
      equipe: eq,
      agendamentos: meus.length,
      km,
      capacidade,
      ocupacao: capacidade > 0 ? (km / capacidade) * 100 : 0,
    };
  });
});

/** Trechos sem previsao ou com medicao velha, o que a operacao precisa corrigir. */
export const lacunasDeDados = cache(async () => {
  const trechos = await listarTrechos();
  const hoje = isoHoje();

  return {
    semPrevisao: trechos.filter((t) => t.crescimento_cm_dia == null),
    semMedicao: trechos.filter((t) => t.medido_em == null),
    medicaoVelha: trechos.filter((t) => t.medido_em != null && diasEntre(t.medido_em, hoje) > 45),
    semAgendamento: trechos.filter((t) => t.agendamento_id == null && (t.risco === "critica" || t.risco === "alta")),
  };
});

/**
 * O trecho da malha mais proximo de uma coordenada qualquer.
 *
 * Existe para o simulador, que recebe latitude e longitude soltas e precisa de
 * duas coisas que um ponto no mapa nao tem: a UF (o modelo pede `uf_cod`) e uma
 * altura limite de referencia (a IA 2 decide QUANDO roçar contra um limite, e
 * um ponto solto nao tem limite nenhum).
 *
 * Resolver pelo vizinho e melhor que pedir mais um campo no formulario e melhor
 * que chutar: e um dado real da malha, e a tela mostra de qual trecho veio e a
 * que distancia, quem olha julga se faz sentido.
 */
export const trechoMaisProximo = cache(
  async (latitude: number, longitude: number): Promise<{ trecho: TrechoStatus; distanciaKm: number } | null> => {
    const trechos = await listarTrechos();
    if (trechos.length === 0) return null;

    let melhor = trechos[0];
    let menor = distanciaKm({ latitude, longitude }, melhor);

    for (const t of trechos.slice(1)) {
      const d = distanciaKm({ latitude, longitude }, t);
      if (d < menor) {
        menor = d;
        melhor = t;
      }
    }

    return { trecho: melhor, distanciaKm: menor };
  },
);

export type TrechosPorRodovia = Awaited<ReturnType<typeof trechosPorRodovia>>;
export type SerieCrescimento = Awaited<ReturnType<typeof serieCrescimentoPorEspecie>>;
export type CargaEquipes = Awaited<ReturnType<typeof cargaDasEquipes>>;
export type LacunasDeDados = Awaited<ReturnType<typeof lacunasDeDados>>;
export type Trechos = Trecho;
