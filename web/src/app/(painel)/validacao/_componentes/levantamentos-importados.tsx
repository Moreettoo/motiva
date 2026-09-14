import { FileSpreadsheet } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo, CartaoRodape } from "@/components/ui/cartao";
import { Tabela, TabelaCabecalho, TabelaCelula, TabelaCorpo, TabelaLinha, TabelaTitulo } from "@/components/ui/tabela";
import { fmt } from "@/lib/format";
import type { LevantamentoImportado } from "@/lib/levantamentos/queries";

/**
 * O portão dos dados semanais: cada planilha RA-RET que entrou, e como entra
 * a próxima. Não é "dois arquivos que um dia foram carregados" -- é o
 * mecanismo permanente de reconferência (spec §0): o importador grava cada
 * levantamento novo da Motiva sozinho e sem duplicar mesmo se rodado de novo
 * (idempotente, provado na Tarefa 13) -- essa parte É automática. Reconferir
 * a validação em `/validacao` contra o levantamento novo, porém, NÃO é: hoje
 * isso ainda pede um desenvolvedor apontar a janela nova e rodar consolidar/
 * validar/publicar à mão (`docs/operacao/importar-levantamento.md`, seção
 * 6). Dizer que a validação "roda sozinha" seria o mesmo erro que este
 * projeto persegue em outro lugar -- o ícone que caía num fallback sem
 * avisar, a calibração que teria entrado sem ser escolhida -- por isso a
 * `descricao` abaixo fala nas duas metades, a automática e a manual, em vez
 * de emprestar a certeza de uma para a outra. Duas linhas hoje é o retrato
 * honesto de um mecanismo jovem, não uma limitação escondida.
 */
export function LevantamentosImportados({ linhas }: { linhas: LevantamentoImportado[] }) {
  return (
    <Cartao>
      <CartaoCabecalho icone={<FileSpreadsheet />} titulo="Levantamentos importados" descricao="Cada caminhada da equipe da Motiva que virou dado do sistema, gravada sozinha e sem duplicar a cada levantamento novo. Reconferir a validação com ele, porém, ainda é um passo que um desenvolvedor roda à mão." />
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
