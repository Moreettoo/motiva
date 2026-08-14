import { describe, expect, it } from "vitest";

import type { AgendamentoDetalhado, Equipe } from "@/lib/types";

import { montarGrade, montarItens, montarJanela, type Grade, type ItemAgenda } from "../dados";
import {
  adotarSelecionado,
  decidirCartaoAtivo,
  decidirCartaoAtivoTrilho,
  idsDoQuadro,
  idsElegiveisNoTrilho,
} from "./usar-foco-grade";

/* ---------- fábricas mínimas: só os campos que o modelo lê ---------- */

function equipe(parcial: Partial<Equipe> & { id: number }): Equipe {
  return {
    nome: `Equipe ${parcial.id}`,
    base_uf: "SP",
    base_cidade: null,
    capacidade_km_dia: 6,
    ativo: true,
    ...parcial,
  } as Equipe;
}

function agendamento(p: { id: number; data: string; equipeId?: number | null }): AgendamentoDetalhado {
  const eq = p.equipeId == null ? null : { id: p.equipeId, nome: `Equipe ${p.equipeId}`, base_uf: "SP" as const };
  return {
    id: p.id,
    trecho_id: p.id,
    previsao_id: null,
    data_sugerida: p.data,
    prioridade: "media",
    justificativa: "teste",
    fatores: null,
    status: "sugerido",
    modelo_usado: null,
    equipe_id: p.equipeId ?? null,
    atualizado_em: null,
    criado_em: "2026-08-01T00:00:00Z",
    trecho: {
      id: p.id,
      rodovia: `BR-${100 + p.id}`,
      km_inicio: 10,
      km_fim: 13,
      uf: "SP",
      sentido: null,
      especie: "braquiaria",
      tipo_pista: null,
      altura_limite_cm: 40,
      latitude: -22,
      longitude: -45,
    },
    equipe: eq,
    previsao: null,
  } as AgendamentoDetalhado;
}

const equipes = [equipe({ id: 1 })];
const hoje = "2026-08-13";
// Janela visível: 2026-08-10 (segunda) a 2026-08-16 (domingo).
const janela = montarJanela(hoje);

function montar(ags: AgendamentoDetalhado[]): Grade {
  const itens = montarItens({ agendamentos: ags, trechos: [], equipes, hoje });
  return montarGrade({ itens, equipes, janela, hoje });
}

/** Como `useFocoGrade` chama a gaveta de detalhe: `selecionado` NÃO é entrada
 *  de `decidirCartaoAtivo` — ele chega em `anterior`, uma vez por mudança, via
 *  `adotarSelecionado`. `selecionadoVisto` default `null` é o render em que a
 *  gaveta ACABOU de passar a mostrar aquele id (o caso de `?ag=` na primeira
 *  pintura); passar o mesmo valor de `selecionado` simula a gaveta já aberta há
 *  vários renders, que é quando o `onFocus` precisa mandar. */
type Entradas = {
  anterior: number | null;
  emVoo: number | null;
  selecionado: number | null;
  selecionadoVisto?: number | null;
};

/** A cadeia do QUADRO como `useFocoGrade` a monta. A fila do trilho não entra
 *  em nenhum dos dois lados: `idsDoQuadro` só conhece `grade`, e é isso que faz
 *  o conjunto de elegibilidade e o universo do padrão serem os MESMOS. */
function decidir(grade: Grade, p: Entradas): number | null {
  const idsRenderizados = idsDoQuadro(grade);
  return decidirCartaoAtivo({
    anterior: adotarSelecionado({
      anterior: p.anterior,
      selecionado: p.selecionado,
      selecionadoVisto: p.selecionadoVisto ?? null,
      // O critério do QUADRO: um cartão montado NO QUADRO (célula de equipe) —
      // o mesmo conjunto contra o qual a decisão já valida um alvo, e o mesmo
      // de onde sai o padrão.
      elegiveis: idsRenderizados,
    }),
    emVoo: p.emVoo,
    grade,
    idsRenderizados,
  });
}

/** A cadeia do TRILHO inteira, na ordem em que `useFocoGrade` a monta: adoção
 *  da gaveta (filtrada por `idsElegiveisNoTrilho`) → decisão. O resultado é o
 *  que `TrilhoFila` recebe de fato na prop `idAtivo`.
 *
 *  Havia um terceiro elo — um desempate contra a linha "Propostas da IA", que
 *  anulava o ativo do trilho quando o mesmo serviço montava nas duas regiões.
 *  A linha saiu do quadro e não existe mais gêmeo para desempatar. */
function ativoDoTrilho(
  grade: Grade,
  p: Entradas,
  filaVisivel: ItemAgenda[] = grade.fila,
): number | null {
  return decidirCartaoAtivoTrilho({
    anterior: adotarSelecionado({
      anterior: p.anterior,
      selecionado: p.selecionado,
      selecionadoVisto: p.selecionadoVisto ?? null,
      elegiveis: idsElegiveisNoTrilho(filaVisivel),
    }),
    emVoo: p.emVoo,
    filaVisivel,
  });
}

/* Os fixtures de precedência abaixo dão equipe aos DOIS serviços, e isso é
   requisito e não detalhe: eles falam sobre qual cartão do QUADRO ganha o tab
   stop, então os dois ids precisam ter cartão no quadro. Antes bastava o id 1
   ter data dentro da semana — sem equipe, ele montava na linha "Propostas da
   IA" e era candidato legítimo. A linha saiu, e um serviço sem equipe passou a
   morar só no trilho: mantido como estava, o fixture testaria a precedência com
   um id que a região nem considera, e passaria pelo motivo errado. */
describe("decidirCartaoAtivo", () => {
  it("o cartão em voo sempre vence, mesmo com selecionado e anterior diferentes", () => {
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11", equipeId: 1 }),
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }),
    ]);
    expect(decidir(grade, { anterior: 2, emVoo: 1, selecionado: 2 })).toBe(1);
  });

  it("na MUDANÇA do selecionado (gaveta abrindo), ele é adotado por cima do anterior", () => {
    // Nome corrigido: não é "o selecionado vence sobre o anterior" em geral —
    // vence só no render em que a gaveta passa a mostrá-lo, que é o único
    // trabalho dele. É o que garante que o Tab volte PARA ELE quando a gaveta
    // fechar, em vez de para o primeiro cartão da tela.
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11", equipeId: 1 }),
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }),
    ]);
    expect(decidir(grade, { anterior: 1, emVoo: null, selecionado: 2 })).toBe(2);
  });

  it("com a gaveta aberta há vários renders, o anterior (onFocus) manda sobre o selecionado", () => {
    // O defeito: `selecionado` é o `?ag=` da URL e fica IGUAL por muitos
    // renders. Pesando mais que o sticky, ele revertia cada `onFocus` no MESMO
    // render (`setFocoId` escrevia, o recálculo empurrava de volta) e o tab
    // stop não saía do cartão da gaveta — justo quando a pessoa está andando
    // entre cartões para comparar com o detalhe aberto.
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11", equipeId: 1 }),
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }),
    ]);
    expect(
      decidir(grade, { anterior: 1, emVoo: null, selecionado: 2, selecionadoVisto: 2 }),
    ).toBe(1);
  });

  it("a gaveta fechando não puxa o tab stop de volta para o cartão dela", () => {
    // `selecionado` cai para `null` e `selecionadoVisto` ainda é o id antigo:
    // outra mudança, mas não há nada para adotar. O sticky que o `onFocus`
    // deixou é exatamente onde o Tab deve retomar.
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11", equipeId: 1 }),
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }),
    ]);
    expect(
      decidir(grade, { anterior: 1, emVoo: null, selecionado: null, selecionadoVisto: 2 }),
    ).toBe(1);
  });

  it("sem os dois, mantém o anterior (sticky) enquanto ele existir", () => {
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }),
    ]);
    expect(decidir(grade, { anterior: 2, emVoo: null, selecionado: null })).toBe(2);
  });

  it("cai no padrão (a primeira célula) quando o anterior sumiu da lista", () => {
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }), // sem equipe: fila, nunca quadro
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }),
    ]);
    // id 99 não existe mais (por exemplo, foi executado e saiu da lista). O
    // padrão é o id 2, e não o 1: o quadro só conhece o que tem equipe desde
    // que a linha "Propostas da IA" saiu, e o id 1 mora só no trilho.
    expect(decidir(grade, { anterior: 99, emVoo: null, selecionado: null })).toBe(2);
  });

  it("cai na primeira célula da semana", () => {
    const grade = montar([agendamento({ id: 2, data: "2026-08-12", equipeId: 1 })]);
    expect(decidir(grade, { anterior: null, emVoo: null, selecionado: null })).toBe(2);
  });

  it("o padrão é o primeiro cartão em ordem de leitura das células", () => {
    // O quadro tem uma parada de Tab só, então este valor É onde o Tab aterra
    // ao entrar na região: precisa ser o primeiro cartão em ordem de LEITURA
    // (linha por linha, da esquerda para a direita), não o primeiro em ordem de
    // dado. `montarGrade` recebeu a sexta antes da terça.
    const grade = montar([
      agendamento({ id: 2, data: "2026-08-14", equipeId: 1 }), // célula, sexta
      agendamento({ id: 1, data: "2026-08-11", equipeId: 1 }), // célula, terça
    ]);
    expect(decidir(grade, { anterior: null, emVoo: null, selecionado: null })).toBe(1);
  });

  it("serviço sem equipe com data NA semana não entra no quadro — é só da fila", () => {
    // O caso que a linha "Propostas da IA" desenhava e que virava um segundo
    // cartão do mesmo serviço na mesma tela. Agora ele existe num lugar só, e
    // este teste ancora essa fronteira: as duas datas caem dentro da janela
    // visível (2026-08-10 a 2026-08-16) e ainda assim o quadro está vazio.
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-08-12" }),
    ]);
    expect([...idsDoQuadro(grade)]).toEqual([]);
    expect(grade.fila.map((i) => i.id)).toEqual([1, 2]);
    expect(decidir(grade, { anterior: null, emVoo: null, selecionado: null })).toBeNull();
  });

  it("devolve null quando não há nenhum item em lugar nenhum", () => {
    const grade = montar([]);
    expect(decidir(grade, { anterior: null, emVoo: null, selecionado: null })).toBeNull();
  });

  it("não testa contra a lista inteira: um selecionado COM equipe que sai da semana visível não trava a grade", () => {
    // Reproduz o bug: item 2 tem equipe (não está em `grade.fila`), e sua
    // data (2026-08-12) está na janela VELHA. Simula a troca de semana
    // remontando a grade para uma janela em que esse item não aparece mais.
    const semanaVelha = montar([agendamento({ id: 2, data: "2026-08-12", equipeId: 1 })]);
    expect(decidir(semanaVelha, { anterior: null, emVoo: null, selecionado: 2 })).toBe(2); // existe na semana velha — ok.

    const itensProximaSemana = montarItens({
      agendamentos: [agendamento({ id: 3, data: "2026-08-20", equipeId: 1 })],
      trechos: [],
      equipes,
      hoje,
    });
    const semanaNova = montarGrade({
      itens: itensProximaSemana,
      equipes,
      janela: montarJanela("2026-08-20"),
      hoje,
    });
    // O id 2 (selecionado) não existe na grade nova — precisa cair no
    // padrão da grade nova (id 3), não ficar preso a um id fantasma.
    expect(decidir(semanaNova, { anterior: null, emVoo: null, selecionado: 2 })).toBe(3);
  });

  it("um id cujo ÚNICO cartão está no trilho não é ativo do quadro por nenhuma das três portas", () => {
    // O defeito, pelos três gatilhos que levam a ele. O id 1 não tem equipe e
    // sua data (2026-09-01) cai fora da janela visível (2026-08-10 a
    // 2026-08-16): não vira proposta, e sem equipe nunca ocupa célula — o único
    // cartão dele está no trilho. Enquanto `idsDoQuadro` incluía a fila, esse
    // id passava no PRIMEIRO ramo de `decidirCartaoAtivo`, o padrão nunca
    // rodava, e nenhum cartão do quadro casava `item.id === idAtivo`: as 7
    // colunas e todas as raias ficavam com ZERO paradas de Tab, com a célula
    // do id 2 visível na tela. E o estado se sustentava, porque o mesmo
    // conjunto revalidava o sticky no render seguinte.
    const grade = montar([
      agendamento({ id: 1, data: "2026-09-01" }),
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }),
    ]);
    expect([...idsDoQuadro(grade)]).toEqual([2]); // a fila não é do quadro
    // (a) sticky memorizado — o caso que persistia entre renders.
    expect(decidir(grade, { anterior: 1, emVoo: null, selecionado: null })).toBe(2);
    // (b) primeira visita: sem sticky nenhum, o padrão não pode escolher
    //     `grade.fila[0]` — e aqui a fila inteira é esse id.
    expect(grade.fila.map((i) => i.id)).toEqual([1]);
    expect(decidir(grade, { anterior: null, emVoo: null, selecionado: null })).toBe(2);
    // (c) a gaveta abrindo nesse item: a adoção é recusada por inelegibilidade
    //     na região e o padrão do quadro prevalece. O cartão do trilho segue
    //     alcançável por lá — é a região dele que carrega essa parada de Tab.
    expect(decidir(grade, { anterior: null, emVoo: null, selecionado: 1 })).toBe(2);
  });

  it("o corte de exibição do trilho não é assunto do quadro", () => {
    // `idsDoQuadro` só conhece `grade`, e as células não têm teto de exibição —
    // então o `TETO_TRILHO` não pode nem em tese tirar um cartão do quadro. O
    // id 1 tem célula de verdade, e é isso que decide.
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11", equipeId: 1 }),
      agendamento({ id: 2, data: "2026-08-12" }),
    ]);
    expect(
      decidirCartaoAtivo({
        anterior: null,
        emVoo: 1,
        grade,
        idsRenderizados: idsDoQuadro(grade),
      }),
    ).toBe(1);
  });

  it("semana vazia com o trilho cheio: o ativo do QUADRO não pode ser um id do trilho", () => {
    // Item 1 está SÓ no trilho (sem equipe, data fora da janela visível — não
    // vira proposta, e sem equipe nunca ocupa célula). Este caso passava antes
    // só por causa de um gate de layout (`filaDisponivel: false`, a doca do
    // trilho fechada no estreito, que deixa o nó `inert`). Agora ele vale
    // sozinho: o quadro não aponta para a fila em largura nenhuma.
    const grade = montar([agendamento({ id: 1, data: "2026-09-01" })]);
    expect(decidir(grade, { anterior: null, emVoo: null, selecionado: null })).toBeNull();
  });

  it("doca aberta (ou largura ampla): esse mesmo item CONTINUA sem ser o padrão do quadro", () => {
    // A expectativa deste teste estava invertida: ele afirmava `.toBe(1)` sob o
    // nome "o mesmo item volta a ser o padrão do quadro", codificando o bug.
    // O id 1 não tem UM cartão no quadro — chamá-lo de padrão da região era
    // exatamente o que zerava a parada de Tab das 7 colunas e das 10 raias, em
    // toda semana alcançada pelo `›` que estivesse vazia. O par com o teste
    // acima continua sendo o ponto: o resultado é o mesmo com a doca aberta ou
    // fechada, porque `filaDisponivel` deixou de ser entrada desta decisão
    // quando a fila deixou de ser candidata dela.
    //
    // `null` aqui é honesto e é o que passou a ser garantido: nada no quadro
    // para focar. A rede desse caso é do DOM (spec §5, um nó do quadro com
    // `tabIndex={0}`), não deste cálculo — se ela cair, a região fica sem
    // parada de Tab por ausência real de conteúdo, não por um id fantasma.
    const grade = montar([agendamento({ id: 1, data: "2026-09-01" })]);
    expect(
      decidirCartaoAtivo({
        anterior: null,
        emVoo: null,
        grade,
        idsRenderizados: idsDoQuadro(grade),
      }),
    ).toBeNull();
  });
});

describe("decidirCartaoAtivoTrilho", () => {
  // O trilho é uma região própria (spec §5): precisa do seu PRÓPRIO ativo,
  // independente do que o "quadro" (as células) resolveu — ver o comentário em
  // `useFocoGrade` sobre por que um sticky global único deixava uma das duas
  // regiões sem tab stop nenhum.

  it("o padrão é o topo da fila, esteja a data dentro ou fora da semana", () => {
    // Este teste guarda uma simplificação, e por isso as duas datas importam: o
    // id 1 cai DENTRO da janela visível e o id 2 fora. Enquanto existia a linha
    // "Propostas da IA", essa diferença decidia o resultado — o id 1 era gêmeo,
    // o padrão tinha de pulá-lo e a resposta era 2. Sem a linha, os dois moram
    // só no trilho e o topo da fila vence, como em qualquer lista.
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-09-01" }),
    ]);
    expect(
      decidirCartaoAtivoTrilho({ anterior: null, emVoo: null, filaVisivel: grade.fila }),
    ).toBe(1);
  });

  it("o trilho tem tab stop mesmo com toda a fila dentro da semana visível", () => {
    // O caso que devolvia `null` antes: as duas datas caem na janela, então os
    // dois cartões eram gêmeos das Propostas, o desempate anulava o ativo e o
    // trilho ficava com ZERO parada de Tab — no caso COMUM, porque a fila vem
    // por urgência e o mais urgente costuma estar na semana à vista.
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-08-12" }),
    ]);
    expect(
      decidirCartaoAtivoTrilho({ anterior: null, emVoo: null, filaVisivel: grade.fila }),
    ).toBe(1);
    expect(ativoDoTrilho(grade, { anterior: null, emVoo: null, selecionado: null })).toBe(1);
  });

  it("mantém o anterior (sticky) enquanto ele morar na fila visível", () => {
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-09-01" }),
    ]);
    expect(ativoDoTrilho(grade, { anterior: 2, emVoo: null, selecionado: null })).toBe(2);
  });

  it("ignora emVoo que não pertence ao trilho (item com equipe) e cai no padrão", () => {
    // Item 2 TEM equipe: nunca aparece em `filaVisivel`. Um sticky global
    // compartilhado com o "quadro" adotaria o id 2 aqui mesmo assim — o bug
    // original. O cálculo escopado ao trilho recusa e cai no primeiro item
    // que de fato mora na fila.
    const grade = montar([
      agendamento({ id: 1, data: "2026-09-01" }),
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }),
    ]);
    expect(
      decidirCartaoAtivoTrilho({ anterior: null, emVoo: 2, filaVisivel: grade.fila }),
    ).toBe(1);
  });

  it("devolve null quando a fila visível está vazia", () => {
    const grade = montar([agendamento({ id: 1, data: "2026-08-11", equipeId: 1 })]);
    expect(
      decidirCartaoAtivoTrilho({
        anterior: 1,
        emVoo: null,
        filaVisivel: grade.fila, // vazia: o único item tem equipe
      }),
    ).toBeNull();
  });

  it("as duas regiões têm cada uma o seu tab stop, ao mesmo tempo", () => {
    // A garantia que os dois cálculos independentes existem para dar, e que um
    // sticky global único quebrava: com um serviço na fila e outro numa célula,
    // o trilho aponta para o seu e o quadro para o dele, na mesma passada.
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }), // fila
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }), // célula
    ]);
    expect(ativoDoTrilho(grade, { anterior: null, emVoo: null, selecionado: null })).toBe(1);
    expect(decidir(grade, { anterior: null, emVoo: null, selecionado: null })).toBe(2);
  });
});

describe("adotarSelecionado", () => {
  it("adota na mudança, quando o id é elegível na região", () => {
    expect(
      adotarSelecionado({
        anterior: 7,
        selecionado: 3,
        selecionadoVisto: null,
        elegiveis: new Set([3]),
      }),
    ).toBe(3);
  });

  it("declina quando o selecionado não mudou: o sticky do onFocus governa", () => {
    // O coração da correção. `selecionado` fica igual por muitos renders com a
    // gaveta aberta; se ele fosse uma entrada CONTÍNUA, este caso devolveria 3
    // e reverteria todo `onFocus` no mesmo render.
    expect(
      adotarSelecionado({
        anterior: 7,
        selecionado: 3,
        selecionadoVisto: 3,
        elegiveis: new Set([3, 7]),
      }),
    ).toBe(7);
  });

  it("declina quando o id não é elegível na região, e não tenta de novo depois", () => {
    // Um id sem cartão alcançável naquela região não entra no sticky dela. E
    // como a marca de "já visto" é escrita de todo jeito, a adoção não volta a
    // ser oferecida em render nenhum — ela é um evento, e o evento passou.
    expect(
      adotarSelecionado({
        anterior: 7,
        selecionado: 3,
        selecionadoVisto: null,
        elegiveis: new Set([7]), // o 3 não tem cartão montado nesta região
      }),
    ).toBe(7);
    // Render seguinte, agora COM o 3 elegível (a semana virou, o cartão montou):
    // a marca de visto já foi escrita, e a adoção não se repete.
    expect(
      adotarSelecionado({
        anterior: 7,
        selecionado: 3,
        selecionadoVisto: 3,
        elegiveis: new Set([3, 7]),
      }),
    ).toBe(7);
  });

  it("gaveta fechando (selecionado null) devolve o sticky intacto", () => {
    expect(
      adotarSelecionado({
        anterior: 7,
        selecionado: null,
        selecionadoVisto: 3,
        elegiveis: new Set([7]),
      }),
    ).toBe(7);
  });

  it("primeiro render com ?ag= na URL adota mesmo sem sticky nenhum", () => {
    // `selecionadoVisto` nasce `null` justamente para este caso: a página abre
    // com a gaveta já aberta, e aquele cartão precisa virar o alvo do roving
    // tabindex para o Tab voltar para ele quando a gaveta fechar.
    expect(
      adotarSelecionado({
        anterior: null,
        selecionado: 3,
        selecionadoVisto: null,
        elegiveis: new Set([3]),
      }),
    ).toBe(3);
  });
});

describe("idsElegiveisNoTrilho", () => {
  it("exclui tudo que não mora na fila visível", () => {
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }), // sem equipe, na semana
      agendamento({ id: 2, data: "2026-09-01" }), // sem equipe, fora da semana
      agendamento({ id: 3, data: "2026-08-12", equipeId: 1 }), // com equipe: célula
    ]);
    // O id 3 fica de fora por ter equipe. O 1 ENTRA, e antes não entrava: ele
    // era gêmeo da linha "Propostas da IA", e adotá-lo apagaria o tab stop do
    // trilho em vez de movê-lo. Sem a linha, ele é um item de fila como o outro.
    expect([...idsElegiveisNoTrilho(grade.fila)]).toEqual([1, 2]);
  });

  it("respeita o corte de exibição do trilho", () => {
    // `filaVisivel` é a fatia que `quadro-semana.tsx` de fato monta
    // (`TETO_TRILHO`). Um id além do corte não tem cartão nenhum na tela, e
    // adotá-lo zeraria a parada de Tab da região.
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-09-01" }),
    ]);
    expect([...idsElegiveisNoTrilho(grade.fila.slice(0, 1))]).toEqual([1]);
  });
});

describe("a cadeia do trilho com a gaveta de detalhe", () => {
  // Estes exercitam a composição inteira (`adotarSelecionado` →
  // `decidirCartaoAtivoTrilho`), que é a única forma em que o `TrilhoFila` vê o
  // resultado.

  it("um selecionado da GRADE não apaga o cartão que a pessoa focou no trilho", () => {
    // O pior sintoma do defeito. Item 2 tem equipe, logo NUNCA está em
    // `filaVisivel`: com `selecionado` na precedência, o trilho não o achava,
    // caía no PADRÃO e jogava a parada de Tab para o primeiro item da fila —
    // apagando o cartão 3, que a pessoa acabou de focar ali para comparar com
    // o detalhe aberto. A elegibilidade por região recusa a adoção e o sticky
    // sobrevive.
    const grade = montar([
      agendamento({ id: 1, data: "2026-09-01" }), // o padrão, para onde o foco fugia
      agendamento({ id: 3, data: "2026-09-02" }), // focado no trilho
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }), // aberto na gaveta
    ]);
    expect(grade.fila.map((i) => i.id)).toEqual([1, 3]); // o padrão seria o 1
    expect(ativoDoTrilho(grade, { anterior: 3, emVoo: null, selecionado: 2 })).toBe(3);
  });

  it("com a gaveta aberta há vários renders, o trilho segue o onFocus", () => {
    // Mesmo defeito da região "quadro", visto do trilho: aqui o id da gaveta
    // até mora na fila, então o congelamento seria silencioso — o tab stop
    // simplesmente não sairia do cartão 1.
    const grade = montar([
      agendamento({ id: 1, data: "2026-09-01" }),
      agendamento({ id: 2, data: "2026-09-02" }),
    ]);
    expect(
      ativoDoTrilho(grade, { anterior: 2, emVoo: null, selecionado: 1, selecionadoVisto: 1 }),
    ).toBe(2);
  });

  it("na MUDANÇA, o trilho adota o id da gaveta que de fato mora nele", () => {
    const grade = montar([
      agendamento({ id: 1, data: "2026-09-01" }),
      agendamento({ id: 2, data: "2026-09-02" }),
    ]);
    expect(ativoDoTrilho(grade, { anterior: 2, emVoo: null, selecionado: 1 })).toBe(1);
  });

  it("a gaveta abrindo num item da fila cuja data cai na semana visível é adotada", () => {
    // Este caso mudou de resposta com a saída da linha "Propostas da IA", e a
    // mudança é a correção. O id 1 cai na semana visível: ele montava no trilho
    // E nas Propostas, e adotá-lo no trilho era pior que não adotar — o
    // desempate o anulava no mesmo render e o trilho ficava com ZERO paradas.
    // Por isso o resultado era 2, o sticky anterior.
    //
    // Sem a linha, o id 1 tem um cartão só, no trilho, e é lá que a gaveta deve
    // levar o foco. A segunda expectativa é o outro lado: o quadro NÃO adota o
    // mesmo id, porque ele não tem cartão em célula nenhuma — as duas regiões
    // decidindo o mesmo `selecionado` na mesma passada, cada uma com o seu
    // critério, que continua sendo o ponto do desenho.
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-09-01" }),
    ]);
    expect(ativoDoTrilho(grade, { anterior: 2, emVoo: null, selecionado: 1 })).toBe(1);
    expect(decidir(grade, { anterior: null, emVoo: null, selecionado: 1 })).toBeNull();
  });
});
