import { describe, expect, it } from "vitest";

import { STATUS_CHAMADO_TOKEN, TIPO_EVENTO } from "@/lib/dominio";

import { ICONES } from "./icones";

/**
 * Irmão de `components/viz/legenda.test.ts`, para o SEGUNDO registro de
 * ícones (ver o comentário no topo de `icones.tsx` sobre por que os dois
 * existem separados). Cobre exatamente os dois vocabulários que aquele
 * comentário promete: `STATUS_CHAMADO_TOKEN` e `TIPO_EVENTO`. `RISCO`,
 * `STATUS` (agendamento), `CLASSE_ALTURA` e `METODO_ROCADA` NÃO entram aqui
 * -- esses resolvem por `legenda.tsx` (testado lá), e listá-los aqui também
 * daria falso negativo, já que este mapa não os cobre nem precisa cobrir.
 *
 * Itera os mapas (não lista ícone por nome) pelo mesmo motivo do irmão: uma
 * classe de evento nova em `TIPO_EVENTO` sem entrada aqui cai sob este teste
 * sozinha.
 */
describe("chamados/icones.ICONES cobre STATUS_CHAMADO_TOKEN e TIPO_EVENTO", () => {
  it("STATUS_CHAMADO_TOKEN: todo icone resolve (ChipChamado)", () => {
    for (const [chave, token] of Object.entries(STATUS_CHAMADO_TOKEN)) {
      expect(ICONES[token.icone], `STATUS_CHAMADO_TOKEN.${chave}.icone = "${token.icone}" não está em icones.ICONES`).toBeDefined();
    }
  });

  it("TIPO_EVENTO: todo icone resolve (IconeChamado, linha do tempo)", () => {
    for (const [chave, token] of Object.entries(TIPO_EVENTO)) {
      expect(ICONES[token.icone], `TIPO_EVENTO.${chave}.icone = "${token.icone}" não está em icones.ICONES`).toBeDefined();
    }
  });
});
