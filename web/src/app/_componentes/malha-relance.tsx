import type { CSSProperties } from "react";
import { Waypoints } from "lucide-react";

import { FaixaRodovia } from "@/components/malha/faixa-rodovia";
import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";
import { EstadoVazio } from "@/components/ui/vazio";
import type { TrechosPorRodovia } from "@/lib/queries";

import { LinkAcao } from "./link-acao";

/**
 * As rodovias mais apertadas, cada uma como régua de km.
 *
 * O recorte é deliberado: a tela responde "o que exige atenção hoje", não
 * "quantas rodovias existem". A malha inteira mora em `/malha`.
 */
export function MalhaEmRelance({
  rodovias,
  totalRodovias,
  indice = 0,
}: {
  rodovias: TrechosPorRodovia;
  totalRodovias: number;
  indice?: number;
}) {
  const restantes = Math.max(0, totalRodovias - rodovias.length);

  return (
    <Cartao className="rise" style={{ "--i": indice } as CSSProperties}>
      <CartaoCabecalho
        icone={<Waypoints />}
        titulo="Malha em relance"
        descricao={
          restantes > 0
            ? `As ${rodovias.length} rodovias de pior risco. Outras ${restantes} estão na malha completa.`
            : "Todas as rodovias monitoradas, da mais apertada para a mais folgada."
        }
        acoes={<LinkAcao href="/malha">Ver malha completa</LinkAcao>}
      />

      {rodovias.length === 0 ? (
        <CartaoCorpo>
          <EstadoVazio
            titulo="Nenhuma rodovia monitorada"
            descricao="Cadastre trechos em ia.trechos para que a malha apareça aqui."
          />
        </CartaoCorpo>
      ) : (
        // Sem padding à esquerda: o filete de acento da FaixaRodovia encosta na
        // borda do cartão, que é onde ele lê como marcação de seção viva.
        <CartaoCorpo className="p-0 pr-5 pb-2">
          {rodovias.map((r, i) => (
            <FaixaRodovia
              key={r.chave}
              rodovia={r.rodovia}
              uf={r.uf}
              extensao={r.extensao}
              criticos={r.criticos}
              piorRisco={r.piorRisco}
              trechos={r.trechos}
              altura="compacta"
              href={`/malha?busca=${encodeURIComponent(r.rodovia)}`}
              indice={i}
            />
          ))}
        </CartaoCorpo>
      )}
    </Cartao>
  );
}
