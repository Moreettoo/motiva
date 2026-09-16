import { describe, expect, it } from "vitest";

import { CAMPOS_ENTRADA, preverBruto } from "./arvores";
import { ROTULOS_FEATURES, rotuloDaFeature } from "./campos";
import {
  CENARIO_REFERENCIA,
  TOLERANCIA_PARIDADE,
  efeitoDaEspecie,
  efeitoDasFeatures,
  fichaDoTreino,
  medirParidade,
  vetorDeReferencia,
} from "./ficha";

/**
 * A ficha e o que a pagina `/evidencia` AFIRMA sobre o modelo. Estes testes
 * existem para ela nunca afirmar algo que deixou de ser verdade sem ninguem
 * notar -- o mesmo modo de falha que `arvores.test.ts` persegue no percurso,
 * so que na camada que vira texto na tela.
 */

describe("paridade medida na propria pagina", () => {
  it("reproduz o scikit-learn dentro da tolerancia do teste de percurso", () => {
    const p = medirParidade();
    expect(p.piorDesvio).toBeLessThan(TOLERANCIA_PARIDADE);
    expect(p.tolerancia).toBe(TOLERANCIA_PARIDADE);
  });

  it("confere as 600 amostras nos tres quantis, e nao um punhado", () => {
    // Se `exportar_modelo.py` encolher o lote de referencia, a pagina passaria
    // a anunciar uma prova mais fraca com a mesma cara de certeza.
    const p = medirParidade();
    expect(p.amostras).toBeGreaterThan(500);
    expect(p.previsoes).toBe(p.amostras * 3);
  });

  it("memoiza: a segunda chamada devolve o mesmo objeto", () => {
    // A conta custa ~80 ms e nao pode mudar dentro de um processo. Sem o memo,
    // `force-dynamic` pagaria isso em toda carga de pagina.
    expect(medirParidade()).toBe(medirParidade());
  });
});

describe("cenario de referencia da sensibilidade", () => {
  it("continua sendo braquiaria, 12 cm, rocada ha 40 dias, periodo de 45", () => {
    // Prende o SIGNIFICADO do cenario, que a tela escreve por extenso. Se
    // `gerar_fixture_features.py` trocar o primeiro caso, isto fica vermelho
    // em vez de a pagina descrever um cenario que ela nao esta mais usando.
    expect(CENARIO_REFERENCIA).toEqual({
      especie: "braquiaria",
      alturaInicialCm: 12,
      diasDesdeRocada: 40,
      diasPeriodo: 45,
    });
  });

  it("monta um vetor completo, na ordem que o modelo espera", () => {
    const v = vetorDeReferencia();
    expect(v).toHaveLength(CAMPOS_ENTRADA.length);
    expect(v.every((n) => Number.isFinite(n))).toBe(true);
  });

  it("parte de um ponto que cresce, nao de um ponto saturado", () => {
    // O motivo de o cenario nao ser a mediana das faixas de treino: la o
    // modelo responde crescimento NEGATIVO, e sensibilidade em volta de um
    // ponto saturado mede a saturacao, nao o modelo.
    const { q10, q50, q90 } = preverBruto(vetorDeReferencia());
    expect(q50).toBeGreaterThan(0);
    expect(q10).toBeLessThanOrEqual(q50);
    expect(q50).toBeLessThanOrEqual(q90);
  });
});

describe("efeito das features", () => {
  it("cobre toda coluna numerica e deixa a especie de fora", () => {
    const linhas = efeitoDasFeatures();
    const campos = linhas.map((l) => l.campo);
    expect(campos).not.toContain("especie");
    expect(linhas).toHaveLength(CAMPOS_ENTRADA.length - 1);
  });

  it("vem ordenado do maior para o menor efeito absoluto", () => {
    const efeitos = efeitoDasFeatures().map((l) => Math.abs(l.efeitoCm));
    expect(efeitos).toEqual([...efeitos].sort((a, b) => b - a));
  });

  it("mede o efeito entre as pontas da faixa de TREINO, nunca fora dela", () => {
    // Extrapolar para fora do treino nao devolve erro: devolve o ultimo bin com
    // a mesma cara de certeza. Uma sensibilidade medida ali seria inventada.
    for (const l of efeitoDasFeatures()) {
      expect(l.min).toBeLessThan(l.max);
      expect(l.efeitoCm).toBeCloseTo(l.q50NoMaximo - l.q50NoMinimo, 12);
    }
  });

  it("encontra efeito real em pelo menos metade das features", () => {
    // Uma feature parada em todo o cenario nao e erro; vinte paradas seriam
    // sinal de que o vetor de referencia caiu num canto morto do modelo.
    const comEfeito = efeitoDasFeatures().filter((l) => Math.abs(l.efeitoCm) > 0.5);
    expect(comEfeito.length).toBeGreaterThan(9);
  });
});

describe("efeito da especie", () => {
  it("devolve as tres especies do modelo, da que mais cresce para a que menos", () => {
    const linhas = efeitoDaEspecie();
    expect(linhas.map((l) => l.especie).sort()).toEqual(["batatais", "braquiaria", "esmeralda"]);
    const q50s = linhas.map((l) => l.q50);
    expect(q50s).toEqual([...q50s].sort((a, b) => b - a));
  });

  it("mantem a especie como a entrada que mais move a resposta", () => {
    // A frase que a tela escreve. Se um retreino mudar isso, a frase precisa
    // mudar junto -- e este teste e quem avisa.
    const especies = efeitoDaEspecie();
    const amplitudeEspecie = especies[0].q50 - especies[especies.length - 1].q50;
    const maiorFeature = Math.abs(efeitoDasFeatures()[0].efeitoCm);
    expect(amplitudeEspecie).toBeGreaterThan(maiorFeature);
  });
});

describe("ficha do treino", () => {
  it("reporta o tamanho real do modelo, contado no JSON", () => {
    const f = fichaDoTreino();
    expect(f.arvores).toBe(1200);
    expect(f.nos).toBeGreaterThan(100_000);
    expect(f.features).toBe(20);
    expect(f.quantis).toEqual([0.1, 0.5, 0.9]);
  });

  it("carrega as metricas de holdout que a tela compara lado a lado", () => {
    const { metricas } = fichaDoTreino();
    expect(metricas.r2_locais_novos).toBeGreaterThan(0);
    expect(metricas.r2_locais_novos).toBeLessThanOrEqual(metricas.r2_aleatorio);
    expect(metricas.mae_locais_novos).toBeGreaterThanOrEqual(metricas.mae_aleatorio);
  });
});

describe("rotulos das features", () => {
  it("traduz TODA entrada do modelo, sem sobrar nome cru", () => {
    // Um retreino que acrescente uma feature deixaria `agua_solo_media_pct`
    // aparecer cru num eixo -- que o leitor le como defeito de dado, nao como
    // falta de traducao. Este teste e quem transforma isso em vermelho.
    for (const campo of CAMPOS_ENTRADA) {
      expect(ROTULOS_FEATURES[campo], `feature "${campo}" sem rótulo`).toBeTruthy();
      expect(rotuloDaFeature(campo)).not.toBe(campo);
    }
  });

  it("nao carrega rotulo orfao de feature que o modelo nao usa mais", () => {
    for (const campo of Object.keys(ROTULOS_FEATURES)) {
      expect(CAMPOS_ENTRADA, `rótulo órfão: "${campo}"`).toContain(campo);
    }
  });
});
