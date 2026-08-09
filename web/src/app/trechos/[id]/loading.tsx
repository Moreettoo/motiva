import { Esqueleto, EsqueletoTexto } from "@/components/ui/esqueleto";

/* A silhueta acompanha a página real: cabeçalho, faixa de identidade, três
   blocos de estado, o gráfico alto, o bloco da decisão e o histórico. Um
   retângulo genérico faria a tela pular quando o dado chegasse. */

function BlocoCartao({ children }: { children?: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-surface p-5">{children}</div>;
}

export default function CarregandoTrecho() {
  return (
    <div role="status" aria-label="Carregando o trecho…" className="space-y-6">
      <div className="border-b border-border pb-5">
        <Esqueleto className="h-3 w-32" />
        <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <Esqueleto className="h-7 w-72" />
            <Esqueleto className="mt-2.5 h-3 w-96 max-w-full" />
          </div>
          <div className="flex flex-wrap items-end gap-8">
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <Esqueleto className="h-2.5 w-20" />
                <Esqueleto className="mt-2 h-5 w-16" />
              </div>
            ))}
            <div className="flex gap-2">
              <Esqueleto className="h-9 w-36 rounded-md" />
              <Esqueleto className="h-9 w-32 rounded-md" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3">
        <Esqueleto className="h-4 w-40" />
        <Esqueleto className="h-6 w-24 rounded-full" />
        <Esqueleto className="h-6 w-12 rounded-full" />
        <Esqueleto className="h-3 w-28" />
        <Esqueleto className="ml-auto h-3 w-44" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <BlocoCartao>
          <Esqueleto className="h-3 w-40" />
          <div className="mt-6 flex justify-center">
            <Esqueleto className="size-36 rounded-full" />
          </div>
        </BlocoCartao>

        {[0, 1].map((bloco) => (
          <BlocoCartao key={bloco}>
            <Esqueleto className="h-3 w-40" />
            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-6">
              {[0, 1, 2, 3].map((i) => (
                <div key={i}>
                  <Esqueleto className="h-2.5 w-24" />
                  <Esqueleto className="mt-2 h-5 w-20" />
                </div>
              ))}
            </div>
          </BlocoCartao>
        ))}
      </div>

      <BlocoCartao>
        <div className="flex items-start justify-between gap-4">
          <Esqueleto className="h-3.5 w-48" />
          <Esqueleto className="h-8 w-48 rounded-md" />
        </div>
        <Esqueleto className="mt-4 h-3 w-64" />
        <Esqueleto className="mt-5 h-80 w-full rounded-md" />
      </BlocoCartao>

      <BlocoCartao>
        <Esqueleto className="h-3.5 w-40" />
        <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,17rem)_1fr]">
          <div>
            <Esqueleto className="h-0.5 w-10" />
            <Esqueleto className="mt-3 h-2.5 w-28" />
            <Esqueleto className="mt-2 h-8 w-40" />
            <Esqueleto className="mt-4 h-6 w-28 rounded-full" />
          </div>
          <div className="space-y-4">
            <EsqueletoTexto linhas={4} />
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Esqueleto key={i} className="h-6 w-32 rounded-full" />
              ))}
            </div>
            <Esqueleto className="h-16 w-full rounded-md" />
          </div>
        </div>
      </BlocoCartao>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <BlocoCartao>
          <Esqueleto className="h-3.5 w-44" />
          <Esqueleto className="mt-5 h-48 w-full rounded-lg" />
        </BlocoCartao>
        <BlocoCartao>
          <Esqueleto className="h-3.5 w-40" />
          <Esqueleto className="mt-5 h-3 w-32" />
          <Esqueleto className="mt-2 h-9 w-full rounded-md" />
          <div className="mt-4 flex justify-end">
            <Esqueleto className="h-9 w-44 rounded-md" />
          </div>
        </BlocoCartao>
      </div>

      <span className="sr-only">Carregando o trecho…</span>
    </div>
  );
}
