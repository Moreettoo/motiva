import type { Metadata } from "next";
import { FlaskConical } from "lucide-react";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";
import { Chip } from "@/components/ui/chip";

// Imports que so o cartao `ComoFunciona` usava, desativados junto com ele.
// import { Brain, CloudSun, Sparkles } from "lucide-react";
// import { DIAS_DE_PREVISAO } from "@/lib/clima";
// import { ESPECIE } from "@/lib/dominio";
// import { fmt } from "@/lib/format";
// import { METRICAS } from "@/lib/modelo/arvores";
// import { ESPECIES } from "@/lib/types";

import { Formulario } from "./_componentes/formulario";
import { interpretar } from "./_componentes/parametros";
import { Resultado } from "./_componentes/resultado";

export const metadata: Metadata = {
  title: "Simulador",
  description:
    "Escolha a espécie, um ponto no mapa, a altura de hoje e quantos dias deixar crescendo. " +
    "O painel busca o clima real do ponto, roda o modelo de crescimento e pede a leitura da IA.",
};

/**
 * Pagina experimental: o fluxo de IA do produto, rodando sobre um ponto
 * qualquer do mapa em vez de um trecho cadastrado.
 *
 * Nao escreve NADA no banco. So le `ia.trechos`, para achar o trecho mais
 * proximo do ponto, que e de onde saem a UF que o modelo pede e o limite de
 * altura contra o qual a IA 2 decide.
 */
export default async function PaginaSimulador({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // `tentou` so alimentava o cartao `ComoFunciona`, desativado abaixo. Os erros
  // de validacao continuam aparecendo campo a campo, dentro do formulario.
  const { pedido, valores, erros } = interpretar(await searchParams);

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 lg:gap-8">
      <CabecalhoPagina
        titulo="Simulador"
        descricao="O mesmo fluxo de IA do painel, aplicado a um ponto qualquer do mapa: clima real, modelo de crescimento e a decisão da LLM."
        acoes={
          <Chip tom="acento" icone={<FlaskConical />}>
            Experimental
          </Chip>
        }
      />

      <Cartao>
        {/* O `[&_h2]` alcanca o titulo dentro do cabecalho, `className` cai no
            <header>, e `text-base` do proprio h2 ganharia de uma classe herdada.
            `text-lg` e nao `text-xl` para nao empatar com o h1 da pagina. */}
        <CartaoCabecalho titulo="Insira seus dados" className="[&_h2]:text-lg" />
        <CartaoCorpo>
          <Formulario valores={valores} erros={erros} />
        </CartaoCorpo>
      </Cartao>

      {pedido ? <Resultado pedido={pedido} /> : null}
      {/* {pedido ? <Resultado pedido={pedido} /> : <ComoFunciona tentou={tentou} />} */}
    </div>
  );
}

/*
 * Cartao "Como a simulação funciona": desativado a pedido, mantido aqui para
 * poder voltar. Mostrava os tres passos do fluxo (Open-Meteo → IA 1 → IA 2) e o
 * rodape das especies, no lugar do resultado enquanto nada tinha sido simulado.
 *
function ComoFunciona({ tentou }: { tentou: boolean }) {
  const passos = [
    {
      icone: <CloudSun aria-hidden="true" className="size-4" />,
      titulo: "Open-Meteo",
      texto: `Previsão diária de temperatura, umidade, chuva, radiação e evapotranspiração para a coordenada exata. A previsão cobre ${DIAS_DE_PREVISAO} dias; períodos maiores são completados com a média observada dos mesmos dias do calendário em anos anteriores.`,
    },
    {
      icone: <Brain aria-hidden="true" className="size-4" />,
      titulo: "IA 1 · modelo de crescimento",
      texto: `Regressão treinada em histórico de campo, R² de ${fmt.d3(
        METRICAS.r2,
      )} e erro médio de ${fmt.d3(METRICAS.mae)} cm/dia no conjunto de teste. Recebe clima, espécie, UF, latitude, mês, altura inicial e tamanho do período, e responde quantos centímetros por dia. Determinística e barata: roda aqui mesmo, sem chamar ninguém.`,
    },
    {
      icone: <Sparkles aria-hidden="true" className="size-4" />,
      titulo: "IA 2 · decisão",
      texto: "A LLM recebe o número pronto e não recalcula. Ela decide quando roçar, com que prioridade e escreve a justificativa, o mesmo papel que tem no lote que roda todo dia às 06:00.",
    },
  ];

  return (
    <Cartao>
      <CartaoCabecalho
        titulo={tentou ? "Corrija os campos acima para rodar" : "Como a simulação funciona"}
        descricao={
          tentou
            ? "Nada foi simulado ainda: algum campo não passou na validação."
            : "Duas IAs com papéis separados, de propósito. Uma responde quanto cresce; a outra, quando roçar."
        }
      />
      <CartaoCorpo>
        <ol className="flex flex-col gap-5">
          {passos.map((passo, i) => (
            <li key={passo.titulo} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-3 text-ink-2"
              >
                {passo.icone}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  <span className="tnum mr-1.5 font-mono text-2xs text-ink-3">{i + 1}</span>
                  {passo.titulo}
                </p>
                <p className="mt-1 max-w-prose text-xs leading-relaxed text-ink-2">{passo.texto}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-6 border-t border-border pt-4 text-xs text-ink-3">
          Espécies disponíveis: {ESPECIES.map((e) => ESPECIE[e].rotulo).join(", ")}, são as três que
          o modelo viu no treino. Nada nesta página é gravado no banco.
        </p>
      </CartaoCorpo>
    </Cartao>
  );
}
*/
