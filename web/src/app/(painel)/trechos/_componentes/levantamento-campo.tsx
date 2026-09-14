import { ClipboardList } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo, CartaoRodape } from "@/components/ui/cartao";
import { Tabela, TabelaCabecalho, TabelaCelula, TabelaCorpo, TabelaLinha, TabelaTitulo } from "@/components/ui/tabela";
import { IconeDominio } from "@/components/viz/legenda";
import { infoRocada } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import type { LevantamentosDoTrecho } from "@/lib/levantamentos/queries";
import type { TrechoStatus } from "@/lib/types";

import { ChipClasse } from "../../validacao/_componentes/chip-classe";

/**
 * O que a equipe da Motiva anotou neste segmento, faixa por faixa, nas
 * caminhadas de campo. É a origem bruta da medição do trecho: a pior classe
 * entre as 4 faixas em escopo (destacadas abaixo) vira o ponto médio em cm
 * que alimenta `medicao_origem = 'levantamento_classe'`; as outras 8 faixas
 * ficam registradas aqui, mas não entram nessa conta.
 *
 * `classe` vem `null` quando a equipe marcou "X" ou deixou a célula em
 * branco no formulário unifilar -- a tabela mostra isso como "não se aplica",
 * nunca como um `ChipClasse`: um chip ali afirmaria uma medição que ninguém
 * fez, e ela ficaria visualmente indistinguível da Classe 1 (a mais leve das
 * três medidas de verdade). Ver `agruparLevantamentos` (`levantamentos/
 * agrupar.ts`) para a garantia, testada, de que esse `null` sobrevive até
 * aqui sem virar outra coisa.
 */
export function LevantamentoCampo({ trecho, lev }: { trecho: TrechoStatus; lev: LevantamentosDoTrecho }) {
  if (lev.datas.length === 0) return null;

  const rocada = infoRocada(trecho.metodo_rocada, trecho.area_rocada_m2);

  return (
    <Cartao>
      <CartaoCabecalho
        icone={<ClipboardList />}
        titulo="Levantamento de campo"
        descricao={`Formulário unifilar RA-ROÇ-LIMP da Motiva, marco ${fmt.n(trecho.km_marco_m ?? 0)} m. Só as 4 faixas em escopo (destacadas) alimentam a medição do trecho; as demais ficam registradas, sem efeito na decisão.`}
      />
      <CartaoCorpo className="space-y-3">
        <Tabela rotulo="Classes por faixa transversal e data">
          <TabelaCabecalho>
            <tr>
              <TabelaTitulo>faixa</TabelaTitulo>
              {lev.datas.map((d) => (
                <TabelaTitulo key={d}>{fmt.dataMedia(d)}</TabelaTitulo>
              ))}
            </tr>
          </TabelaCabecalho>
          <TabelaCorpo>
            {lev.faixas.map((f) => (
              <TabelaLinha key={f.codigo}>
                <TabelaCelula className={f.em_escopo ? "font-medium text-ink" : "text-ink-3"}>
                  {f.nome}
                  {f.em_escopo ? null : <span className="ml-1.5">· fora do escopo</span>}
                </TabelaCelula>
                {lev.datas.map((d) => {
                  const c = lev.classes[f.codigo]?.[d] ?? null;
                  return (
                    <TabelaCelula key={d}>
                      {c ? <ChipClasse classe={c} /> : <span className="text-ink-3">não se aplica</span>}
                    </TabelaCelula>
                  );
                })}
              </TabelaLinha>
            ))}
          </TabelaCorpo>
        </Tabela>

        <p className="text-xs text-ink-2">
          {rocada.registrado ? (
            <>
              Roçada:{" "}
              <span className="inline-flex items-center gap-1 align-middle">
                <IconeDominio nome={rocada.icone} className="text-ink-3" />
                <strong className="font-medium text-ink">{rocada.rotulo}</strong>
              </span>
              , {fmt.n(rocada.areaM2)} m² roçáveis segundo o KML da Motiva.{" "}
            </>
          ) : (
            <>
              Roçada: <strong className="font-medium text-ink-3">método não registrado</strong> — o KML de roçada da
              Motiva não tem polígono cobrindo este marco (área também não registrada).{" "}
            </>
          )}
          Solo{" "}
          {trecho.solo_fonte === "soilgrids"
            ? "lido do SoilGrids no marco"
            : trecho.solo_fonte === "premissa"
              ? "por premissa (o SoilGrids não cobre este ponto)"
              : "sem fonte registrada"}
          {trecho.fertilidade_solo != null ? (
            <>
              : fertilidade {fmt.d2(Number(trecho.fertilidade_solo))},{" "}
              {fmt.n(Math.round(Number(trecho.capacidade_agua_solo_mm ?? 0)))} mm de água disponível.
            </>
          ) : (
            "."
          )}
        </p>
      </CartaoCorpo>
      <CartaoRodape>
        <span className="min-w-0 break-words">
          Arquivos: {lev.datas.map((d) => lev.arquivos[d]).join(" · ")}. Classes: 1 abaixo de 10 cm, 2 de 10 a 30 cm,
          3 acima de 30 cm (limite Artesp).
        </span>
      </CartaoRodape>
    </Cartao>
  );
}
