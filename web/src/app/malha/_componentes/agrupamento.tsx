"use client";

import type { CSSProperties } from "react";
import { SquareStack } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo, CartaoRodape } from "@/components/ui/cartao";
import { Chip, ChipRisco } from "@/components/ui/chip";
import { Leitura } from "@/components/ui/leitura";
import { IconeDominio } from "@/components/viz/legenda";
import { RISCO, ordemRisco, piorRiscoDe } from "@/lib/dominio";
import { fmt, inicioDaSemana, parseData, somarDias } from "@/lib/format";
import type { Risco, TrechoStatus, UF } from "@/lib/types";
import { cn, sum } from "@/lib/utils";

/** Distância máxima entre dois trechos vizinhos para caberem na mesma saída.
 *  Acima disso a equipe gasta mais tempo na estrada do que roçando. */
const RAIO_KM = 50;

/** Crítica e alta são o motivo da saída. Média entra porque já tem data sugerida
 *  pela IA: roçar junto agora evita uma segunda viagem à mesma faixa em três
 *  semanas. Baixa fica de fora — antecipar tanto é desperdício de equipe. */
const RISCOS_ELEGIVEIS: Risco[] = ["critica", "alta", "media"];

export type Agrupamento = {
  chave: string;
  rodovia: string;
  uf: UF;
  /** Segunda-feira da semana em que o grupo inteiro vence. */
  semana: Date;
  trechos: TrechoStatus[];
  kmInicio: number;
  kmFim: number;
  /** Distância entre a ponta inicial e a final do agrupamento. */
  vaoKm: number;
  /** Soma da extensão a roçar de fato. */
  extensaoKm: number;
  saidasEvitadas: number;
  economiaKm: number;
  piorRisco: Risco;
};

type Candidato = {
  trecho: TrechoStatus;
  semana: Date;
};

/** Chave de dia em horário local. `toISOString()` empurraria a segunda-feira
 *  para domingo no Brasil e quebraria a semana ao meio. */
function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function montar(candidatos: Candidato[]): Agrupamento {
  const trechos = candidatos.map((c) => c.trecho);
  const kmInicio = Math.min(...trechos.map((t) => Number(t.km_inicio)));
  const kmFim = Math.max(...trechos.map((t) => Number(t.km_fim)));
  const vaoKm = kmFim - kmInicio;
  const saidasEvitadas = trechos.length - 1;

  return {
    chave: `${trechos[0].rodovia} ${trechos[0].uf} ${chaveDia(candidatos[0].semana)} ${kmInicio}`,
    rodovia: trechos[0].rodovia,
    uf: trechos[0].uf,
    semana: candidatos[0].semana,
    trechos,
    kmInicio,
    kmFim,
    vaoKm,
    extensaoKm: sum(trechos.map((t) => Number(t.extensao_km) || 0)),
    saidasEvitadas,
    // Cada saída separada percorre o vão do agrupamento na ida e na volta. Uma
    // saída só percorre esse vão uma vez, então o que se evita é o vão de ida e
    // volta multiplicado pelas saídas que deixaram de existir.
    economiaKm: saidasEvitadas * 2 * vaoKm,
    piorRisco: piorRiscoDe(trechos),
  };
}

/**
 * Encontra trechos que valem uma saída de equipe única.
 *
 * Função pura: recebe a lista já filtrada pela tela e a data de referência, e
 * devolve os agrupamentos ordenados por urgência. Sem acesso a rede, sem `Date`
 * implícito — dá para testar passando `hoje`.
 *
 * O critério tem três camadas, nesta ordem:
 *   1. o trecho precisa ter data de roçada conhecida e risco que justifique sair;
 *   2. rodovia, UF e semana de vencimento precisam coincidir (a quilometragem
 *      reinicia na divisa, então a UF faz parte da identidade da faixa);
 *   3. dentro disso, trechos vizinhos entram no mesmo grupo enquanto o vão entre
 *      eles couber em `RAIO_KM` — é a parte de "proximidade" propriamente dita.
 *
 * Grupo de um trecho só não é agrupamento: some da lista.
 */
export function detectarAgrupamentos(trechos: TrechoStatus[], hoje: Date): Agrupamento[] {
  const candidatos: Candidato[] = [];

  for (const trecho of trechos) {
    if (!RISCOS_ELEGIVEIS.includes(trecho.risco)) continue;

    const vencimento = trecho.data_sugerida
      ? parseData(trecho.data_sugerida)
      : trecho.dias_ate_limite != null
        ? somarDias(hoje, trecho.dias_ate_limite)
        : null;

    if (!vencimento) continue;
    candidatos.push({ trecho, semana: inicioDaSemana(vencimento) });
  }

  const baldes = new Map<string, Candidato[]>();
  for (const c of candidatos) {
    const chave = `${c.trecho.rodovia} · ${c.trecho.uf} · ${chaveDia(c.semana)}`;
    const balde = baldes.get(chave);
    if (balde) balde.push(c);
    else baldes.set(chave, [c]);
  }

  const agrupamentos: Agrupamento[] = [];

  for (const balde of baldes.values()) {
    balde.sort((a, b) => Number(a.trecho.km_inicio) - Number(b.trecho.km_inicio));

    let corrente: Candidato[] = [];
    const fechar = () => {
      if (corrente.length >= 2) agrupamentos.push(montar(corrente));
      corrente = [];
    };

    for (const c of balde) {
      if (corrente.length === 0) {
        corrente = [c];
        continue;
      }

      const anterior = corrente[corrente.length - 1].trecho;
      const vao = Number(c.trecho.km_inicio) - Number(anterior.km_fim);

      if (vao <= RAIO_KM) {
        corrente.push(c);
      } else {
        fechar();
        corrente = [c];
      }
    }

    fechar();
  }

  return agrupamentos.sort(
    (a, b) =>
      ordemRisco(a.piorRisco) - ordemRisco(b.piorRisco) ||
      a.semana.getTime() - b.semana.getTime() ||
      a.rodovia.localeCompare(b.rodovia, "pt-BR"),
  );
}

/* ========================================================================== */

export function BlocoAgrupamento({
  agrupamentos,
  selecionado,
  aoSelecionar,
}: {
  agrupamentos: Agrupamento[];
  selecionado: number | null;
  aoSelecionar: (id: number) => void;
}) {
  if (agrupamentos.length === 0) return null;

  return (
    <Cartao>
      <CartaoCabecalho
        como="h2"
        icone={<SquareStack />}
        titulo="Agrupamento por proximidade"
        descricao={`Trechos da mesma rodovia que vencem na mesma semana e ficam a menos de ${RAIO_KM} km um do outro. Juntar numa saída só evita repetir o deslocamento.`}
      />

      <CartaoCorpo>
        <ul className="flex flex-col gap-4">
          {agrupamentos.map((grupo, i) => {
            const fimDaSemana = somarDias(grupo.semana, 6);

            return (
              <li
                key={grupo.chave}
                style={{ "--i": Math.min(i, 8) } as CSSProperties}
                className="rise border-t border-border pt-4 first:border-t-0 first:pt-0"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <ChipRisco risco={grupo.piorRisco} tamanho="sm" />
                  <span className="min-w-0 truncate text-sm font-medium text-ink">
                    {grupo.rodovia}
                  </span>
                  <Chip tom="neutro">{grupo.uf}</Chip>
                  <span className="tnum font-mono text-xs text-ink-2">
                    {fmt.faixaKm(grupo.kmInicio, grupo.kmFim)}
                  </span>
                  <span className="text-xs text-ink-3">
                    semana de {fmt.dataCurta(grupo.semana)} a {fmt.dataCurta(fimDaSemana)}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                  <Leitura rotulo="Vão" valor={fmt.km(grupo.vaoKm)} nota="primeiro ao último" />
                  <Leitura
                    rotulo="A roçar"
                    valor={fmt.km(grupo.extensaoKm)}
                    nota={`${grupo.trechos.length} trechos`}
                  />
                  <Leitura
                    rotulo="Saídas"
                    valor={`${grupo.trechos.length} → 1`}
                    nota={`${grupo.saidasEvitadas} ${grupo.saidasEvitadas === 1 ? "evitada" : "evitadas"}`}
                  />
                  <Leitura
                    rotulo="Deslocamento evitado"
                    valor={`≈ ${fmt.km(grupo.economiaKm)}`}
                    nota="estimativa"
                  />
                </div>

                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {grupo.trechos.map((t) => {
                    const ativo = t.id === selecionado;

                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          aria-pressed={ativo}
                          onClick={() => aoSelecionar(t.id)}
                          className={cn(
                            "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5",
                            "tnum font-mono text-2xs whitespace-nowrap",
                            "transition-[background-color,border-color,color] duration-150 ease-[var(--ease-out-quint)]",
                            ativo
                              ? "border-accent bg-accent-soft text-accent"
                              : "border-border bg-surface-2 text-ink-2 hover:border-border-strong hover:text-ink",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className="inline-flex shrink-0"
                            style={{ color: RISCO[t.risco].tinta }}
                          >
                            <IconeDominio nome={RISCO[t.risco].icone} className="size-3" />
                          </span>
                          <span className="truncate">
                            {fmt.faixaKm(Number(t.km_inicio), Number(t.km_fim))}
                          </span>
                          <span className="sr-only">
                            {" "}
                            — risco {RISCO[t.risco].rotulo.toLowerCase()}. Abrir detalhe do trecho.
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </CartaoCorpo>

      <CartaoRodape>
        <p className="min-w-0 break-words">
          Estimativa de deslocamento: cada saída separada percorreria o vão do agrupamento na ida e
          na volta. A distância até a base da equipe não entra na conta.
        </p>
      </CartaoRodape>
    </Cartao>
  );
}
