import { Esqueleto } from "@/components/ui/esqueleto";

/** Mesma silhueta do conteúdo real: cabeçalho, controles, faixa de números,
 *  régua com raias e a coluna da fila. Um retângulo cinza genérico faria a tela
 *  pular de layout quando os dados chegassem. */
export default function CarregandoAgenda() {
  return (
    <div role="status" aria-label="Carregando a agenda…" className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-5 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Esqueleto className="h-7 w-40" />
          <Esqueleto className="mt-3 h-3 w-full max-w-prose" />
          <Esqueleto className="mt-2 h-3 w-2/3 max-w-prose" />
        </div>

        <div className="flex gap-8">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Esqueleto className="h-2.5 w-16" />
              <Esqueleto className="mt-2 h-5 w-10" />
            </div>
          ))}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Esqueleto className="h-10 w-64 rounded-md" />
        <Esqueleto className="h-8 w-28 rounded-md" />
        <Esqueleto className="h-8 w-28 rounded-md" />
        <Esqueleto className="h-8 w-28 rounded-md" />
        <Esqueleto className="h-8 w-28 rounded-md" />
        <Esqueleto className="h-8 w-44 rounded-md" />
      </div>

      <div className="grid grid-cols-2 rounded-lg border border-border bg-surface lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={i === 0 ? "p-4" : "border-l border-border p-4"}>
            <Esqueleto className="h-2.5 w-24" />
            <Esqueleto className="mt-3 h-7 w-16" />
            <Esqueleto className="mt-3 h-2.5 w-28" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface">
          <div className="p-5">
            <Esqueleto className="h-4 w-56" />
            <Esqueleto className="mt-2 h-3 w-80 max-w-full" />
          </div>

          <div className="flex border-t border-border">
            <Esqueleto className="h-14 w-52 shrink-0 rounded-none" />
            <div className="flex min-w-0 flex-1 gap-px overflow-hidden">
              {Array.from({ length: 7 }, (_, i) => (
                <Esqueleto key={i} className="h-14 flex-1 rounded-none" />
              ))}
            </div>
          </div>

          {/* Larguras e recuos irregulares: uma coluna de barras iguais não lê
              como plano de operação. */}
          {[
            { recuo: "ml-0", largura: "w-2/5" },
            { recuo: "ml-[18%]", largura: "w-1/4" },
            { recuo: "ml-[8%]", largura: "w-1/3" },
            { recuo: "ml-[45%]", largura: "w-1/5" },
            { recuo: "ml-[26%]", largura: "w-2/5" },
          ].map((barra, linha) => (
            <div key={linha} className="flex border-t border-border">
              <div className="w-52 shrink-0 border-r border-border p-3">
                <Esqueleto className="h-3 w-32" />
                <Esqueleto className="mt-2 h-2.5 w-24" />
                <Esqueleto className="mt-2 h-1 w-full" />
              </div>
              <div className="min-w-0 flex-1 p-3">
                <Esqueleto className={`h-9 rounded-sm ${barra.recuo} ${barra.largura}`} />
              </div>
            </div>
          ))}
        </div>

        <div className="min-w-0 rounded-lg border border-border bg-surface">
          <div className="border-b border-border p-5">
            <Esqueleto className="h-4 w-36" />
            <Esqueleto className="mt-2 h-3 w-full" />
          </div>

          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="border-b border-border p-4 last:border-b-0">
              <div className="flex items-start justify-between gap-2">
                <Esqueleto className="h-3.5 w-40" />
                <Esqueleto className="h-5 w-16 rounded-full" />
              </div>
              <Esqueleto className="mt-2 h-2.5 w-32" />
              <Esqueleto className="mt-3 h-3 w-full" />
              <Esqueleto className="mt-1.5 h-3 w-4/5" />
              <div className="mt-3 flex gap-1.5">
                <Esqueleto className="h-8 w-24 rounded-md" />
                <Esqueleto className="h-8 w-32 rounded-md" />
                <Esqueleto className="size-8 rounded-md" />
                <Esqueleto className="size-8 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Carregando a agenda…</span>
    </div>
  );
}
