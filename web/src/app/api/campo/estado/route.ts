import { NextResponse, type NextRequest } from "next/server";

import { obterSessao } from "@/lib/auth/sessao";
import type { ChamadoCampo, EstadoCampo, EventoRecente, NotificacaoCampo, TrechoCampo } from "@/lib/campo/contratos";
import { equipeDaBusca, equipeDaSessao, recusou } from "@/lib/campo/servidor";
import { contarNaoLidas, listarChamados, listarNotificacoes } from "@/lib/chamados/queries";
import { db } from "@/lib/supabase";
import type { ChamadoAdiamento, ChamadoDetalhado, Especie, MotivoAdiamento, TipoEventoChamado } from "@/lib/types";

/**
 * O snapshot que o aparelho guarda no IndexedDB e passa o dia lendo.
 *
 * UMA requisicao, tudo dentro: o app abre na beira da estrada, com uma barra de
 * sinal, e cada ida e volta e uma chance de falhar. Vale mais mandar 40 KB de
 * uma vez do que seis requisicoes pequenas que podem morrer no meio.
 */

/** Nao terminais: o trabalho vivo da equipe. */
const VIVOS = ["aberto", "em_andamento", "aguardando_aprovacao", "devolvido", "adiamento_solicitado"] as const;
const DIAS_DE_HISTORICO = 7;
const MAX_EVENTOS_NA_LINHA = 5;

type LinhaEvento = { chamado_id: number; tipo: TipoEventoChamado; autor_nome: string; ocorrido_em: string; payload: Record<string, unknown> | null };

function trechoDoCampo(t: ChamadoDetalhado["trecho"], especie: Especie): TrechoCampo {
  return {
    id: t.id,
    rodovia: t.rodovia,
    km_inicio: Number(t.km_inicio),
    km_fim: Number(t.km_fim),
    uf: t.uf,
    sentido: t.sentido,
    especie,
    altura_limite_cm: Number(t.altura_limite_cm),
    latitude: Number(t.latitude),
    longitude: Number(t.longitude),
    observacoes: t.observacoes,
  };
}

export async function GET(request: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ erro: "Sessão necessária." }, { status: 401 });

  const equipe = await equipeDaSessao(sessao, equipeDaBusca(request.nextUrl.searchParams));
  if (recusou(equipe)) {
    // `equipes` so vem na recusa por falta de escolha; a tela vira seletor.
    return NextResponse.json({ erro: equipe.erro, equipes: equipe.equipes }, { status: equipe.status });
  }

  /* Duas leituras e nao uma: `listarChamados` nao filtra por `atualizado_em`, e
     puxar o historico inteiro da equipe para descartar 99% em JS seria pior. Os
     vivos vem sem recorte de data; os terminais sao cortados aqui embaixo. */
  const [vivos, terminais] = await Promise.all([
    listarChamados({ equipeId: equipe.id, status: [...VIVOS] }),
    listarChamados({ equipeId: equipe.id, status: ["concluido", "cancelado"] }),
  ]);

  const corte = new Date(Date.now() - DIAS_DE_HISTORICO * 86_400_000).toISOString();
  const chamados = [...vivos, ...terminais.filter((c) => c.atualizado_em >= corte)];
  const ids = chamados.map((c) => c.id);

  /* `especie` nao esta no embed de `listarChamados` (o painel nao usa) e a tela
     do campo mostra. Uma consulta pelos trechos dos chamados listados, nao N. */
  const idsTrecho = [...new Set(chamados.map((c) => c.trecho.id))];
  const [{ data: trechos }, { data: eventos }, { data: adiamentos }, naoLidas, notificacoes] = await Promise.all([
    idsTrecho.length ? db.from("trechos").select("id, especie").in("id", idsTrecho) : Promise.resolve({ data: [] }),
    ids.length
      ? db.from("chamado_eventos").select("chamado_id, tipo, autor_nome, ocorrido_em, payload").in("chamado_id", ids).order("ocorrido_em", { ascending: false })
      : Promise.resolve({ data: [] }),
    ids.length ? db.from("chamado_adiamentos").select("*").in("chamado_id", ids).is("decisao", null) : Promise.resolve({ data: [] }),
    contarNaoLidas(sessao.usuarioId),
    listarNotificacoes(sessao.usuarioId),
  ]);

  const especiePorTrecho = new Map(((trechos ?? []) as { id: number; especie: Especie }[]).map((t) => [t.id, t.especie]));
  const adiamentoPorChamado = new Map(((adiamentos ?? []) as unknown as ChamadoAdiamento[]).map((a) => [a.chamado_id, a]));

  /* Os eventos vem do mais novo para o mais velho, entao a linha do tempo e o
     "ultimo devolvido" saem do mesmo passeio: o primeiro `devolvido` que aparece
     E o ultimo que aconteceu. */
  const linhaDoTempo = new Map<number, EventoRecente[]>();
  const comentarioGestor = new Map<number, string>();
  for (const e of (eventos ?? []) as unknown as LinhaEvento[]) {
    const linha = linhaDoTempo.get(e.chamado_id) ?? [];
    if (linha.length < MAX_EVENTOS_NA_LINHA) {
      linha.push({ tipo: e.tipo, ocorrido_em: e.ocorrido_em, autor_nome: e.autor_nome });
      linhaDoTempo.set(e.chamado_id, linha);
    }
    if (e.tipo === "devolvido" && !comentarioGestor.has(e.chamado_id)) {
      const texto = typeof e.payload?.comentario === "string" ? e.payload.comentario.trim() : "";
      if (texto) comentarioGestor.set(e.chamado_id, texto);
    }
  }

  const paraCampo = (c: ChamadoDetalhado): ChamadoCampo => {
    const adiamento = adiamentoPorChamado.get(c.id);
    return {
      id: c.id,
      numero: c.numero,
      status: c.status,
      trecho: trechoDoCampo(c.trecho, especiePorTrecho.get(c.trecho.id) ?? "braquiaria"),
      data_sugerida: c.agendamento.data_sugerida,
      prioridade: c.agendamento.prioridade,
      justificativa: c.agendamento.justificativa,
      altura_inicial_cm: c.altura_inicial_cm == null ? null : Number(c.altura_inicial_cm),
      altura_inicial_origem: c.altura_inicial_origem,
      altura_final_cm: c.altura_final_cm == null ? null : Number(c.altura_final_cm),
      iniciado_em: c.iniciado_em,
      finalizado_em: c.finalizado_em,
      // So vale enquanto o chamado esta devolvido: depois de refeito, o comentario e historico.
      comentario_gestor: c.status === "devolvido" ? (comentarioGestor.get(c.id) ?? null) : null,
      adiamento_pendente: adiamento
        ? { motivo: adiamento.motivo as MotivoAdiamento, data_sugerida: adiamento.data_sugerida, solicitado_em: adiamento.solicitado_em }
        : null,
      eventos_recentes: linhaDoTempo.get(c.id) ?? [],
      atualizado_em: c.atualizado_em,
    };
  };

  const corpo: Omit<EstadoCampo, "sincronizadoEm"> = {
    equipe: { id: equipe.id, nome: equipe.nome },
    lider: { nome: equipe.lider_nome },
    chamados: chamados.map(paraCampo),
    notificacoesNaoLidas: naoLidas,
    notificacoes: notificacoes.map(
      (n): NotificacaoCampo => ({ id: n.id, titulo: n.titulo, texto: n.texto, chamado_id: n.chamado_id, lida_em: n.lida_em, criado_em: n.criado_em }),
    ),
    servidorEm: new Date().toISOString(),
  };

  // Foto de equipe e nome de lider nao entram em cache compartilhado, nem em disco.
  return NextResponse.json(corpo, { headers: { "Cache-Control": "private, no-store" } });
}
