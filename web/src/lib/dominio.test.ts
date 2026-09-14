import { describe, expect, it } from "vitest";

import {
  erroFaltaEquipe,
  infoRocada,
  METODO_ROCADA,
  ordemRisco,
  ORDEM_RISCO,
  piorRiscoDe,
  prioridadeExibida,
  REGIME,
  RISCO,
  rotuloPrazo,
  textoDivergencia,
} from "./dominio";
import { REGIMES, REGIME_PADRAO } from "./types";

describe("erroFaltaEquipe", () => {
  it("bloqueia aprovar um agendamento sem equipe atribuída", () => {
    expect(erroFaltaEquipe(null, "aprovado")).toBe("Atribua uma equipe antes de aprovar.");
  });

  it("bloqueia concluir um agendamento sem equipe atribuída", () => {
    expect(erroFaltaEquipe(null, "executado")).toBe("Atribua uma equipe antes de marcar como executada.");
  });

  it("libera aprovar quando já há uma equipe atribuída", () => {
    expect(erroFaltaEquipe(7, "aprovado")).toBeNull();
  });

  it("libera concluir quando já há uma equipe atribuída", () => {
    expect(erroFaltaEquipe(7, "executado")).toBeNull();
  });
});

describe("REGIME", () => {
  it("tem vocabulário para todo regime que existe", () => {
    // Um regime novo em `types.ts` sem entrada aqui derrubaria a tela do
    // simulador em `REGIME[pedido.regime].rotulo`, e não no build.
    for (const r of REGIMES) expect(REGIME[r]?.rotulo).toBeTruthy();
  });

  it("fixa as profundidades de raiz que o `solo.py` também usa", () => {
    // Estes dois números são a única diferença física entre os regimes no
    // pipeline de solo, e existem em dois idiomas: aqui e em `RAIZ_MM`, no
    // `solo.py`. Mudar um sem o outro faz o mesmo ponto ter dois solos — o lote
    // diário calcularia um balde e o simulador outro.
    expect(REGIME.faixa.raizMm).toBe(500);
    expect(REGIME.pasto.raizMm).toBe(800);
  });

  it("marca como experimental exatamente o que o modelo não viu no treino", () => {
    // O padrão nunca pode ser experimental: um link sem `regime` cai nele.
    expect(REGIME[REGIME_PADRAO].experimental).toBe(false);
    expect(REGIME.pasto.experimental).toBe(true);
  });
});

describe("rotuloPrazo", () => {
  it("não escreve precisão que a extrapolação não tem", () => {
    // Acima de 120 dias `dias_ate_limite` é extensão linear, não varredura do
    // modelo. "621 dias" prometeria precisão de dia sobre uma reta — é o mesmo
    // defeito dos "2.196 dias" que a agenda já mostrou uma vez.
    expect(rotuloPrazo(366)).toBe("mais de 1 ano");
    expect(rotuloPrazo(621)).toBe("mais de 1 ano");
    expect(rotuloPrazo(365)).toBe("365 dias");
  });

  it("distingue os três casos que não são um número de dias", () => {
    expect(rotuloPrazo(null)).toBe("sem crescimento");
    expect(rotuloPrazo(0)).toBe("acima do limite");
    expect(rotuloPrazo(1)).toBe("1 dia");
  });
});

describe("prioridadeExibida", () => {
  it("pinta o prazo, e não a palavra da LLM", () => {
    // O caso registrado no CLAUDE.md: a LLM devolveu `critica` para um trecho
    // que cruzava o limite em 61 dias.
    const leitura = prioridadeExibida(61, "critica");
    expect(leitura.risco).toBe("baixa");
    expect(leitura.divergente).toBe("critica");
    expect(textoDivergencia(leitura)).toBe("A IA classificou como Crítica. Vale o prazo: Baixa.");
  });

  it("não inventa divergência quando as duas concordam", () => {
    const leitura = prioridadeExibida(3, "critica");
    expect(leitura.risco).toBe("critica");
    expect(leitura.divergente).toBeNull();
    expect(textoDivergencia(leitura)).toBeNull();
  });

  it("promove o trecho que já passou do limite, mesmo marcado baixa", () => {
    // CH-2026-0009 nesta base: chip verde sobre `dias_ate_limite = 0`.
    expect(prioridadeExibida(0, "baixa").risco).toBe("critica");
  });

  it("sem prazo, mantém a palavra registrada e avisa que nada a sustenta", () => {
    // `riscoPorPrazo(null)` responderia `baixa`, que é a armadilha de tratar
    // "não se sabe nada" como "folgado". Ver `dispensaAgendamento`.
    const leitura = prioridadeExibida(null, "critica");
    expect(leitura.risco).toBe("critica");
    expect(leitura.semPrazo).toBe(true);
    expect(leitura.divergente).toBeNull();
  });

  it("em roçada manual não atribui a divergência a LLM nenhuma", () => {
    // A coluna nasceu cópia do `risco` da view e só envelheceu.
    const leitura = prioridadeExibida(522, "alta", "manual");
    expect(leitura.risco).toBe("baixa");
    expect(leitura.divergente).toBeNull();
  });
});

describe("RISCO.sem_dados", () => {
  it("não pinta de seguro: nem a cor nem o ícone do 'baixa' seguro", () => {
    // A migração `risco_sem_dados` existe exatamente para separar "não sei
    // nada" de "está tudo bem". Um token que reusasse a cor ou o ícone de
    // `baixa` desfaria a separação na tela, mesmo com o valor correto no banco.
    expect(RISCO.sem_dados.cor).not.toBe(RISCO.baixa.cor);
    expect(RISCO.sem_dados.icone).not.toBe(RISCO.baixa.icone);
    expect(RISCO.sem_dados.cor).not.toBe(RISCO.critica.cor);
  });
});

describe("ORDEM_RISCO / ordemRisco", () => {
  it("sem_dados fica depois de baixa: não é mais urgente nem mais seguro, é desconhecido", () => {
    expect(ORDEM_RISCO.at(-1)).toBe("sem_dados");
    expect(ordemRisco("sem_dados")).toBeGreaterThan(ordemRisco("baixa"));
  });
});

describe("piorRiscoDe", () => {
  it("lista vazia devolve baixa: sem trecho não há o que alarmar", () => {
    expect(piorRiscoDe([])).toBe("baixa");
  });

  it("um grupo inteiro de sem_dados continua sem_dados, não vira baixa pelo valor inicial do acumulador", () => {
    // A armadilha que este teste tranca: semear o acumulador com `baixa`
    // fixo (em vez do primeiro item do grupo) faz um agrupamento em que
    // NENHUM trecho é `baixa` "vencer" contra o próprio seed e devolver
    // `baixa` mesmo assim -- reabrindo, um nível acima, o mesmo problema que
    // a migração corrigiu na coluna individual.
    const grupo = [{ risco: "sem_dados" as const }, { risco: "sem_dados" as const }];
    expect(piorRiscoDe(grupo)).toBe("sem_dados");
  });

  it("o mais urgente do grupo vence, em qualquer posição", () => {
    expect(piorRiscoDe([{ risco: "sem_dados" as const }, { risco: "critica" as const }, { risco: "baixa" as const }])).toBe(
      "critica",
    );
    expect(piorRiscoDe([{ risco: "media" as const }, { risco: "alta" as const }])).toBe("alta");
  });
});

describe("infoRocada", () => {
  /* Os 6 marcos do Rodoanel sem polígono no KML de roçada da Motiva (km
     2.500, 3.000, 7.500, 8.000, 29.000 e 29.300) chegam com metodo_rocada E
     area_rocada_m2 nulos -- o cartão do trecho (Tarefa 18) precisa mostrar
     isso como um fato registrado sobre os dados, não como uma frase que some
     da tela sem explicação. */
  it("marca como não registrado quando o trecho não tem método (sem polígono no KML)", () => {
    expect(infoRocada(null, null)).toEqual({ registrado: false });
  });

  it("não finge área zero quando a área não foi registrada", () => {
    // `registrado: false` não carrega `areaM2` nenhum -- inventar `0` aqui
    // afirmaria "área roçável é zero", quando ela é desconhecida.
    const r = infoRocada(null, null);
    expect(r).not.toHaveProperty("areaM2");
  });

  it("resolve rótulo, ícone e área para cada método real do domínio", () => {
    // Itera `METODO_ROCADA` em vez de listar os quatro nomes à mão: uma
    // entrada nova no vocabulário cai sob este teste sozinha.
    for (const [chave, token] of Object.entries(METODO_ROCADA)) {
      expect(infoRocada(chave, 1234.5)).toEqual({
        registrado: true,
        rotulo: token.rotulo,
        icone: token.icone,
        areaM2: 1235,
      });
    }
  });

  it("aceita area_rocada_m2 como string (numeric do Postgres) e arredonda", () => {
    expect(infoRocada("Apenas manual", "999.6")).toEqual({
      registrado: true,
      rotulo: "Apenas manual",
      icone: "Hand",
      areaM2: 1000,
    });
  });

  it("um método fora do vocabulário ainda resolve: rótulo cru, ícone cai para CircleHelp (já registrado em legenda.ICONES)", () => {
    expect(infoRocada("Método novo não catalogado", 10)).toEqual({
      registrado: true,
      rotulo: "Método novo não catalogado",
      icone: "CircleHelp",
      areaM2: 10,
    });
  });
});
