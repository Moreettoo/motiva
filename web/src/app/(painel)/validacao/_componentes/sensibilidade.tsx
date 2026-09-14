import { SlidersHorizontal } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";
import { Tabela, TabelaCabecalho, TabelaCelula, TabelaCorpo, TabelaLinha, TabelaTitulo } from "@/components/ui/tabela";
import { fmt } from "@/lib/format";
import type { Validacao } from "@/lib/types";

function j(v: Validacao): number | null {
  const tt = Number(v.transicoes_total ?? 0), et = Number(v.estaveis_total ?? 0);
  if (!tt || !et) return null;
  return Number(v.transicoes_detectadas ?? 0) / tt - Number(v.alarmes_falsos ?? 0) / et;
}

/** As variações das premissas, sem calibração: o quanto o resultado depende do que assumimos. */
export function Sensibilidade({ linhas }: { linhas: Validacao[] }) {
  if (linhas.length === 0) return null;
  return (
    <Cartao>
      <CartaoCabecalho icone={<SlidersHorizontal />} titulo="Sensibilidade às premissas" descricao="Espécie, altura da classe 3 e dias desde a roçada variados um a um, sem calibração." />
      <CartaoCorpo>
        <Tabela rotulo="Sensibilidade da validação às premissas">
          <TabelaCabecalho>
            <tr>
              <TabelaTitulo>espécie</TabelaTitulo><TabelaTitulo>classe 3</TabelaTitulo><TabelaTitulo>roçada há</TabelaTitulo>
              <TabelaTitulo>acurácia</TabelaTitulo><TabelaTitulo>transições</TabelaTitulo><TabelaTitulo>alarmes</TabelaTitulo><TabelaTitulo>J</TabelaTitulo>
            </tr>
          </TabelaCabecalho>
          <TabelaCorpo>
            {linhas.map((v) => (
              <TabelaLinha key={v.id}>
                <TabelaCelula>{v.especie}</TabelaCelula>
                <TabelaCelula className="tnum">{fmt.cm(Number(v.ponto_medio_classe3_cm))}</TabelaCelula>
                <TabelaCelula className="tnum">{fmt.contar(Number(v.dias_desde_rocada_premissa), "dia")}</TabelaCelula>
                <TabelaCelula className="tnum">{v.acuracia_classe == null ? "—" : `${fmt.d1(Number(v.acuracia_classe) * 100)}%`}</TabelaCelula>
                <TabelaCelula className="tnum">{fmt.n(v.transicoes_detectadas ?? 0)} de {fmt.n(v.transicoes_total ?? 0)}</TabelaCelula>
                <TabelaCelula className="tnum">{fmt.n(v.alarmes_falsos ?? 0)} de {fmt.n(v.estaveis_total ?? 0)}</TabelaCelula>
                <TabelaCelula className="tnum">{j(v) == null ? "—" : fmt.d3(j(v) as number)}</TabelaCelula>
              </TabelaLinha>
            ))}
          </TabelaCorpo>
        </Tabela>
      </CartaoCorpo>
    </Cartao>
  );
}
