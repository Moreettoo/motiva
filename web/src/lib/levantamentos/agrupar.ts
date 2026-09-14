import type { ClasseAltura, Levantamento } from "../types";

export type LevantamentosAgrupados = {
  datas: string[];
  classes: Record<string, Record<string, ClasseAltura | null>>;
  arquivos: Record<string, string>;
};

/**
 * Agrupa as linhas cruas de `ia.levantamentos` (uma por trecho x faixa x
 * data) do jeito que o cartão de campo consome: classe por faixa e, dentro
 * dela, por data.
 *
 * Função pura e sem `server-only` de propósito: é a única forma de testar,
 * sem tocar banco, a garantia que este módulo existe para dar --
 * `levantamentosDoTrecho` (`queries.ts`, ao lado) não pode ser importado de
 * um `.test.ts` (o `import "server-only"` do topo derruba fora de um Server
 * Component, e `vitest.config.ts` só roda função pura, nunca banco).
 *
 * `classe` chega `null` quando a equipe marcou "X" ou deixou a célula em
 * branco no formulário unifilar -- e ISSO PRECISA CHEGAR NA TELA COMO `null`,
 * nunca como ausência da chave (que significa "esta faixa não tem nenhuma
 * linha nesta data", um fato diferente) e nunca como a Classe 1 (que é uma
 * medição de verdade, "abaixo de 10 cm"). `(classes[faixa] ??= {})[data] =
 * l.classe` grava o valor exatamente como veio do banco, `null` incluído; um
 * `l.classe ?? algumaCoisa` aqui apagaria essa distinção antes mesmo de
 * chegar no componente, e nenhum teste depois disso teria como flagrar.
 */
export function agruparLevantamentos(
  linhas: Pick<Levantamento, "faixa_codigo" | "data" | "classe" | "arquivo_origem">[],
): LevantamentosAgrupados {
  const classes: LevantamentosAgrupados["classes"] = {};
  const arquivos: Record<string, string> = {};
  const datas = new Set<string>();
  for (const l of linhas) {
    datas.add(l.data);
    arquivos[l.data] = l.arquivo_origem;
    (classes[l.faixa_codigo] ??= {})[l.data] = l.classe;
  }
  return { datas: [...datas].sort(), classes, arquivos };
}
