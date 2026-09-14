import { FileSpreadsheet } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo, CartaoRodape } from "@/components/ui/cartao";
import { Tabela, TabelaCabecalho, TabelaCelula, TabelaCorpo, TabelaLinha, TabelaTitulo } from "@/components/ui/tabela";
import { fmt } from "@/lib/format";
import type { LevantamentoImportado } from "@/lib/levantamentos/queries";

/**
 * O portão dos dados semanais: cada planilha RA-RET que entrou, e como entra
 * a próxima. Não é "dois arquivos que um dia foram carregados" -- é o
 * mecanismo permanente de reconferência (spec §0): toda semana que a Motiva
 * caminha o Rodoanel de novo, uma linha nova aparece aqui e a validação em
 * `/validacao` volta a rodar contra ela. Duas linhas hoje é o retrato honesto
 * de um mecanismo jovem, não uma limitação escondida.
 */
export function LevantamentosImportados({ linhas }: { linhas: LevantamentoImportado[] }) {
  return (
    <Cartao>
      <CartaoCabecalho icone={<FileSpreadsheet />} titulo="Levantamentos importados" descricao="Cada caminhada da equipe da Motiva que virou dado do sistema. A próxima vira par de validação sozinha." />
      <CartaoCorpo>
        <Tabela rotulo="Levantamentos importados">
          <TabelaCabecalho>
            <tr><TabelaTitulo>data do levantamento</TabelaTitulo><TabelaTitulo>arquivo</TabelaTitulo><TabelaTitulo>trechos</TabelaTitulo><TabelaTitulo>importado em</TabelaTitulo></tr>
          </TabelaCabecalho>
          <TabelaCorpo>
            {linhas.map((l) => (
              <TabelaLinha key={l.data}>
                <TabelaCelula>{fmt.dataMedia(l.data)}</TabelaCelula>
                <TabelaCelula className="font-mono text-xs">{l.arquivo}</TabelaCelula>
                <TabelaCelula className="tnum">{fmt.n(l.trechos)}</TabelaCelula>
                <TabelaCelula>{fmt.dataMedia(l.importado_em.slice(0, 10))}</TabelaCelula>
              </TabelaLinha>
            ))}
          </TabelaCorpo>
        </Tabela>
      </CartaoCorpo>
      <CartaoRodape>
        <span className="min-w-0 break-words">
          Para importar o próximo: <span className="font-mono">python -m pesquisa.importar_levantamento --xlsx RA-RET-ROÇ-LIMP-AAAA-MM-DD.xlsx --anterior &lt;o anterior&gt; --gravar</span>. Procedimento em <span className="font-mono">docs/operacao/importar-levantamento.md</span>.
        </span>
      </CartaoRodape>
    </Cartao>
  );
}
