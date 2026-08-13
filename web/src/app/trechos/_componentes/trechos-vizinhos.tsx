import { Route } from "lucide-react";

import { CartaoTrecho } from "@/components/malha/cartao-trecho";
import { ReguaKm, type SegmentoRegua } from "@/components/malha/regua-km";
import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";
import { EstadoVazio } from "@/components/ui/vazio";
import { IconeDominio, Legenda } from "@/components/viz/legenda";
import { ESPECIE, ORDEM_RISCO, RISCO } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import type { TrechoStatus } from "@/lib/types";

const MAXIMO_CARTOES = 4;

/** Distância entre duas faixas de km — zero quando elas encostam ou se sobrepõem. */
function distanciaKm(a: TrechoStatus, b: TrechoStatus): number {
  const inicioA = Number(a.km_inicio);
  const fimA = Number(a.km_fim);
  const inicioB = Number(b.km_inicio);
  const fimB = Number(b.km_fim);

  if (inicioB > fimA) return inicioB - fimA;
  if (inicioA > fimB) return inicioA - fimB;
  return 0;
}

/**
 * Contexto na rodovia: a régua mostra onde o trecho cai na malha e os cartões
 * trazem os vizinhos mais próximos — é o que decide se dá para levar a mesma
 * equipe para dois trechos na mesma janela.
 */
export function TrechosVizinhos({
  trecho,
  daRodovia,
}: {
  trecho: TrechoStatus;
  /** Todos os trechos da mesma rodovia, incluindo o atual. */
  daRodovia: TrechoStatus[];
}) {
  const vizinhos = daRodovia
    .filter((t) => t.id !== trecho.id)
    .sort((a, b) => distanciaKm(trecho, a) - distanciaKm(trecho, b))
    .slice(0, MAXIMO_CARTOES);

  const kmInicio = Math.min(...daRodovia.map((t) => Number(t.km_inicio)));
  const kmFim = Math.max(...daRodovia.map((t) => Number(t.km_fim)));

  const segmentos: SegmentoRegua[] = daRodovia.map((t) => ({
    id: t.id,
    kmInicio: Number(t.km_inicio),
    kmFim: Number(t.km_fim),
    risco: t.risco,
    rotulo: [t.rodovia, t.sentido].filter(Boolean).join(" · "),
    alturaCm: t.altura_atual_cm == null ? null : Number(t.altura_atual_cm),
    limiteCm: Number(t.altura_limite_cm),
    diasAteLimite: t.dias_ate_limite,
    detalhe: ESPECIE[t.especie]?.rotulo ?? null,
    href: `/trechos/${t.id}`,
  }));

  return (
    <Cartao>
      <CartaoCabecalho
        como="h2"
        icone={<Route />}
        titulo="Trechos vizinhos"
        descricao={`Outros trechos monitorados na ${trecho.rodovia}. Trechos próximos com prazos parecidos cabem na mesma mobilização.`}
      />

      <CartaoCorpo className="space-y-6">
        {kmFim > kmInicio ? (
          <div className="space-y-2">
            <ReguaKm
              kmInicio={kmInicio}
              kmFim={kmFim}
              segmentos={segmentos}
              selecionado={trecho.id}
              altura="detalhada"
              rotuloAcessivel={`Trechos monitorados na ${trecho.rodovia}, ${fmt.faixaKm(kmInicio, kmFim)}`}
            />
            {/* Chave de risco: sem ela os matizes da régua não têm rótulo nenhum nesta página. */}
            <Legenda
              itens={ORDEM_RISCO.map((risco) => ({
                rotulo: RISCO[risco].rotulo,
                cor: RISCO[risco].cor,
                icone: <IconeDominio nome={RISCO[risco].icone} />,
              }))}
            />
          </div>
        ) : null}

        {vizinhos.length === 0 ? (
          <EstadoVazio
            icone={<Route />}
            titulo="Nenhum trecho vizinho monitorado"
            descricao={`Este é o único trecho da ${trecho.rodovia} na malha. Não há agrupamento de equipe possível por aqui.`}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {vizinhos.map((vizinho, i) => (
              <CartaoTrecho key={vizinho.id} trecho={vizinho} indice={i} compacto />
            ))}
          </div>
        )}
      </CartaoCorpo>
    </Cartao>
  );
}
