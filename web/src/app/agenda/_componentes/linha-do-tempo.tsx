"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { TriangleAlert } from "lucide-react";

import { BarraProgresso } from "@/components/ui/barra-progresso";
import { EstadoVazio } from "@/components/ui/vazio";
import { IconeDominio, Legenda } from "@/components/viz/legenda";
import { ORDEM_RISCO, RISCO, STATUS, rotuloPrazo } from "@/lib/dominio";
import { fmt, parseData } from "@/lib/format";
import { clamp, cn } from "@/lib/utils";

import {
  ALTURA_BLOCO,
  FOLGA_BLOCO,
  LARGURA_DIA,
  LARGURA_RAIA,
  alturaDaRaia,
  ehFimDeSemana,
  fatiarPorMes,
  type ItemPosicionado,
  type Janela,
  type Periodo,
  type Raia,
} from "./dados";

/* O balão vai para o <body>: o container da régua tem overflow nos dois eixos
   (é o que faz o cabeçalho e a coluna de equipe grudarem), então qualquer
   posicionamento interno seria recortado na primeira e na última raia. */
const semAssinatura = () => () => {};
const verdadeiro = () => true;
const falso = () => false;

const HACHURA_EXCESSO =
  "repeating-linear-gradient(45deg, color-mix(in oklab, var(--critical) 26%, transparent) 0 5px, transparent 5px 10px)";

type Balao = { item: ItemPosicionado; x: number; y: number; acima: boolean };

export function textoServico(dias: number): string {
  return dias === 1 ? "1 dia de serviço" : `${fmt.n(dias)} dias de serviço`;
}

/* Rótulo em pares "campo: valor" de propósito: encaixar "sugerido" e "média" numa
   frase corrida obrigaria a concordar gênero com quatro substantivos diferentes. */
function rotuloDoBloco(item: ItemPosicionado): string {
  const t = item.ag.trecho;
  return [
    `${t.rodovia}, ${fmt.faixaKm(Number(t.km_inicio), Number(t.km_fim))}, ${t.uf}`,
    `Roçada para ${fmt.dataMedia(item.data)}`,
    `Situação: ${STATUS[item.status].rotulo}`,
    `Risco: ${RISCO[item.risco].rotulo}`,
    `Extensão: ${fmt.km(item.km)}`,
    `Estimativa: ${textoServico(item.diasServico)}`,
    item.equipeNome ? `Equipe: ${item.equipeNome}` : "Sem equipe atribuída",
    "Abrir detalhe",
  ].join(". ");
}

export function LinhaDoTempo({
  raias,
  janela,
  periodo,
  hoje,
  selecionado,
  aoSelecionar,
  mostrandoEncerrados,
}: {
  raias: Raia[];
  janela: Janela;
  periodo: Periodo;
  hoje: string;
  selecionado: number | null;
  aoSelecionar: (id: number) => void;
  mostrandoEncerrados: boolean;
}) {
  const [balao, setBalao] = useState<Balao | null>(null);
  const montado = useSyncExternalStore(semAssinatura, verdadeiro, falso);

  const larguraDia = LARGURA_DIA[periodo];
  const larguraDias = janela.dias.length * larguraDia;
  const indiceHoje = janela.dias.indexOf(hoje);
  const total = raias.reduce((n, r) => n + r.itens.length, 0);

  // O balão é `fixed`, então qualquer rolagem — da régua ou da página — o
  // desgruda do bloco. Some em vez de flutuar apontando para o lugar errado.
  const comBalao = balao != null;
  useEffect(() => {
    if (!comBalao) return;
    const dispensar = () => setBalao(null);
    window.addEventListener("scroll", dispensar, true);
    return () => window.removeEventListener("scroll", dispensar, true);
  }, [comBalao]);

  function apontar(elemento: HTMLElement, item: ItemPosicionado) {
    const caixa = elemento.getBoundingClientRect();
    const acima = caixa.top > 220;
    setBalao({
      item,
      x: clamp(caixa.left + caixa.width / 2, 140, window.innerWidth - 140),
      y: acima ? caixa.top - 8 : caixa.bottom + 8,
      acima,
    });
  }

  if (total === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-5">
        <CabecalhoRegua janela={janela} raias={raias} mostrandoEncerrados={mostrandoEncerrados} />
        <EstadoVazio
          className="mt-5"
          icone={<IconeDominio nome="Clock" />}
          titulo="Nenhuma roçada nesta janela"
          descricao="Nenhum agendamento cai entre as datas selecionadas com os filtros atuais. Abra o período para quinzena ou mês, ou inclua mais status."
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="p-5 pb-4">
        <CabecalhoRegua janela={janela} raias={raias} mostrandoEncerrados={mostrandoEncerrados} />
      </div>

      {/* O overflow nos dois eixos é o que faz o cabeçalho de dias e a coluna de
          equipe grudarem: `sticky` só se ancora num container que rola. */}
      <div className="max-h-[min(68vh,620px)] overflow-auto overscroll-x-contain border-t border-border scroll-thin">
        <div style={{ width: LARGURA_RAIA + larguraDias }} className="relative">
          <div className="sticky top-0 z-30 flex bg-surface">
            <div
              style={{ width: LARGURA_RAIA }}
              className="sticky left-0 z-10 shrink-0 border-r border-b border-border bg-surface px-3 py-2"
            >
              <span className="block text-2xs tracking-widest text-ink-3 uppercase">Equipe</span>
              <span className="tnum mt-1 block truncate font-mono text-2xs text-ink-2">
                {fmt.dataCurta(janela.inicio)} – {fmt.dataCurta(janela.fim)}
              </span>
            </div>

            <div style={{ width: larguraDias }} className="shrink-0">
              <div className="flex h-5 border-b border-border">
                {fatiarPorMes(janela.dias).map((fatia) => (
                  <div
                    key={fatia.dia}
                    style={{ width: fatia.quantidade * larguraDia }}
                    className="shrink-0 truncate border-l border-border px-2 text-2xs leading-5 tracking-widest text-ink-3 uppercase"
                  >
                    {fmt.mesAno(fatia.dia)}
                  </div>
                ))}
              </div>

              <div className="flex border-b border-border">
                {janela.dias.map((dia) => {
                  const fds = ehFimDeSemana(dia);
                  const ehHoje = dia === hoje;

                  return (
                    <div
                      key={dia}
                      aria-current={ehHoje ? "date" : undefined}
                      style={{ width: larguraDia }}
                      className={cn(
                        "relative shrink-0 border-l border-border px-1 py-1.5 text-center",
                        fds && "bg-surface-3",
                      )}
                    >
                      <span
                        className={cn(
                          "block truncate text-2xs tracking-widest uppercase",
                          ehHoje ? "text-ink" : fds ? "text-ink-3" : "text-ink-2",
                        )}
                      >
                        {fmt.diaSemana(dia)}
                      </span>
                      <span
                        className={cn(
                          "tnum mt-0.5 block font-mono text-sm leading-none",
                          ehHoje ? "font-semibold text-ink" : "text-ink-2",
                        )}
                      >
                        {fmt.n(parseData(dia).getDate())}
                      </span>

                      {ehHoje ? (
                        <>
                          <span
                            aria-hidden="true"
                            className="absolute inset-x-0 bottom-0 h-0.5 bg-accent-line"
                          />
                          <span className="sr-only">hoje</span>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {raias.map((raia) => (
            <FaixaEquipe
              key={raia.chave}
              raia={raia}
              janela={janela}
              larguraDia={larguraDia}
              larguraDias={larguraDias}
              indiceHoje={indiceHoje}
              selecionado={selecionado}
              aoSelecionar={aoSelecionar}
              aoApontar={apontar}
              aoSair={() => setBalao(null)}
            />
          ))}
        </div>
      </div>

      {montado && balao
        ? createPortal(
            <div
              aria-hidden="true"
              style={{
                position: "fixed",
                left: balao.x,
                top: balao.y,
                transform: `translate(-50%, ${balao.acima ? "-100%" : "0"})`,
              }}
              className="pointer-events-none z-50 w-64 rounded-md border border-border-strong bg-surface-2 p-3 shadow-md"
            >
              <ConteudoBalao item={balao.item} />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function CabecalhoRegua({
  janela,
  raias,
  mostrandoEncerrados,
}: {
  janela: Janela;
  raias: Raia[];
  mostrandoEncerrados: boolean;
}) {
  const servicos = raias.reduce((n, r) => n + r.itens.length, 0);

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h2 className="text-base font-medium text-ink">Linha do tempo da operação</h2>
        <p className="mt-1 text-xs text-ink-3">
          {servicos === 1 ? "1 serviço" : `${fmt.n(servicos)} serviços`} entre{" "}
          {fmt.dataMedia(janela.inicio)} e {fmt.dataMedia(janela.fim)}. A largura do bloco é o tempo
          estimado de serviço: km do trecho sobre a capacidade da equipe, em dias inteiros.
        </p>
      </div>

      <div className="flex min-w-0 flex-col items-start gap-2">
        <Legenda
          itens={ORDEM_RISCO.map((risco) => ({
            rotulo: RISCO[risco].rotulo,
            cor: RISCO[risco].cor,
            icone: <IconeDominio nome={RISCO[risco].icone} />,
          }))}
        />
        <p className="text-2xs text-ink-3">
          Hachura vermelha marca o dia em que a equipe passa da capacidade.
          {mostrandoEncerrados ? " Executado e descartado aparecem em cinza." : ""}
        </p>
      </div>
    </div>
  );
}

function FaixaEquipe({
  raia,
  janela,
  larguraDia,
  larguraDias,
  indiceHoje,
  selecionado,
  aoSelecionar,
  aoApontar,
  aoSair,
}: {
  raia: Raia;
  janela: Janela;
  larguraDia: number;
  larguraDias: number;
  indiceHoje: number;
  selecionado: number | null;
  aoSelecionar: (id: number) => void;
  aoApontar: (elemento: HTMLElement, item: ItemPosicionado) => void;
  aoSair: () => void;
}) {
  const altura = alturaDaRaia(raia);
  const nome = raia.equipe?.nome ?? "Sem equipe";
  const excedidos = raia.diasExcedidos.length;

  return (
    <div className="flex border-b border-border last:border-b-0">
      <div
        style={{ width: LARGURA_RAIA, minHeight: altura }}
        className="sticky left-0 z-20 flex shrink-0 flex-col justify-center gap-1 border-r border-border bg-surface px-3 py-2"
      >
        <p className="truncate text-xs font-medium text-ink" title={nome}>
          {nome}
        </p>

        <p className="tnum truncate font-mono text-2xs text-ink-3">
          {raia.capacidade == null
            ? "capacidade estimada"
            : raia.km > 0
              ? `${fmt.km(raia.capacidade)}/dia · ${fmt.km(raia.km)}`
              : `${fmt.km(raia.capacidade)}/dia`}
        </p>

        {raia.ocupacao21 != null ? (
          <div className="flex items-center gap-1.5">
            <span aria-hidden="true" className="shrink-0 text-2xs text-ink-3">
              21&nbsp;d
            </span>
            <BarraProgresso
              valor={raia.ocupacao21}
              tom="neutro"
              mostrarValor
              rotulo={`Ocupação de ${nome} nos próximos 21 dias`}
            />
          </div>
        ) : null}

        {excedidos > 0 ? (
          <p className="flex items-center gap-1 text-2xs font-medium text-critical-ink">
            <TriangleAlert aria-hidden="true" className="size-3 shrink-0" />
            <span className="truncate">
              {excedidos === 1 ? "1 dia acima" : `${fmt.n(excedidos)} dias acima`}
            </span>
          </p>
        ) : null}
      </div>

      <div style={{ width: larguraDias, minHeight: altura }} className="relative shrink-0">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {janela.dias.map((dia, i) => (
            <span
              key={dia}
              style={{ left: i * larguraDia, width: larguraDia }}
              className={cn(
                "absolute inset-y-0 border-l border-grid",
                ehFimDeSemana(dia) && "bg-surface-3",
              )}
            />
          ))}

          {raia.diasExcedidos.map((d) => (
            <span
              key={`excesso-${d}`}
              style={{ left: d * larguraDia, width: larguraDia, backgroundImage: HACHURA_EXCESSO }}
              className="absolute inset-y-0"
            />
          ))}

          {indiceHoje >= 0 ? (
            <span
              style={{ left: indiceHoje * larguraDia }}
              className="absolute inset-y-0 w-0.5 bg-accent-line"
            />
          ) : null}
        </div>

        {raia.itens.length === 0 ? (
          <p className="absolute top-1/2 left-3 -translate-y-1/2 text-2xs text-ink-3">
            Sem serviço no período
          </p>
        ) : null}

        {raia.itens.map((item, i) => (
          <Bloco
            key={item.id}
            item={item}
            indice={i}
            larguraDia={larguraDia}
            selecionado={item.id === selecionado}
            aoSelecionar={aoSelecionar}
            aoApontar={aoApontar}
            aoSair={aoSair}
          />
        ))}
      </div>
    </div>
  );
}

function Bloco({
  item,
  indice,
  larguraDia,
  selecionado,
  aoSelecionar,
  aoApontar,
  aoSair,
}: {
  item: ItemPosicionado;
  indice: number;
  larguraDia: number;
  selecionado: boolean;
  aoSelecionar: (id: number) => void;
  aoApontar: (elemento: HTMLElement, item: ItemPosicionado) => void;
  aoSair: () => void;
}) {
  const token = RISCO[item.risco];
  // Serviço encerrado sai da escala de risco: o risco de um trecho já roçado não
  // é informação viva, e pintá-lo de vermelho competiria com o que ainda importa.
  // O filete lateral guarda o risco; só o corpo do bloco fica neutro.
  const encerrado = item.status === "executado" || item.status === "descartado";
  const largura = Math.max(28, item.diasServico * larguraDia - 2);
  const compacto = largura < 76;

  return (
    <button
      type="button"
      aria-label={rotuloDoBloco(item)}
      aria-pressed={selecionado}
      onClick={() => aoSelecionar(item.id)}
      onMouseEnter={(e) => aoApontar(e.currentTarget, item)}
      onMouseLeave={aoSair}
      onFocus={(e) => aoApontar(e.currentTarget, item)}
      onBlur={aoSair}
      style={
        {
          "--i": Math.min(indice, 10),
          left: item.inicio * larguraDia + 1,
          width: largura,
          top: item.linha * (ALTURA_BLOCO + FOLGA_BLOCO) + FOLGA_BLOCO + 2,
          height: ALTURA_BLOCO,
          backgroundColor: encerrado ? "var(--surface-3)" : token.fundo,
          color: encerrado ? "var(--ink-3)" : token.tinta,
          borderColor: `color-mix(in oklab, ${token.cor} ${encerrado ? 28 : 55}%, transparent)`,
        } as React.CSSProperties
      }
      /* z-10 fixo: a coluna de equipe gruda em z-20 e precisa passar por cima dos
         blocos na rolagem horizontal. Blocos nunca se sobrepõem entre si — o
         empacotamento em sub-linhas já resolveu isso. */
      className={cn(
        "fade absolute z-10 overflow-hidden rounded-sm border text-left",
        "transition-transform duration-150 ease-[var(--ease-out-quint)] hover:-translate-y-px",
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: token.cor }}
      />

      <span className="relative flex h-full min-w-0 items-center gap-1.5 pr-2 pl-2.5">
        <IconeDominio
          nome={encerrado ? STATUS[item.status].icone : token.icone}
          className="size-3.5"
        />

        {compacto ? null : (
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-2xs font-medium">{item.ag.trecho.rodovia}</span>
            <span className="tnum block truncate font-mono text-2xs opacity-80">
              {fmt.faixaKm(Number(item.ag.trecho.km_inicio), Number(item.ag.trecho.km_fim))}
            </span>
          </span>
        )}
      </span>

      {selecionado ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-sm border-2"
          style={{ borderColor: "var(--accent-line)" }}
        />
      ) : null}
    </button>
  );
}

function ConteudoBalao({ item }: { item: ItemPosicionado }) {
  const t = item.ag.trecho;
  const risco = RISCO[item.risco];
  const status = STATUS[item.status];

  return (
    <>
      <p className="truncate text-sm font-medium text-ink">{t.rodovia}</p>
      <p className="tnum mt-0.5 truncate font-mono text-2xs text-ink-3">
        {fmt.faixaKm(Number(t.km_inicio), Number(t.km_fim))} · {t.uf}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-2xs">
        <span className="inline-flex items-center gap-1" style={{ color: risco.tinta }}>
          <IconeDominio nome={risco.icone} className="size-3" />
          {risco.rotulo}
        </span>
        <span aria-hidden="true" className="text-ink-3">
          ·
        </span>
        <span className="inline-flex items-center gap-1 text-ink-2">
          <IconeDominio nome={status.icone} className="size-3" />
          {status.rotulo}
        </span>
      </div>

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-2xs">
        <dt className="text-ink-3">Data</dt>
        <dd className="tnum truncate text-right font-mono text-ink">{fmt.dataMedia(item.data)}</dd>

        <dt className="text-ink-3">Extensão</dt>
        <dd className="tnum text-right font-mono text-ink">{fmt.km(item.km)}</dd>

        <dt className="text-ink-3">Serviço</dt>
        <dd className="tnum text-right font-mono text-ink">
          {fmt.n(item.diasServico)} d · {fmt.km(item.capacidade)}/dia
        </dd>

        <dt className="text-ink-3">Prazo</dt>
        <dd className="tnum text-right font-mono text-ink">
          {rotuloPrazo(item.ag.previsao?.dias_ate_limite)}
        </dd>

        <dt className="text-ink-3">Equipe</dt>
        <dd className="truncate text-right text-ink">{item.equipeNome ?? "Sem equipe"}</dd>
      </dl>

      <p className="mt-2 line-clamp-3 border-t border-border pt-2 text-2xs text-ink-2">
        {item.ag.justificativa}
      </p>
    </>
  );
}
