import { ProvedorNotificacoes } from "@/components/ui/notificacoes";
import type { Sessao } from "@/lib/auth/sessao";
import { contarNaoLidas, listarNotificacoes } from "@/lib/chamados/queries";
import { fmt } from "@/lib/format";
import { listarTrechos } from "@/lib/queries";
import type { Notificacao } from "@/lib/types";
import { cn } from "@/lib/utils";

import { BarraLateral } from "./barra-lateral";
import { BarraSuperior } from "./barra-superior";
import { NavegacaoMovel } from "./navegacao-movel";
import type { TrechoNaPaleta } from "./paleta-comandos";

/** `previsto_em` chega como data pura em alguns casos e como carimbo completo em
 *  outros. `new Date()` numa data pura voltaria um dia no Brasil, daí o `fmt`. */
function formatarCarimbo(iso: string): string {
  const soData = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return soData ? fmt.dataCurta(iso) : `${fmt.dataCurta(iso)} · ${fmt.horaMin(iso)}`;
}

type DadosDoCasco = {
  trechos: TrechoNaPaleta[];
  ultimaAnalise: string | null;
  naoLidas: number;
  notificacoes: Notificacao[];
};

/** O que a moldura mostra em toda tela. Zerado quando o banco tropeça, ver o
 *  `catch`: um sino sem contagem é melhor que um painel que não abre. */
const CASCO_VAZIO: DadosDoCasco = {
  trechos: [],
  ultimaAnalise: null,
  naoLidas: 0,
  notificacoes: [],
};

async function carregarCasco(usuarioId: string): Promise<DadosDoCasco> {
  try {
    /* Em paralelo, e não em série: são três consultas independentes que
       atrasariam a PRIMEIRA pintura de toda página do painel se enfileiradas.
       Dentro do mesmo `try` porque o destino delas é o mesmo — a moldura. */
    const [trechos, naoLidas, notificacoes] = await Promise.all([
      listarTrechos(),
      contarNaoLidas(usuarioId),
      listarNotificacoes(usuarioId),
    ]);

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
      naoLidas,
      notificacoes,
    };
  } catch (e) {
    // O casco envolve TODAS as telas: se o banco tropeça, a moldura continua de
    // pé e quem reporta o erro é a página, que sabe o que estava tentando ler.
    //
    // Mas o silêncio era completo: o sino passava a dizer "0 não lidas" — que é
    // uma afirmação, não uma ausência — e a paleta ficava vazia, sem deixar
    // rastro em lugar nenhum. A moldura continua de pé; o log é para quem
    // depois pergunta por que o sino zerou.
    console.error("[casco] falha ao carregar a moldura do painel", e);
    return CASCO_VAZIO;
  }
}

export async function Shell({ sessao, children }: { sessao: Sessao; children: React.ReactNode }) {
  const { trechos, ultimaAnalise, naoLidas, notificacoes } = await carregarCasco(sessao.usuarioId);

  return (
    <ProvedorNotificacoes>
      <div className="flex min-h-dvh">
        <BarraLateral cargo={sessao.cargo} ultimaAnalise={ultimaAnalise} />

        <div className="flex min-w-0 flex-1 flex-col">
          <BarraSuperior
            trechos={trechos}
            cargo={sessao.cargo}
            naoLidas={naoLidas}
            notificacoes={notificacoes}
            usuario={{ nome: sessao.nome, cargo: sessao.cargo }}
          />

          <main
            id="conteudo"
            tabIndex={-1}
            className="flex-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          >
            {/* Monitor de sala de controle: a largura máxima é generosa de
                propósito, mas não infinita, linha de texto longa demais cansa.
                `flex h-full flex-col` é inerte pra quem não pede: uma página
                comum preenche por conteúdo como sempre preencheu. Só quem
                marca a própria raiz com `flex-1` (o copiloto, pra crescer até
                o rodapé) passa a receber a altura de verdade que `main` já
                calculava por baixo. */}
            <div
              className={cn(
                "mx-auto flex h-full w-full max-w-[1600px] flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-8",
                // Folga para a barra inferior do celular não cobrir o último bloco.
                "pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-8",
              )}
            >
              {children}
            </div>
          </main>

          <NavegacaoMovel cargo={sessao.cargo} />
        </div>
      </div>
    </ProvedorNotificacoes>
  );
}
