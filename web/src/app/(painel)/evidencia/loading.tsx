import { Cartao } from "@/components/ui/cartao";
import { Esqueleto } from "@/components/ui/esqueleto";

/** Mesma silhueta do conteudo real: cabecalho, a faixa de quatro numeros e os
 *  tres atos. Um bloco cinza generico faria a pagina saltar quando os graficos
 *  chegassem -- e aqui eles chegam altos. */
export default function CarregandoEvidencia() {
  return (
    <div role="status" aria-label="Carregando a evidência…" className="flex flex-col gap-10">
      <div className="border-b border-border pb-5">
        <Esqueleto className="h-7 w-40" />
        <Esqueleto className="mt-2.5 h-4 w-full max-w-prose" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Cartao key={i} className="p-4">
            <Esqueleto className="h-2.5 w-24" />
            <Esqueleto className="mt-3 h-8 w-28" />
            <Esqueleto className="mt-3 h-3 w-full" />
          </Cartao>
        ))}
      </div>

      {[0, 1, 2].map((ato) => (
        <div key={ato} className="grid gap-5">
          <div>
            <Esqueleto className="h-6 w-56" />
            <Esqueleto className="mt-1.5 h-4 w-80 max-w-full" />
          </div>
          <Cartao className="p-5">
            <Esqueleto className="h-4 w-48" />
            <Esqueleto className="mt-4 h-[220px] w-full rounded-md" />
          </Cartao>
        </div>
      ))}
    </div>
  );
}
