/**
 * Leitura paginada do PostgREST.
 *
 * O `db-max-rows` do projeto corta a resposta em mil linhas e avisa APENAS no
 * cabecalho `content-range` (`0-999/1440`). O `error` volta nulo e o HTTP volta
 * 200: para o cliente, **uma consulta truncada e indistinguivel de uma consulta
 * que acabou**. Por isso uma leitura que pode passar de mil linhas tem que
 * PAGINAR, e nao so confiar no `error`.
 *
 * Este modulo nao importa `server-only` de proposito: o laco e a unica parte
 * testavel sem banco, e sem ele nenhum teste deste repo conseguiria distinguir
 * "leu tudo" de "leu a primeira pagina" -- que foi exatamente o que aconteceu
 * com `levantamentosImportados`, cujo teste reproduzia as 1.440 linhas em
 * memoria, sem PostgREST no meio, e por isso nunca viu o corte.
 */

/** Tamanho da pagina: o mesmo `db-max-rows` que o servidor aplica. */
export const PAGINA_POSTGREST = 1000;

/**
 * Teto de paginas. E guarda-corpo, nao regra: nenhuma leitura deste projeto
 * chega perto de 20.000 linhas, e o teto existe para o laco nao rodar para
 * sempre se o servidor passar a devolver pagina cheia indefinidamente.
 */
const TETO_PAGINAS = 20;

/**
 * Le todas as paginas de uma consulta e devolve as linhas concatenadas.
 *
 * `buscarPagina` recebe o intervalo fechado que vai para `.range(de, ate)` e
 * devolve as linhas daquela pagina (o tratamento do `error` fica com quem
 * chama, que sabe o nome da consulta para a mensagem). O laco para quando um
 * lote vem MENOR que a pagina -- o unico sinal confiavel de fim.
 *
 * Quem chama precisa ordenar por uma chave TOTAL (`.order("data").order("id")`,
 * nunca so por `data`): sem desempate estavel o servidor pode devolver a mesma
 * linha em duas paginas e omitir outra, e a leitura paginada fica errada de um
 * jeito ainda mais dificil de ver que o truncamento.
 *
 * Bater no teto LEVANTA, em vez de devolver uma leitura parcial em silencio --
 * o silencio e justamente o defeito que este modulo existe para matar.
 */
export async function lerPaginado<T>(
  contexto: string,
  buscarPagina: (de: number, ate: number) => Promise<T[]>,
): Promise<T[]> {
  const linhas: T[] = [];
  for (let pagina = 0; pagina < TETO_PAGINAS; pagina += 1) {
    const de = pagina * PAGINA_POSTGREST;
    const lote = await buscarPagina(de, de + PAGINA_POSTGREST - 1);
    linhas.push(...lote);
    if (lote.length < PAGINA_POSTGREST) return linhas;
  }
  throw new Error(
    `Falha ao ler ${contexto}: passou de ${TETO_PAGINAS * PAGINA_POSTGREST} linhas ` +
      `(${TETO_PAGINAS} paginas cheias) e a leitura foi interrompida; ` +
      `trocar a consulta por uma agregacao no banco em vez de aumentar o teto.`,
  );
}
