import { fmt } from "@/lib/format";
import { barrasDaProva } from "@/lib/modelo/prova-treino";

/**
 * O erro do treino desenhado contra a regua da Motiva.
 *
 * Um numero sozinho nao tem tamanho: "1,29 cm" so quer dizer alguma coisa ao
 * lado do degrau que ele precisa nao atravessar. As tres barras dividem UMA
 * escala -- e por isso que a lasca do erro se le sem legenda nenhuma.
 *
 * Servidor: nao ha hover, nao ha estado. O desenho e a frase inteira.
 */
export function ReguaErro({ erroCm }: { erroCm: number }) {
  const barras = barrasDaProva(erroCm);

  return (
    <div className="flex flex-col gap-3">
      {barras.map((b) => (
        <div
          key={b.chave}
          className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto]"
        >
          <span
            className={
              b.destaque
                ? "text-sm font-medium text-ink"
                : "text-sm text-ink-3"
            }
          >
            {b.rotulo}
          </span>

          {/* O trilho carrega a escala; a barra, o valor. Sem trilho as tres
              barras flutuariam e a comparacao dependeria de medir com o olho
              onde cada uma comeca. */}
          <span
            className="block h-3.5 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: "var(--surface-3)" }}
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${b.larguraPct}%`,
                backgroundColor: b.destaque ? "var(--accent)" : "var(--border-strong)",
              }}
            />
          </span>

          <span
            className={
              b.destaque
                ? "tnum font-mono text-sm font-semibold whitespace-nowrap text-ink"
                : "tnum font-mono text-sm whitespace-nowrap text-ink-3"
            }
          >
            {b.chave === "erro" ? `${fmt.d2(b.valorCm)} cm` : `${fmt.n(b.valorCm)} cm`}
          </span>
        </div>
      ))}
    </div>
  );
}
