import { Cartao } from "@/components/ui/cartao";
import { Esqueleto } from "@/components/ui/esqueleto";

/** Mesma silhueta do conteúdo real: cabeçalho com quatro leituras, barra de
 *  filtros de uma linha e as réguas de km empilhadas. Um bloco cinza genérico
 *  faria a página saltar quando os dados chegassem. */
export default function CarregandoMalha() {
  return (
    <div role="status" aria-label="Carregando a malha…" className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
        <div className="min-w-0">
          <Esqueleto className="h-11 w-40" />
        </div>

        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <Esqueleto className="h-2.5 w-16" />
              <Esqueleto className="mt-2 h-4 w-12" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-border bg-surface p-3">
        <Esqueleto className="h-9 w-full sm:w-64" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Esqueleto key={i} className="h-7 w-20 rounded-full" />
        ))}
        <Esqueleto className="ml-auto h-8 w-56 rounded-md" />
      </div>

      <div className="min-w-0">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <Esqueleto className="h-4 w-48" />
          <Esqueleto className="h-3 w-24" />
        </div>

        <Cartao className="pr-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="border-b border-border py-4 pl-4 last:border-b-0">
              <div className="mb-3 flex items-center gap-3">
                <Esqueleto className="h-4 w-40" />
                <Esqueleto className="h-5 w-10 rounded-full" />
                <Esqueleto className="h-3 w-16" />
                <Esqueleto className="ml-auto h-5 w-20 rounded-full" />
              </div>

              {/* 72px é a altura exata da régua "detalhada". */}
              <Esqueleto className="h-[72px] w-full rounded-sm" />
              <Esqueleto className="mt-1 h-5 w-full" />
            </div>
          ))}
        </Cartao>
      </div>
    </div>
  );
}
