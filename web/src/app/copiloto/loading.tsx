import { Esqueleto, EsqueletoTexto } from "@/components/ui/esqueleto";

/** Mesma silhueta da tela pronta: cabeçalho real, conversa à esquerda, ficha e
 *  qualidade dos dados à direita. Bloco cinza genérico faria a página pular. */
export default function CarregandoCopiloto() {
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 lg:gap-8" aria-busy="true">
      <span role="status" className="sr-only">
        Carregando o copiloto…
      </span>

      {/* Silhueta do cabeçalho, não o CabecalhoPagina de verdade: ele renderiza
          um <h1>, e durante o streaming o esqueleto e o conteúdo convivem no
          mesmo documento — a página era servida com dois <h1> "Copiloto". */}
      <div className="flex flex-col gap-5 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Esqueleto className="h-6 w-32" />
          <Esqueleto className="mt-3 h-3 w-[38rem] max-w-full" />
        </div>
        <div className="flex gap-6">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Esqueleto className="h-2.5 w-20" />
              <Esqueleto className="mt-2 h-4 w-14" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_23rem] xl:gap-8">
        <div className="flex w-full max-w-[68ch] min-w-0 flex-col">
          <div className="flex items-baseline justify-between gap-3">
            <Esqueleto className="h-2.5 w-20" />
            <Esqueleto className="h-2.5 w-40" />
          </div>

          <div className="mt-4 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-10">
            <Esqueleto className="size-9 rounded-md" />
            <Esqueleto className="h-3.5 w-56" />
            <Esqueleto className="h-3 w-72" />
          </div>

          <div className="mt-6 border-t border-border pt-4">
            <Esqueleto className="h-2.5 w-16" />
            <div className="mt-2 flex flex-wrap gap-2">
              {["w-52", "w-44", "w-56", "w-40"].map((largura) => (
                <Esqueleto key={largura} className={`h-7 rounded-full ${largura}`} />
              ))}
            </div>

            <div className="mt-3 flex items-end gap-2">
              <Esqueleto className="h-9 flex-1 rounded-md" />
              <Esqueleto className="h-9 w-32 rounded-md" />
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <div className="rounded-lg border border-border bg-surface p-5">
            <Esqueleto className="h-3.5 w-40" />
            <Esqueleto className="mt-2 h-2.5 w-56" />
            <Esqueleto className="mt-5 h-2.5 w-36" />
            <Esqueleto className="mt-2 h-7 w-24" />
            <Esqueleto className="mt-3 h-1 w-full" />
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {[0, 1, 2, 3].map((i) => (
                <Esqueleto key={i} className="h-20 rounded-md" />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface p-5">
            <Esqueleto className="h-3.5 w-36" />
            <Esqueleto className="mt-2 h-2.5 w-52" />
            <div className="mt-5 space-y-4">
              <EsqueletoTexto linhas={3} />
              <EsqueletoTexto linhas={3} />
            </div>
            <Esqueleto className="mt-5 h-28 w-full rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
