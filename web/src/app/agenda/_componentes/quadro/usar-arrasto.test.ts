import { describe, expect, it } from "vitest";

import { decidirRevalidacao, decidirSolta } from "./usar-arrasto";

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
    expect(decidirRevalidacao(null, "Essa turma está desativada e não recebe serviço novo.", false)).toEqual(
      { tipo: "corrigir-e-anunciar" },
    );
  });

  it("reproduz a sequência do bug do cache: duas travessias para o MESMO alvo/recusa, sem abortar a segunda", () => {
    // 1. Shift+← para uma célula no passado: recusa ao vivo (otimista) é
    //    null, a fresca é "Esse dia já passou." — corrige e anuncia.
    const passo1 = decidirRevalidacao(null, "Esse dia já passou.", true);
    expect(passo1).toEqual({ tipo: "corrigir-e-anunciar" });

    // 2. Shift+→ de volta para uma célula válida: recusa ao vivo (otimista,
    //    depois do Shift+→) é null, a fresca também é null — sem correção,
    //    mas com chegada pendente, então só anuncia.
    const passo2 = decidirRevalidacao(null, null, true);
    expect(passo2).toEqual({ tipo: "anunciar" });

    // 3. Shift+← de novo, para o MESMO alvo/recusa do passo 1: a recusa ao
    //    vivo (otimista, de novo) é null, a fresca é "Esse dia já passou." —
    //    o par (alvo, recusa) é IDÊNTICO ao do passo 1, mas a decisão não
    //    pode abortar por isso: o teste (`decidirRevalidacao`) não tem
    //    cache nenhum, só compara contra o estado ao vivo — corrige e
    //    anuncia de novo, sem exceção.
    const passo3 = decidirRevalidacao(null, "Esse dia já passou.", true);
    expect(passo3).toEqual({ tipo: "corrigir-e-anunciar" });
  });
});
