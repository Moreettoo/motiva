"use client";

import { parseAsArrayOf, parseAsBoolean, parseAsInteger, parseAsString, parseAsStringLiteral } from "nuqs";
import { Eraser } from "lucide-react";

import { Botao } from "@/components/ui/botao";
import { Busca, Entrada, Selecao } from "@/components/ui/campo";
import { STATUS_CHAMADO_TOKEN } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import { STATUS_CHAMADO, type ChamadoDetalhado, type Equipe, type StatusChamado } from "@/lib/types";
import { cn } from "@/lib/utils";

import { IconeChamado } from "./icones";

/* ==========================================================================
   ESTADO NA URL

   Todo filtro desta tela vive no endereço, como na malha e na agenda: o gestor
   acha os três chamados que dependem dele e manda o link para quem decide.
   Nada aqui pode virar `useState`.

   Os filtros são aplicados NO CLIENTE, sobre a lista inteira. `listarChamados`
   aceita os mesmos recortes no banco, e essa é a porta certa quando a tabela
   crescer; hoje são poucas centenas de linhas e uma ida ao servidor por tecla
   digitada seria pior em tudo.
   ========================================================================== */

export const paramStatus = parseAsArrayOf(parseAsStringLiteral(STATUS_CHAMADO)).withDefault([]);
export const paramEquipe = parseAsInteger.withDefault(0);
export const paramRodovia = parseAsString.withDefault("");
export const paramDe = parseAsString.withDefault("");
export const paramAte = parseAsString.withDefault("");
export const paramBusca = parseAsString.withDefault("");
/** Sem `withDefault`: "nenhum chamado aberto" é a AUSÊNCIA do parâmetro. */
export const paramChamado = parseAsInteger;
export const paramNova = parseAsBoolean.withDefault(false);

export type FiltrosChamados = {
  status: StatusChamado[];
  equipeId: number;
  rodovia: string;
  de: string;
  ate: string;
  busca: string;
};

export const FILTROS_VAZIOS: FiltrosChamados = {
  status: [],
  equipeId: 0,
  rodovia: "",
  de: "",
  ate: "",
  busca: "",
};

export function temFiltro(f: FiltrosChamados): boolean {
  return (
    f.status.length > 0 || f.equipeId > 0 || f.rodovia !== "" || f.de !== "" || f.ate !== "" || f.busca.trim() !== ""
  );
}

/** Liga/desliga um status mantendo a ordem canônica: dois gestores clicando na
 *  mesma ordem diferente geram o mesmo link. */
export function alternarStatus(atual: StatusChamado[], valor: StatusChamado): StatusChamado[] {
  const proxima = atual.includes(valor) ? atual.filter((s) => s !== valor) : [...atual, valor];
  return STATUS_CHAMADO.filter((s) => proxima.includes(s));
}

/* --------------------------------------------------------------------------
   Leitura pura
   -------------------------------------------------------------------------- */

/** Marcas combinantes que o NFD separa da letra. Escritas em escape porque um
 *  acento solto num literal é invisível na revisão de código. */
const DIACRITICOS = /[\u0300-\u036f]/g;

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(DIACRITICOS, "").toLowerCase().trim();
}

/**
 * O texto que a busca varre, um por chamado.
 *
 * Número, rodovia, faixa de km, UF, equipe e líder: são os seis jeitos de se
 * referir a um chamado no rádio e no WhatsApp da operação. Buscar só pelo
 * número obrigaria a pessoa a saber o número, que é justamente o que ela vem
 * procurar.
 */
export function montarIndiceBusca(chamados: ChamadoDetalhado[]): Map<number, string> {
  const indice = new Map<number, string>();

  for (const c of chamados) {
    indice.set(
      c.id,
      normalizar(
        [
          c.numero,
          c.trecho.rodovia,
          c.trecho.uf,
          c.trecho.sentido ?? "",
          fmt.faixaKm(Number(c.trecho.km_inicio), Number(c.trecho.km_fim)),
          `km ${Number(c.trecho.km_inicio)} ${Number(c.trecho.km_fim)}`,
          c.agendamento.equipe?.nome ?? "sem equipe",
          c.agendamento.equipe?.lider_nome ?? "",
        ].join(" · "),
      ),
    );
  }

  return indice;
}

export function filtrarChamados(
  chamados: ChamadoDetalhado[],
  f: FiltrosChamados,
  indice: Map<number, string>,
): ChamadoDetalhado[] {
  const termo = normalizar(f.busca);

  return chamados.filter((c) => {
    if (f.status.length > 0 && !f.status.includes(c.status)) return false;
    if (f.equipeId > 0 && c.agendamento.equipe?.id !== f.equipeId) return false;
    if (f.rodovia && c.trecho.rodovia !== f.rodovia) return false;
    // Comparação de string, e não de `Date`: as datas do banco são `AAAA-MM-DD`
    // e nesse formato a ordem lexicográfica É a ordem cronológica.
    if (f.de && c.agendamento.data_sugerida < f.de) return false;
    if (f.ate && c.agendamento.data_sugerida > f.ate) return false;
    if (termo && !(indice.get(c.id) ?? "").includes(termo)) return false;
    return true;
  });
}

/** As rodovias que aparecem na lista, em ordem. Sai dos chamados e não da
 *  malha inteira: oferecer no filtro uma rodovia sem chamado nenhum é oferecer
 *  um caminho para a tela vazia. */
export function rodoviasDe(chamados: ChamadoDetalhado[]): string[] {
  return [...new Set(chamados.map((c) => c.trecho.rodovia))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/* --------------------------------------------------------------------------
   Barra
   -------------------------------------------------------------------------- */

function ChipStatusFiltro({
  status,
  ativo,
  contagem,
  aoAlternar,
}: {
  status: StatusChamado;
  ativo: boolean;
  contagem: number;
  aoAlternar: () => void;
}) {
  const token = STATUS_CHAMADO_TOKEN[status];

  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={aoAlternar}
      title={token.descricao}
      className={cn(
        "inline-flex h-7 max-w-full shrink-0 items-center gap-1.5 rounded-full border px-2.5",
        "text-xs font-medium whitespace-nowrap",
        "transition-[background-color,border-color,color] duration-150 ease-[var(--ease-out-quint)]",
        ativo ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-2 hover:text-ink",
      )}
      /* `border-accent` e classe morta (ver `icones.tsx`). */
      style={{ borderColor: ativo ? "var(--accent)" : undefined }}
    >
      <IconeChamado nome={token.icone} className="size-3" />
      <span className="truncate">{token.rotulo}</span>
      <span className={cn("tnum shrink-0 font-mono text-2xs", ativo ? "text-accent" : "text-ink-3")}>
        {fmt.n(contagem)}
      </span>
    </button>
  );
}

export function BarraFiltros({
  filtros,
  aoMudar,
  aoLimpar,
  equipes,
  rodovias,
  contagemStatus,
  visiveis,
  total,
  acao,
}: {
  filtros: FiltrosChamados;
  aoMudar: (parcial: Partial<FiltrosChamados>) => void;
  aoLimpar: () => void;
  equipes: Equipe[];
  rodovias: string[];
  contagemStatus: Record<StatusChamado, number>;
  visiveis: number;
  total: number;
  /** O botão "Novo chamado". Fica aqui, à direita da contagem, porque é a única
   *  ação de criação da tela e a barra é a única faixa fixa acima da lista. */
  acao?: React.ReactNode;
}) {
  return (
    <section
      aria-label="Filtros dos chamados"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-border bg-surface p-3"
    >
      <Busca
        valor={filtros.busca}
        aoMudar={(busca) => aoMudar({ busca })}
        rotulo="Buscar por número, rodovia, km ou equipe"
        placeholder="CH-2026, rodovia, km ou equipe…"
        className="w-full min-w-56 sm:w-72"
      />

      <div role="group" aria-label="Estado" className="flex min-w-0 flex-wrap items-center gap-1.5">
        {STATUS_CHAMADO.filter((s) => contagemStatus[s] > 0 || filtros.status.includes(s)).map((s) => (
          <ChipStatusFiltro
            key={s}
            status={s}
            ativo={filtros.status.includes(s)}
            contagem={contagemStatus[s]}
            aoAlternar={() => aoMudar({ status: alternarStatus(filtros.status, s) })}
          />
        ))}
      </div>

      {/* `Selecao` e `Entrada` são `w-full` por dentro, para servirem a
          formulário em coluna. Aqui eles são controles de barra, então quem
          define a largura é este invólucro — sem ele o primeiro select come a
          linha inteira e empurra o resto do filtro para baixo. */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="w-44 shrink-0">
          <Selecao
            aria-label="Equipe"
            value={String(filtros.equipeId)}
            onChange={(evento) => aoMudar({ equipeId: Number(evento.target.value) })}
          >
            <option value="0">Todas as equipes</option>
            {equipes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </Selecao>
        </div>

        <div className="w-40 shrink-0">
          <Selecao
            aria-label="Rodovia"
            value={filtros.rodovia}
            onChange={(evento) => aoMudar({ rodovia: evento.target.value })}
          >
            <option value="">Todas as rodovias</option>
            {rodovias.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Selecao>
        </div>

        {/* Data PREVISTA, não data de criação: é por ela que a operação
            pergunta ("o que estava marcado para a semana passada?"). */}
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="w-36 shrink-0">
            <Entrada
              type="date"
              aria-label="Prevista a partir de"
              value={filtros.de}
              max={filtros.ate || undefined}
              onChange={(evento) => aoMudar({ de: evento.target.value })}
              className="tnum"
            />
          </div>
          <span aria-hidden="true" className="shrink-0 text-xs text-ink-3">
            até
          </span>
          <div className="w-36 shrink-0">
            <Entrada
              type="date"
              aria-label="Prevista até"
              value={filtros.ate}
              min={filtros.de || undefined}
              onChange={(evento) => aoMudar({ ate: evento.target.value })}
              className="tnum"
            />
          </div>
        </div>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-2">
        <p aria-live="polite" className="tnum shrink-0 font-mono text-xs text-ink-2">
          {fmt.n(visiveis)} de {fmt.n(total)} chamados
        </p>

        {temFiltro(filtros) ? (
          <Botao tamanho="sm" variante="fantasma" iconeEsquerda={<Eraser />} onClick={aoLimpar}>
            Limpar filtros
          </Botao>
        ) : null}

        {acao}
      </div>
    </section>
  );
}
