"use client";

import { ChevronDown, ListFilter, RotateCcw } from "lucide-react";

import { Botao } from "@/components/ui/botao";
import { Selecao } from "@/components/ui/campo";
import { ItemMenuAlternavel, Menu } from "@/components/ui/menu";
import { IconeDominio } from "@/components/viz/legenda";
import { STATUS } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import { STATUS_AGENDAMENTO, type Equipe, type StatusAgendamento } from "@/lib/types";

import type { EquipeNaUrl } from "./dados";

/**
 * Os controles do quadro: filtro de status e destaque de equipe.
 *
 * Eram uma FAIXA no nível da página, com os quatro status abertos como chips e
 * a contagem de cada um em texto — quatro números permanentes na tela, ao lado
 * de outros sete, para um controle que quase ninguém mexe. Viraram duas peças
 * que moram no cabeçalho do quadro, porque é o quadro que elas governam.
 *
 * O escopo dos números continua sendo TODA A MALHA, e não a semana visível: o
 * filtro alimenta a grade, o trilho inteiro e os 28 dias do mini-mapa, então a
 * contagem tem de ser do conjunto que o botão de fato governa. O que mudou é
 * onde isso está dito — antes precisava de um rótulo visível ("Status · toda a
 * malha") porque o número ficava solto entre números da semana; agora ele só
 * aparece DENTRO do menu, ao lado do nome do status, longe de qualquer número
 * de semana com que pudesse ser confundido. O nome acessível de cada item
 * continua carregando o escopo por extenso.
 */
export function Controles({
  status,
  aoMudarStatus,
  equipe,
  aoMudarEquipe,
  equipes,
  porStatusNaMalha,
  alterado,
  aoRestaurar,
}: {
  status: StatusAgendamento[];
  aoMudarStatus: (valor: StatusAgendamento[]) => void;
  equipe: EquipeNaUrl;
  aoMudarEquipe: (valor: EquipeNaUrl) => void;
  equipes: Equipe[];
  /** Agendamentos por status em TODA a malha — ver o comentário acima. */
  porStatusNaMalha: Record<StatusAgendamento, number>;
  alterado: boolean;
  aoRestaurar: () => void;
}) {
  function alternar(valor: StatusAgendamento) {
    aoMudarStatus(
      status.includes(valor) ? status.filter((s) => s !== valor) : [...status, valor],
    );
  }

  /* O resumo no gatilho, para o filtro não virar um estado escondido. Um botão
     que diz só "Status" obriga a abrir o menu para saber o que está filtrando —
     e um filtro que a pessoa esquece que ligou é pior que um chip a mais. Com
     nenhum status marcado a frase é "nenhum", que é literalmente o que a tela
     mostra nesse caso. */
  const marcados = STATUS_AGENDAMENTO.filter((s) => status.includes(s));
  const resumo =
    marcados.length === 0
      ? "nenhum"
      : marcados.length === STATUS_AGENDAMENTO.length
        ? "todos"
        : marcados.map((s) => STATUS[s].rotulo.toLowerCase()).join(", ");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Menu
        alinhamento="direita"
        gatilho={
          <Botao
            tamanho="sm"
            variante="secundario"
            iconeEsquerda={<ListFilter />}
            iconeDireita={<ChevronDown />}
          >
            <span className="max-w-40 truncate">Status: {resumo}</span>
          </Botao>
        }
      >
        {STATUS_AGENDAMENTO.map((s) => {
          const token = STATUS[s];
          return (
            <ItemMenuAlternavel
              key={s}
              marcado={status.includes(s)}
              contagem={fmt.n(porStatusNaMalha[s])}
              icone={<IconeDominio nome={token.icone} />}
              aoAlternar={() => alternar(s)}
            >
              {/* O nome acessível sai do texto do item mais o `aria-checked`, e
                  o número precisa entrar com unidade e escopo — solto, "59" é
                  falado como se fosse da semana. O texto visível continua
                  contido no nome (WCAG 2.5.3): o rótulo vem primeiro. */}
              <span>{token.rotulo}</span>
              <span className="sr-only">
                : {fmt.contar(porStatusNaMalha[s], "agendamento")} em toda a malha
              </span>
            </ItemMenuAlternavel>
          );
        })}
      </Menu>

      {/* Destaque, não filtro: escolher uma equipe aqui não esconde nenhum
          cartão — o quadro (`QuadroSemana`) atenua as linhas das OUTRAS
          equipes, porque toda célula continua sendo destino válido de solta.
          Sem opção "sem equipe": o trilho já É a visão de quem não tem
          equipe, e destacar "ninguém" não faz sentido como conceito. */}
      {/* O `<div>` de largura fixa não é enfeite: `Selecao` envolve o `<select>`
          num `<span class="relative flex w-full">` e ancora a seta na direita
          DESSE envoltório, e a `className` do componente desce para o `<select>`,
          não para ele. Numa faixa de formulário isso é o certo; aqui, numa barra
          de ferramentas, o envoltório esticava até o fim da linha e a seta
          aparecia solta a meio metro do campo. Dimensionar por fora resolve sem
          mexer numa peça compartilhada por outras telas. */}
      <div className="w-44">
        <Selecao
          aria-label="Destacar equipe"
          value={equipe}
          onChange={(evento) => aoMudarEquipe(evento.target.value)}
          className="h-8 text-xs"
        >
          <option value="">Destacar equipe</option>
          {equipes
            .filter((e) => e.ativo)
            .map((e) => (
              <option key={e.id} value={String(e.id)}>
                {e.nome}
              </option>
            ))}
        </Selecao>
      </div>

      {/* "Restaurar padrão", não "Restaurar filtros": o seletor de equipe
          acima destaca, não filtra, e o rótulo antigo prometia esconder algo
          que este botão nunca escondeu. */}
      {alterado ? (
        <Botao tamanho="sm" variante="fantasma" iconeEsquerda={<RotateCcw />} onClick={aoRestaurar}>
          Restaurar padrão
        </Botao>
      ) : null}
    </div>
  );
}
