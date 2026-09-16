import { FileSpreadsheet, Satellite } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo, CartaoRodape } from "@/components/ui/cartao";
import {
  Tabela,
  TabelaCabecalho,
  TabelaCelula,
  TabelaCorpo,
  TabelaLinha,
  TabelaTitulo,
} from "@/components/ui/tabela";
import { fmt } from "@/lib/format";
import type { LevantamentoImportado } from "@/lib/levantamentos/queries";
import type { NdviAnalise, Validacao } from "@/lib/types";

const d3 = (v: number | string | null) => (v == null ? "—" : fmt.d3(Number(v)));

/** A nota de separacao numa regua de 0 a 100, e nao no 0 a 1 em que ela e
 *  calculada: "0,188" pede que o leitor saiba o que a medida e; "19" ao lado
 *  de "50 = nao separa" nao pede nada. O valor e o mesmo, so a escala muda. */
const separacao = (v: number | string | null) => (v == null ? "—" : fmt.n(Math.round(Number(v) * 100)));

/**
 * A margem do resultado: o que a pagina NAO afirma.
 *
 * Fica na tela, e nao num documento a parte, pelo motivo de sempre neste
 * projeto -- uma limitacao que so existe no relatorio nao protege ninguem que
 * esta olhando o painel. O titulo e o da propria secao; este bloco nao o
 * repete.
 */
export function Rodape({
  v,
  analises,
  importados,
}: {
  v: Validacao | null;
  analises: NdviAnalise[];
  importados: LevantamentoImportado[];
}) {
  const comAuc = analises.filter((a) => a.auc != null);
  const invertido = comAuc.length > 0 && comAuc.every((a) => Number(a.auc) < 0.5);
  const testeRocada = analises.find((a) => a.p_valor_delta != null);
  const semDiferenca = testeRocada != null && Number(testeRocada.p_valor_delta) >= 0.05;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao>
          <CartaoCorpo className="p-5">
            <ol className="grid gap-2.5">
              {limitacoes(v).map((l, i) => (
                <li key={l} className="flex gap-2.5 text-xs leading-snug text-ink-2">
                  <span aria-hidden="true" className="tnum shrink-0 font-mono text-2xs text-ink-3">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 break-words">{l}</span>
                </li>
              ))}
            </ol>
          </CartaoCorpo>
        </Cartao>

        <Cartao>
          <CartaoCabecalho
            icone={<Satellite />}
            titulo="Tentamos usar satélite. Não funcionou."
            descricao="Na última coluna, 50 significa que não separa nada e 100 que separa sempre."
          />
          <CartaoCorpo className="space-y-3">
            {analises.length === 0 ? (
              <p className="text-sm text-ink-2">Nenhum teste de satélite gravado ainda.</p>
            ) : (
              <>
                <Tabela rotulo="O quanto o satélite separa capim alto de capim baixo">
                  <TabelaCabecalho>
                    <tr>
                      <TabelaTitulo>data</TabelaTitulo>
                      <TabelaTitulo numerica>verde do capim baixo</TabelaTitulo>
                      <TabelaTitulo numerica>verde do capim alto</TabelaTitulo>
                      <TabelaTitulo numerica>separou? (0 a 100)</TabelaTitulo>
                    </tr>
                  </TabelaCabecalho>
                  <TabelaCorpo>
                    {analises.map((a) => (
                      <TabelaLinha key={a.id}>
                        <TabelaCelula>{fmt.dataMedia(a.data_alvo)}</TabelaCelula>
                        <TabelaCelula numerica className="font-mono">{d3(a.ndvi_mediana_c1)}</TabelaCelula>
                        <TabelaCelula numerica className="font-mono">{d3(a.ndvi_mediana_c3)}</TabelaCelula>
                        <TabelaCelula numerica className="font-mono font-medium">{separacao(a.auc)}</TabelaCelula>
                      </TabelaLinha>
                    ))}
                  </TabelaCorpo>
                </Tabela>

                {/* A frase le o sinal gravado, nunca e texto fixo: no dia em
                    que uma rodada nova mudar o resultado, ela para de afirmar
                    sozinha o que deixou de ser verdade. */}
                {invertido || semDiferenca ? (
                  <p className="text-xs leading-snug text-ink-2">
                    {invertido
                      ? "Saiu ao contrário: o capim mais alto aparece MENOS verde. O satélite enxerga cor, não altura — capim alto e maduro é mais seco e opaco que capim novo."
                      : null}
                    {invertido && semDiferenca ? " " : null}
                    {semDiferenca && testeRocada
                      ? "E ele também não consegue dizer onde passou a roçadeira."
                      : null}
                  </p>
                ) : null}
              </>
            )}
          </CartaoCorpo>
        </Cartao>
      </div>

      <Cartao>
        <CartaoCabecalho
          icone={<FileSpreadsheet />}
          titulo="De onde vem o que usamos para conferir"
          descricao="As planilhas que a equipe de vocês preencheu na estrada."
        />
        <CartaoCorpo>
          {importados.length === 0 ? (
            <p className="text-sm text-ink-2">Nenhuma planilha de campo entrou ainda.</p>
          ) : (
            <Tabela rotulo="Levantamentos importados">
              <TabelaCabecalho>
                <tr>
                  <TabelaTitulo>dia da caminhada</TabelaTitulo>
                  <TabelaTitulo>arquivo</TabelaTitulo>
                  <TabelaTitulo numerica>trechos</TabelaTitulo>
                  <TabelaTitulo>entrou no sistema</TabelaTitulo>
                </tr>
              </TabelaCabecalho>
              <TabelaCorpo>
                {importados.map((l) => (
                  <TabelaLinha key={l.data}>
                    <TabelaCelula>{fmt.dataMedia(l.data)}</TabelaCelula>
                    <TabelaCelula className="font-mono text-xs">{l.arquivo}</TabelaCelula>
                    <TabelaCelula numerica className="font-mono">{fmt.n(l.trechos)}</TabelaCelula>
                    <TabelaCelula>{fmt.dataMedia(l.importado_em.slice(0, 10))}</TabelaCelula>
                  </TabelaLinha>
                ))}
              </TabelaCorpo>
            </Tabela>
          )}
        </CartaoCorpo>
        {v ? (
          <CartaoRodape>
            <span className="min-w-0 break-words">
              Conferência feita em {fmt.dataMedia(v.executada_em.slice(0, 10))} · números da IA usados como
              saem, sem correção
            </span>
          </CartaoRodape>
        ) : null}
      </Cartao>
    </div>
  );
}

/** Fragmentos, nao frases, e sem termo tecnico: a lista existe para ser
 *  varrida com o olho por quem toma a decisao, nao por quem escreveu o modelo.
 *  Uma limitacao que ninguem le nao protege ninguem. */
function limitacoes(v: Validacao | null): string[] {
  return [
    "Só duas datas, as duas em março — fim do período de chuva em São Paulo.",
    "Ninguém anotou qual capim está em cada trecho. Foi suposto — e é o que mais pesa.",
    v
      ? `Também foi suposto que fazia ${fmt.n(Number(v.dias_desde_rocada_premissa))} dias da última roçada. Testamos com 30 e com 60.`
      : null,
    "A conta de \"a resposta abrangeu o real\" é generosa: a caixa do meio vai de 10 a 30 cm, e é fácil caber nela.",
    "Tentamos corrigir os números da IA por um fator. Melhorava nos trechos usados para calcular e piorava nos outros. Ficou desligado.",
    "O resultado é do Rodoanel. Em outra rodovia o método vale; o número, não.",
    "O satélite enxerga em quadrados de 10 metros. Faixa estreita some dentro do quadrado.",
  ].filter((l): l is string => l != null);
}
