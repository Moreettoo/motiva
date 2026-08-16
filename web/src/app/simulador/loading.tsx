import { Esqueleto } from "@/components/ui/esqueleto";

/** Mesma silhueta da tela pronta: cabeçalho, formulário de quatro campos e o
 *  bloco de resultado. Bloco cinza genérico faria a página pular quando o
 *  clima e o modelo terminassem. */
export default function CarregandoSimulador() {
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 lg:gap-8" aria-busy="true">
      <span role="status" className="sr-only">
        Carregando o simulador…
      </span>

      {/* Silhueta do cabeçalho, e não o CabecalhoPagina de verdade: ele
          renderiza um <h1>, e durante o streaming o esqueleto e o conteúdo
          convivem no mesmo documento, a página sairia com dois <h1>. */}
      <div className="flex flex-col gap-5 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Esqueleto className="h-7 w-40" />
          <Esqueleto className="mt-2.5 h-3 w-[28rem] max-w-full" />
        </div>
        <Esqueleto className="h-6 w-28 rounded-full" />
      </div>

      <div className="rounded-lg border border-border bg-surface p-5">
        <Esqueleto className="h-3.5 w-32" />
        <Esqueleto className="mt-2 h-2.5 w-80 max-w-full" />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i}>
              <Esqueleto className="h-2.5 w-24" />
              <Esqueleto className="mt-2 h-2 w-40 max-w-full" />
              <Esqueleto className="mt-2 h-9 w-full rounded-md" />
            </div>
          ))}
        </div>
        <Esqueleto className="mt-5 h-9 w-48 rounded-md" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Esqueleto key={i} className="h-24 rounded-lg" />
        ))}
      </div>

      <div className="rounded-lg border border-border bg-surface p-5">
        <Esqueleto className="h-3.5 w-56" />
        <Esqueleto className="mt-2 h-2.5 w-96 max-w-full" />
        <Esqueleto className="mt-5 h-[280px] w-full rounded-md" />
      </div>
    </div>
  );
}
