import { Esqueleto } from "@/components/ui/esqueleto";

/** Larguras irregulares para as barras do mini-mapa de 28 dias: uma fileira de
 *  barras iguais não lê como gráfico. */
const ALTURAS_MAPA = ["h-3", "h-6", "h-8", "h-4", "h-7", "h-5", "h-9"];

/** Quais dias de cada linha de equipe já têm um cartão, larguras/posições
 *  irregulares de propósito, mesma razão de sempre: uma coluna de células
 *  idênticas não lê como quadro em uso. */
const CARTOES_POR_LINHA = [
  [1, 4],
  [0, 2, 5],
  [3],
];

/** Mesma silhueta do conteúdo real: cabeçalho, controles, faixa de números e o
 *  quadro da semana: navegação, mini-mapa de 28 dias, trilho da fila à
 *  esquerda e a calha de equipes + 7 dias à direita. Um retângulo cinza
 *  genérico faria a tela pular de layout quando os dados chegassem. */
export default function CarregandoAgenda() {
  return (
    <div role="status" aria-label="Carregando a agenda…" className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-5 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Esqueleto className="h-11 w-40" />
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
        <div className="flex flex-wrap items-center gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <Esqueleto key={i} className="h-8 w-24 rounded-md" />
          ))}
        </div>
        <Esqueleto className="h-8 w-44 rounded-md" />
      </div>

      <div className="grid grid-cols-2 rounded-lg border border-border bg-surface lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={i === 0 ? "p-3" : "border-l border-border p-3"}>
            <Esqueleto className="h-2.5 w-24" />
            <Esqueleto className="mt-2.5 h-5 w-14" />
            <Esqueleto className="mt-2 h-2.5 w-28" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Esqueleto className="size-8 rounded-md" />
            <Esqueleto className="h-5 w-36" />
            <Esqueleto className="size-8 rounded-md" />
            <Esqueleto className="h-8 w-16 rounded-md" />
          </div>
          <Esqueleto className="h-5 w-52" />
        </div>

        <div className="rounded-md border border-border bg-surface p-3">
          <div className="flex items-end gap-px">
            {Array.from({ length: 28 }, (_, i) => (
              <Esqueleto
                key={i}
                className={`${ALTURAS_MAPA[i % ALTURAS_MAPA.length]} flex-1 rounded-t-xs`}
              />
            ))}
          </div>
        </div>

        <div className="flex min-w-0 overflow-hidden rounded-lg border border-border bg-surface">
          <div className="hidden w-60 shrink-0 border-r border-border lg:block">
            <div className="border-b border-border p-3">
              <Esqueleto className="h-3.5 w-24" />
              <Esqueleto className="mt-1.5 h-2.5 w-full" />
            </div>
            <div className="flex flex-col gap-1.5 p-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded-md border border-border p-2">
                  <Esqueleto className="h-3 w-28" />
                  <Esqueleto className="mt-1.5 h-2.5 w-20" />
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex border-b border-border">
              <Esqueleto className="h-12 w-36 shrink-0 rounded-none" />
              <div className="flex min-w-0 flex-1 gap-px overflow-hidden">
                {Array.from({ length: 7 }, (_, i) => (
                  <Esqueleto key={i} className="h-12 flex-1 rounded-none" />
                ))}
              </div>
            </div>

            {CARTOES_POR_LINHA.map((diasComCartao, linha) => (
              <div key={linha} className="flex border-b border-border last:border-b-0">
                <div className="w-36 shrink-0 border-r border-border p-2.5">
                  <Esqueleto className="h-3 w-20" />
                  <Esqueleto className="mt-1.5 h-2.5 w-16" />
                </div>
                <div className="flex min-w-0 flex-1 gap-px">
                  {Array.from({ length: 7 }, (_, dia) => (
                    <div key={dia} className="min-h-16 min-w-0 flex-1 p-1.5">
                      {diasComCartao.includes(dia) ? <Esqueleto className="h-12 rounded-sm" /> : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <span className="sr-only">Carregando a agenda…</span>
    </div>
  );
}
