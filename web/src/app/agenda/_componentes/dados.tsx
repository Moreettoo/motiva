/**
 * Modelo da agenda.
 *
 * A linha do tempo, a fila de decisão e o resumo precisam concordar no número:
 * se cada um calculasse os dias de serviço por conta própria, a soma de km da
 * faixa não bateria com a largura dos blocos e o gestor perderia a confiança na
 * tela. Por isso todo cálculo de janela, duração e carga mora aqui.
 */

import { ordemRisco, riscoPorPrazo } from "@/lib/dominio";
import { diasEntre, fmt, inicioDaSemana, parseData, somarDias } from "@/lib/format";
import type { AgendamentoDetalhado, Equipe, Risco, StatusAgendamento, UF } from "@/lib/types";
import { sum } from "@/lib/utils";

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

export const HACHURA_EXCESSO =
  "repeating-linear-gradient(45deg, color-mix(in oklab, var(--critical) 26%, transparent) 0 5px, transparent 5px 10px)";

export function textoServico(dias: number): string {
  return dias === 1 ? "1 dia de serviço" : `${fmt.n(dias)} dias de serviço`;
}

/** Quantos dias inteiros a turma gasta. Dias inteiros porque a turma mobiliza
 *  caminhão, sinalização e equipe por dia — meio dia de roçada ainda ocupa o dia. */
export function diasDeServico(km: number, capacidade: number): number {
  return Math.max(1, Math.ceil(km / (capacidade || 1)));
}

export type ChaveCelula = string;

/** `dia|equipeId`. O separador é pipe porque nenhum dos dois lados pode contê-lo.
 *  Chave de MEMÓRIA (`Map`, `data-celula`), nunca id de DOM — para o DOM existe
 *  `idDoGrupo`, logo abaixo, com outro separador e o porquê escrito lá. */
export function chaveCelula(dia: string, equipeId: number): ChaveCelula {
  return `${dia}|${equipeId}`;
}

/** `id` do rótulo do `<div role="group">` de um par (dia, equipe) — e o valor do
 *  `aria-labelledby` que aponta para ele. Um helper só para as duas pontas: um
 *  id montado à mão numa delas e pelo helper na outra é um grupo que perde o
 *  nome sem quebrar nada visível, e ninguém percebe até alguém abrir a tela com
 *  leitor de tela.
 *
 *  Hífen, não o pipe de `chaveCelula`: `getElementById` aceitaria o pipe, mas
 *  `#grupo-2026-08-13|7` é seletor INVÁLIDO em `querySelector` sem `CSS.escape`
 *  — e quem escrever esse seletor daqui a seis meses não vai lembrar de
 *  escapar. */
export function idDoGrupo(dia: string, equipeId: number): string {
  return `grupo-${dia}-${equipeId}`;
}

/** A janela sempre abre na segunda-feira: a operação é planejada por semana.
 *  A âncora é qualquer dia da semana desejada — é o que permite navegar sem
 *  depender de "hoje" e sem ida ao servidor. */
export function montarJanela(ancora: string, dias = 7): Janela {
  const primeiro = inicioDaSemana(ancora);
  const lista = Array.from({ length: dias }, (_, i) => chaveDia(somarDias(primeiro, i)));
  return { dias: lista, inicio: lista[0], fim: lista[dias - 1] };
}

/** Serviço ocupa `[inicio, inicio + diasServico)`. Comparar por igualdade de data
 *  faria a capacidade mentir no dia em que `diasServico` deixar de ser sempre 1. */
export function ocupaDia(item: ItemAgenda, dia: string): boolean {
  const d = diasEntre(item.data, dia);
  return d >= 0 && d < item.diasServico;
}

export type Fatia = { chave: ChaveCelula; dia: string; equipeId: number; km: number };

/** Fatias que o item ocuparia se caísse em (dia, equipe). A duração é recalculada
 *  na capacidade do DESTINO: mover para uma turma mais rápida encurta o serviço. */
export function fatiasEm(item: ItemAgenda, dia: string, equipe: Equipe): Fatia[] {
  const capacidade = Number(equipe.capacidade_km_dia) || 1;
  const dias = diasDeServico(item.km, capacidade);
  const km = item.km / dias;

  return Array.from({ length: dias }, (_, i) => {
    const d = chaveDia(somarDias(dia, i));
    return { chave: chaveCelula(d, equipe.id), dia: d, equipeId: equipe.id, km };
  });
}

export type Ocupacao = { km: number; ocupacao: number; excedida: boolean };

function medir(km: number, capacidade: number): Ocupacao {
  return {
    km,
    ocupacao: capacidade > 0 ? (km / capacidade) * 100 : 0,
    excedida: km > capacidade + 1e-6,
  };
}

export type Celula = {
  chave: ChaveCelula;
  dia: string;
  equipeId: number;
  itens: ItemAgenda[];
  km: number;
  capacidade: number;
  ocupacao: number;
  excedida: boolean;
  /** Falso para dia passado e para turma inativa. Célula que não aceita solta
   *  NÃO emite `data-celula` no DOM — senão o hit-test a encontraria mesmo assim. */
  aceitaSolta: boolean;
};

export type LinhaEquipe = { equipe: Equipe; celulas: Celula[]; kmSemana: number };

export type ResumoDia = {
  dia: string;
  comEquipe: number;
  semEquipe: number;
  algumaExcedida: boolean;
};

export type Grade = {
  janela: Janela;
  /** dia → itens sem equipe cuja data cai nele. Alimenta a linha de propostas. */
  propostas: Map<string, ItemAgenda[]>;
  linhas: LinhaEquipe[];
  /** TODOS os em aberto sem equipe, por urgência. Independe da semana visível:
   *  um backlog que encolhe quando você olha para outra semana não é um backlog. */
  fila: ItemAgenda[];
  porDia: ResumoDia[];
  porCelula: Map<ChaveCelula, Celula>;
  /** id do item → fatias que ele ocupa hoje. Devolve a carga da origem em O(1). */
  fatiasPorItem: Map<number, Fatia[]>;
};

const EM_ABERTO = new Set<StatusAgendamento>(["sugerido", "aprovado"]);

/**
 * Quais equipes "contam" nesta janela: ativa, OU inativa com serviço em
 * aberto cujo `item.data` caia dentro de `dias`. Turma inativa sem serviço na
 * janela fica de fora — sem ela o cartão sumiria do quadro enquanto o resumo
 * continuaria contando o serviço (o motivo original desta regra), e com ela
 * incondicional, uma equipe sem NENHUM serviço na janela contaria km de uma
 * célula que nenhuma tela mostra.
 *
 * `montarGrade` e `resumo28`/`diasComExcesso` chamam esta MESMA função — uma
 * calculava a regra por conta própria e a outra não calculava nenhuma, e as
 * duas podiam divergir sobre a mesma equipe no mesmo dia. `dias` é parâmetro,
 * não fixo em 7: a semana visível de `montarGrade` e os 28 dias de
 * `resumo28` são janelas de tamanhos diferentes para a MESMA regra — só o
 * tamanho da janela muda, nunca o critério de quem conta nela.
 */
function equipesComLinha(itens: ItemAgenda[], equipes: Equipe[], dias: string[]): Equipe[] {
  const diasDaJanela = new Set(dias);
  const desativadaComServico = new Set(
    itens
      .filter((i) => i.equipeId != null && EM_ABERTO.has(i.status) && diasDaJanela.has(i.data))
      .map((i) => i.equipeId as number),
  );
  return equipes.filter((e) => e.ativo || desativadaComServico.has(e.id));
}

export function montarGrade({
  itens,
  equipes,
  janela,
  hoje,
}: {
  itens: ItemAgenda[];
  equipes: Equipe[];
  janela: Janela;
  hoje: string;
}): Grade {
  const porId = new Map(equipes.map((e) => [e.id, e]));
  const diasDaJanela = new Set(janela.dias);

  const comLinha = equipesComLinha(itens, equipes, janela.dias).sort(
    (a, b) => a.base_uf.localeCompare(b.base_uf, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"),
  );

  const fatiasPorItem = new Map<number, Fatia[]>();
  const kmPorCelula = new Map<ChaveCelula, number>();
  const itensPorCelula = new Map<ChaveCelula, ItemAgenda[]>();

  for (const item of itens) {
    if (!EM_ABERTO.has(item.status) || item.equipeId == null) continue;
    const equipe = porId.get(item.equipeId);
    if (!equipe) continue;

    const fatias = fatiasEm(item, item.data, equipe);
    fatiasPorItem.set(item.id, fatias);

    for (const fatia of fatias) {
      kmPorCelula.set(fatia.chave, (kmPorCelula.get(fatia.chave) ?? 0) + fatia.km);
    }
    // O cartão desenha no dia em que começa; as demais fatias só entram na carga.
    const chave = chaveCelula(item.data, item.equipeId);
    itensPorCelula.set(chave, [...(itensPorCelula.get(chave) ?? []), item]);
  }

  const porCelula = new Map<ChaveCelula, Celula>();

  const linhas: LinhaEquipe[] = comLinha.map((equipe) => {
    const capacidade = Number(equipe.capacidade_km_dia) || 0;

    const celulas = janela.dias.map((dia) => {
      const chave = chaveCelula(dia, equipe.id);
      const km = kmPorCelula.get(chave) ?? 0;
      const medida = medir(km, capacidade);

      const celula: Celula = {
        chave,
        dia,
        equipeId: equipe.id,
        itens: (itensPorCelula.get(chave) ?? []).slice().sort(ordenarPorUrgencia),
        capacidade,
        km: medida.km,
        ocupacao: medida.ocupacao,
        excedida: medida.excedida,
        aceitaSolta: equipe.ativo && dia >= hoje,
      };

      porCelula.set(chave, celula);
      return celula;
    });

    return { equipe, celulas, kmSemana: celulas.reduce((n, c) => n + c.km, 0) };
  });

  const semEquipe = itens.filter((i) => EM_ABERTO.has(i.status) && i.equipeId == null);

  const propostas = new Map<string, ItemAgenda[]>();
  for (const item of semEquipe) {
    if (!diasDaJanela.has(item.data)) continue;
    propostas.set(item.data, [...(propostas.get(item.data) ?? []), item]);
  }
  for (const lista of propostas.values()) lista.sort(ordenarPorUrgencia);

  const porDia: ResumoDia[] = janela.dias.map((dia) => ({
    dia,
    comEquipe: linhas.reduce((n, l) => n + (porCelula.get(chaveCelula(dia, l.equipe.id))?.itens.length ?? 0), 0),
    semEquipe: propostas.get(dia)?.length ?? 0,
    algumaExcedida: linhas.some((l) => porCelula.get(chaveCelula(dia, l.equipe.id))?.excedida ?? false),
  }));

  return {
    janela,
    propostas,
    linhas,
    fila: semEquipe.slice().sort(ordenarPorUrgencia),
    porDia,
    porCelula,
    fatiasPorItem,
  };
}

/** Delta escalar sobre 2 a 4 células, nunca um recálculo da grade: isto roda a
 *  cada `pointermove` enquanto o cartão paira. */
export function previaDoMovimento(
  grade: Grade,
  item: ItemAgenda,
  destino: ChaveCelula,
  equipes: Equipe[],
): Map<ChaveCelula, Ocupacao> {
  const [dia, idTexto] = destino.split("|");
  const equipe = equipes.find((e) => e.id === Number(idTexto));
  if (!equipe) return new Map();

  const antigas = grade.fatiasPorItem.get(item.id) ?? [];
  const novas = fatiasEm(item, dia, equipe);

  const mesmas =
    antigas.length === novas.length && antigas.every((f, i) => f.chave === novas[i].chave);
  if (mesmas) return new Map();

  const delta = new Map<ChaveCelula, number>();
  for (const f of antigas) delta.set(f.chave, (delta.get(f.chave) ?? 0) - f.km);
  for (const f of novas) delta.set(f.chave, (delta.get(f.chave) ?? 0) + f.km);

  const previa = new Map<ChaveCelula, Ocupacao>();
  for (const [chave, dif] of delta) {
    const celula = grade.porCelula.get(chave);
    if (!celula) continue;
    previa.set(chave, medir(Math.max(0, celula.km + dif), celula.capacidade));
  }
  return previa;
}

/**
 * Em quais dos `dias` alguma equipe passa da própria capacidade — mesma
 * matemática de `montarGrade` (fatias por item, km por célula), mas sem
 * produzir `Celula`/`LinhaEquipe`: o mini-mapa de 28 dias só precisa do sinal
 * booleano por dia, não do objeto inteiro.
 *
 * Usa `equipesComLinha` — a MESMA função que decide quem ganha linha em
 * `montarGrade` — para nunca contar uma equipe inativa sem serviço na
 * janela. Sem isso, uma equipe inativa cujo serviço não cai dentro de `dias`
 * (por exemplo, começou antes da janela de 28 dias e só uma fatia antiga
 * vaza para dentro dela) ficaria sem NENHUMA linha/célula visível em
 * `montarGrade` para justificar um alerta que ainda assim apareceria aqui.
 *
 * O resto do cálculo (fatias, km por célula) não é compartilhado com
 * `montarGrade` por decisão, não por descuido: aquele loop constrói
 * `itensPorCelula` e `fatiasPorItem` na MESMA passada que `kmPorCelula`, e os
 * dois têm uso próprio ali (célula por linha, prévia de arrasto) que esta
 * função não precisa. Extrair também esse pedaço forçaria `montarGrade` a
 * chamar `fatiasEm` de novo ou a ler de uma estrutura externa — trocar
 * código já testado por uma dedupe cosmética não compensa o risco.
 */
function diasComExcesso(itensEmAberto: ItemAgenda[], equipes: Equipe[], dias: string[]): Set<string> {
  const relevantes = equipesComLinha(itensEmAberto, equipes, dias);
  const porId = new Map(relevantes.map((e) => [e.id, e]));
  const kmPorCelula = new Map<ChaveCelula, number>();

  for (const item of itensEmAberto) {
    if (item.equipeId == null) continue;
    const equipe = porId.get(item.equipeId);
    if (!equipe) continue;

    for (const fatia of fatiasEm(item, item.data, equipe)) {
      kmPorCelula.set(fatia.chave, (kmPorCelula.get(fatia.chave) ?? 0) + fatia.km);
    }
  }

  const excedidos = new Set<string>();
  for (const dia of dias) {
    for (const equipe of relevantes) {
      const capacidade = Number(equipe.capacidade_km_dia) || 0;
      const km = kmPorCelula.get(chaveCelula(dia, equipe.id)) ?? 0;
      if (km > capacidade + 1e-6) {
        excedidos.add(dia);
        break;
      }
    }
  }
  return excedidos;
}

/** Quatro semanas a partir da segunda da âncora. Ancorada na semana VISÍVEL e não
 *  na de hoje: navegar seis semanas à frente com a faixa parada em agosto
 *  apontaria para um intervalo que não contém o quadro. */
export function resumo28(itens: ItemAgenda[], ancora: string, equipes: Equipe[]): ResumoDia[] {
  const janela = montarJanela(ancora, 28);
  const abertos = itens.filter((i) => EM_ABERTO.has(i.status));
  const excedidos = diasComExcesso(abertos, equipes, janela.dias);

  return janela.dias.map((dia) => {
    const doDia = abertos.filter((i) => i.data === dia);
    return {
      dia,
      comEquipe: doDia.filter((i) => i.equipeId != null).length,
      semEquipe: doDia.filter((i) => i.equipeId == null).length,
      algumaExcedida: excedidos.has(dia),
    };
  });
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
      diasServico: diasDeServico(km, capacidade),
      capacidade,
      atrasado: ag.data_sugerida < hoje && (ag.status === "sugerido" || ag.status === "aprovado"),
    };
  });
}

export function ordenarPorUrgencia(a: ItemAgenda, b: ItemAgenda): number {
  return ordemRisco(a.risco) - ordemRisco(b.risco) || a.data.localeCompare(b.data) || a.id - b.id;
}

/** Quantos agendamentos em aberto já passaram da data sugerida — COM ou sem
 *  equipe atribuída. `grade.fila` só carrega os sem equipe e `montarGrade`/
 *  `resumo28` só enxergam a janela visível; nenhum dos dois serve para este
 *  número, que precisa da malha INTEIRA para não esconder um serviço vencido
 *  que já tem turma e caiu fora da semana ou dos 28 dias em exibição. */
export function contarAtrasados(itens: ItemAgenda[]): number {
  return itens.filter((i) => i.atrasado).length;
}

/** Segunda-feira da semana do agendamento vencido mais ANTIGO — para onde o
 *  resumo leva o gestor ao clicar. `null` sem nenhum atrasado: um número sem
 *  link para abrir informa um problema que a pessoa não consegue investigar. */
export function semanaDoAtrasoMaisAntigo(itens: ItemAgenda[]): string | null {
  const atrasados = itens.filter((i) => i.atrasado);
  if (atrasados.length === 0) return null;
  const maisAntigo = atrasados.reduce((a, b) => (a.data < b.data ? a : b));
  return chaveDia(inicioDaSemana(maisAntigo.data));
}

/** Valor cru do `?equipe=` na URL — string, não id: pode ser "" (sem
 *  destaque), um id que não existe mais, ou lixo de uma versão anterior do
 *  seletor. O nome já foi `FiltroEquipe`, de quando `?equipe=` ESCONDIA
 *  linha; hoje só destaca (ver `linhaAtenuada`), e o tipo ficou com nome de
 *  uma semântica que não é mais a dele. */
export type EquipeNaUrl = string;

/** Resolve o `?equipe=` da URL para o id que o quadro deve DESTACAR, ou
 *  `null` sem destaque. Nunca lança: um valor de uma versão anterior do
 *  seletor ("sem", de quando a equipe ainda filtrava por esconder) ou um id
 *  de equipe que não existe mais degrada em silêncio para "sem destaque", em
 *  vez de deixar a URL num estado inválido para quem tiver o link salvo. */
export function resolverEquipeFoco(filtro: EquipeNaUrl, equipes: Equipe[]): number | null {
  if (!filtro) return null;
  return equipes.find((e) => String(e.id) === filtro)?.id ?? null;
}

/** Verdadeiro quando a linha da equipe `equipeId` deve ficar visualmente
 *  atenuada: alguma equipe está em destaque (`focoEquipeId`) e não é esta.
 *  Quando a equipe em destaque não tem NENHUMA linha na semana visível — link
 *  salvo apontando para uma equipe desativada sem serviço aberto agora, por
 *  exemplo — nada atenua: apagar a semana inteira sem nenhuma linha para
 *  contrastar seria o oposto de "destacar". */
export function linhaAtenuada(
  equipeId: number,
  focoEquipeId: number | null,
  linhas: LinhaEquipe[],
): boolean {
  if (focoEquipeId == null) return false;
  if (!linhas.some((l) => l.equipe.id === focoEquipeId)) return false;
  return equipeId !== focoEquipeId;
}
