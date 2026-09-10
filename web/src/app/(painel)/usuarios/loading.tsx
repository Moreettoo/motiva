import { Esqueleto } from "@/components/ui/esqueleto";

/** Mesma silhueta do conteúdo real: cabeçalho com duas métricas, a barra de
 *  ação com o botão "Convidar" e a tabela de cinco colunas. Um retângulo
 *  genérico faria a tela pular de layout quando os dados chegassem. */
export default function CarregandoUsuarios() {
  return (
    <div role="status" aria-label="Carregando os usuários…" className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-5 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <Esqueleto className="h-11 w-44" />
        <div className="flex gap-8">
          {[0, 1].map((i) => (
            <div key={i}>
              <Esqueleto className="h-2.5 w-24" />
              <Esqueleto className="mt-2 h-5 w-10" />
            </div>
          ))}
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Esqueleto className="h-5 w-36" />
        <Esqueleto className="h-9 w-28 rounded-md" />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="flex gap-4 bg-surface-3 px-3 py-2.5">
          {["w-28", "w-20", "w-32", "w-20", "w-24"].map((largura) => (
            <Esqueleto key={largura} className={`h-3 ${largura}`} />
          ))}
        </div>
        {[0, 1, 2, 3, 4].map((linha) => (
          <div key={linha} className="flex items-center gap-4 border-t border-border px-3 py-3">
            <div className="min-w-0 flex-1">
              <Esqueleto className="h-3.5 w-40" />
              <Esqueleto className="mt-1.5 h-2.5 w-52" />
            </div>
            <Esqueleto className="h-6 w-24 rounded-full" />
            <Esqueleto className="h-3 w-28" />
            <Esqueleto className="h-6 w-20 rounded-full" />
            <Esqueleto className="h-3 w-24" />
          </div>
        ))}
      </div>

      <span className="sr-only">Carregando os usuários…</span>
    </div>
  );
}
