import { Esqueleto } from "@/components/ui/esqueleto";

/** Quantas linhas de tabela o esqueleto desenha. Perto da altura de uma
 *  primeira dobra: mais que isso e o esqueleto cria rolagem que o conteúdo
 *  real pode não ter. */
const LINHAS = 8;

/** Quais cartões da fila cada bloco mostra. Contagens diferentes de propósito:
 *  três colunas com o mesmo número de fichas leem como grade decorativa, e o
 *  que esta tela tem a dizer no primeiro instante é justamente que os três
 *  blocos NÃO estão iguais. */
const FICHAS_POR_BLOCO = [3, 1, 4];

/**
 * Mesma silhueta do conteúdo real: cabeçalho com duas métricas, os três blocos
 * da fila lado a lado, a barra de filtros e a tabela. Um retângulo cinza
 * genérico faria a tela pular de layout quando os dados chegassem.
 */
export default function CarregandoChamados() {
  return (
    <div role="status" aria-label="Carregando os chamados…" className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-5 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <Esqueleto className="h-11 w-48" />

        <div className="flex gap-8">
          {[0, 1].map((i) => (
            <div key={i}>
              <Esqueleto className="h-2.5 w-24" />
              <Esqueleto className="mt-2 h-5 w-12" />
            </div>
          ))}
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        {FICHAS_POR_BLOCO.map((fichas, bloco) => (
          <div key={bloco} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-baseline justify-between gap-3">
              <Esqueleto className="h-3.5 w-36" />
              <Esqueleto className="h-7 w-8" />
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {Array.from({ length: fichas }, (_, i) => (
                <div key={i} className="rounded-md border border-border p-2.5">
                  <Esqueleto className="h-3 w-28" />
                  <Esqueleto className="mt-1.5 h-2.5 w-40" />
                  <Esqueleto className="mt-1.5 h-2.5 w-24" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3">
        <Esqueleto className="h-9 w-full min-w-56 sm:w-64" />
        {[0, 1, 2, 3].map((i) => (
          <Esqueleto key={i} className="h-7 w-28 rounded-full" />
        ))}
        <Esqueleto className="ml-auto h-9 w-32 rounded-md" />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <Esqueleto className="h-9 w-full rounded-none" />
        {Array.from({ length: LINHAS }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border px-3 py-2.5 last:border-b-0">
            <Esqueleto className="h-3.5 w-28 shrink-0" />
            <Esqueleto className="h-3.5 w-40" />
            <Esqueleto className="hidden h-3.5 w-24 sm:block" />
            <Esqueleto className="ml-auto h-5 w-28 shrink-0 rounded-full" />
          </div>
        ))}
      </div>

      <span className="sr-only">Carregando os chamados…</span>
    </div>
  );
}
