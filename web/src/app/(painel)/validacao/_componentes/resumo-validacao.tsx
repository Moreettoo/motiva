import { Scale } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo, CartaoRodape } from "@/components/ui/cartao";
import { fmt } from "@/lib/format";
import type { Validacao } from "@/lib/types";

function pct(v: number | string | null): string {
  return v == null ? "—" : `${fmt.d1(Number(v) * 100)}%`;
}

/** O número. Ao lado dele, sempre, a linha de base "nada muda": é contra ela que o modelo é julgado. */
export function ResumoValidacao({ v }: { v: Validacao }) {
  const n = Number(v.n_pares_usados);
  const estaveis = Number(v.estaveis_total ?? 0);
  const base = n ? estaveis / n : null;
  const fator = Number(v.fator_calibracao);
  const tiles = [
    { rotulo: "Pares reais usados", valor: fmt.n(n), nota: `${fmt.n(v.n_rocados_excluidos)} roçados no intervalo ficaram fora` },
    { rotulo: "Transições detectadas", valor: `${fmt.n(v.transicoes_detectadas ?? 0)} de ${fmt.n(v.transicoes_total ?? 0)}`, nota: "pontos que subiram de classe em 7 dias e o modelo avisou" },
    { rotulo: "Alarmes falsos", valor: `${fmt.n(v.alarmes_falsos ?? 0)} de ${fmt.n(estaveis)}`, nota: "pontos que ficaram iguais e o modelo previu subida" },
    { rotulo: "Acurácia de classe", valor: pct(v.acuracia_classe), nota: `linha de base "nada muda": ${pct(base)}` },
    {
      rotulo: "Fator de calibração",
      valor: fmt.d2(fator),
      nota: fator === 1 ? "desligada: o candidato 1,15 foi testado e rejeitado fora da amostra" : "multiplica o crescimento previsto",
    },
    { rotulo: "Cobertura da banda q10–q90", valor: pct(v.cobertura_banda), nota: "observação compatível com o intervalo do modelo" },
  ];
  return (
    <Cartao>
      <CartaoCabecalho
        icone={<Scale />}
        titulo="O modelo contra o campo"
        descricao={`Rodoanel Oeste, ${fmt.dataMedia(v.janela_de)} → ${fmt.dataMedia(v.janela_ate)}. Espécie assumida: ${v.especie}. Classe 3 = ${fmt.n(Number(v.ponto_medio_classe3_cm))} cm; roçada há ${fmt.n(Number(v.dias_desde_rocada_premissa))} dias.`}
      />
      <CartaoCorpo>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {tiles.map((t) => (
            <li key={t.rotulo} className="rounded-md border border-border bg-surface-2 p-3">
              <span className="block text-2xs tracking-widest text-ink-3 uppercase">{t.rotulo}</span>
              <span className="tnum mt-1.5 block font-mono text-xl leading-none font-semibold text-ink">{t.valor}</span>
              <span className="mt-1.5 block text-xs text-ink-2">{t.nota}</span>
            </li>
          ))}
        </ul>
      </CartaoCorpo>
      <CartaoRodape>
        <span className="min-w-0 break-words">
          Validado em {fmt.dataMedia(v.executada_em.slice(0, 10))}
          {v.commit_git ? <> · commit <span className="font-mono">{v.commit_git}</span></> : null}
          {v.observacoes ? <> · {v.observacoes}</> : null}
        </span>
      </CartaoRodape>
    </Cartao>
  );
}
