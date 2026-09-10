"use client";

import { ClipboardList, Eraser, TriangleAlert } from "lucide-react";

import { Botao } from "@/components/ui/botao";
import { Chip, ChipRisco } from "@/components/ui/chip";
import {
  Tabela,
  TabelaCabecalho,
  TabelaCelula,
  TabelaCorpo,
  TabelaLinha,
  TabelaTitulo,
} from "@/components/ui/tabela";
import { EstadoVazio } from "@/components/ui/vazio";
import { diasDeAtraso, estaAtrasado } from "@/lib/chamados/numero";
import type { ChamadoNaTela } from "@/lib/chamados/queries";
import { prioridadeExibida, textoDivergencia } from "@/lib/dominio";
import { fmt, relativoEmDias } from "@/lib/format";
import { cn } from "@/lib/utils";

import { desde } from "./cartao-chamado";
import { ChipChamado } from "./icones";

/**
 * A lista inteira, na ordem que `listarChamados` já entrega: estado que pede
 * decisão primeiro, depois prioridade, depois data. Ordenação por coluna não
 * existe aqui de propósito — a ordem da fila É a informação, e uma tabela que
 * reordena por clique convida a perdê-la sem oferecer nada em troca. Quem quer
 * outro recorte usa o filtro, que vai para a URL e volta.
 */
export function ListaChamados({
  chamados,
  hoje,
  agora,
  chamadoAberto,
  filtrada,
  aoAbrir,
  aoLimpar,
}: {
  chamados: ChamadoNaTela[];
  hoje: string;
  agora: string;
  chamadoAberto: number | null;
  /** Há filtro ligado: muda o texto do estado vazio e oferece limpar. */
  filtrada: boolean;
  aoAbrir: (id: number) => void;
  aoLimpar: () => void;
}) {
  if (chamados.length === 0) {
    return filtrada ? (
      <EstadoVazio
        icone={<ClipboardList />}
        titulo="Nenhum chamado com esses filtros"
        descricao="Tire um filtro para ver mais, ou limpe todos e comece de novo."
        acao={
          <Botao variante="secundario" iconeEsquerda={<Eraser />} onClick={aoLimpar}>
            Limpar filtros
          </Botao>
        }
      />
    ) : (
      <EstadoVazio
        icone={<ClipboardList />}
        titulo="Nenhum chamado ainda"
        descricao="Um chamado nasce quando uma roçada é aprovada com equipe. Aprove uma na agenda, ou crie aqui em Novo chamado."
      />
    );
  }

  return (
    /* `max-h` + `overflow-auto` no contêiner, e não na página: com 12 ou com
       400 chamados a tabela rola por dentro, o cabeçalho gruda no topo dela e
       a fila de decisão continua visível acima. É também o que segura a
       largura em 390 px, onde as sete colunas não cabem: rola a tabela, nunca
       a página. */
    <Tabela rotulo="Chamados" className="max-h-[60vh]">
      <TabelaCabecalho>
        <tr>
          <TabelaTitulo>Número</TabelaTitulo>
          <TabelaTitulo>Trecho</TabelaTitulo>
          <TabelaTitulo>Equipe</TabelaTitulo>
          <TabelaTitulo>Data prevista</TabelaTitulo>
          <TabelaTitulo>Estado</TabelaTitulo>
          <TabelaTitulo>Prioridade</TabelaTitulo>
          <TabelaTitulo>Última atividade</TabelaTitulo>
        </tr>
      </TabelaCabecalho>

      <TabelaCorpo>
        {chamados.map((c) => {
          const { trecho, agendamento } = c;
          const equipe = agendamento.equipe;
          const atrasado = estaAtrasado(c.status, agendamento.data_sugerida, hoje);
          const prioridade = prioridadeExibida(c.prazo_dias, agendamento.prioridade, agendamento.origem);

          return (
            <TabelaLinha
              key={c.id}
              selecionada={chamadoAberto === c.id}
              onClick={() => aoAbrir(c.id)}
              className="cursor-pointer"
            >
              <TabelaCelula className="tnum font-mono whitespace-nowrap">
                {/* O botão é o alvo de teclado da linha: `<tr onClick>` sozinho
                    não é focável e a tabela ficaria inacessível sem mouse. */}
                <button
                  type="button"
                  onClick={(evento) => {
                    evento.stopPropagation();
                    aoAbrir(c.id);
                  }}
                  className="rounded-sm font-medium text-ink hover:text-accent hover:underline"
                >
                  {c.numero}
                </button>
              </TabelaCelula>

              <TabelaCelula>
                <span className="block max-w-56 truncate font-medium text-ink">{trecho.rodovia}</span>
                <span className="tnum block text-xs text-ink-3">
                  {fmt.faixaKm(Number(trecho.km_inicio), Number(trecho.km_fim))} · {trecho.uf}
                </span>
              </TabelaCelula>

              <TabelaCelula>
                {equipe ? (
                  <>
                    <span className="block max-w-40 truncate text-ink">{equipe.nome}</span>
                    {equipe.lider_nome ? (
                      <span className="block max-w-40 truncate text-xs text-ink-3">
                        {equipe.lider_nome}
                      </span>
                    ) : (
                      <Chip tom="warning" tamanho="sm" icone={<TriangleAlert />}>
                        sem líder
                      </Chip>
                    )}
                  </>
                ) : (
                  <Chip tom="warning" tamanho="sm" icone={<TriangleAlert />}>
                    sem equipe
                  </Chip>
                )}
              </TabelaCelula>

              <TabelaCelula className="whitespace-nowrap">
                <span className={cn("tnum block", atrasado ? "font-medium text-critical-ink" : "text-ink")}>
                  {fmt.dataCurta(agendamento.data_sugerida)}
                </span>
                {atrasado ? (
                  <span className="flex items-center gap-1 text-xs text-critical-ink">
                    <TriangleAlert aria-hidden="true" className="size-3 shrink-0" />
                    {fmt.contar(diasDeAtraso(agendamento.data_sugerida, hoje), "dia de atraso", "dias de atraso")}
                  </span>
                ) : (
                  <span className="block text-xs text-ink-3">
                    {relativoEmDias(agendamento.data_sugerida, hoje)}
                  </span>
                )}
              </TabelaCelula>

              <TabelaCelula>
                <ChipChamado status={c.status} />
              </TabelaCelula>

              {/* Do PRAZO de hoje, nunca de `agendamento.prioridade`: ver
                  `prioridadeExibida`. O `title` guarda a palavra registrada
                  quando ela discorda, para a divergência não sumir da tela. */}
              <TabelaCelula>
                <span title={textoDivergencia(prioridade) ?? undefined}>
                  <ChipRisco risco={prioridade.risco} />
                </span>
              </TabelaCelula>

              <TabelaCelula className="whitespace-nowrap">
                <span className="tnum block text-ink-2">{fmt.dataCurta(c.atualizado_em)}</span>
                <span className="block text-xs text-ink-3">{desde(c.atualizado_em, agora)}</span>
              </TabelaCelula>
            </TabelaLinha>
          );
        })}
      </TabelaCorpo>
    </Tabela>
  );
}
