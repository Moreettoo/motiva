import { Satellite } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";
import { Tabela, TabelaCabecalho, TabelaCelula, TabelaCorpo, TabelaLinha, TabelaTitulo } from "@/components/ui/tabela";
import { fmt } from "@/lib/format";
import type { NdviAnalise } from "@/lib/types";

const d3 = (v: number | string | null) => (v == null ? "—" : fmt.d3(Number(v)));

/** O satélite contra a caminhada da equipe. AUC 0,5 = não separa; 1,0 = separa perfeitamente.
 *  A frase abaixo da tabela nunca é texto fixo: ela lê o sinal (AUC < 0,5 = invertido) e o
 *  teste de detecção de roçada (p do delta) direto das linhas gravadas, para nunca afirmar
 *  "o satélite funcionou" sobre uma rodada em que ele não funcionou — e para parar de afirmar
 *  isso sozinha no dia em que uma rodada nova mudar o resultado. */
export function NdviSeparacao({ analises }: { analises: NdviAnalise[] }) {
  const comAuc = analises.filter((a) => a.auc != null);
  const invertido = comAuc.length > 0 && comAuc.every((a) => Number(a.auc) < 0.5);
  const testeMobilizacao = analises.find((a) => a.p_valor_delta != null);
  const semDiferenca = testeMobilizacao && Number(testeMobilizacao.p_valor_delta) >= 0.05;

  return (
    <Cartao>
      <CartaoCabecalho icone={<Satellite />} titulo="Sentinel-2 contra a verdade de campo" descricao="NDVI mediano por segmento, máscara dos polígonos de roçada da Motiva. Classe 3 lê mais verde que classe 1?" />
      <CartaoCorpo className="space-y-4">
        {analises.length === 0 ? (
          <p className="text-sm text-ink-2">Nenhuma análise de NDVI gravada ainda. O bloco aparece quando a trilha do satélite fechar.</p>
        ) : (
          <>
            <Tabela rotulo="Separação de classes por NDVI">
              <TabelaCabecalho>
                <tr>
                  <TabelaTitulo>data-alvo</TabelaTitulo><TabelaTitulo>imagem</TabelaTitulo><TabelaTitulo>nuvem</TabelaTitulo>
                  <TabelaTitulo>NDVI classe 1</TabelaTitulo><TabelaTitulo>NDVI classe 3</TabelaTitulo><TabelaTitulo>AUC</TabelaTitulo><TabelaTitulo>p</TabelaTitulo>
                  <TabelaTitulo>ΔNDVI roçados × não</TabelaTitulo>
                </tr>
              </TabelaCabecalho>
              <TabelaCorpo>
                {analises.map((a) => (
                  <TabelaLinha key={a.id}>
                    <TabelaCelula>{fmt.dataMedia(a.data_alvo)}</TabelaCelula>
                    <TabelaCelula>{a.data_imagem ? `${fmt.dataMedia(a.data_imagem)} (${a.defasagem_dias! >= 0 ? "+" : ""}${a.defasagem_dias} d)` : a.observacoes ?? "sem imagem"}</TabelaCelula>
                    <TabelaCelula className="tnum">{a.nuvem_pct_media == null ? "—" : `${fmt.d1(Number(a.nuvem_pct_media) * 100)}%`}</TabelaCelula>
                    <TabelaCelula className="tnum">{d3(a.ndvi_mediana_c1)} <span className="text-ink-3">(n {a.n_classe1 ?? 0})</span></TabelaCelula>
                    <TabelaCelula className="tnum">{d3(a.ndvi_mediana_c3)} <span className="text-ink-3">(n {a.n_classe3 ?? 0})</span></TabelaCelula>
                    <TabelaCelula className="tnum font-semibold">{d3(a.auc)}</TabelaCelula>
                    <TabelaCelula className="tnum">{d3(a.p_valor)}</TabelaCelula>
                    <TabelaCelula className="tnum">{a.delta_rocados == null ? "—" : `${d3(a.delta_rocados)} × ${d3(a.delta_nao_rocados)} (p ${d3(a.p_valor_delta)})`}</TabelaCelula>
                  </TabelaLinha>
                ))}
              </TabelaCorpo>
            </Tabela>
            {invertido || semDiferenca ? (
              <p className="text-xs text-ink-2">
                {invertido
                  ? `AUC abaixo de 0,5 em todas as ${fmt.contar(comAuc.length, "análise gravada", "análises gravadas")}: a classe que a equipe marcou mais alta lê NDVI mais baixo, o inverso de "mais verde, mais vegetação".`
                  : null}
                {invertido && semDiferenca ? " " : null}
                {semDiferenca && testeMobilizacao
                  ? `O teste que compara NDVI antes/depois em segmentos roçados contra não roçados (${fmt.dataMedia(testeMobilizacao.data_alvo)}) não encontrou diferença (p = ${d3(testeMobilizacao.p_valor_delta)}): nesta rodada, o satélite não separa quem foi roçado de quem não foi.`
                  : null}
              </p>
            ) : null}
          </>
        )}
      </CartaoCorpo>
    </Cartao>
  );
}
