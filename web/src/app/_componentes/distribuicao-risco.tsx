import type { CSSProperties } from "react";
import Link from "next/link";

import { Cartao, CartaoRodape } from "@/components/ui/cartao";
import { ChipRisco } from "@/components/ui/chip";
import { FaixaEmpilhada } from "@/components/viz/faixa-empilhada";
import { ORDEM_RISCO, RISCO } from "@/lib/dominio";
import type { Risco } from "@/lib/types";

/**
 * A malha inteira em uma linha só.
 *
 * A faixa carrega a proporção e a legenda carrega ícone + rótulo + contagem +
 * percentual. O rodapé é o caminho de saída: cada nível abre a malha já filtrada,
 * e o filtro mora na URL para o gestor mandar o endereço pronto para a equipe.
 */
export function DistribuicaoDeRisco({
  porRisco,
  total,
  indice = 0,
}: {
  porRisco: Record<Risco, number>;
  total: number;
  indice?: number;
}) {
  return (
    <Cartao className="rise" style={{ "--i": indice } as CSSProperties}>
      {/* A moldura do gráfico imprime o título como legenda de figura; o heading
          fica invisível só para manter a hierarquia de leitura de tela. */}
      <h2 className="sr-only">Distribuição de risco</h2>

      <div className="p-5">
        <FaixaEmpilhada
          titulo="Distribuição de risco"
          descricao={`${total} trechos monitorados, classificados pelo prazo até o limite de altura`}
          total={total}
          altura={22}
          segmentos={ORDEM_RISCO.map((risco) => ({
            chave: risco,
            rotulo: RISCO[risco].rotulo,
            valor: porRisco[risco] ?? 0,
            cor: RISCO[risco].cor,
            icone: RISCO[risco].icone,
          }))}
        />
      </div>

      <CartaoRodape>
        <span className="text-2xs tracking-widest text-ink-3 uppercase">Abrir na malha</span>

        {ORDEM_RISCO.map((risco) => (
          <Link
            key={risco}
            href={`/malha?risco=${risco}`}
            aria-label={`Ver na malha os trechos com classificação de risco ${RISCO[risco].rotulo.toLowerCase()}`}
            className="rounded-full transition-transform duration-150 ease-[var(--ease-out-quint)] hover:-translate-y-px"
          >
            <ChipRisco risco={risco} tamanho="sm" />
          </Link>
        ))}
      </CartaoRodape>
    </Cartao>
  );
}
