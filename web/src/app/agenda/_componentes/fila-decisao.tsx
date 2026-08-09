"use client";

import { useId, useState } from "react";
import { CalendarClock, Check, ChevronDown, CircleSlash, Users } from "lucide-react";

import { Botao, BotaoIcone } from "@/components/ui/botao";
import { Campo, Entrada } from "@/components/ui/campo";
import { Chip, ChipRisco } from "@/components/ui/chip";
import { ItemMenu, Menu, SeparadorMenu } from "@/components/ui/menu";
import { EstadoVazio } from "@/components/ui/vazio";
import { IconeDominio } from "@/components/viz/legenda";
import { fmt, relativoEmDias } from "@/lib/format";
import type { Equipe } from "@/lib/types";
import { cn } from "@/lib/utils";

import type { ItemAgenda } from "./dados";

const VISIVEIS = 12;

export function FilaDecisao({
  itens,
  equipes,
  hoje,
  pendente,
  aoAbrir,
  aoAprovar,
  aoAtribuir,
  aoRemarcar,
  aoDescartar,
}: {
  itens: ItemAgenda[];
  equipes: Equipe[];
  hoje: string;
  pendente: boolean;
  aoAbrir: (id: number) => void;
  aoAprovar: (item: ItemAgenda) => void;
  aoAtribuir: (item: ItemAgenda, equipe: Equipe) => void;
  aoRemarcar: (item: ItemAgenda, data: string) => void;
  aoDescartar: (item: ItemAgenda) => void;
}) {
  const visiveis = itens.slice(0, VISIVEIS);
  const restantes = itens.length - visiveis.length;

  return (
    <section
      aria-labelledby="titulo-fila"
      className="flex min-w-0 flex-col rounded-lg border border-border bg-surface"
    >
      <header className="flex items-start gap-3 border-b border-border p-5">
        <div className="min-w-0 flex-1">
          <h2 id="titulo-fila" className="text-base font-medium text-ink">
            Fila de decisão
          </h2>
          <p className="mt-1 text-xs text-ink-3">
            Sugestões da IA sem equipe, da mais urgente para a menos. Aprovar tira o serviço da
            fila; atribuir a equipe leva o bloco para a raia da turma.
          </p>
        </div>

        <span className="tnum shrink-0 rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-xs text-ink">
          {fmt.n(itens.length)}
        </span>
      </header>

      {itens.length === 0 ? (
        <div className="p-5">
          <EstadoVazio
            icone={<IconeDominio nome="CircleCheck" />}
            titulo="Nada esperando decisão"
            descricao="Toda sugestão da janela já foi aprovada, atribuída ou descartada."
          />
        </div>
      ) : (
        <>
          <ul className="min-w-0">
            {visiveis.map((item, i) => (
              <ItemFila
                key={item.id}
                item={item}
                indice={i}
                equipes={equipes}
                hoje={hoje}
                pendente={pendente}
                aoAbrir={aoAbrir}
                aoAprovar={aoAprovar}
                aoAtribuir={aoAtribuir}
                aoRemarcar={aoRemarcar}
                aoDescartar={aoDescartar}
              />
            ))}
          </ul>

          {restantes > 0 ? (
            <p className="border-t border-border px-5 py-3 text-2xs text-ink-3">
              Mostrando {fmt.n(visiveis.length)} de {fmt.n(itens.length)} sugestões. Decida as do
              topo — a fila reordena sozinha por urgência.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function ItemFila({
  item,
  indice,
  equipes,
  hoje,
  pendente,
  aoAbrir,
  aoAprovar,
  aoAtribuir,
  aoRemarcar,
  aoDescartar,
}: {
  item: ItemAgenda;
  indice: number;
  equipes: Equipe[];
  hoje: string;
  pendente: boolean;
  aoAbrir: (id: number) => void;
  aoAprovar: (item: ItemAgenda) => void;
  aoAtribuir: (item: ItemAgenda, equipe: Equipe) => void;
  aoRemarcar: (item: ItemAgenda, data: string) => void;
  aoDescartar: (item: ItemAgenda) => void;
}) {
  const idData = useId();
  const [remarcando, setRemarcando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [novaData, setNovaData] = useState(item.data);

  const t = item.ag.trecho;
  const daUf = equipes.filter((e) => e.ativo && e.base_uf === item.uf);
  const outras = equipes.filter((e) => e.ativo && e.base_uf !== item.uf);

  return (
    <li
      style={{ "--i": indice } as React.CSSProperties}
      className="rise min-w-0 border-b border-border p-4 last:border-b-0"
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => aoAbrir(item.id)}
          className="group min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-sm font-medium text-ink group-hover:underline">
            {t.rodovia}
          </span>
          <span className="tnum mt-0.5 block truncate font-mono text-2xs text-ink-3">
            {fmt.faixaKm(Number(t.km_inicio), Number(t.km_fim))} · {t.uf}
          </span>
          <span className="sr-only">Abrir detalhe do agendamento</span>
        </button>

        <ChipRisco risco={item.risco} tamanho="sm" />
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <CalendarClock aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
        <span className="tnum font-mono text-2xs text-ink">{fmt.dataMedia(item.data)}</span>
        <span className="text-2xs text-ink-3">{relativoEmDias(item.data)}</span>
        {item.atrasado ? (
          <Chip tom="critical" icone={<IconeDominio nome="OctagonAlert" />} className="h-5 text-2xs">
            Data vencida
          </Chip>
        ) : null}
      </p>

      <p className="mt-1.5 line-clamp-2 text-xs break-words text-ink-2">{item.ag.justificativa}</p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Botao
          tamanho="sm"
          variante="primario"
          disabled={pendente}
          iconeEsquerda={<Check />}
          onClick={() => aoAprovar(item)}
        >
          Aprovar
        </Botao>

        <Menu
          alinhamento="esquerda"
          gatilho={
            <Botao
              tamanho="sm"
              disabled={pendente}
              iconeEsquerda={<Users />}
              iconeDireita={<ChevronDown />}
            >
              Atribuir equipe
            </Botao>
          }
        >
          <p
            role="presentation"
            className="px-2.5 pt-1 pb-1.5 text-2xs tracking-widest text-ink-3 uppercase"
          >
            Base em {item.uf}
          </p>

          {daUf.length === 0 ? (
            <p role="presentation" className="px-2.5 pb-1.5 text-2xs text-ink-3">
              Nenhuma equipe com base neste estado.
            </p>
          ) : (
            daUf.map((equipe) => (
              <ItemMenu
                key={equipe.id}
                icone={<Users />}
                atalho={`${fmt.d1(Number(equipe.capacidade_km_dia))} km/d`}
                aoEscolher={() => aoAtribuir(item, equipe)}
              >
                {equipe.nome}
              </ItemMenu>
            ))
          )}

          {outras.length > 0 ? (
            <>
              <SeparadorMenu />
              <p
                role="presentation"
                className="px-2.5 pt-1 pb-1.5 text-2xs tracking-widest text-ink-3 uppercase"
              >
                Outros estados
              </p>
              {outras.map((equipe) => (
                <ItemMenu
                  key={equipe.id}
                  icone={<Users />}
                  atalho={equipe.base_uf}
                  aoEscolher={() => aoAtribuir(item, equipe)}
                >
                  {equipe.nome}
                </ItemMenu>
              ))}
            </>
          ) : null}
        </Menu>

        <BotaoIcone
          rotulo="Remarcar roçada"
          tamanho="sm"
          variante="secundario"
          aria-expanded={remarcando}
          onClick={() => {
            setNovaData(item.data);
            setRemarcando((v) => !v);
            setConfirmando(false);
          }}
        >
          <CalendarClock />
        </BotaoIcone>

        <BotaoIcone
          rotulo="Descartar sugestão"
          tamanho="sm"
          variante="perigo"
          onClick={() => {
            setConfirmando(true);
            setRemarcando(false);
          }}
        >
          <CircleSlash />
        </BotaoIcone>
      </div>

      {remarcando ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface-2 p-3"
          onSubmit={(evento) => {
            evento.preventDefault();
            setRemarcando(false);
            aoRemarcar(item, novaData);
          }}
        >
          <div className="min-w-36 flex-1">
            <Campo rotulo="Nova data da roçada" id={idData}>
              <Entrada
                type="date"
                min={hoje}
                value={novaData}
                onChange={(evento) => setNovaData(evento.target.value)}
              />
            </Campo>
          </div>

          <Botao type="submit" tamanho="sm" variante="secundario" disabled={pendente || !novaData}>
            Salvar data
          </Botao>
          <Botao tamanho="sm" variante="fantasma" onClick={() => setRemarcando(false)}>
            Cancelar
          </Botao>
        </form>
      ) : null}

      {/* Descartar some com a sugestão para sempre: pede confirmação em vez de
          obedecer no primeiro clique. */}
      <div
        aria-live="polite"
        className={cn(
          confirmando
            ? "mt-3 rounded-md border border-critical-soft bg-critical-soft p-3"
            : "sr-only",
        )}
      >
        {confirmando ? (
          <>
            <p className="text-xs font-medium text-critical-ink">
              Descartar a sugestão de {t.rodovia}? O trecho volta para a fila sem data.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Botao
                tamanho="sm"
                variante="perigo"
                disabled={pendente}
                onClick={() => {
                  setConfirmando(false);
                  aoDescartar(item);
                }}
              >
                Confirmar descarte
              </Botao>
              <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmando(false)}>
                Manter sugestão
              </Botao>
            </div>
          </>
        ) : null}
      </div>
    </li>
  );
}
