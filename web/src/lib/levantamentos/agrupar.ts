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

export type LevantamentoImportado = { data: string; arquivo: string; trechos: number; importado_em: string };

/**
 * Agrupa as linhas cruas de `ia.levantamentos` por DATA de importação, para
 * o cartão "Levantamentos importados" (`validacao/_componentes/
 * levantamentos-importados.tsx`): um RA-RET vira uma linha, não cada
 * trecho x faixa vira uma. Com 12 faixas x 60 trechos por arquivo são 720
 * linhas cruas por importação -- `trechos` aqui PRECISA ser a contagem de
 * marcos DISTINTOS (`Set`, no máximo 60), nunca `linhas.length` (720) nem a
 * contagem de linhas do grupo: um `.length` ingênuo contaria cada faixa do
 * mesmo trecho de novo e mostraria "720 trechos" numa rodovia de 60.
 *
 * Extraída pura e sem `server-only`, no mesmo molde de `agruparLevantamentos`
 * acima, porque `levantamentosImportados` (`queries.ts`, ao lado) não pode
 * ser importada de um `.test.ts` -- e sem isso o bug do parágrafo anterior
 * seria visível só em produção, nunca num teste.
 *
 * `importado_em` fica o mais recente das linhas do grupo. Na prática todas
 * as linhas de uma importação gravam no mesmo instante (o `upsert` do
 * publicador é uma única chamada em lote), mas nada no schema obriga isso --
 * um reprocessamento parcial deixaria `importado_em` divergente dentro da
 * mesma data, e mostrar o mais antigo esconderia a correção mais recente.
 */
export function agruparImportacoes(
  linhas: Pick<Levantamento, "data" | "arquivo_origem" | "trecho_id" | "importado_em">[],
): LevantamentoImportado[] {
  const grupos = new Map<string, { data: string; arquivo: string; trechos: Set<number>; importado_em: string }>();
  for (const l of linhas) {
    const g = grupos.get(l.data) ?? { data: l.data, arquivo: l.arquivo_origem, trechos: new Set<number>(), importado_em: l.importado_em };
    g.trechos.add(l.trecho_id);
    if (l.importado_em > g.importado_em) g.importado_em = l.importado_em;
    grupos.set(l.data, g);
  }
  return [...grupos.values()].map((g) => ({ data: g.data, arquivo: g.arquivo, trechos: g.trechos.size, importado_em: g.importado_em }));
}
