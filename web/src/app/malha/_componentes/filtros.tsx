"use client";

import { parseAsArrayOf, parseAsInteger, parseAsString, parseAsStringLiteral } from "nuqs";
import { Eraser, MapPinned, Ruler, Table2 } from "lucide-react";

import { Botao } from "@/components/ui/botao";
import { Busca } from "@/components/ui/campo";
import { Segmentado, type OpcaoSegmentada } from "@/components/ui/segmentado";
import { ESPECIE, ORDEM_RISCO, RISCO } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import { ESPECIES, UFS } from "@/lib/types";
import type { Especie, Risco, TrechoStatus, UF, ZonaClima } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ==========================================================================
   ESTADO NA URL

   Todo filtro da malha vive no endereço: o gestor acha o trecho crítico e manda
   o link pronto para a equipe. Nada aqui pode virar `useState`.
   ========================================================================== */

export const VISOES = ["faixa", "mapa", "tabela"] as const;
export type Visao = (typeof VISOES)[number];

export const ORDENACOES = [
  "rodovia",
  "km",
  "uf",
  "especie",
  "altura",
  "ocupacao",
  "dias",
  "risco",
  "rocada",
] as const;
export type Ordenacao = (typeof ORDENACOES)[number];

export const SENTIDOS = ["asc", "desc"] as const;
export type Sentido = (typeof SENTIDOS)[number];

export const paramBusca = parseAsString.withDefault("");
export const paramRisco = parseAsArrayOf(parseAsStringLiteral(ORDEM_RISCO)).withDefault([]);
export const paramUf = parseAsArrayOf(parseAsStringLiteral(UFS)).withDefault([]);
export const paramEspecie = parseAsArrayOf(parseAsStringLiteral(ESPECIES)).withDefault([]);
export const paramVisao = parseAsStringLiteral(VISOES).withDefault("faixa");
export const paramOrdenar = parseAsStringLiteral(ORDENACOES).withDefault("risco");
export const paramSentido = parseAsStringLiteral(SENTIDOS).withDefault("asc");
/** Sem `withDefault`: "nenhum trecho selecionado" é a ausência do parâmetro. */
export const paramTrecho = parseAsInteger;

export type Filtros = {
  busca: string;
  riscos: Risco[];
  ufs: UF[];
  especies: Especie[];
};

/** Liga/desliga um valor mantendo a ordem canônica — a URL não embaralha
 *  conforme a sequência de cliques, então dois gestores geram o mesmo link. */
export function alternarEm<T>(lista: readonly T[], valor: T, ordem: readonly T[]): T[] {
  const proxima = lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
  return ordem.filter((v) => proxima.includes(v));
}

/* ==========================================================================
   FUNÇÕES PURAS DE LEITURA
   ========================================================================== */

/** Marcas combinantes que o NFD separa da letra. Escritas em escape porque um
 *  acento solto num literal é invisível na revisão de código. */
const DIACRITICOS = /[\u0300-\u036f]/g;

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(DIACRITICOS, "").toLowerCase().trim();
}

/** Zona de clima que cobre o trecho: mesma rodovia e faixas de km que se cruzam.
 *  Quando mais de uma encosta, vence a de maior sobreposição. */
export function zonaDoTrecho(trecho: TrechoStatus, zonas: ZonaClima[]): ZonaClima | null {
  const inicio = Number(trecho.km_inicio);
  const fim = Number(trecho.km_fim);

  let melhor: ZonaClima | null = null;
  let maiorCruzamento = 0;

  for (const zona of zonas) {
    if (zona.rodovia !== trecho.rodovia) continue;

    const cruzamento =
      Math.min(fim, Number(zona.km_fim)) - Math.max(inicio, Number(zona.km_inicio));
    if (cruzamento > maiorCruzamento) {
      melhor = zona;
      maiorCruzamento = cruzamento;
    }
  }

  return melhor;
}

/**
 * Texto que o campo de busca varre, um por trecho.
 *
 * A zona de clima entra porque é ela que carrega o nome da cidade — `ia.trechos`
 * não tem esse campo, e "cidade" é como a operação se refere ao trecho no rádio.
 */
export function montarIndiceBusca(
  trechos: TrechoStatus[],
  zonas: ZonaClima[],
): Map<number, string> {
  const indice = new Map<number, string>();

  for (const t of trechos) {
    const zona = zonaDoTrecho(t, zonas);

    indice.set(
      t.id,
      normalizar(
        [
          t.rodovia,
          t.uf,
          t.sentido ?? "",
          t.tipo_pista ?? "",
          ESPECIE[t.especie]?.rotulo ?? t.especie,
          fmt.faixaKm(Number(t.km_inicio), Number(t.km_fim)),
          `km ${Number(t.km_inicio)} ${Number(t.km_fim)}`,
          zona?.nome ?? "",
          t.observacoes ?? "",
        ].join(" · "),
      ),
    );
  }

  return indice;
}

export function filtrarTrechos(
  trechos: TrechoStatus[],
  filtros: Filtros,
  indice: Map<number, string>,
): TrechoStatus[] {
  const termo = normalizar(filtros.busca);

  return trechos.filter((t) => {
    if (filtros.riscos.length > 0 && !filtros.riscos.includes(t.risco)) return false;
    if (filtros.ufs.length > 0 && !filtros.ufs.includes(t.uf)) return false;
    if (filtros.especies.length > 0 && !filtros.especies.includes(t.especie)) return false;
    if (termo && !(indice.get(t.id) ?? "").includes(termo)) return false;
    return true;
  });
}

/** O agrupamento por rodovia vive em `@/lib/malha` — o servidor usa a mesma
 *  função em `trechosPorRodovia`. Reexportado aqui só para quem já importava. */
export { agruparPorRodovia, type GrupoRodovia } from "@/lib/malha";

/* ==========================================================================
   BARRA DE FILTROS
   ========================================================================== */

const OPCOES_VISAO: OpcaoSegmentada<Visao>[] = [
  { valor: "faixa", rotulo: "Faixa", icone: <Ruler /> },
  { valor: "mapa", rotulo: "Mapa", icone: <MapPinned /> },
  { valor: "tabela", rotulo: "Tabela", icone: <Table2 /> },
];

function ChipFiltro({
  ativo,
  aoAlternar,
  marca,
  rotulo,
  contagem,
}: {
  ativo: boolean;
  aoAlternar: () => void;
  /** Ponto sólido da escala de risco. Nunca substitui o rótulo, só acompanha. */
  marca?: string;
  rotulo: string;
  contagem?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={aoAlternar}
      className={cn(
        "inline-flex h-7 max-w-full shrink-0 items-center gap-1.5 rounded-full border px-2.5",
        "text-xs font-medium whitespace-nowrap",
        "transition-[background-color,border-color,color] duration-150 ease-[var(--ease-out-quint)]",
        ativo
          ? "border-accent bg-accent-soft text-accent"
          : "border-border bg-surface-2 text-ink-2 hover:border-border-strong hover:text-ink",
      )}
    >
      {marca ? (
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: marca }}
        />
      ) : null}
      <span className="truncate">{rotulo}</span>
      {contagem != null ? (
        <span
          className={cn("tnum shrink-0 font-mono text-2xs", ativo ? "text-accent" : "text-ink-3")}
        >
          {fmt.n(contagem)}
        </span>
      ) : null}
    </button>
  );
}

function GrupoChips({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={rotulo} className="flex min-w-0 flex-wrap items-center gap-1.5">
      {/* O rótulo do grupo já é anunciado pelo `aria-label`; repeti-lo aqui faria
          o leitor de tela dizer "Risco" duas vezes seguidas. */}
      <span aria-hidden="true" className="shrink-0 text-2xs tracking-widest text-ink-3 uppercase">
        {rotulo}
      </span>
      {children}
    </div>
  );
}

export function BarraFiltros({
  busca,
  aoBuscar,
  riscos,
  aoAlternarRisco,
  ufs,
  aoAlternarUf,
  especies,
  aoAlternarEspecie,
  visao,
  aoMudarVisao,
  contagemRisco,
  visiveis,
  total,
  temFiltro,
  aoLimpar,
}: {
  busca: string;
  aoBuscar: (valor: string) => void;
  riscos: Risco[];
  aoAlternarRisco: (risco: Risco) => void;
  ufs: UF[];
  aoAlternarUf: (uf: UF) => void;
  especies: Especie[];
  aoAlternarEspecie: (especie: Especie) => void;
  visao: Visao;
  aoMudarVisao: (visao: Visao) => void;
  contagemRisco: Record<Risco, number>;
  visiveis: number;
  total: number;
  temFiltro: boolean;
  aoLimpar: () => void;
}) {
  return (
    <section
      aria-label="Filtros da malha"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-border bg-surface p-3"
    >
      <Busca
        valor={busca}
        aoMudar={aoBuscar}
        rotulo="Buscar por rodovia, km ou cidade"
        placeholder="Rodovia, km ou cidade…"
        className="w-full min-w-56 sm:w-64"
      />

      <GrupoChips rotulo="Risco">
        {ORDEM_RISCO.map((risco) => (
          <ChipFiltro
            key={risco}
            ativo={riscos.includes(risco)}
            aoAlternar={() => aoAlternarRisco(risco)}
            marca={RISCO[risco].cor}
            rotulo={RISCO[risco].rotulo}
            contagem={contagemRisco[risco]}
          />
        ))}
      </GrupoChips>

      <GrupoChips rotulo="UF">
        {UFS.map((uf) => (
          <ChipFiltro
            key={uf}
            ativo={ufs.includes(uf)}
            aoAlternar={() => aoAlternarUf(uf)}
            rotulo={uf}
          />
        ))}
      </GrupoChips>

      <GrupoChips rotulo="Espécie">
        {ESPECIES.map((especie) => (
          <ChipFiltro
            key={especie}
            ativo={especies.includes(especie)}
            aoAlternar={() => aoAlternarEspecie(especie)}
            rotulo={ESPECIE[especie].rotulo}
          />
        ))}
      </GrupoChips>

      <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-2">
        <p aria-live="polite" className="tnum shrink-0 font-mono text-xs text-ink-2">
          {fmt.n(visiveis)} de {fmt.n(total)} trechos
        </p>

        {temFiltro ? (
          <Botao tamanho="sm" variante="fantasma" iconeEsquerda={<Eraser />} onClick={aoLimpar}>
            Limpar filtros
          </Botao>
        ) : null}

        <Segmentado
          opcoes={OPCOES_VISAO}
          valor={visao}
          aoMudar={aoMudarVisao}
          tamanho="sm"
          rotulo="Modo de visualização da malha"
        />
      </div>
    </section>
  );
}
