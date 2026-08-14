import { describe, expect, it } from "vitest";

import type { AgendamentoDetalhado, Equipe } from "@/lib/types";

import { montarGrade, montarItens, montarJanela, type Grade, type ItemAgenda } from "../dados";
import {
  adotarSelecionado,
  decidirCartaoAtivo,
  decidirCartaoAtivoTrilho,
  idAtivoNoTrilho,
  idsDoQuadro,
  idsElegiveisNoTrilho,
  idsNasPropostas,
} from "./usar-foco-grade";

/* ---------- fábricas mínimas: só os campos que o modelo lê ---------- */

function equipe(parcial: Partial<Equipe> & { id: number }): Equipe {
  return {
    nome: `Turma ${parcial.id}`,
    base_uf: "SP",
    base_cidade: null,
    capacidade_km_dia: 6,
    ativo: true,
    ...parcial,
  } as Equipe;
}

function agendamento(p: { id: number; data: string; equipeId?: number | null }): AgendamentoDetalhado {
  const eq = p.equipeId == null ? null : { id: p.equipeId, nome: `Turma ${p.equipeId}`, base_uf: "SP" as const };
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

/** Nos testes, sem corte de exibição — a fila visível é a fila inteira. */
function decidir(grade: Grade, p: Entradas): number | null {
  const idsRenderizados = idsDoQuadro(grade.fila, grade);
  return decidirCartaoAtivo({
    anterior: adotarSelecionado({
      anterior: p.anterior,
      selecionado: p.selecionado,
      selecionadoVisto: p.selecionadoVisto ?? null,
      // O critério do QUADRO: qualquer id com cartão montado em algum lugar da
      // grade — o mesmo conjunto contra o qual a decisão já valida um alvo.
      elegiveis: idsRenderizados,
    }),
    emVoo: p.emVoo,
    grade,
    filaVisivel: grade.fila,
    idsRenderizados,
  });
}

/** A cadeia do TRILHO inteira, na ordem em que `useFocoGrade` a monta: adoção
 *  da gaveta (filtrada por `idsElegiveisNoTrilho`) → decisão → desempate contra
 *  as Propostas. O último elo é o que `TrilhoFila` recebe de fato na prop
 *  `idAtivo`; afirmar só o elo do meio deixa passar fixture em que a decisão
 *  devolve um id e o componente recebe `null`. */
function ativoDoTrilho(
  grade: Grade,
  p: Entradas,
  filaVisivel: ItemAgenda[] = grade.fila,
): number | null {
  const idsPropostas = idsNasPropostas(grade);
  const proprio = decidirCartaoAtivoTrilho({
    anterior: adotarSelecionado({
      anterior: p.anterior,
      selecionado: p.selecionado,
      selecionadoVisto: p.selecionadoVisto ?? null,
      elegiveis: idsElegiveisNoTrilho(filaVisivel, idsPropostas),
    }),
    emVoo: p.emVoo,
    filaVisivel,
    idsPropostas,
  });
  return idAtivoNoTrilho(proprio, idsPropostas);
}

describe("decidirCartaoAtivo", () => {
  it("o cartão em voo sempre vence, mesmo com selecionado e anterior diferentes", () => {
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
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
      agendamento({ id: 1, data: "2026-08-11" }),
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
      agendamento({ id: 1, data: "2026-08-11" }),
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
      agendamento({ id: 1, data: "2026-08-11" }),
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

  it("cai no padrão (primeiro da fila) quando o anterior sumiu da lista", () => {
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-08-12", equipeId: 1 }),
    ]);
    // id 99 não existe mais (por exemplo, foi executado e saiu da lista).
    expect(decidir(grade, { anterior: 99, emVoo: null, selecionado: null })).toBe(1);
  });

  it("cai no primeiro item da grade quando a fila está vazia", () => {
    const grade = montar([agendamento({ id: 2, data: "2026-08-12", equipeId: 1 })]);
    expect(decidir(grade, { anterior: null, emVoo: null, selecionado: null })).toBe(2);
  });

  it("devolve null quando não há nenhum item em lugar nenhum", () => {
    const grade = montar([]);
    expect(decidir(grade, { anterior: null, emVoo: null, selecionado: null })).toBeNull();
  });

  it("não testa contra a lista inteira: um selecionado COM turma que sai da semana visível não trava a grade", () => {
    // Reproduz o bug: item 2 tem turma (não está em `grade.fila`), e sua
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

  it("um id além do corte de exibição do trilho, e fora da semana visível, não trava a grade", () => {
    // Simula o teto do trilho: `filaVisivel` só tem o id 2. O id 1 existe em
    // `grade.fila` mas está "além do teto" — e sua data (fora da janela
    // visível, 2026-08-10 a 2026-08-16) também não o coloca em
    // `grade.propostas`, então ele não tem cartão NENHUM montado na tela.
    const grade = montar([
      agendamento({ id: 1, data: "2026-09-01" }),
      agendamento({ id: 2, data: "2026-08-12" }),
    ]);
    const filaVisivel = [grade.fila.find((i) => i.id === 2)!];
    const idsRenderizados = idsDoQuadro(filaVisivel, grade);
    expect(
      decidirCartaoAtivo({
        anterior: 1,
        emVoo: null,
        filaVisivel,
        grade,
        idsRenderizados,
      }),
    ).toBe(2); // cai no padrão (primeiro da fila VISÍVEL), não trava em tabIndex=-1.
  });

  it("um id além do corte do trilho, mas presente nas propostas desta semana, AINDA valida como ativo", () => {
    // Mesmo corte do teste acima, mas agora a data do id 1 (2026-08-11) CAI
    // na janela visível — ele tem um cartão de verdade na linha "Propostas
    // da IA", mesmo estando fora do corte de exibição do trilho.
    // `idsDoQuadro` precisa unir `grade.propostas`, não só `filaVisivel` e
    // as células, ou este id seria injustamente recusado como ativo.
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-08-12" }),
    ]);
    const filaVisivel = [grade.fila.find((i) => i.id === 2)!];
    const idsRenderizados = idsDoQuadro(filaVisivel, grade);
    expect(
      decidirCartaoAtivo({
        anterior: null,
        emVoo: 1,
        filaVisivel,
        grade,
        idsRenderizados,
      }),
    ).toBe(1);
  });

  it("doca fechada / fila indisponível: o ativo do QUADRO não pode ser um id do trilho", () => {
    // Item 1 está SÓ no trilho (sem equipe, data fora da janela visível —
    // não vira proposta, e sem equipe nunca ocupa célula). Com a doca
    // fechada no estreito (`filaDisponivel: false`), o trilho existe no DOM
    // mas está `inert`: um Tab não alcança ele ali. Sem o gate, o padrão
    // (`primeiroItemDoQuadro`) apontava para o item 1 mesmo assim — o
    // "ativo" do quadro resolvia para um cartão que o teclado não alcança.
    const grade = montar([agendamento({ id: 1, data: "2026-09-01" })]);
    expect(
      decidirCartaoAtivo({
        anterior: null,
        emVoo: null,
        filaVisivel: grade.fila,
        grade,
        idsRenderizados: idsDoQuadro([], grade), // useFocoGrade também gateia isto quando filaDisponivel é falso
        filaDisponivel: false,
      }),
    ).toBeNull(); // nada na grade (nenhuma equipe com serviço) e o trilho está fora de alcance.
  });

  it("doca aberta (ou largura ampla): o mesmo item volta a ser o padrão do quadro", () => {
    // Mesma grade do teste acima, mas com `filaDisponivel` no valor default
    // (`true`) — prova que o gate só muda o resultado quando explicitamente
    // desligado, sem regredir o comportamento de coluna já testado acima.
    const grade = montar([agendamento({ id: 1, data: "2026-09-01" })]);
    expect(
      decidirCartaoAtivo({
        anterior: null,
        emVoo: null,
        filaVisivel: grade.fila,
        grade,
        idsRenderizados: idsDoQuadro(grade.fila, grade),
      }),
    ).toBe(1);
  });
});

describe("decidirCartaoAtivoTrilho", () => {
  // O trilho é uma região própria (spec §5): precisa do seu PRÓPRIO ativo,
  // independente do que o "quadro" (propostas + células) resolveu — ver o
  // comentário em `useFocoGrade` sobre por que um sticky global único
  // deixava uma das duas regiões sem tab stop nenhum.

  it("o padrão pula os gêmeos e cai no primeiro item que só existe no trilho", () => {
    // Item 1 cai na semana visível, então monta TAMBÉM nas Propostas — é
    // gêmeo, e `idAtivoNoTrilho` anularia o trilho se ele fosse o padrão.
    // Item 2 está fora da janela: só existe no trilho. Sem pular o gêmeo, o
    // trilho ficava com ZERO parada de Tab no caso comum (a fila vem ordenada
    // por urgência, e o topo dela quase sempre cai na semana visível).
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-09-01" }),
    ]);
    const idsPropostas = idsNasPropostas(grade);
    expect(idsPropostas.has(1)).toBe(true);

    const ativo = decidirCartaoAtivoTrilho({
      anterior: null,
      emVoo: null,
      filaVisivel: grade.fila,
      idsPropostas,
    });

    expect(ativo).toBe(2);
    // A composição é o que importa: o valor que o `TrilhoFila` recebe de fato
    // sobrevive ao desempate, em vez de virar `null` no mesmo render.
    expect(idAtivoNoTrilho(ativo, idsPropostas)).toBe(2);
  });

  it("devolve null quando toda a fila visível é gêmea das Propostas", () => {
    // Não há tab stop possível no trilho: cada cartão dele também está montado
    // nas Propostas, que ganham o desempate por não terem teto de exibição.
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-08-12" }),
    ]);
    expect(
      decidirCartaoAtivoTrilho({
        anterior: null,
        emVoo: null,
        filaVisivel: grade.fila,
        idsPropostas: idsNasPropostas(grade),
      }),
    ).toBeNull();
  });

  it("o sticky gêmeo passa pela decisão, mas o desempate o anula: o tab stop é das Propostas", () => {
    // Nome e fixture corrigidos. O antigo era "mantém o anterior (sticky) mesmo
    // sendo gêmeo — só o PADRÃO pula", afirmando `.toBe(2)` sobre o elo do
    // MEIO da cadeia: verdade para `decidirCartaoAtivoTrilho`, mas com este
    // fixture (as duas datas DENTRO da janela, logo os dois itens gêmeos) o
    // valor que `TrilhoFila` recebe é `null`. Os dois fatos convivem, e é o
    // segundo que descreve a tela: o cartão gêmeo das Propostas é quem carrega
    // a parada de Tab daquele id.
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-08-12" }),
    ]);
    const idsPropostas = idsNasPropostas(grade);
    const proprio = decidirCartaoAtivoTrilho({
      anterior: 2,
      emVoo: null,
      filaVisivel: grade.fila,
      idsPropostas,
    });
    expect(proprio).toBe(2); // a decisão só pula gêmeo no PADRÃO, e isto continua valendo
    expect(idAtivoNoTrilho(proprio, idsPropostas)).toBeNull();
    expect(ativoDoTrilho(grade, { anterior: 2, emVoo: null, selecionado: null })).toBeNull();
  });

  it("mantém o anterior (sticky) que só existe no trilho — aí sim ele chega ao componente", () => {
    // O par honesto do teste acima: mesma regra ("só o PADRÃO pula gêmeo"), mas
    // com o item 2 fora da janela visível. Sem gêmeo para disputar, o sticky
    // atravessa a cadeia inteira e é ele que o `TrilhoFila` recebe.
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
      decidirCartaoAtivoTrilho({
        anterior: null,
        emVoo: 2,
        filaVisivel: grade.fila,
        idsPropostas: idsNasPropostas(grade),
      }),
    ).toBe(1);
  });

  it("devolve null quando a fila visível está vazia", () => {
    const grade = montar([agendamento({ id: 1, data: "2026-08-11", equipeId: 1 })]);
    expect(
      decidirCartaoAtivoTrilho({
        anterior: 1,
        emVoo: null,
        filaVisivel: grade.fila, // vazia: o único item tem equipe
        idsPropostas: idsNasPropostas(grade),
      }),
    ).toBeNull();
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
  it("exclui os gêmeos das Propostas e tudo que não mora na fila visível", () => {
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }), // sem turma, na semana: gêmeo
      agendamento({ id: 2, data: "2026-09-01" }), // sem turma, fora da semana: só trilho
      agendamento({ id: 3, data: "2026-08-12", equipeId: 1 }), // com turma: célula
    ]);
    const elegiveis = idsElegiveisNoTrilho(grade.fila, idsNasPropostas(grade));
    expect([...elegiveis]).toEqual([2]);
  });
});

describe("a cadeia do trilho com a gaveta de detalhe", () => {
  // Estes quatro exercitam a composição inteira (`adotarSelecionado` →
  // `decidirCartaoAtivoTrilho` → `idAtivoNoTrilho`), que é a única forma em que
  // o `TrilhoFila` vê o resultado.

  it("um selecionado da GRADE não apaga o cartão que a pessoa focou no trilho", () => {
    // O pior sintoma do defeito. Item 2 tem turma, logo NUNCA está em
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

  it("a gaveta abrindo num gêmeo não zera a parada de Tab do trilho", () => {
    // Item 1 cai na semana visível: monta no trilho E nas Propostas. Adotá-lo
    // no trilho seria pior que não adotar — o desempate o anularia no mesmo
    // render e o trilho ficaria com ZERO paradas, em vez de manter a que tem.
    // Nada se perde: o alvo da gaveta segue alcançável pelo gêmeo das
    // Propostas, que é a região do QUADRO — a segunda expectativa mostra as
    // duas regiões decidindo o mesmo `selecionado` de formas diferentes, na
    // mesma passada de render, cada uma com o seu critério.
    const grade = montar([
      agendamento({ id: 1, data: "2026-08-11" }),
      agendamento({ id: 2, data: "2026-09-01" }),
    ]);
    expect(ativoDoTrilho(grade, { anterior: 2, emVoo: null, selecionado: 1 })).toBe(2);
    expect(decidir(grade, { anterior: null, emVoo: null, selecionado: 1 })).toBe(1);
  });
});

describe("idAtivoNoTrilho", () => {
  it("é null quando a decisão do trilho não achou ativo nenhum", () => {
    expect(idAtivoNoTrilho(null, new Set())).toBeNull();
  });

  it("mantém o id quando ele NÃO aparece nas propostas desta semana", () => {
    // data fora da janela visível (2026-08-10 a 2026-08-16): não vira proposta.
    const grade = montar([agendamento({ id: 1, data: "2026-09-01" })]);
    expect(idAtivoNoTrilho(1, idsNasPropostas(grade))).toBe(1);
  });

  it("vira null quando o id É o gêmeo mostrado nas propostas desta semana", () => {
    const grade = montar([agendamento({ id: 1, data: "2026-08-11" })]);
    expect(idAtivoNoTrilho(1, idsNasPropostas(grade))).toBeNull();
  });
});
