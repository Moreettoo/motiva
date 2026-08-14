/**
 * Modelo da agenda.
 *
 * A linha do tempo, a fila de decisão e o resumo precisam concordar no número:
 * se cada um calculasse os dias de serviço por conta própria, a soma de km da
 * faixa não bateria com a largura dos blocos e o gestor perderia a confiança na
 * tela. Por isso todo cálculo de janela, duração e carga mora aqui.
 */

import { dispensaAgendamento, ordemRisco, riscoPorPrazo } from "@/lib/dominio";
import { diasEntre, fmt, inicioDaSemana, parseData, somarDias } from "@/lib/format";
import type { AgendamentoDetalhado, Equipe, Risco, StatusAgendamento, UF } from "@/lib/types";
import { sum } from "@/lib/utils";

/** Só o que a agenda lê da view de trechos — o resto não precisa cruzar a rede.
 *
 *  O bloco de identidade (rodovia, km, uf, sentido) entrou com o agendamento
 *  manual: o seletor de trecho da gaveta de criação precisa NOMEAR os 50
 *  trechos, e antes disso nada nesta tela precisava — os agendamentos já
 *  chegavam com o trecho embutido, e um trecho sem agendamento nenhum (que é
 *  justamente o caso que se agenda na mão) não tinha por onde ser nomeado. */
export type TrechoResumo = {
  id: number;
  rodovia: string;
  km_inicio: number;
  km_fim: number;
  uf: UF;
  sentido: string | null;
  risco: Risco;
  dias_ate_limite: number | null;
  ocupacao_pct: number | null;
  altura_atual_cm: number | null;
  altura_limite_cm: number;
  crescimento_cm_dia: number | null;
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

/** Quantos dias inteiros a equipe gasta. Dias inteiros porque a equipe mobiliza
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
 *  na capacidade do DESTINO: mover para uma equipe mais rápida encurta o serviço. */
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
  /** Serviços que OCUPAM este dia sem desenhar cartão nele: `itensPorCelula` é
   *  chaveado pelo dia de INÍCIO (o cartão desenha onde começa), então o segundo
   *  dia de um serviço de 2 dias herda só km. Sem esta lista a célula de
   *  continuação fica com `km > 0` e `itens` vazio, e o rótulo falado tinha de
   *  escolher entre mentir ("Sem serviço.", com a barra mostrando 2,5/4,5) e
   *  deixar o km sem dono. Alcançável pelo próprio arrasto: 6 agendamentos em
   *  aberto passam de 4,5 km e há equipe ativa com 4,5 km/dia de capacidade. */
  continuacoes: ItemAgenda[];
  km: number;
  capacidade: number;
  ocupacao: number;
  excedida: boolean;
  /** Falso para dia passado e para equipe inativa. Célula que não aceita solta
   *  NÃO emite `data-celula` no DOM — senão o hit-test a encontraria mesmo assim. */
  aceitaSolta: boolean;
};

export type LinhaEquipe = { equipe: Equipe; celulas: Celula[]; kmSemana: number };

/** Um dia do mini-mapa de 28 dias. `semEquipe` existe aqui, e só aqui, porque
 *  a faixa de 28 dias é o ÚNICO lugar que ainda desenha a pressão de propostas
 *  por dia — e ela desenha, na banda de cima de cada barra, então o número tem
 *  um objeto na tela para ser conferido contra. Ver `ResumoColuna`, logo abaixo,
 *  para o caso em que ele não tem. */
export type ResumoDia = {
  dia: string;
  comEquipe: number;
  semEquipe: number;
  algumaExcedida: boolean;
};

/** Um dia do cabeçalho do quadro. Deliberadamente SEM `semEquipe`.
 *
 *  Enquanto existia a linha "Propostas da IA", o cabeçalho podia dizer
 *  "6 s/ equipe" e a pessoa conferia contando os cartões da coluna logo abaixo.
 *  A linha saiu (ela duplicava a fila de decisão — 31 cartões desenhados duas
 *  vezes), e com ela foi embora o objeto que sustentava esse número: mantê-lo
 *  seria pôr no cabeçalho uma contagem sem nada na coluna para verificá-la, que
 *  é exatamente a contradição que este arquivo existe para impedir.
 *
 *  Um tipo próprio, e não `ResumoDia` com o campo ignorado, para o compilador
 *  garantir isso: se um dia alguém quiser o número de volta no cabeçalho, vai
 *  ter de trazer de volta também o lugar onde ele se confere. */
export type ResumoColuna = {
  dia: string;
  comEquipe: number;
  algumaExcedida: boolean;
};

export type Grade = {
  janela: Janela;
  linhas: LinhaEquipe[];
  /** TODOS os em aberto sem equipe, por urgência. Independe da semana visível:
   *  um backlog que encolhe quando você olha para outra semana não é um backlog. */
  fila: ItemAgenda[];
  porDia: ResumoColuna[];
  porCelula: Map<ChaveCelula, Celula>;
  /** id do item → fatias que ele ocupa hoje. Devolve a carga da origem em O(1). */
  fatiasPorItem: Map<number, Fatia[]>;
};

/**
 * TRÊS perguntas de status, não uma.
 *
 * Havia só `EM_ABERTO`, e ele respondia às três de uma vez — o que fazia o
 * filtro de status da tela mentir. `montarGrade` recebe `visiveis` (o que o
 * filtro deixou passar) e então descartava tudo fora de aberto, então marcar
 * "Executado" no menu nunca podia ACRESCENTAR nada ao quadro: das quatro
 * opções, duas eram estruturalmente mortas, com a contagem de cada uma
 * anunciada ao lado. O estado visual `encerrado` do cartão (fundo
 * `--surface-3`, ícone de status) existia e era inalcançável.
 *
 * Separadas, cada uma responde ao que de fato governa:
 *
 * `EM_ABERTO` — espera decisão, logo entra na FILA. Roçada executada não espera
 * nada; descartada, menos ainda. A fila é o backlog de decisão, não um arquivo.
 *
 * `CONSOME_CAPACIDADE` — foi ou será trabalho de verdade, logo entra na BARRA de
 * km do dia. Executado entra: a equipe passou o dia lá, e a barra responde
 * "qual era a carga daquele dia?". Descartado não entra: não aconteceu, e somar
 * um plano cancelado à carga faria a barra mentir sobre o passado.
 *
 * Quem desenha CARTÃO na célula não tem predicado nenhum: é qualquer item com
 * equipe. O filtro de status já decidiu isso antes de `montarGrade` ser
 * chamada, e uma segunda peneira aqui é exatamente o defeito que existia.
 */
const EM_ABERTO = new Set<StatusAgendamento>(["sugerido", "aprovado"]);
const CONSOME_CAPACIDADE = new Set<StatusAgendamento>(["sugerido", "aprovado", "executado"]);

/**
 * Quais equipes "contam" nesta janela: ativa, OU inativa com serviço visível
 * cujo `item.data` caia dentro de `dias`. Equipe inativa sem serviço na
 * janela fica de fora — sem ela o cartão sumiria do quadro enquanto o resumo
 * continuaria contando o serviço (o motivo original desta regra), e com ela
 * incondicional, uma equipe sem NENHUM serviço na janela contaria km de uma
 * célula que nenhuma tela mostra.
 *
 * "Serviço visível", e não "em aberto": uma equipe desativada com roçada
 * EXECUTADA na janela precisa da linha dela agora que o quadro desenha
 * encerrados — senão o cartão não teria onde pousar e o cabeçalho do dia
 * contaria um serviço que nenhuma linha mostra.
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
      .filter((i) => i.equipeId != null && diasDaJanela.has(i.data))
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

  const comLinha = equipesComLinha(itens, equipes, janela.dias).sort(
    (a, b) => a.base_uf.localeCompare(b.base_uf, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"),
  );

  const fatiasPorItem = new Map<number, Fatia[]>();
  const kmPorCelula = new Map<ChaveCelula, number>();
  const itensPorCelula = new Map<ChaveCelula, ItemAgenda[]>();
  const continuacoesPorCelula = new Map<ChaveCelula, ItemAgenda[]>();

  for (const item of itens) {
    // Sem peneira de status aqui: o filtro da tela já decidiu o que chega em
    // `itens`, e uma segunda peneira era o que tornava "Executado" um botão
    // morto no menu. O único requisito para ter cartão numa célula é ter
    // equipe — sem ela não há linha em que pousar.
    if (item.equipeId == null) continue;
    const equipe = porId.get(item.equipeId);
    if (!equipe) continue;

    const fatias = fatiasEm(item, item.data, equipe);
    // `fatiasPorItem` é a carga DA ORIGEM de um arrasto (ver `previaDoMovimento`),
    // e só o que está em aberto se arrasta: `CartaoServico` não monta alça em
    // cartão encerrado. Registrar encerrados aqui seria carregar um mapa que
    // ninguém consulta.
    if (EM_ABERTO.has(item.status)) fatiasPorItem.set(item.id, fatias);

    // As duas coisas que a fatia produz — km na barra e "dono" do km na fala da
    // célula — andam juntas, e por isso partilham a guarda. Descartado não
    // entra em nenhuma: não somou carga, então não há km a que dar dono, e
    // listá-lo como continuação faria a célula anunciar um serviço com 0,0 km.
    // Ver `CONSOME_CAPACIDADE`, no alto, e `Celula.continuacoes`.
    if (CONSOME_CAPACIDADE.has(item.status)) {
      for (const [i, fatia] of fatias.entries()) {
        kmPorCelula.set(fatia.chave, (kmPorCelula.get(fatia.chave) ?? 0) + fatia.km);
        // Da segunda fatia em diante o cartão já foi desenhado no dia de início:
        // esta célula carrega km sem cartão. O índice cobre também a fatia cujo
        // dia de início cai FORA da janela — ela não tem célula onde desenhar, e
        // o dia de continuação que caiu dentro é o único lugar que mostra o km.
        if (i > 0) {
          continuacoesPorCelula.set(fatia.chave, [
            ...(continuacoesPorCelula.get(fatia.chave) ?? []),
            item,
          ]);
        }
      }
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
        continuacoes: (continuacoesPorCelula.get(chave) ?? []).slice().sort(ordenarPorUrgencia),
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

  const porDia: ResumoColuna[] = janela.dias.map((dia) => ({
    dia,
    comEquipe: linhas.reduce((n, l) => n + (porCelula.get(chaveCelula(dia, l.equipe.id))?.itens.length ?? 0), 0),
    algumaExcedida: linhas.some((l) => porCelula.get(chaveCelula(dia, l.equipe.id))?.excedida ?? false),
  }));

  return {
    janela,
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
function diasComExcesso(itens: ItemAgenda[], equipes: Equipe[], dias: string[]): Set<string> {
  const relevantes = equipesComLinha(itens, equipes, dias);
  const porId = new Map(relevantes.map((e) => [e.id, e]));
  const kmPorCelula = new Map<ChaveCelula, number>();

  for (const item of itens) {
    if (item.equipeId == null) continue;
    // A MESMA guarda de `montarGrade`: a hachura de excesso do mini-mapa e a
    // barra vermelha da célula precisam concordar sobre o que é carga, ou o
    // mapa de 28 dias marca um dia que o quadro mostra dentro da capacidade.
    if (!CONSOME_CAPACIDADE.has(item.status)) continue;
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
  // Sem peneira de status, pela mesma razão de `montarGrade`: o mini-mapa fica
  // logo ACIMA do quadro e a coluna de um dia é lida junto com o cabeçalho
  // daquele mesmo dia. Filtrando aqui e não lá, marcar "Executado" no menu
  // acrescentaria cartões no quadro e a barra do mini-mapa não subiria — dois
  // números para o mesmo dia a centímetros de distância, que é a contradição
  // que este arquivo existe para impedir. O que chega em `itens` já passou pelo
  // filtro da tela.
  const excedidos = diasComExcesso(itens, equipes, janela.dias);

  return janela.dias.map((dia) => {
    const doDia = itens.filter((i) => i.data === dia);
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
  /** Criado por um gestor no painel, não pelo lote. Ver `Origem`, em `types.ts`. */
  manual: boolean;
  /** O trecho passou de `DIAS_FOLGA_DISPENSA` dias do limite: este agendamento
   *  em aberto não é mais necessário.
   *
   *  Na prática só aparece em `aprovado` com data futura, e isso é desenho: o
   *  lote descarta sozinho o que ele mesmo sugeriu e o que já venceu sem ser
   *  executado, mas não desfaz uma aprovação humana ainda por acontecer. Esses
   *  ficam na tela com o selo e um descarte de um clique — a decisão volta para
   *  quem a tomou, em vez de sumir.
   *
   *  NUNCA verdadeiro numa roçada manual, e essa exceção é o ponto: agendar na
   *  mão é justamente o que se faz quando o modelo NÃO vê necessidade — a
   *  reclamação de motorista, a obra, o evento. Um trecho com 200 dias de folga
   *  é o caso típico, não o excepcional. Sem a exceção, toda roçada manual
   *  nasceria com o selo "Não é mais necessária" e um botão de descarte ao
   *  lado: o painel contradizendo, na mesma tela, a decisão que a pessoa acabou
   *  de tomar nela. */
  dispensavel: boolean;
};

function media(ns: number[]): number {
  return ns.length ? sum(ns) / ns.length : 0;
}

/**
 * Capacidade aplicável ao serviço. Sem equipe atribuída, a estimativa usa a média
 * das equipes com base no mesmo estado — é o palpite que o planejador faria, e
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
    const trecho = porTrecho.get(ag.trecho.id);
    const emAberto = ag.status === "sugerido" || ag.status === "aprovado";
    const manual = ag.origem === "manual";

    return {
      id: ag.id,
      ag,
      data: ag.data_sugerida,
      status: ag.status,
      equipeId: ag.equipe_id,
      equipeNome: ag.equipe?.nome ?? null,
      uf: ag.trecho.uf,
      risco: riscoDoItem(ag, trecho),
      km,
      diasServico: diasDeServico(km, capacidade),
      capacidade,
      atrasado: ag.data_sugerida < hoje && emAberto,
      manual,
      // A previsão do trecho manda, e a do próprio agendamento é o reserva —
      // mesma precedência de `riscoDoItem`, pelo mesmo motivo: a view carrega a
      // previsão MAIS RECENTE, e a do agendamento é a de quando ele nasceu. Um
      // agendamento antigo cujo trecho foi roçado desde então só é reconhecido
      // como dispensável pelo primeiro caminho.
      //
      // `!manual` primeiro, e não como filtro na tela: o selo, a frase de
      // explicação da gaveta e qualquer contagem futura de dispensáveis leem
      // este campo. Um deles esquecido é a contradição de volta.
      dispensavel:
        emAberto &&
        !manual &&
        dispensaAgendamento(trecho ? trecho.dias_ate_limite : ag.previsao?.dias_ate_limite),
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
 *  que já tem equipe e caiu fora da semana ou dos 28 dias em exibição. */
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

/**
 * Verdadeiro para a linha da equipe ESCOLHIDA no seletor de destaque.
 *
 * Substituiu `linhaAtenuada`, que respondia o inverso — "esta linha deve ficar
 * apagada?" — e a inversão conserta um defeito MEDIDO, não é troca de nome.
 *
 * O destaque antigo marcava as OUTRAS nove linhas com uma veladura preta a 3%.
 * Medido, o que isso produz de diferença entre linha atenuada e linha normal:
 * no ESCURO, 1,007:1 a 3% e 1,030:1 mesmo a 20% — preto sobre quase-preto não
 * gera sinal em alfa nenhum, e era por isso que o seletor parecia não
 * responder. No CLARO gera algum, mas a 6% já derruba `ink-3` para 4,37:1,
 * abaixo do piso de 4,5. Não existe alfa ao mesmo tempo legal e visível: o
 * mecanismo era incapaz, não mal calibrado.
 *
 * A saída é MATIZ em vez de luminância, e marcar UMA linha em vez de apagar
 * nove: `--accent` mede 4,82:1 no claro e 12,31:1 no escuro sobre a superfície,
 * e `--accent-soft` nas células não custa contraste de texto nenhum, porque o
 * único texto que pousa ali (o rótulo `km/capacidade`) carrega `bg-surface`
 * próprio. Ver `LinhaTurma` e `CelulaEquipe`.
 *
 * Não recebe `linhas`, ao contrário da antiga: uma equipe sem linha na semana
 * simplesmente não casa id nenhum, e o destaque não aparece. Quem responde "o
 * destaque está visível?" — a pergunta da região viva — é `destaqueVisivel`.
 */
export function linhaDestacada(equipeId: number, focoEquipeId: number | null): boolean {
  return focoEquipeId != null && equipeId === focoEquipeId;
}

/**
 * A equipe em destaque tem linha na semana visível?
 *
 * Quem não vê a tela não percebe o realce, então a região viva narra o
 * desfecho — e precisa distinguir "destaquei e você vai ver" de "destaquei mas
 * esta equipe não tem serviço nesta semana". O segundo caso é alcançável por um
 * link salvo apontando para equipe desativada e sem serviço aberto.
 *
 * NÃO é "alguma linha está destacada": com uma linha só, e ela sendo a em foco,
 * o destaque está na tela e o anúncio não pode dizer o contrário.
 */
export function destaqueVisivel(focoEquipeId: number | null, linhas: LinhaEquipe[]): boolean {
  return focoEquipeId != null && linhas.some((l) => l.equipe.id === focoEquipeId);
}

/**
 * trechoId → data do agendamento aberto que ele já tem.
 *
 * A invariante "um agendamento aberto por trecho" tem três pontas: o índice
 * único parcial no banco (`ux_agendamento_aberto_por_trecho`), a recusa de
 * `criarRocadaManual` no servidor, e este mapa. Só ele evita o erro em vez de
 * relatá-lo — sem ele o seletor de trecho da gaveta de criação ofereceria as 50
 * opções e a recusa do servidor seria a primeira notícia de que uma delas não
 * valia. A data entra no valor porque "já agendado" sem dizer para quando manda
 * a pessoa procurar o cartão pelo quadro inteiro.
 */
export function agendamentosAbertosPorTrecho(itens: ItemAgenda[]): Map<number, string> {
  const mapa = new Map<number, string>();
  for (const item of itens) {
    if (!EM_ABERTO.has(item.status)) continue;
    // Mais antigo vence. Com a invariante valendo há no máximo um por trecho,
    // então isto só desempata um estado que o índice já não deixa nascer — mas
    // desempatar por ordem de chegada da lista deixaria o texto do seletor
    // depender da ordenação da consulta.
    const atual = mapa.get(item.ag.trecho.id);
    if (atual == null || item.data < atual) mapa.set(item.ag.trecho.id, item.data);
  }
  return mapa;
}

export type DiaDaPrevia = { dia: string; km: number; capacidade: number; excedida: boolean };

export type PreviaNovoServico = {
  km: number;
  diasServico: number;
  /** Um por dia que o serviço novo ocuparia, com a carga que a equipe JÁ tem
   *  somada — o número que a gaveta mostra é o depois, não o acréscimo. */
  dias: DiaDaPrevia[];
};

/**
 * O que aconteceria com a equipe se este serviço novo entrasse em (dia, equipe).
 *
 * É a prévia do arrasto (`previaDoMovimento`) para um serviço que ainda não
 * existe — daí não reusar aquela: ela parte de um `ItemAgenda` e de uma `Grade`,
 * e o serviço em criação não tem nem um nem outro.
 *
 * Lê `itens`, não `grade`, e isso não é atalho: a `Grade` só cobre a semana
 * VISÍVEL, e a data digitada na gaveta de criação costuma cair fora dela —
 * agendar para daqui a três semanas é o caso normal, não o excepcional. Com a
 * grade, a prévia ficaria muda justamente quando é mais necessária. `itens` é a
 * malha inteira e não tem essa fronteira.
 */
export function previaDeNovoServico({
  itens,
  equipe,
  dia,
  km,
}: {
  itens: ItemAgenda[];
  equipe: Equipe;
  dia: string;
  km: number;
}): PreviaNovoServico {
  const capacidade = Number(equipe.capacidade_km_dia) || 0;
  const diasServico = diasDeServico(km, capacidade || 1);
  const kmPorDia = km / diasServico;

  // Mesma matemática de `montarGrade`: o serviço espalha o km pelos dias que
  // ocupa, então somar só no dia de início mentiria num serviço de 2 dias.
  const jaAlocado = new Map<string, number>();
  for (const item of itens) {
    if (item.equipeId !== equipe.id || !EM_ABERTO.has(item.status)) continue;
    for (const fatia of fatiasEm(item, item.data, equipe)) {
      jaAlocado.set(fatia.dia, (jaAlocado.get(fatia.dia) ?? 0) + fatia.km);
    }
  }

  return {
    km,
    diasServico,
    dias: Array.from({ length: diasServico }, (_, i) => {
      const d = chaveDia(somarDias(dia, i));
      const total = (jaAlocado.get(d) ?? 0) + kmPorDia;
      // O mesmo `1e-6` de `medir`: km é fracionário (km ÷ dias de serviço) e a
      // igualdade exata em ponto flutuante acusaria excesso numa equipe que
      // fechou a capacidade na conta certa.
      return { dia: d, km: total, capacidade, excedida: total > capacidade + 1e-6 };
    }),
  };
}
