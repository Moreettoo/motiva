import { describe, expect, it } from "vitest";

import { balancoSolo, type DiaClima } from "../clima";
import type { Especie } from "../types";
import fixture from "./fixture-features.json";
import { CAMPOS_ENTRADA } from "./arvores";
import { codificarEspecie, montarFeatures } from "./campos";

/**
 * A OUTRA metade da rede de seguranca do modelo portado.
 *
 * `arvores.test.ts` prova o PERCURSO: dado um vetor de 20 números, o TypeScript
 * devolve o mesmo que o scikit-learn. Este arquivo prova a MONTAGEM: dado o
 * mesmo clima, o TypeScript monta o mesmo vetor que o Python monta.
 *
 * São coisas diferentes e as duas podem quebrar sozinhas. A montagem tem duas
 * implementações independentes — `clima.montar_features`, que roda no lote que
 * grava no banco, e `montarFeatures`, que roda no simulador — e duas
 * implementações da mesma conta divergem. O modo de falha é o de sempre: nada
 * quebra, os dois números continuam plausíveis, e o simulador passa a responder
 * diferente do lote para o mesmo trecho. Como a discordância seria em graus-dia
 * ou em água no solo, ninguém repara olhando a tela.
 *
 * O fixture sai de `python gerar_fixture_features.py`, com uma série de clima
 * SINTÉTICA: o teste precisa ser determinístico e não pode tocar rede.
 */

const serie: DiaClima[] = fixture.serie.map((d) => ({
  data: d.data,
  temperaturaC: d.tmed,
  temperaturaMinC: d.tmin,
  temperaturaMaxC: d.tmax,
  umidadePct: d.umidade,
  chuvaMm: d.chuva,
  radiacaoMjM2: d.radiacao,
  et0MmDia: d.et0,
  fonte: "previsao",
}));

describe("montarFeatures bate com o preenchedor do Python", () => {
  it("usa a mesma série e o mesmo ponto de início do fixture", () => {
    expect(serie).toHaveLength(fixture.serie.length);
    expect(serie[fixture.aquecimento].data).toBe(fixture.inicio);
  });

  for (const caso of fixture.casos) {
    const p = caso.pedido;

    it(`${p.especie}, ${p.dias_periodo} dia(s), ${p.altura_cm} cm`, () => {
      const balanco = balancoSolo(serie, p.capacidade_mm, p.altura_cm);

      // O balde é a parte mais fácil de divergir sem ninguém ver: ele acumula
      // 60 dias de aquecimento antes de o período começar, então um erro de um
      // dia no laço só aparece na terceira casa.
      expect(balanco.fracoes[fixture.aquecimento] * 100).toBeCloseTo(
        caso.agua_solo_no_inicio_pct,
        4,
      );

      const nosso = montarFeatures({
        especie: p.especie as Especie,
        latitude: p.latitude,
        alturaInicialCm: p.altura_cm,
        diasDesdeRocada: p.dias_desde_rocada,
        fertilidade: p.fertilidade,
        capacidadeMm: p.capacidade_mm,
        serie,
        inicio: fixture.aquecimento,
        diasPeriodo: p.dias_periodo,
        balanco,
      });

      const deles = caso.features as Record<string, number | string>;

      // Campo a campo, e não vetor contra vetor: quando quebra, a mensagem
      // precisa dizer QUAL feature divergiu. "esperava [20 números], recebeu
      // [20 números]" manda quem for consertar contar posições na mão.
      CAMPOS_ENTRADA.forEach((campo, i) => {
        const esperado =
          campo === "especie" ? codificarEspecie(deles[campo] as string) : (deles[campo] as number);
        expect(nosso[i], `feature "${campo}"`).toBeCloseTo(esperado, 6);
      });
    });
  }

  it("cobre os três capins, e o período de 1 dia e o de 120", () => {
    // O fixture é a única fonte destes casos; se alguém encolher a lista de
    // cenários no gerador, os testes acima continuam verdes cobrindo menos.
    const especies = new Set(fixture.casos.map((c) => c.pedido.especie));
    const periodos = fixture.casos.map((c) => c.pedido.dias_periodo);

    expect([...especies].sort()).toEqual(["batatais", "braquiaria", "esmeralda"]);
    expect(Math.min(...periodos)).toBe(1);
    expect(Math.max(...periodos)).toBe(120);
  });
});
