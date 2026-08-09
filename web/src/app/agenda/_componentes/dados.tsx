/**
 * Modelo da agenda.
 *
 * A linha do tempo, a fila de decisão e o resumo precisam concordar no número:
 * se cada um calculasse os dias de serviço por conta própria, a soma de km da
 * faixa não bateria com a largura dos blocos e o gestor perderia a confiança na
 * tela. Por isso todo cálculo de janela, duração e carga mora aqui.
 */

import { ordemRisco, riscoPorPrazo } from "@/lib/dominio";
import { inicioDaSemana, parseData, somarDias } from "@/lib/format";
import type { AgendamentoDetalhado, Equipe, Risco, StatusAgendamento, UF } from "@/lib/types";
import { sum } from "@/lib/utils";

export const PERIODOS = ["semana", "quinzena", "mes"] as const;
export type Periodo = (typeof PERIODOS)[number];

/** Quinzena e não semana: a janela abre na segunda-feira da semana corrente, e
 *  numa sexta-feira "Semana" mostraria dois dias úteis de plano. Quinzena sempre
 *  deixa pelo menos uma semana inteira à frente de hoje. */
export const PERIODO_PADRAO: Periodo = "quinzena";

export const ROTULO_PERIODO: Record<Periodo, string> = {
  semana: "Semana",
  quinzena: "Quinzena",
  mes: "Mês",
};

/** 28 dias em vez de 30: quatro semanas fechadas deixam as colunas de fim de
 *  semana no mesmo lugar em toda a extensão da régua. */
export const DIAS_DO_PERIODO: Record<Periodo, number> = { semana: 7, quinzena: 14, mes: 28 };

/** Largura da coluna de dia. Encolhe conforme a janela cresce para o mês inteiro
 *  ainda caber em duas telas de rolagem. */
export const LARGURA_DIA: Record<Periodo, number> = { semana: 152, quinzena: 104, mes: 60 };

export const LARGURA_RAIA = 208;
export const ALTURA_BLOCO = 36;
export const FOLGA_BLOCO = 4;
export const ALTURA_RAIA_MINIMA = 72;

/** Só o que a agenda lê da view de trechos — o resto não precisa cruzar a rede. */
export type TrechoResumo = {
  id: number;
  risco: Risco;
  dias_ate_limite: number | null;
  ocupacao_pct: number | null;
  altura_atual_cm: number | null;
  altura_limite_cm: number;
  crescimento_cm_dia: number | null;
};

export type CargaEquipe = {
  equipeId: number;
  ocupacao: number;
  km: number;
  agendamentos: number;
};

/** Chave de dia, não texto de tela: comparável, ordenável e igual à do banco. */
export function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ehFimDeSemana(dia: string): boolean {
  const n = parseData(dia).getDay();
  return n === 0 || n === 6;
}

export type Janela = { dias: string[]; inicio: string; fim: string };

/** A janela sempre abre na segunda-feira: a operação de roçada é planejada por
 *  semana, e começar "hoje" faria a régua andar sozinha todo dia. */
export function montarJanela(periodo: Periodo, hoje: string): Janela {
  const primeiro = inicioDaSemana(hoje);
  const total = DIAS_DO_PERIODO[periodo];
  const dias = Array.from({ length: total }, (_, i) => chaveDia(somarDias(primeiro, i)));
  return { dias, inicio: dias[0], fim: dias[total - 1] };
}

export type ItemAgenda = {
  id: number;
  ag: AgendamentoDetalhado;
  data: string;
  status: StatusAgendamento;
  equipeId: number | null;
  equipeNome: string | null;
  uf: UF;
  risco: Risco;
  km: number;
  /** km ÷ capacidade da equipe, arredondado para cima em dias inteiros. */
  diasServico: number;
  capacidade: number;
  atrasado: boolean;
};

function media(ns: number[]): number {
  return ns.length ? sum(ns) / ns.length : 0;
}

/**
 * Capacidade aplicável ao serviço. Sem equipe atribuída, a estimativa usa a média
 * das turmas com base no mesmo estado — é o palpite que o planejador faria, e
 * mantém a largura do bloco honesta quando ele ainda está na raia "Sem equipe".
 */
function capacidadeAplicavel(equipes: Equipe[], equipeId: number | null, uf: UF): number {
  if (equipeId != null) {
    const atribuida = equipes.find((e) => e.id === equipeId);
    if (atribuida) return Number(atribuida.capacidade_km_dia) || 1;
  }

  const ativas = equipes.filter((e) => e.ativo);
  const daUf = ativas.filter((e) => e.base_uf === uf).map((e) => Number(e.capacidade_km_dia));
  const base = daUf.length ? daUf : ativas.map((e) => Number(e.capacidade_km_dia));
  return media(base) || 6;
}

/** Risco pelo prazo, nunca pelo texto da LLM: a view é a fonte, a previsão do
 *  próprio agendamento é o reserva, e a prioridade só entra se faltarem as duas. */
function riscoDoItem(ag: AgendamentoDetalhado, trecho: TrechoResumo | undefined): Risco {
  if (trecho) return trecho.risco;
  const dias = ag.previsao?.dias_ate_limite;
  if (dias != null) return riscoPorPrazo(dias);
  return ag.prioridade;
}

export function montarItens({
  agendamentos,
  trechos,
  equipes,
  hoje,
}: {
  agendamentos: AgendamentoDetalhado[];
  trechos: TrechoResumo[];
  equipes: Equipe[];
  hoje: string;
}): ItemAgenda[] {
  const porTrecho = new Map(trechos.map((t) => [t.id, t]));

  return agendamentos.map((ag) => {
    const km = Math.max(0, Number(ag.trecho.km_fim) - Number(ag.trecho.km_inicio));
    const capacidade = capacidadeAplicavel(equipes, ag.equipe_id, ag.trecho.uf);

    return {
      id: ag.id,
      ag,
      data: ag.data_sugerida,
      status: ag.status,
      equipeId: ag.equipe_id,
      equipeNome: ag.equipe?.nome ?? null,
      uf: ag.trecho.uf,
      risco: riscoDoItem(ag, porTrecho.get(ag.trecho.id)),
      km,
      // Dias inteiros: a turma mobiliza caminhão, sinalização e equipe por dia,
      // então meio dia de roçada ainda ocupa o dia. Também é o que mantém o
      // bloco largo o bastante para carregar rótulo na régua.
      diasServico: Math.max(1, Math.ceil(km / capacidade)),
      capacidade,
      atrasado: ag.data_sugerida < hoje && (ag.status === "sugerido" || ag.status === "aprovado"),
    };
  });
}

export function ordenarPorUrgencia(a: ItemAgenda, b: ItemAgenda): number {
  return ordemRisco(a.risco) - ordemRisco(b.risco) || a.data.localeCompare(b.data) || a.id - b.id;
}

export type FiltroEquipe = string;

export function combinaEquipe(item: ItemAgenda, filtro: FiltroEquipe): boolean {
  if (!filtro) return true;
  if (filtro === "sem") return item.equipeId == null;
  return String(item.equipeId) === filtro;
}

export type ItemPosicionado = ItemAgenda & { inicio: number; fim: number; linha: number };

export type Raia = {
  chave: string;
  equipe: Equipe | null;
  capacidade: number | null;
  itens: ItemPosicionado[];
  linhas: number;
  cargaPorDia: number[];
  diasExcedidos: number[];
  ocupacao21: number | null;
  km: number;
};

/** Empacotamento guloso: cada bloco cai na primeira sub-linha livre. Dois serviços
 *  no mesmo dia viram duas faixas, e a sobreposição fica visível em vez de somem. */
function empilhar(itens: { inicio: number; fim: number }[]): number[] {
  const ocupadoAte: number[] = [];
  return itens.map((it) => {
    let linha = ocupadoAte.findIndex((fim) => fim <= it.inicio + 1e-9);
    if (linha === -1) {
      linha = ocupadoAte.length;
      ocupadoAte.push(it.fim);
    } else {
      ocupadoAte[linha] = it.fim;
    }
    return linha;
  });
}

export function montarRaias({
  itens,
  equipes,
  janela,
  filtroEquipe,
  cargas,
}: {
  itens: ItemAgenda[];
  equipes: Equipe[];
  janela: Janela;
  filtroEquipe: FiltroEquipe;
  cargas: CargaEquipe[];
}): Raia[] {
  const indiceDoDia = new Map(janela.dias.map((d, i) => [d, i]));
  const porOcupacao = new Map(cargas.map((c) => [c.equipeId, c]));

  // Uma turma desativada com serviço já atribuído ainda precisa de raia: sem ela o
  // bloco sumiria da régua enquanto o resumo e os chips continuariam contando o
  // agendamento, e o seletor de equipe — que só lista as ativas — não teria como
  // devolvê-lo à tela.
  const comItemNaJanela = new Set(
    itens.filter((i) => i.equipeId != null && indiceDoDia.has(i.data)).map((i) => i.equipeId),
  );

  const comRaia = equipes
    .filter((e) => e.ativo || comItemNaJanela.has(e.id))
    .sort(
      (a, b) =>
        a.base_uf.localeCompare(b.base_uf, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"),
    );

  const definicoes: { chave: string; equipe: Equipe | null }[] = [
    { chave: "sem", equipe: null },
    ...comRaia.map((e) => ({ chave: String(e.id), equipe: e })),
  ].filter(({ chave }) => !filtroEquipe || chave === filtroEquipe);

  return definicoes.map(({ chave, equipe }) => {
    const capacidade = equipe ? Number(equipe.capacidade_km_dia) : null;

    const naJanela = itens
      .filter((item) => (equipe ? item.equipeId === equipe.id : item.equipeId == null))
      .filter((item) => indiceDoDia.has(item.data))
      .sort((a, b) => a.data.localeCompare(b.data) || ordemRisco(a.risco) - ordemRisco(b.risco));

    const base = naJanela.map((item) => {
      const inicio = indiceDoDia.get(item.data) as number;
      return { ...item, inicio, fim: inicio + item.diasServico };
    });

    const linhas = empilhar(base);
    const posicionados: ItemPosicionado[] = base.map((item, i) => ({ ...item, linha: linhas[i] }));

    // Carga do dia: cada serviço distribui seus km pelos dias que ocupa. Um
    // serviço longo nunca estoura sozinho — ele já foi esticado pela capacidade.
    // O que estoura é acumular serviços no mesmo dia.
    const cargaPorDia = janela.dias.map((_, d) =>
      sum(
        posicionados
          .filter((it) => it.inicio <= d && d < it.fim - 1e-9)
          .map((it) => it.km / it.diasServico),
      ),
    );

    const diasExcedidos =
      capacidade == null
        ? []
        : cargaPorDia.reduce<number[]>((acc, carga, d) => {
            if (carga > capacidade + 1e-6) acc.push(d);
            return acc;
          }, []);

    return {
      chave,
      equipe,
      capacidade,
      itens: posicionados,
      linhas: Math.max(1, linhas.length ? Math.max(...linhas) + 1 : 1),
      cargaPorDia,
      diasExcedidos,
      ocupacao21: equipe ? (porOcupacao.get(equipe.id)?.ocupacao ?? 0) : null,
      km: sum(posicionados.map((it) => it.km)),
    };
  });
}

export function alturaDaRaia(raia: Raia): number {
  return Math.max(ALTURA_RAIA_MINIMA, raia.linhas * (ALTURA_BLOCO + FOLGA_BLOCO) + FOLGA_BLOCO * 3);
}

/** Blocos de mês consecutivos dentro da janela — a faixa que nomeia "agosto". */
export function fatiarPorMes(dias: string[]): { dia: string; quantidade: number }[] {
  const fatias: { dia: string; quantidade: number }[] = [];
  for (const dia of dias) {
    const anterior = fatias[fatias.length - 1];
    if (anterior && anterior.dia.slice(0, 7) === dia.slice(0, 7)) anterior.quantidade += 1;
    else fatias.push({ dia, quantidade: 1 });
  }
  return fatias;
}
