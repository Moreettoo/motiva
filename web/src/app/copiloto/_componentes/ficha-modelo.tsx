import { CloudSun, Cpu, TriangleAlert } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo, CartaoRodape } from "@/components/ui/cartao";
import { ChipRisco } from "@/components/ui/chip";
import {
  Tabela,
  TabelaCabecalho,
  TabelaCelula,
  TabelaCorpo,
  TabelaLinha,
  TabelaTitulo,
} from "@/components/ui/tabela";
import { ORDEM_RISCO, riscoPorPrazo } from "@/lib/dominio";
import type { Risco } from "@/lib/types";

/**
 * Ficha do sistema — o que gera confianca nao e a resposta bonita, e o gestor
 * saber de onde ela veio.
 */

/** Entradas do modelo, com o nome tecnico que aparece no `.pkl` e no log. */
const FEATURES = [
  { rotulo: "Temperatura média", campo: "temperatura_media_c" },
  { rotulo: "Umidade média", campo: "umidade_media_pct" },
  { rotulo: "Precipitação", campo: "precipitacao_total_mm" },
  { rotulo: "Radiação solar", campo: "radiacao_media_mj_m2" },
  { rotulo: "Evapotranspiração", campo: "et0_medio_mm_dia" },
  { rotulo: "Balanço hídrico", campo: "balanco_hidrico_chuva_sobre_et0" },
  { rotulo: "Latitude", campo: "latitude" },
  { rotulo: "Altura inicial", campo: "altura_inicial_cm" },
  { rotulo: "Mês", campo: "mes" },
  { rotulo: "Espécie", campo: "especie_cod" },
  { rotulo: "UF", campo: "uf_cod" },
];

const LIMITACOES = [
  "A altura de hoje é extrapolada, não medida: é a última medição mais o crescimento previsto vezes os dias decorridos.",
  "Medição velha acumula erro. Quanto mais antiga a visita ao trecho, mais a altura atual é estimativa em cima de estimativa.",
  "A análise em lote só chama a LLM para trechos a menos de 45 dias do limite. Trecho folgado ganha previsão, mas não ganha agendamento — o silêncio ali é economia, não ausência de risco.",
  "O copiloto lê apenas agendamentos: rodovia, km, UF, prioridade, data e justificativa. Medição, altura, crescimento e escala de equipe ficam fora da pergunta.",
];

/** Teto da sondagem que descobre as faixas. Precisa passar do último corte. */
const TETO_SONDAGEM = 90;

/**
 * As faixas da tabela saem de `riscoPorPrazo`, e nao de uma copia escrita a mao.
 * Se a regra mudar em `@/lib/dominio`, esta tabela muda junto — que e o unico
 * jeito de a explicacao nunca mentir sobre o que o sistema faz.
 */
function faixasDePrazo(): Map<Risco, { min: number; max: number }> {
  const faixas = new Map<Risco, { min: number; max: number }>();

  for (let dias = 0; dias <= TETO_SONDAGEM; dias++) {
    const risco = riscoPorPrazo(dias);
    const faixa = faixas.get(risco);
    if (faixa) faixa.max = dias;
    else faixas.set(risco, { min: dias, max: dias });
  }

  return faixas;
}

function rotuloFaixa(faixa: { min: number; max: number }): string {
  if (faixa.max >= TETO_SONDAGEM) return `mais de ${faixa.min - 1} dias`;
  if (faixa.min === 0) return `até ${faixa.max} dias, ou já acima do limite`;
  return `${faixa.min} a ${faixa.max} dias`;
}

export function FichaModelo({ modeloLlm }: { modeloLlm: string | null }) {
  const faixas = faixasDePrazo();

  return (
    <Cartao>
      <CartaoCabecalho
        icone={<Cpu />}
        titulo="Ficha do modelo"
        descricao="Duas IAs com papéis separados, e o que cada uma não faz."
      />

      <CartaoCorpo className="space-y-6">
        <section>
          <h3 className="text-2xs tracking-widest text-ink-3 uppercase">Divisão de trabalho</h3>

          <ol className="mt-3 space-y-4">
            <li className="border-l-2 border-border-strong pl-3">
              <p className="tnum font-mono text-2xs text-ink-3">IA 1 · regressão</p>
              <p className="mt-1 text-sm font-medium text-ink">Quanto a vegetação cresce</p>
              <p className="mt-1 text-xs text-ink-2">
                Modelo de <em className="not-italic">gradient boosting</em> treinado em histórico de
                campo e serializado em{" "}
                <span className="font-mono text-ink-3">modelo_vegetacao.pkl</span>. Devolve o
                crescimento em cm/dia. É determinístico: mesma entrada, mesma saída, sem chamar a
                OpenAI.
              </p>
            </li>

            <li className="border-l-2 border-border-strong pl-3">
              <p className="tnum font-mono text-2xs text-ink-3">IA 2 · linguagem</p>
              <p className="mt-1 text-sm font-medium text-ink">Quando roçar, e por quê</p>
              <p className="mt-1 text-xs text-ink-2">
                Recebe o cm/dia já calculado e{" "}
                <strong className="font-medium text-ink">não recalcula o número</strong>. Lê as
                observações do trecho — curva fechada, reclamação no 0800, risco de incêndio, janela
                seca — escolhe a data e escreve a justificativa.
              </p>
            </li>
          </ol>
        </section>

        <section>
          <h3 className="text-2xs tracking-widest text-ink-3 uppercase">
            O que entra no modelo de crescimento
          </h3>

          {/* Rótulo à esquerda, nome técnico à direita: lê como ficha de
              instrumento, e o nome inteiro cabe sem truncar — cortado, ele
              deixaria de servir para achar a coluna no log ou no `.pkl`. */}
          <ul className="mt-3 flex flex-col gap-1.5">
            {FEATURES.map((feature) => (
              <li key={feature.campo} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 shrink-0 text-xs text-ink">{feature.rotulo}</span>
                <span aria-hidden="true" className="h-px min-w-3 flex-1 bg-border" />
                <span className="font-mono text-2xs break-words text-ink-3">{feature.campo}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="text-2xs tracking-widest text-ink-3 uppercase">Regra de prioridade</h3>
          <p className="mt-2 text-xs text-ink-2">
            Sai do prazo calculado, não do texto da LLM. A LLM pode discordar da data, mas não muda
            a faixa.
          </p>

          <Tabela rotulo="Faixas de prioridade por prazo até o limite" className="mt-3 bg-surface-2">
            <TabelaCabecalho>
              <tr>
                <TabelaTitulo>Prioridade</TabelaTitulo>
                <TabelaTitulo>Prazo até o limite</TabelaTitulo>
              </tr>
            </TabelaCabecalho>
            <TabelaCorpo>
              {ORDEM_RISCO.map((risco) => {
                const faixa = faixas.get(risco);
                return (
                  <TabelaLinha key={risco}>
                    <TabelaCelula>
                      <ChipRisco risco={risco} tamanho="sm" />
                    </TabelaCelula>
                    <TabelaCelula className="text-xs text-ink-2">
                      {faixa ? rotuloFaixa(faixa) : "—"}
                    </TabelaCelula>
                  </TabelaLinha>
                );
              })}
            </TabelaCorpo>
          </Tabela>

          <p className="mt-2 text-2xs text-ink-3">
            Trecho com crescimento previsto perto de zero também cai em Baixa: sem crescimento, não
            há prazo.
          </p>
        </section>

        <section>
          <h3 className="flex items-center gap-1.5 text-2xs tracking-widest text-ink-3 uppercase">
            <CloudSun aria-hidden="true" className="size-3.5 shrink-0" />
            Fonte do clima
          </h3>
          <p className="mt-2 text-xs text-ink-2">
            Open-Meteo, previsão diária de 16 dias, sem chave de API. A consulta é feita uma vez por
            zona climática de km — a rodovia é uma linha, então trechos vizinhos compartilham o mesmo
            tempo e uma chamada serve a todos.
          </p>
        </section>

        <section className="rounded-md border border-border bg-surface-2 p-3">
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-warning-ink">
            <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
            Limitações conhecidas
          </h3>

          <ol className="mt-2.5 space-y-2">
            {LIMITACOES.map((limitacao, i) => (
              <li key={limitacao} className="flex gap-2.5 text-xs text-ink-2">
                <span aria-hidden="true" className="tnum shrink-0 font-mono text-2xs text-ink-3">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 break-words">{limitacao}</span>
              </li>
            ))}
          </ol>
        </section>
      </CartaoCorpo>

      <CartaoRodape>
        <span className="min-w-0 break-words">
          {modeloLlm ? (
            <>
              Decisão da data e da justificativa por{" "}
              <span className="font-mono text-ink-2">{modeloLlm}</span>, conforme registrado no
              último agendamento.
            </>
          ) : (
            "Nenhum agendamento na base registra qual modelo decidiu a data."
          )}
        </span>
      </CartaoRodape>
    </Cartao>
  );
}
