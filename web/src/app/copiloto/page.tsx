import type { Metadata } from "next";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { lacunasDeDados, listarAgendamentos, listarTrechos, montarPainel } from "@/lib/queries";

import { Conversa } from "./_componentes/conversa";
import { FichaModelo } from "./_componentes/ficha-modelo";
import { QualidadeDados } from "./_componentes/qualidade-dados";
import { montarSugestoes } from "./_componentes/sugestoes";
import { TransparenciaSistema } from "./_componentes/transparencia-sistema";

export const metadata: Metadata = {
  title: "Copiloto",
  description:
    "Perguntas em português sobre a malha, com a ficha do modelo e a qualidade dos dados que sustentam a resposta.",
};

/** `POST /perguntar` monta o contexto com os 60 agendamentos mais recentes. */
const TETO_CONTEXTO = 60;

export default async function PaginaCopiloto() {
  const [painel, trechos, agendamentos, lacunas] = await Promise.all([
    montarPainel(),
    listarTrechos(),
    listarAgendamentos(),
    lacunasDeDados(),
  ]);

  const escopo = Math.min(TETO_CONTEXTO, agendamentos.length);
  const sugestoes = montarSugestoes(trechos, agendamentos);

  // O modelo da ficha vem do que a base registrou, nao de uma constante: se a
  // variavel de ambiente do backend mudar, a tela conta a verdade sozinha.
  const modeloLlm =
    [...agendamentos]
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
      .find((a) => a.modelo_usado)?.modelo_usado ?? null;

  // O cabeçalho mantém a largura cheia (título + ícone de transparência) e
  // altura de conteúdo (`shrink-0`); a conversa, sem mais coluna lateral ao
  // lado, cresce (`flex-1`) até o rodapé da tela, é o `Shell` que já mede
  // essa altura, essa página só precisa pedir pra usá-la.
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1120px] flex-1 flex-col gap-6 lg:gap-8">
      <CabecalhoPagina
        titulo="Copiloto"
        destaque
        className="shrink-0"
        acoes={
          <TransparenciaSistema>
            <QualidadeDados lacunas={lacunas} total={painel.trechos_total} />
            <FichaModelo modeloLlm={modeloLlm} />
          </TransparenciaSistema>
        }
      />

      <Conversa sugestoes={sugestoes} escopo={escopo} />
    </div>
  );
}
