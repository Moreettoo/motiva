import { Cartao } from "@/components/ui/cartao";
import { Esqueleto } from "@/components/ui/esqueleto";

/**
 * Silhueta do painel, não bloco cinza genérico: se o esqueleto tem outra forma,
 * a tela salta quando o dado chega e o gestor perde a linha que estava lendo.
 */
function EsqueletoIndicador() {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <Esqueleto className="h-2.5 w-24" />
        <Esqueleto className="size-4 rounded-sm" />
      </div>
      <Esqueleto className="mt-3 h-7 w-20" />
      <Esqueleto className="mt-3 h-2.5 w-full" />
      <Esqueleto className="mt-1.5 h-2.5 w-8/12" />
    </div>
  );
}

function EsqueletoDecisao() {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-4 border-b border-border p-5 pl-6 last:border-b-0 sm:grid-cols-[5.5rem_minmax(0,1fr)] xl:grid-cols-[5.5rem_minmax(0,1fr)_13rem]">
      <div>
        <Esqueleto className="h-2.5 w-12" />
        <Esqueleto className="mt-2 h-7 w-10" />
        <Esqueleto className="mt-2 h-2.5 w-16" />
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Esqueleto className="h-5 w-20 rounded-full" />
          <Esqueleto className="h-3.5 w-40" />
          <Esqueleto className="h-5 w-10 rounded-full" />
        </div>
        <Esqueleto className="mt-3 h-2.5 w-72 max-w-full" />
        <Esqueleto className="mt-3 h-3 w-full" />
        <Esqueleto className="mt-1.5 h-3 w-10/12" />
        <Esqueleto className="mt-3 h-2.5 w-44" />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 sm:col-span-2 xl:col-span-1 xl:flex-col xl:items-end">
        <div className="xl:text-right">
          <Esqueleto className="h-2.5 w-20" />
          <Esqueleto className="mt-2 h-3.5 w-24" />
          <Esqueleto className="mt-2 h-2.5 w-16" />
        </div>
        <div className="flex gap-2">
          <Esqueleto className="h-8 w-32 rounded-md" />
          <Esqueleto className="h-8 w-24 rounded-md" />
        </div>
      </div>
    </div>
  );
}

function EsqueletoRodovia() {
  return (
    <div className="border-b border-border py-4 pl-4 last:border-b-0">
      <div className="mb-3 flex items-center gap-3">
        <Esqueleto className="h-3.5 w-44" />
        <Esqueleto className="h-5 w-10 rounded-full" />
        <Esqueleto className="h-2.5 w-16" />
        <Esqueleto className="ml-auto h-5 w-20 rounded-full" />
      </div>
      <Esqueleto className="h-7 w-full rounded-sm" />
      <Esqueleto className="mt-1.5 h-2.5 w-full" />
    </div>
  );
}

function EsqueletoGrafico({ altura }: { altura: string }) {
  return (
    <Cartao className="p-5">
      <Esqueleto className="h-3.5 w-48" />
      <Esqueleto className="mt-2 h-2.5 w-64 max-w-full" />
      <Esqueleto className="mt-4 h-3 w-56 max-w-full" />
      <Esqueleto className={`mt-4 w-full rounded-md ${altura}`} />
    </Cartao>
  );
}

export default function CarregandoPainel() {
  return (
    <div role="status" aria-label="Carregando o painel…" className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Esqueleto className="h-6 w-32" />
          <Esqueleto className="mt-3 h-3 w-[36rem] max-w-full" />
        </div>
        <Esqueleto className="h-9 w-40 rounded-md" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <EsqueletoIndicador key={i} />
        ))}
      </div>

      <Cartao>
        <div className="p-5">
          <Esqueleto className="h-3.5 w-44" />
          <Esqueleto className="mt-2 h-2.5 w-80 max-w-full" />
          <Esqueleto className="mt-4 h-3 w-full max-w-md" />
          <Esqueleto className="mt-4 h-[22px] w-full rounded-sm" />
        </div>
        <div className="flex items-center gap-4 border-t border-border px-5 py-3">
          <Esqueleto className="h-2.5 w-28" />
          {Array.from({ length: 4 }, (_, i) => (
            <Esqueleto key={i} className="h-5 w-20 rounded-full" />
          ))}
        </div>
      </Cartao>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Cartao>
          <div className="flex items-start gap-3 p-5">
            <Esqueleto className="mt-px size-4 rounded-sm" />
            <div className="min-w-0 flex-1">
              <Esqueleto className="h-3.5 w-40" />
              <Esqueleto className="mt-2 h-2.5 w-72 max-w-full" />
            </div>
            <Esqueleto className="h-3 w-24" />
          </div>
          <div className="border-t border-border">
            {Array.from({ length: 3 }, (_, i) => (
              <EsqueletoDecisao key={i} />
            ))}
          </div>
        </Cartao>

        <div className="flex min-w-0 flex-col gap-6">
          <EsqueletoGrafico altura="h-[236px]" />
          <EsqueletoGrafico altura="h-[300px]" />
        </div>
      </div>

      <Cartao>
        <div className="flex items-start gap-3 p-5">
          <Esqueleto className="mt-px size-4 rounded-sm" />
          <div className="min-w-0 flex-1">
            <Esqueleto className="h-3.5 w-44" />
            <Esqueleto className="mt-2 h-2.5 w-80 max-w-full" />
          </div>
          <Esqueleto className="h-3 w-32" />
        </div>
        <div className="pr-5 pb-2">
          {Array.from({ length: 4 }, (_, i) => (
            <EsqueletoRodovia key={i} />
          ))}
        </div>
      </Cartao>
    </div>
  );
}
