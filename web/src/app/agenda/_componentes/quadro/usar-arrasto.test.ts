import { describe, expect, it, vi } from "vitest";

import {
  areaUtil,
  criarDiferidor,
  decidirRevalidacao,
  decidirSolta,
  insetsDeObstaculos,
  velocidadeDeRolagem,
  type Caixa,
  type Insets,
  type Relogio,
} from "./usar-arrasto";

/** A pista do quadro num lugar plausível da tela: 1000×700, e não na origem —
 *  uma caixa em (0,0) esconderia erro de sinal, porque somar zero é inofensivo. */
const PISTA: Caixa = { top: 200, left: 100, right: 1100, bottom: 900 };

/** Cabeçalho do dia: `sticky top-0`, ~52px, colado no topo da pista. */
const CABECALHO: Caixa = { top: 200, left: 244, right: 372, bottom: 252 };

/** Calha da equipe: `sticky left-0`, 144px (`--calha: 9rem`), colada à esquerda. */
const CALHA: Caixa = { top: 252, left: 100, right: 244, bottom: 324 };

const ZERO: Insets = { topo: 0, baixo: 0, esquerda: 0, direita: 0 };

describe("decidirSolta", () => {
  it("recusa vence, mesmo que o alvo seja igual à origem", () => {
    expect(decidirSolta("2026-08-12|1", "fila", "Esse dia já passou.")).toEqual({
      tipo: "recusa",
      motivo: "Esse dia já passou.",
    });
  });

  it("sem recusa, alvo igual à origem é um no-op — não solta de verdade", () => {
    expect(decidirSolta("2026-08-12|1", "2026-08-12|1", null)).toEqual({ tipo: "sem-mudanca" });
  });

  it("sem recusa e alvo diferente da origem, solta de verdade", () => {
    expect(decidirSolta("2026-08-13|1", "2026-08-12|1", null)).toEqual({ tipo: "soltar" });
    expect(decidirSolta("2026-08-12|1", "fila", null)).toEqual({ tipo: "soltar" });
  });
});

describe("decidirRevalidacao", () => {
  it("nada a fazer quando a recusa não mudou e não há chegada pendente", () => {
    expect(decidirRevalidacao(null, null, false)).toEqual({ tipo: "nada" });
    expect(decidirRevalidacao("Esse dia já passou.", "Esse dia já passou.", false)).toEqual({
      tipo: "nada",
    });
  });

  it("só anuncia (sem corrigir estado) quando a recusa não mudou mas há chegada pendente", () => {
    // Cruzar semana para uma célula VÁLIDA: a suposição otimista (recusa
    // null) se confirma, mas o cruzamento precisa ser anunciado mesmo assim
    // — sem isto, atravessar semana para um destino válido ficava mudo.
    expect(decidirRevalidacao(null, null, true)).toEqual({ tipo: "anunciar" });
  });

  it("corrige e anuncia quando a recusa mudou, com ou sem chegada pendente", () => {
    expect(decidirRevalidacao(null, "Esse dia já passou.", true)).toEqual({
      tipo: "corrigir-e-anunciar",
    });
    // Recusa mudou por um motivo QUALQUER (não só cruzamento de semana) —
    // corrige de qualquer forma.
    expect(decidirRevalidacao(null, "Essa equipe está desativada e não recebe serviço novo.", false)).toEqual(
      { tipo: "corrigir-e-anunciar" },
    );
  });

  it("é sem estado: chamadas repetidas com o MESMO par (recusaAoVivo, recusaFresca) sempre devolvem a mesma decisão", () => {
    // NÃO reproduz o bug do cache antigo — aquele cache vivia no EFEITO
    // (`usar-arrasto.ts`, num `useRef`), nunca aqui. `decidirRevalidacao` é
    // pura e nunca teve estado escondido para vazar entre chamadas; três
    // travessias com o mesmo par de entrada dão a mesma resposta por
    // CONSTRUÇÃO — isto é matemática de função pura, não uma sequência de
    // interação reproduzida. O valor deste teste é fixar essa propriedade
    // (se alguém reintroduzir um cache aqui dentro amanhã, ele quebra), não
    // provar que o bug do cache está corrigido — essa correção (remover
    // `ultimoRevalidado` do efeito) foi verificada por LEITURA DE CÓDIGO,
    // não por cobertura de teste.
    const primeira = decidirRevalidacao(null, "Esse dia já passou.", true);
    const segunda = decidirRevalidacao(null, null, true);
    const terceira = decidirRevalidacao(null, "Esse dia já passou.", true);

    expect(primeira).toEqual({ tipo: "corrigir-e-anunciar" });
    expect(segunda).toEqual({ tipo: "anunciar" });
    expect(terceira).toEqual(primeira);
  });
});

describe("insetsDeObstaculos", () => {
  it("sem nenhum elemento marcado, todos os insets são zero", () => {
    // Este é o contrato que mantém a árvore de pé enquanto os componentes ainda
    // não carregam `data-obstaculo`: sem obstáculo, a área útil é a caixa crua
    // e a auto-rolagem é a de antes deste conserto.
    expect(insetsDeObstaculos(PISTA, [])).toEqual(ZERO);
  });

  it("valor vazio ou desconhecido não come borda nenhuma", () => {
    expect(
      insetsDeObstaculos(PISTA, [
        { bordas: "", caixa: CABECALHO },
        { bordas: null, caixa: CABECALHO },
        { bordas: undefined, caixa: CABECALHO },
        { bordas: "top", caixa: CABECALHO },
        { bordas: "cima", caixa: CABECALHO },
      ]),
    ).toEqual(ZERO);
  });

  it("o cabeçalho grudado come a altura dele no topo, e só no topo", () => {
    expect(insetsDeObstaculos(PISTA, [{ bordas: "topo", caixa: CABECALHO }])).toEqual({
      ...ZERO,
      topo: 52,
    });
  });

  it("a calha grudada come a largura dela à esquerda", () => {
    expect(insetsDeObstaculos(PISTA, [{ bordas: "esquerda", caixa: CALHA }])).toEqual({
      ...ZERO,
      esquerda: 144,
    });
  });

  it("os dois eixos ao mesmo tempo, cada um na sua borda", () => {
    expect(
      insetsDeObstaculos(PISTA, [
        { bordas: "topo", caixa: CABECALHO },
        { bordas: "esquerda", caixa: CALHA },
      ]),
    ).toEqual({ ...ZERO, topo: 52, esquerda: 144 });
  });

  it("vários obstáculos na MESMA borda ficam com o maior", () => {
    // O caso real: uma calha por linha (11 delas) e um cabeçalho por coluna (7).
    // Todos declaram a mesma borda, e a densidade por container query pode
    // deixar um mais alto que o outro — reservar o menor deixaria o mais alto
    // dentro da zona morta, que é o defeito que estamos consertando.
    expect(
      insetsDeObstaculos(PISTA, [
        { bordas: "topo", caixa: CABECALHO },
        { bordas: "topo", caixa: { ...CABECALHO, bottom: 264 } },
        { bordas: "topo", caixa: { ...CABECALHO, bottom: 248 } },
      ]),
    ).toEqual({ ...ZERO, topo: 64 });
  });

  it("um elemento pode declarar duas bordas, separadas por espaço", () => {
    // O canto do quadro gruda nos dois eixos (`sticky top-0 left-0`).
    const canto: Caixa = { top: 200, left: 100, right: 244, bottom: 252 };
    expect(insetsDeObstaculos(PISTA, [{ bordas: "topo  esquerda", caixa: canto }])).toEqual({
      ...ZERO,
      topo: 52,
      esquerda: 144,
    });
  });

  it("borda e padding do rolador não inflam o inset além do obstáculo", () => {
    // `getBoundingClientRect` do rolador dá a caixa de BORDA; o grudado cola no
    // scrollport, uns pixels adentro. A distância até o fim dele passaria da
    // altura dele por essa folga — o limite pela extensão corta isso.
    const deslocado: Caixa = { ...CABECALHO, top: 208, bottom: 260 };
    expect(insetsDeObstaculos(PISTA, [{ bordas: "topo", caixa: deslocado }])).toEqual({
      ...ZERO,
      topo: 52,
    });
  });

  it("obstáculo que não gruda e rolou para fora não come nada", () => {
    const foraPorCima: Caixa = { ...CABECALHO, top: 100, bottom: 152 };
    expect(insetsDeObstaculos(PISTA, [{ bordas: "topo", caixa: foraPorCima }])).toEqual(ZERO);
  });

  it("obstáculo que não gruda e flutua no meio reserva a própria altura, não a pista", () => {
    // Marcação errada (elemento sem `sticky`) com a rolagem em zero: a distância
    // sozinha diria "a área útil começa 400px abaixo" e transformaria quase a
    // pista inteira em zona morta. Limitado à altura dele, o erro é de 52px.
    const meio: Caixa = { ...CABECALHO, top: 548, bottom: 600 };
    expect(insetsDeObstaculos(PISTA, [{ bordas: "topo", caixa: meio }])).toEqual({
      ...ZERO,
      topo: 52,
    });
  });

  it("caixa zerada (`display: none`) não come nada, nem com o rolador acima da viewport", () => {
    // A navegação móvel no desktop dá rect todo zerado. Com a página rolada, a
    // caixa do rolador tem `top` NEGATIVO, e só a distância (0 − (−300)) daria
    // 300px de zona morta inventada.
    const pistaRolada: Caixa = { ...PISTA, top: -300, bottom: 400 };
    const oculto: Caixa = { top: 0, left: 0, right: 0, bottom: 0 };
    expect(insetsDeObstaculos(pistaRolada, [{ bordas: "topo baixo", caixa: oculto }])).toEqual(ZERO);
  });

  it("as bordas do fim medem para o outro lado", () => {
    const rodape: Caixa = { top: 836, left: 100, right: 1100, bottom: 900 };
    const lateral: Caixa = { top: 200, left: 1020, right: 1100, bottom: 900 };
    expect(
      insetsDeObstaculos(PISTA, [
        { bordas: "baixo", caixa: rodape },
        { bordas: "direita", caixa: lateral },
      ]),
    ).toEqual({ ...ZERO, baixo: 64, direita: 80 });
  });
});

describe("areaUtil", () => {
  it("sem inset, devolve a caixa crua", () => {
    expect(areaUtil(PISTA, ZERO)).toEqual(PISTA);
  });

  it("encolhe cada borda pelo seu inset", () => {
    expect(areaUtil(PISTA, { topo: 52, esquerda: 144, baixo: 8, direita: 16 })).toEqual({
      top: 252,
      left: 244,
      right: 1084,
      bottom: 892,
    });
  });

  it("eixo colapsado volta à caixa crua — e só aquele eixo", () => {
    // Inset maior que o próprio rolador (medida absurda, ou rolador menor que o
    // cabeçalho): a área invertida deixaria as duas distâncias negativas e
    // travaria a rolagem na velocidade máxima numa direção só.
    expect(areaUtil(PISTA, { ...ZERO, topo: 800, esquerda: 144 })).toEqual({
      top: 200,
      bottom: 900,
      left: 244,
      right: 1100,
    });
  });
});

describe("velocidadeDeRolagem", () => {
  it("não rola no meio da área útil", () => {
    expect(velocidadeDeRolagem(300, 300)).toBe(0);
  });

  it("o limiar é exclusivo: exatamente na faixa ainda não rola", () => {
    expect(velocidadeDeRolagem(24, 500)).toBe(0);
    expect(velocidadeDeRolagem(500, 24)).toBe(0);
  });

  it("negativo perto do início, positivo perto do fim", () => {
    expect(velocidadeDeRolagem(12, 500)).toBe(-9);
    expect(velocidadeDeRolagem(500, 12)).toBe(9);
  });

  it("chega na velocidade máxima na borda", () => {
    expect(velocidadeDeRolagem(0, 500)).toBe(-18);
    expect(velocidadeDeRolagem(500, 0)).toBe(18);
  });

  it("distância negativa não passa da velocidade máxima", () => {
    // O ponteiro ATRÁS do cabeçalho grudado: distância negativa é legítima
    // (aponta para uma célula escondida), mas sem teto a razão passaria de 1 e
    // 500px atrás dariam ~160px por quadro — a pista fugindo do ponteiro.
    expect(velocidadeDeRolagem(-52, 500)).toBe(-18);
    expect(velocidadeDeRolagem(-500, 500)).toBe(-18);
    expect(velocidadeDeRolagem(500, -500)).toBe(18);
  });

  it("a faixa interna acaba antes da metade da menor célula, nos dois eixos", () => {
    // Este é O critério da faixa interna, e a razão de ela não ser a mesma da
    // metade de fora: o centro da célula é onde se mira para soltar, e ele
    // precisa ficar parado. `--altura-linha` é 4.5rem (72px) e é um PISO
    // (`minmax`), então o centro de uma linha colada na borda da área útil está
    // a 36px dela; `--dia-min` é 6.5rem (104px) e dá 52px na horizontal.
    expect(velocidadeDeRolagem(36, 500)).toBe(0);
    expect(velocidadeDeRolagem(52, 500)).toBe(0);
    // Onde a faixa termina de verdade: 24 exclusivo, 12px de folga sobre os 36
    // — o bastante para absorver um refluxo que encurte o cabeçalho no meio do
    // gesto, já que o inset é medido uma vez por gesto (ver `medirInsets`).
    expect(velocidadeDeRolagem(23, 500)).toBe(-1);
  });

  it("os números medidos a 1920px: o centro da primeira linha visível fica parado e o cabeçalho rola a toda velocidade", () => {
    // Medido no DOM real com a `.quadro-pista` rolada: caixa crua em top=555 e
    // o cabeçalho do dia grudado com 49px de altura, então a área útil começa em
    // 604 e a primeira linha de equipe visível ocupa [604, 676] (`--altura-linha`,
    // 72px). A pista tem `max-h-[min(78vh,760px)]` e nenhum obstáculo embaixo,
    // então a área útil termina na caixa crua, em 1315.
    // `velocidadeDeRolagem` não conhece coordenada absoluta — recebe as duas
    // distâncias —, e é `laco()` que faz esta tradução a cada quadro.
    const utilTop = 604;
    const utilBottom = 1315;
    const dy = (y: number) => velocidadeDeRolagem(y - utilTop, utilBottom - y);

    // O centro da linha, que é onde o ponteiro mira: parado. Com a faixa única
    // de 56px isto devolvia −6, ou seja ~360px por segundo de pista fugindo do
    // ponteiro em cima do alvo que ele estava tentando acertar.
    expect(dy(640)).toBe(0);
    // A borda de cima da MESMA linha continua rolando — 24 dos 72px, o terço de
    // cima —, e a rampa acaba antes da metade.
    expect(dy(604)).toBe(-18);
    expect(dy(616)).toBe(-9);
    expect(dy(628)).toBe(0);
    // Um ponto sobre o cabeçalho grudado (49px acima da área útil): distância
    // negativa, velocidade máxima. É a metade de fora, e ela não mudou.
    expect(dy(580)).toBe(-18);
    // A borda de BAIXO não tem obstáculo nenhum e sofria o mesmo defeito: a
    // última linha inteira ocupa [1243, 1315] e o centro dela (1279) também
    // rolava (+6). Ninguém notou porque no fim da lista o `scrollBy` é no-op.
    expect(dy(1279)).toBe(0);
    expect(dy(1315)).toBe(18);
  });

  it("a borda de início vence quando as duas distâncias são curtas", () => {
    // Rolador mais estreito que duas faixas internas — com 24px isso exige menos
    // de 48px de área útil no eixo, mais degenerado que antes, mas alguma direção
    // tem que ganhar e a documentada é a do início.
    expect(velocidadeDeRolagem(8, 8)).toBe(-12);
  });
});

/** Relógio de mentira: nada de temporizador de verdade, e o teste decide quando
 *  o tempo passa. Cumpre a injeção que `criarDiferidor` pede. */
function relogioFalso() {
  const tarefas = new Map<number, { efeito: () => void; em: number }>();
  let proximoId = 1;
  let agora = 0;

  const relogio: Relogio = {
    agendar(efeito, ms) {
      const id = proximoId++;
      tarefas.set(id, { efeito, em: agora + ms });
      return id;
    },
    cancelar(id) {
      tarefas.delete(id);
    },
  };

  return {
    relogio,
    /** Avança o relógio e dispara o que venceu. Um efeito que agenda de novo cai
     *  no próximo `avancar`, não neste — a foto é tirada antes de rodar. */
    avancar(ms: number) {
      agora += ms;
      for (const [id, tarefa] of [...tarefas].sort((a, b) => a[1].em - b[1].em)) {
        if (tarefa.em > agora) continue;
        tarefas.delete(id);
        tarefa.efeito();
      }
    },
    pendentes: () => tarefas.size,
  };
}

describe("criarDiferidor", () => {
  it("não emite antes do prazo", () => {
    const t = relogioFalso();
    const falar = vi.fn();
    const d = criarDiferidor(t.relogio, 150);

    d.diferir(() => falar("um passo"));
    t.avancar(149);

    expect(falar).not.toHaveBeenCalled();
  });

  it("é borda de SAÍDA: uma rajada de setas emite só o último, uma vez", () => {
    const t = relogioFalso();
    const falar = vi.fn();
    const d = criarDiferidor(t.relogio, 150);

    // Tecla presa: ~30 passos por segundo, um a cada 33 ms.
    for (const dia of ["segunda", "terça", "quarta", "quinta"]) {
      d.diferir(() => falar(dia));
      t.avancar(33);
    }
    t.avancar(150);

    expect(falar).toHaveBeenCalledTimes(1);
    expect(falar).toHaveBeenCalledWith("quinta");
  });

  it("`agora` fala sem esperar e não deixa nada pendente", () => {
    const t = relogioFalso();
    const falar = vi.fn();
    const d = criarDiferidor(t.relogio, 150);

    d.diferir(() => falar("passo"));
    d.agora(() => falar("recusa"));

    // Sem avançar o relógio: um "pego" ou uma recusa que só chegasse 150 ms
    // depois de Enter seria latência sentida em resposta a uma ação única.
    expect(falar).toHaveBeenCalledTimes(1);
    expect(falar).toHaveBeenCalledWith("recusa");
    expect(t.pendentes()).toBe(0);
  });

  it("um passo pendente nunca fala DEPOIS de um anúncio terminal", () => {
    const t = relogioFalso();
    const ditas: string[] = [];
    const d = criarDiferidor(t.relogio, 150);

    d.diferir(() => ditas.push("Quinta, 13 de agosto. Equipe MG-Sul 01."));
    d.agora(() => ditas.push("Movimento cancelado. O serviço continua onde estava."));
    t.avancar(500);

    // A ordem é o ponto: sem o descarte, o passo falaria 150 ms depois do
    // cancelamento e descreveria a célula para onde o cartão já não vai.
    expect(ditas).toEqual(["Movimento cancelado. O serviço continua onde estava."]);
  });

  it("`cancelar` descarta o pendente — é o que o desmonte chama", () => {
    const t = relogioFalso();
    const falar = vi.fn();
    const d = criarDiferidor(t.relogio, 150);

    d.diferir(() => falar("um passo"));
    d.cancelar();
    t.avancar(500);

    expect(falar).not.toHaveBeenCalled();
    expect(t.pendentes()).toBe(0);
  });

  it("depois de emitir, a vaga volta a aceitar", () => {
    const t = relogioFalso();
    const falar = vi.fn();
    const d = criarDiferidor(t.relogio, 150);

    d.diferir(() => falar("primeiro"));
    t.avancar(150);
    d.diferir(() => falar("segundo"));
    t.avancar(150);

    expect(falar.mock.calls).toEqual([["primeiro"], ["segundo"]]);
  });

  it("cancelar depois de já ter emitido não derruba um agendamento novo", () => {
    const t = relogioFalso();
    const falar = vi.fn();
    const d = criarDiferidor(t.relogio, 150);

    d.diferir(() => falar("primeiro"));
    t.avancar(150);
    d.diferir(() => falar("segundo"));
    // `cancelar` interno de um `diferir` novo não pode mirar o id já disparado:
    // se `pendente` continuasse apontando para ele, o relógio mataria a vaga
    // recém-criada e o segundo anúncio nunca sairia.
    t.avancar(150);

    expect(falar).toHaveBeenCalledWith("segundo");
  });
});
