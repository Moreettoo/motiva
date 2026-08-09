import type { Metadata } from "next";

import { CabecalhoPagina, MetricaCabecalho } from "@/components/shell/cabecalho-pagina";
import { fmt } from "@/lib/format";
import { lacunasDeDados, listarAgendamentos, listarTrechos, montarPainel } from "@/lib/queries";

import { Conversa } from "./_componentes/conversa";
import { FichaModelo } from "./_componentes/ficha-modelo";
import { QualidadeDados } from "./_componentes/qualidade-dados";
import { montarSugestoes } from "./_componentes/sugestoes";

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

  const comprometidos = new Set(
    [...lacunas.semPrevisao, ...lacunas.semMedicao, ...lacunas.medicaoVelha].map((t) => t.id),
  );
  const cobertura = painel.trechos_total
    ? ((painel.trechos_total - comprometidos.size) / painel.trechos_total) * 100
    : 0;

  // A tela é de leitura: acima de ~1120px a coluna da conversa pararia de
  // crescer e sobraria um vão morto entre ela e a lateral de transparência.
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 lg:gap-8">
      <CabecalhoPagina
        titulo="Copiloto"
        descricao="Pergunte em português sobre o planejamento de roçada. Esta tela também mostra o que o sistema sabe e o que ele não sabe — a resposta só vale o dado que existe atrás dela."
        metricas={
          <>
            <MetricaCabecalho rotulo="Malha" valor={fmt.n(painel.trechos_total)} unidade="trechos" />
            <MetricaCabecalho
              rotulo="Janela do copiloto"
              valor={fmt.n(escopo)}
              unidade="agendamentos"
            />
            <MetricaCabecalho rotulo="Leitura confiável" valor={fmt.pct(cobertura)} />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_23rem] xl:gap-8">
        <Conversa sugestoes={sugestoes} escopo={escopo} />

        <aside aria-label="Transparência do sistema" className="flex min-w-0 flex-col gap-6">
          <QualidadeDados lacunas={lacunas} total={painel.trechos_total} />
          <FichaModelo modeloLlm={modeloLlm} />
        </aside>
      </div>
    </div>
  );
}
