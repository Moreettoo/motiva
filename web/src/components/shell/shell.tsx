import { ProvedorNotificacoes } from "@/components/ui/notificacoes";
import { fmt } from "@/lib/format";
import { listarTrechos } from "@/lib/queries";
import { cn } from "@/lib/utils";

import { BarraLateral } from "./barra-lateral";
import { BarraSuperior } from "./barra-superior";
import { NavegacaoMovel } from "./navegacao-movel";
import type { TrechoNaPaleta } from "./paleta-comandos";

/** `previsto_em` chega como data pura em alguns casos e como carimbo completo em
 *  outros. `new Date()` numa data pura voltaria um dia no Brasil — daí o `fmt`. */
function formatarCarimbo(iso: string): string {
  const soData = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return soData ? fmt.dataCurta(iso) : `${fmt.dataCurta(iso)} · ${fmt.horaMin(iso)}`;
}

type DadosDoCasco = { trechos: TrechoNaPaleta[]; ultimaAnalise: string | null };

async function carregarCasco(): Promise<DadosDoCasco> {
  try {
    const trechos = await listarTrechos();

    const previsoes = trechos.map((t) => t.previsto_em).filter((v): v is string => v != null);
    const maisRecente = previsoes.length ? previsoes.reduce((a, b) => (a > b ? a : b)) : null;

    return {
      trechos: trechos.map((t) => ({
        id: t.id,
        rodovia: t.rodovia,
        km_inicio: Number(t.km_inicio),
        km_fim: Number(t.km_fim),
        uf: t.uf,
        risco: t.risco,
      })),
      ultimaAnalise: maisRecente ? formatarCarimbo(maisRecente) : null,
    };
  } catch {
    // O casco envolve TODAS as telas: se o banco tropeça, a moldura continua de
    // pé e quem reporta o erro é a página, que sabe o que estava tentando ler.
    return { trechos: [], ultimaAnalise: null };
  }
}

export async function Shell({ children }: { children: React.ReactNode }) {
  const { trechos, ultimaAnalise } = await carregarCasco();

  return (
    <ProvedorNotificacoes>
      <div className="flex min-h-dvh">
        <BarraLateral ultimaAnalise={ultimaAnalise} />

        <div className="flex min-w-0 flex-1 flex-col">
          <BarraSuperior trechos={trechos} carimbo={ultimaAnalise} />

          <main
            id="conteudo"
            tabIndex={-1}
            className="flex-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          >
            {/* Monitor de sala de controle: a largura máxima é generosa de
                propósito, mas não infinita — linha de texto longa demais cansa. */}
            <div
              className={cn(
                "mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8",
                // Folga para a barra inferior do celular não cobrir o último bloco.
                "pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-8",
              )}
            >
              {children}
            </div>
          </main>

          <NavegacaoMovel />
        </div>
      </div>
    </ProvedorNotificacoes>
  );
}
