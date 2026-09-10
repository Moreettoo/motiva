import { proximoStatus } from "@/lib/chamados/maquina";

import type { ChamadoCampo, ItemFila } from "./contratos";

/**
 * As regras puras do aparelho: ordenar a fila, mostrar o estado que a pessoa
 * acabou de criar mesmo antes de ele chegar ao servidor, contar pendencias e
 * espacar as tentativas.
 *
 * Nada aqui toca IndexedDB, rede ou React — e por isso que tudo isto tem teste.
 * O estado otimista sai de `proximoStatus`, a MESMA maquina que o painel usa e
 * que `ia.registrar_evento_chamado` repete no banco: se a tela adiantasse um
 * estado que o servidor recusa, o cartao voltaria atras sozinho depois do envio.
 */

/** Ordem de chegada. `criado_em` e ISO com fuso, entao a comparacao de texto ja e cronologica. */
export function ordenarFila(itens: ItemFila[]): ItemFila[] {
  return [...itens].sort((a, b) => (a.criado_em < b.criado_em ? -1 : a.criado_em > b.criado_em ? 1 : 0));
}

/** Aplica a fila sobre o snapshot do servidor, em ordem, sem alterar a entrada. */
export function aplicarPendencias(chamados: ChamadoCampo[], fila: ItemFila[]): ChamadoCampo[] {
  const porChamado = new Map(chamados.map((c) => [c.id, { ...c }]));
  for (const item of ordenarFila(fila)) {
    const c = porChamado.get(item.chamado_id);
    if (!c) continue;
    const novo = proximoStatus(c.status, item.tipo, null);
    if (novo) c.status = novo;
    if (item.tipo === "finalizado" && typeof item.payload.altura_final_cm === "number") {
      c.altura_final_cm = item.payload.altura_final_cm;
    }
  }
  return [...porChamado.values()];
}

/** `comErro` e o que o indicador precisa para dizer "N pendentes, M com problema". */
export function resumoPendencias(fila: ItemFila[]): { total: number; comErro: number } {
  return { total: fila.length, comErro: fila.filter((i) => i.ultimo_erro != null).length };
}

/**
 * Espera antes da proxima tentativa, em milissegundos: 0, 2 s, 8 s, 30 s e
 * depois 120 s para sempre. Teto e nao crescimento infinito porque a fila do
 * campo tem que estar vazia no fim do dia, nao daqui a duas horas.
 */
export function esperaAntesDaTentativa(tentativas: number): number {
  return [0, 2_000, 8_000, 30_000][tentativas] ?? 120_000;
}

export type GruposDeChamados = {
  hoje: ChamadoCampo[];
  atrasados: ChamadoCampo[];
  proximos: ChamadoCampo[];
  aguardando: ChamadoCampo[];
  recentes: ChamadoCampo[];
};

/**
 * Os cinco grupos da lista. O status manda sobre a data: um chamado que ja foi
 * enviado para aprovacao nao e mais trabalho de hoje, mesmo que a data seja
 * hoje — ele esta na mao do gestor.
 *
 * `hoje` e `data_sugerida` sao `AAAA-MM-DD` sem fuso e a comparacao e de texto,
 * de proposito: `new Date("2026-09-10")` e UTC e no Brasil volta um dia.
 */
export function agruparChamados(chamados: ChamadoCampo[], hoje: string): GruposDeChamados {
  const grupos: GruposDeChamados = { hoje: [], atrasados: [], proximos: [], aguardando: [], recentes: [] };

  for (const c of chamados) {
    if (c.status === "aguardando_aprovacao" || c.status === "devolvido") grupos.aguardando.push(c);
    else if (c.status === "concluido" || c.status === "cancelado") grupos.recentes.push(c);
    else if (c.data_sugerida < hoje) grupos.atrasados.push(c);
    else if (c.data_sugerida > hoje) grupos.proximos.push(c);
    else grupos.hoje.push(c);
  }

  const porData = (a: ChamadoCampo, b: ChamadoCampo) =>
    a.data_sugerida < b.data_sugerida ? -1 : a.data_sugerida > b.data_sugerida ? 1 : a.id - b.id;

  grupos.hoje.sort(porData);
  grupos.atrasados.sort(porData);
  grupos.proximos.sort(porData);
  grupos.aguardando.sort(porData);
  // Concluido recente e historico: o ultimo trabalho fechado vem primeiro.
  grupos.recentes.sort((a, b) => (a.atualizado_em < b.atualizado_em ? 1 : a.atualizado_em > b.atualizado_em ? -1 : b.id - a.id));

  return grupos;
}
