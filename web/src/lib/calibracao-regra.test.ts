import { describe, expect, it } from "vitest";

import { escolherCalibracao, SEM_CALIBRACAO } from "./calibracao-regra";

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
