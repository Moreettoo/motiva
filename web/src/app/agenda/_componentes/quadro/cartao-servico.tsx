"use client";

import { memo } from "react";
import { GripVertical, Undo2 } from "lucide-react";

import { IconeDominio } from "@/components/viz/legenda";
import { RISCO, STATUS } from "@/lib/dominio";
import { fmt, relativoEmDias } from "@/lib/format";
import { cn } from "@/lib/utils";

import { textoServico, type ItemAgenda } from "../dados";
import type { Alvo, CargaArrasto } from "./usar-arrasto";

export function cargaDoItem(item: ItemAgenda, origem: Alvo): CargaArrasto {
  const t = item.ag.trecho;
  return {
    id: item.id,
    origem,
    rotulo: `${t.rodovia}, ${fmt.faixaKm(Number(t.km_inicio), Number(t.km_fim))}`,
  };
}

function rotuloCompleto(item: ItemAgenda): string {
  const t = item.ag.trecho;
  return [
    `${t.rodovia}, ${fmt.faixaKm(Number(t.km_inicio), Number(t.km_fim))}, ${t.uf}`,
    `Roçada para ${fmt.dataMedia(item.data)}`,
    `Situação: ${STATUS[item.status].rotulo}`,
    `Risco: ${RISCO[item.risco].rotulo}`,
    `Estimativa: ${textoServico(item.diasServico)}`,
    item.equipeNome ? `Equipe: ${item.equipeNome}` : "Sem equipe atribuída",
  ].join(". ");
}

export const CartaoServico = memo(function CartaoServico({
  item,
  origem,
  compacto = false,
  fantasma,
  selecionado,
  salvando,
  ativo,
  desfazer,
  aoPegar,
  aoTeclar,
  aoAbrir,
  engolirClique,
  refCartao,
}: {
  item: ItemAgenda;
  origem: Alvo;
  compacto?: boolean;
  /** O cartão saiu para o sobrevoo: reserva a caixa e some, sem colapsar a linha. */
  fantasma: boolean;
  /** Este é o serviço aberto na gaveta de detalhe agora — não tem relação com o
   *  arrasto; é o mesmo sentido de `selecionado` em `linha-do-tempo.tsx`. */
  selecionado: boolean;
  salvando: boolean;
  /** Roving tabindex da grade: só o cartão ativo entra no Tab (os outros ~129
   *  ficam em -1). A Tarefa 7 calcula; este componente só consome. */
  ativo: boolean;
  desfazer: (() => void) | null;
  aoPegar: (e: React.PointerEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoTeclar: (e: React.KeyboardEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoAbrir: (id: number) => void;
  engolirClique: (e: React.MouseEvent) => void;
  refCartao: (no: HTMLElement | null) => void;
}) {
  const token = RISCO[item.risco];
  const encerrado = item.status === "executado" || item.status === "descartado";
  const carga = cargaDoItem(item, origem);
  const t = item.ag.trecho;
  const tabIndex = ativo ? 0 : -1;

  return (
    <li
      aria-busy={salvando || undefined}
      style={{ visibility: fantasma ? "hidden" : undefined }}
      className="min-w-0"
    >
      {/* Container puro: nenhum papel, nenhum tabIndex, nenhum onKeyDown aqui.
          Um <button> (abrir detalhe) dentro de um role="button" (o antigo host
          de foco) era aninhamento interativo — indefinido entre leitores de
          tela. Os dois controles reais agora são irmãos: a alça e o botão de
          detalhe, nessa ordem no DOM. */}
      <div
        style={{
          backgroundColor: encerrado ? "var(--surface-3)" : token.fundo,
          color: encerrado ? "var(--ink-3)" : token.tinta,
          borderColor: `color-mix(in oklab, ${token.cor} ${encerrado ? 28 : 55}%, transparent)`,
        }}
        className={cn(
          "group relative flex min-w-0 items-stretch gap-1 overflow-hidden rounded-sm border",
          "transition-transform duration-150 ease-[var(--ease-out-quint)] hover:-translate-y-px",
          selecionado && "ring-2 ring-accent",
        )}
      >
        <span aria-hidden="true" className="w-1 shrink-0" style={{ backgroundColor: token.cor }} />

        {encerrado ? null : (
          <button
            ref={refCartao}
            type="button"
            /* Rótulo com faixa de km, não só a rodovia: com 50 trechos, vários
               cartões da mesma rodovia coexistem na tela, e "Arrastar BR-101"
               repetido não desambigua nada na navegação por lista do leitor
               de tela. `carga.rotulo` já é essa frase — reaproveitada. */
            aria-label={`Arrastar ${carga.rotulo}`}
            aria-roledescription="serviço arrastável"
            aria-disabled={salvando || undefined}
            tabIndex={tabIndex}
            /* Sem handler em vez de `disabled`: um botão `disabled` sai da
               árvore de foco, e este é o nó que `refCartao` entrega para a
               Tarefa 7 focar programaticamente ao navegar pela grade. Se a
               escrita ainda estiver em voo bem quando este cartão for o
               "ativo", `disabled` faria o `.focus()` falhar em silêncio e
               destravar o teclado do resto da grade. `aria-disabled` avisa o
               leitor de tela sem tirar o nó do lugar. */
            onPointerDown={salvando ? undefined : (evento) => aoPegar(evento, carga)}
            onKeyDown={salvando ? undefined : (evento) => aoTeclar(evento, carga)}
            className={cn(
              "flex w-5 shrink-0 touch-none items-center justify-center text-current",
              salvando ? "cursor-wait opacity-30" : "cursor-grab opacity-45 group-hover:opacity-80",
            )}
          >
            <GripVertical aria-hidden="true" className={cn("size-3.5", salvando && "animate-pulse")} />
          </button>
        )}

        <button
          ref={encerrado ? refCartao : undefined}
          type="button"
          aria-label={rotuloCompleto(item)}
          aria-pressed={selecionado}
          tabIndex={tabIndex}
          onClick={aoAbrir.bind(null, item.id)}
          onClickCapture={engolirClique}
          className="min-w-0 flex-1 py-1.5 pr-2 text-left"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <IconeDominio
              nome={encerrado ? STATUS[item.status].icone : token.icone}
              className="size-3.5 shrink-0"
            />
            <span className="block truncate text-2xs font-medium">{t.rodovia}</span>
          </span>

          {compacto ? null : (
            <span className="tnum mt-0.5 block truncate font-mono text-2xs opacity-80">
              {fmt.faixaKm(Number(t.km_inicio), Number(t.km_fim))}
            </span>
          )}

          {compacto ? null : (
            <span className="chip-km tnum mt-0.5 block truncate font-mono text-2xs opacity-70">
              {fmt.km(item.km)} · {relativoEmDias(item.data)}
            </span>
          )}
        </button>

        {item.diasServico > 1 ? (
          <span className="tnum absolute top-1 right-1 rounded-xs bg-surface-2/70 px-1 font-mono text-2xs text-ink-2">
            {fmt.n(item.diasServico)} d
          </span>
        ) : null}
      </div>

      {desfazer ? (
        <button
          type="button"
          onClick={desfazer}
          className="mt-1 inline-flex items-center gap-1 rounded-sm px-1 text-2xs text-ink-3 hover:text-ink"
        >
          <Undo2 aria-hidden="true" className="size-3" />
          Desfazer
        </button>
      ) : null}
    </li>
  );
});
