import { Grid3x3 } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";
import { Tabela, TabelaCabecalho, TabelaCelula, TabelaCorpo, TabelaLinha, TabelaTitulo } from "@/components/ui/tabela";
import { fmt } from "@/lib/format";
import type { ClasseAltura, Validacao } from "@/lib/types";

import { ChipClasse } from "./chip-classe";

const CLASSES: ClasseAltura[] = [1, 2, 3];

export function MatrizConfusao({ v }: { v: Validacao }) {
  return (
    <Cartao>
      <CartaoCabecalho icone={<Grid3x3 />} titulo="Matriz de confusão" descricao="Linhas: o que a equipe viu em 20/03. Colunas: o que o modelo previu a partir de 13/03." />
      <CartaoCorpo>
        <Tabela rotulo="Matriz de confusão observado por previsto">
          <TabelaCabecalho>
            <tr>
              <TabelaTitulo>observada ↓ · prevista →</TabelaTitulo>
              {CLASSES.map((c) => (
                <TabelaTitulo key={c}><ChipClasse classe={c} curto /></TabelaTitulo>
              ))}
            </tr>
          </TabelaCabecalho>
          <TabelaCorpo>
            {CLASSES.map((obs) => (
              <TabelaLinha key={obs}>
                <TabelaCelula><ChipClasse classe={obs} /></TabelaCelula>
                {CLASSES.map((prev) => {
                  const n = Number(v.matriz_confusao[String(obs) as "1" | "2" | "3"]?.[String(prev) as "1" | "2" | "3"] ?? 0);
                  return (
                    <TabelaCelula key={prev} className={`tnum ${obs === prev ? "font-semibold text-ink" : "text-ink-2"}`}>
                      {fmt.n(n)}
                    </TabelaCelula>
                  );
                })}
              </TabelaLinha>
            ))}
          </TabelaCorpo>
        </Tabela>
      </CartaoCorpo>
    </Cartao>
  );
}
