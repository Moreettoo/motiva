"use client";

import type { CSSProperties } from "react";
import Link from "next/link";

import { BarraProgresso } from "@/components/ui/barra-progresso";
import { ChipRisco } from "@/components/ui/chip";
import {
  Tabela,
  TabelaCabecalho,
  TabelaCelula,
  TabelaCorpo,
  TabelaLinha,
  TabelaTitulo,
  type Alinhamento,
} from "@/components/ui/tabela";
import { ESPECIE, TOM_BARRA_POR_RISCO, ordemRisco, rotuloPrazo } from "@/lib/dominio";
import { fmt, relativoEmDias } from "@/lib/format";
import type { TrechoStatus } from "@/lib/types";

import type { Ordenacao, Sentido } from "./filtros";

type Coluna = {
  chave: Ordenacao;
  rotulo: string;
  alinhamento?: Alinhamento;
  numerica?: boolean;
};

const COLUNAS: Coluna[] = [
  { chave: "rodovia", rotulo: "Rodovia" },
  { chave: "km", rotulo: "Faixa de km", numerica: true },
  { chave: "uf", rotulo: "UF" },
  { chave: "especie", rotulo: "Espécie" },
  { chave: "altura", rotulo: "Altura / limite", numerica: true },
  // A chave continua `ocupacao` porque vai para a URL e link compartilhado não
  // pode quebrar; o que muda é o rótulo. "Ocupação" ficou reservado para carga
  // de equipe, e aqui a barra compara altura com o limite do trecho.
  { chave: "ocupacao", rotulo: "Contra o limite" },
  { chave: "dias", rotulo: "Dias até o limite", numerica: true },
  { chave: "risco", rotulo: "Risco" },
  { chave: "rocada", rotulo: "Próxima roçada" },
];

/** Valor comparável de cada coluna. `null` significa dado ausente — nunca zero,
 *  senão um trecho sem previsão apareceria como o mais folgado da malha. */
const VALOR: Record<Ordenacao, (t: TrechoStatus) => number | string | null> = {
  rodovia: (t) => t.rodovia,
  km: (t) => Number(t.km_inicio),
  uf: (t) => t.uf,
  especie: (t) => ESPECIE[t.especie]?.rotulo ?? t.especie,
  altura: (t) => (t.altura_atual_cm == null ? null : Number(t.altura_atual_cm)),
  ocupacao: (t) => (t.ocupacao_pct == null ? null : Number(t.ocupacao_pct)),
  dias: (t) => t.dias_ate_limite,
  risco: (t) => ordemRisco(t.risco),
  rocada: (t) => t.data_sugerida,
};

/**
 * Ordenação estável e determinística.
 *
 * O empate cai sempre no id: sem isso, dois carregamentos da mesma URL podem
 * devolver ordens diferentes e o link compartilhado deixa de apontar para a
 * mesma linha.
 */
export function ordenarTrechos(
  trechos: TrechoStatus[],
  chave: Ordenacao,
  sentido: Sentido,
): TrechoStatus[] {
  const ler = VALOR[chave];
  const sinal = sentido === "asc" ? 1 : -1;

  return [...trechos].sort((a, b) => {
    const va = ler(a);
    const vb = ler(b);

    // Ausência de dado vai para o fim nos dois sentidos.
    if (va == null && vb == null) return a.id - b.id;
    if (va == null) return 1;
    if (vb == null) return -1;

    const comparacao =
      typeof va === "string" && typeof vb === "string"
        ? va.localeCompare(vb, "pt-BR")
        : Number(va) - Number(vb);

    return comparacao * sinal || a.id - b.id;
  });
}

export function TabelaTrechos({
  trechos,
  ordenar,
  sentido,
  aoOrdenar,
  selecionado,
}: {
  trechos: TrechoStatus[];
  ordenar: Ordenacao;
  sentido: Sentido;
  aoOrdenar: (chave: Ordenacao) => void;
  selecionado: number | null;
}) {
  return (
    <Tabela
      rotulo="Trechos monitorados, com altura, ocupação, prazo e risco"
      className="max-h-[70vh]"
    >
      <TabelaCabecalho>
        <tr>
          {COLUNAS.map((coluna) => (
            <TabelaTitulo
              key={coluna.chave}
              ordenavel
              ordem={ordenar === coluna.chave ? sentido : "none"}
              aoOrdenar={() => aoOrdenar(coluna.chave)}
              alinhamento={coluna.alinhamento}
              numerica={coluna.numerica}
            >
              {coluna.rotulo}
            </TabelaTitulo>
          ))}
        </tr>
      </TabelaCabecalho>

      <TabelaCorpo>
        {trechos.map((t) => {
          const limite = Number(t.altura_limite_cm);
          const atual = t.altura_atual_cm == null ? null : Number(t.altura_atual_cm);
          const ocupacao = t.ocupacao_pct == null ? null : Number(t.ocupacao_pct);

          return (
            <TabelaLinha
              key={t.id}
              selecionada={t.id === selecionado}
              // Dica de renderização preguiçosa: onde o navegador aplica
              // contenção, a linha fora da viewport não entra no layout. O
              // tamanho intrínseco declarado mantém a barra de rolagem honesta.
              style={
                { contentVisibility: "auto", containIntrinsicSize: "auto 45px" } as CSSProperties
              }
            >
              <TabelaCelula className="max-w-64">
                <Link
                  href={`/trechos/${t.id}`}
                  className="block min-w-0 rounded-sm transition-colors duration-150 ease-[var(--ease-out-quint)] hover:text-accent"
                >
                  <span className="block truncate font-medium">{t.rodovia}</span>
                  {t.sentido ? (
                    <span className="block truncate text-2xs text-ink-3">{t.sentido}</span>
                  ) : null}
                </Link>
              </TabelaCelula>

              <TabelaCelula numerica className="font-mono whitespace-nowrap">
                {fmt.faixaKm(Number(t.km_inicio), Number(t.km_fim))}
              </TabelaCelula>

              <TabelaCelula className="font-mono">{t.uf}</TabelaCelula>

              <TabelaCelula className="whitespace-nowrap">
                {ESPECIE[t.especie]?.rotulo ?? t.especie}
              </TabelaCelula>

              <TabelaCelula numerica className="font-mono whitespace-nowrap">
                {atual == null ? "—" : fmt.d1(atual)}
                <span className="text-ink-3"> / {fmt.d1(limite)} cm</span>
              </TabelaCelula>

              <TabelaCelula className="w-36 min-w-28">
                {ocupacao == null ? (
                  <span className="text-ink-3">—</span>
                ) : (
                  <BarraProgresso
                    valor={ocupacao}
                    max={100}
                    tom={TOM_BARRA_POR_RISCO[t.risco]}
                    altura="fina"
                    mostrarValor
                    rotulo={`Altura contra o limite em ${t.rodovia}, ${fmt.faixaKm(Number(t.km_inicio), Number(t.km_fim))}`}
                  />
                )}
              </TabelaCelula>

              <TabelaCelula numerica className="font-mono whitespace-nowrap">
                {rotuloPrazo(t.dias_ate_limite)}
              </TabelaCelula>

              <TabelaCelula>
                <ChipRisco risco={t.risco} tamanho="sm" />
              </TabelaCelula>

              <TabelaCelula className="whitespace-nowrap">
                {t.data_sugerida ? (
                  <>
                    <span className="tnum font-mono">{fmt.dataCurta(t.data_sugerida)}</span>
                    <span className="text-ink-3"> · {relativoEmDias(t.data_sugerida)}</span>
                  </>
                ) : (
                  <span className="text-ink-3">sem sugestão</span>
                )}
              </TabelaCelula>
            </TabelaLinha>
          );
        })}
      </TabelaCorpo>
    </Tabela>
  );
}
