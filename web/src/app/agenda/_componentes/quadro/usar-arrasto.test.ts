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
