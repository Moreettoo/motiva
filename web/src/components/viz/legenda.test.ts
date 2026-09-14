import { describe, expect, it } from "vitest";

import { CLASSE_ALTURA, METODO_ROCADA, RISCO, STATUS } from "@/lib/dominio";

import { ICONES } from "./legenda";

/**
 * A rede que faltava: `RISCO.sem_dados.icone = "CircleHelp"` foi acrescentado
 * sem registrar `CircleHelp` aqui, e nada pegou -- `TokenStatus.icone` é
 * `string` solto, então `tsc` não vê a referência quebrada; `eslint` não
 * confere valor de objeto contra outro; e o `dominio.test.ts` de então só
 * comparava a STRING de `sem_dados` com a de `baixa` (que já é diferente por
 * definição), nunca se `IconeDominio` teria como desenhá-la. `IconeDominio`
 * caía no `?? Circle`, e os 60 trechos sem previsão desenhavam uma bolinha
 * vazia -- o oposto do que a migração `risco_sem_dados` existe para evitar.
 *
 * Cada `it` abaixo ITERA o mapa (nunca lista nome de ícone à mão): uma
 * entrada nova em `RISCO`, `STATUS`, `CLASSE_ALTURA` ou `METODO_ROCADA` cai
 * automaticamente sob o mesmo teste, sem ninguém lembrar de atualizar uma
 * lista aqui.
 *
 * `CARGO` e `STATUS_CHAMADO_TOKEN`/`TIPO_EVENTO` FICAM DE FORA de propósito:
 * `CARGO` resolve por `usuarios/_componentes/icone-cargo.tsx`, um terceiro
 * registro (não este); `STATUS_CHAMADO_TOKEN`/`TIPO_EVENTO` resolvem por
 * `chamados/_componentes/icones.tsx` (testado em `icones.test.ts`, ao lado
 * daquele registro). Testar os três aqui teria dado FALSO NEGATIVO: nenhum
 * dos ícones de `CARGO` (ShieldCheck, UserCog, Eye) está neste mapa, e não
 * precisa estar.
 */
describe("legenda.ICONES cobre todo status/risco do dominio que passa por IconeDominio", () => {
  it("RISCO: todo icone de RISCO resolve (ChipRisco, agrupamento, mapa, régua de km, simulador)", () => {
    for (const [chave, token] of Object.entries(RISCO)) {
      expect(ICONES[token.icone], `RISCO.${chave}.icone = "${token.icone}" não está em legenda.ICONES`).toBeDefined();
    }
  });

  it("STATUS (StatusAgendamento): todo icone resolve (ChipStatus)", () => {
    for (const [chave, token] of Object.entries(STATUS)) {
      expect(ICONES[token.icone], `STATUS.${chave}.icone = "${token.icone}" não está em legenda.ICONES`).toBeDefined();
    }
  });

  it("CLASSE_ALTURA: todo icone resolve (mesma forma de TokenStatus que RISCO; `ChipClasse`, Tarefa 17)", () => {
    for (const [chave, token] of Object.entries(CLASSE_ALTURA)) {
      expect(ICONES[token.icone], `CLASSE_ALTURA.${chave}.icone = "${token.icone}" não está em legenda.ICONES`).toBeDefined();
    }
  });

  it("METODO_ROCADA: todo icone resolve (`LevantamentoCampo`, Tarefa 18)", () => {
    for (const [chave, token] of Object.entries(METODO_ROCADA)) {
      expect(ICONES[token.icone], `METODO_ROCADA["${chave}"].icone = "${token.icone}" não está em legenda.ICONES`).toBeDefined();
    }
  });
});
