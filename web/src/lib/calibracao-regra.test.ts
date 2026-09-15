import { describe, expect, it } from "vitest";

import { escolherCalibracao, estadoDaCalibracao, origemParaIA, SEM_CALIBRACAO } from "./calibracao-regra";

const LINHAS = [
  { fator: "1.30", rodovia: "SP-021 Rodoanel Oeste", especie: "braquiaria", validacoes: { n_pares_usados: 195, executada_em: "2026-09-13T20:00:00Z" } },
  { fator: "1.20", rodovia: "SP-021 Rodoanel Oeste", especie: null, validacoes: null },
  { fator: "1.10", rodovia: null, especie: "braquiaria", validacoes: null },
  { fator: "0.90", rodovia: null, especie: null, validacoes: null },
];

describe("escolherCalibracao", () => {
  it("a mais específica vence e traz o n e a data da validação", () => {
    const c = escolherCalibracao(LINHAS, "SP-021 Rodoanel Oeste", "braquiaria");
    expect(c).toEqual({
      fator: 1.3,
      origem: "medida",
      nPares: 195,
      validadaEm: "2026-09-13T20:00:00Z",
      rodovia: "SP-021 Rodoanel Oeste",
      especie: "braquiaria",
    });
  });

  // A ordem completa das quatro camadas, e nao so "a mais especifica ganha
  // de alguma outra": cada teste aqui opõe duas camadas ADJACENTES uma
  // contra a outra, para que trocar a pontuação de `especificidade` (por
  // exemplo, dar o mesmo peso a rodovia e a espécie) derrube um teste
  // específico, e não só "algum".
  it("(rodovia, espécie) vence (rodovia, qualquer), mesmo com a linha mais específica mais tarde no array", () => {
    const invertida = [...LINHAS].reverse();
    expect(escolherCalibracao(invertida, "SP-021 Rodoanel Oeste", "braquiaria").fator).toBe(1.3);
  });

  it("(rodovia, qualquer) vence (qualquer, espécie) quando as duas casam com o pedido", () => {
    // Pedido por uma espécie SEM linha própria (esmeralda): só (rodovia,
    // qualquer) e (qualquer, qualquer) casam, e a da rodovia deve vencer.
    expect(escolherCalibracao(LINHAS, "SP-021 Rodoanel Oeste", "esmeralda").fator).toBe(1.2);

    // Construído para que (rodovia, qualquer) E (qualquer, espécie) casem
    // com o MESMO pedido ao mesmo tempo — sem isso, o teste anterior por si
    // só não prova que a rodovia venceria a espécie num empate direto,
    // só que venceu o "qualquer/qualquer".
    const linhas = [
      { fator: 1.2, rodovia: "SP-021 Rodoanel Oeste", especie: null },
      { fator: 1.1, rodovia: null, especie: "braquiaria" },
    ];
    expect(escolherCalibracao(linhas, "SP-021 Rodoanel Oeste", "braquiaria").fator).toBe(1.2);
  });

  it("(qualquer, espécie) vence (qualquer, qualquer)", () => {
    expect(escolherCalibracao(LINHAS, "BR-116", "braquiaria").fator).toBe(1.1);
  });

  it("na ausência de qualquer linha mais específica, cai para (qualquer, qualquer)", () => {
    expect(escolherCalibracao(LINHAS, "BR-116", "batatais").fator).toBe(0.9);
  });

  it("sem linha que case, é sem calibração — o mesmo objeto SEM_CALIBRACAO, não uma cópia parecida", () => {
    expect(escolherCalibracao([], null, "braquiaria")).toBe(SEM_CALIBRACAO);
    expect(escolherCalibracao([{ fator: 2, rodovia: "SP-280", especie: null }], "SP-021 Rodoanel Oeste", "braquiaria")).toEqual(
      SEM_CALIBRACAO,
    );
  });

  it("PostgREST devolve `validacoes` como lista quando não prova a unicidade: usa a primeira", () => {
    const c = escolherCalibracao(
      [{ fator: "1.5", rodovia: "SP-021 Rodoanel Oeste", especie: "braquiaria", validacoes: [{ n_pares_usados: 40, executada_em: "2026-09-01" }, { n_pares_usados: 999, executada_em: "2020-01-01" }] }],
      "SP-021 Rodoanel Oeste",
      "braquiaria",
    );
    expect(c.nPares).toBe(40);
    expect(c.validadaEm).toBe("2026-09-01");
  });

  it("lista de validações vazia não quebra: n e data ficam nulos, não undefined nem lançam", () => {
    const c = escolherCalibracao(
      [{ fator: "1.5", rodovia: "SP-021 Rodoanel Oeste", especie: "braquiaria", validacoes: [] }],
      "SP-021 Rodoanel Oeste",
      "braquiaria",
    );
    expect(c.nPares).toBeNull();
    expect(c.validadaEm).toBeNull();
    expect(c.origem).toBe("medida");
  });

  it("uma linha de rodovia ou espécie diferente da pedida não compete, mesmo sendo a única", () => {
    expect(escolherCalibracao([{ fator: 2, rodovia: "SP-280", especie: null }], "SP-021 Rodoanel Oeste", "braquiaria")).toEqual(
      SEM_CALIBRACAO,
    );
    expect(escolherCalibracao([{ fator: 2, rodovia: null, especie: "esmeralda" }], "SP-021 Rodoanel Oeste", "braquiaria")).toEqual(
      SEM_CALIBRACAO,
    );
  });
});

describe("estadoDaCalibracao", () => {
  const medida = (fator: number) => ({ ...SEM_CALIBRACAO, fator, origem: "medida" as const });

  it("separa medida-e-aplicada de medida-e-desligada, que é o caso do Rodoanel", () => {
    expect(estadoDaCalibracao(medida(1.15))).toBe("aplicada");
    expect(estadoDaCalibracao(medida(1))).toBe("desligada");
    expect(estadoDaCalibracao(SEM_CALIBRACAO)).toBe("ausente");
  });

  it("fator 1,0 com ruído de ponto flutuante continua desligada", () => {
    expect(estadoDaCalibracao(medida(1 + 1e-12))).toBe("desligada");
  });
});

describe("origemParaIA", () => {
  // A frase vai DENTRO do prompt e sai na justificativa que o cliente lê. O que
  // se prende aqui é a distinção que ela não pode perder: fator 1,0 não é
  // ausência de medição, e não pode soar como endosso do fator rejeitado.
  it("diz que a calibração foi desligada, e não que não houve medição", () => {
    const frase = origemParaIA({ ...SEM_CALIBRACAO, fator: 1, origem: "medida" });
    expect(frase).toContain("DESLIGADA");
    expect(frase).toContain("REJEITADO");
    expect(frase).not.toContain("sem calibração medida");
  });

  it("sem calibração nenhuma, avisa que é simulação pura", () => {
    expect(origemParaIA(SEM_CALIBRACAO)).toContain("modelo sintético puro");
  });

  it("com fator diferente de 1, diz que foi medida e aplicada", () => {
    expect(origemParaIA({ ...SEM_CALIBRACAO, fator: 1.15, origem: "medida" })).toContain("aplicada");
  });
});
