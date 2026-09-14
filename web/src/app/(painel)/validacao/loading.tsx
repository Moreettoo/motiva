import { Cartao } from "@/components/ui/cartao";
import { Esqueleto, EsqueletoTexto } from "@/components/ui/esqueleto";

/** Mesma silhueta do conteúdo real: cabeçalho, o cartão de resumo com seis
 *  ladrilhos, matriz de confusão ao lado das limitações, e as duas tabelas
 *  (sensibilidade e NDVI) empilhadas embaixo. Um bloco cinza genérico faria a
 *  página saltar de layout quando a validação chegasse. */
export default function CarregandoValidacao() {
  return (
    <div role="status" aria-label="Carregando a validação…" className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
        <div className="min-w-0">
          <Esqueleto className="h-8 w-40" />
          <Esqueleto className="mt-2 h-4 w-96 max-w-full" />
        </div>
      </div>

      <div className="grid gap-4">
        <Cartao>
          <div className="flex items-start gap-3 p-5">
            <Esqueleto className="mt-px size-4 shrink-0 rounded-sm" />
            <div className="min-w-0 flex-1">
              <Esqueleto className="h-4 w-56" />
              <Esqueleto className="mt-2 h-3 w-full max-w-md" />
            </div>
          </div>
          <div className="p-5 pt-0">
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <li key={i} className="rounded-md border border-border bg-surface-2 p-3">
                  <Esqueleto className="h-2.5 w-24" />
                  <Esqueleto className="mt-2 h-6 w-16" />
                  <Esqueleto className="mt-2 h-2.5 w-full" />
                </li>
              ))}
            </ul>
          </div>
          <div className="border-t border-border px-5 py-3">
            <Esqueleto className="h-3 w-72 max-w-full" />
          </div>
        </Cartao>

        <div className="grid gap-4 lg:grid-cols-2">
          <Cartao>
            <div className="flex items-start gap-3 p-5">
              <Esqueleto className="mt-px size-4 shrink-0 rounded-sm" />
              <Esqueleto className="h-4 w-40" />
            </div>
            <div className="p-5 pt-0">
              <Esqueleto className="h-40 w-full rounded-md" />
            </div>
          </Cartao>

          <Cartao>
            <div className="flex items-start gap-3 p-5">
              <Esqueleto className="mt-px size-4 shrink-0 rounded-sm" />
              <Esqueleto className="h-4 w-44" />
            </div>
            <div className="p-5 pt-0">
              <EsqueletoTexto linhas={7} />
            </div>
          </Cartao>
        </div>

        <Cartao>
          <div className="flex items-start gap-3 p-5">
            <Esqueleto className="mt-px size-4 shrink-0 rounded-sm" />
            <div className="min-w-0 flex-1">
              <Esqueleto className="h-4 w-52" />
              <Esqueleto className="mt-2 h-3 w-full max-w-md" />
            </div>
          </div>
          <div className="p-5 pt-0">
            <Esqueleto className="h-56 w-full rounded-md" />
          </div>
        </Cartao>

        <Cartao>
          <div className="flex items-start gap-3 p-5">
            <Esqueleto className="mt-px size-4 shrink-0 rounded-sm" />
            <div className="min-w-0 flex-1">
              <Esqueleto className="h-4 w-64" />
              <Esqueleto className="mt-2 h-3 w-full max-w-md" />
            </div>
          </div>
          <div className="p-5 pt-0">
            <Esqueleto className="h-40 w-full rounded-md" />
          </div>
        </Cartao>
      </div>

      <span className="sr-only">Carregando a validação…</span>
    </div>
  );
}
