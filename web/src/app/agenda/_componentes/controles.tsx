"use client";

import { RotateCcw } from "lucide-react";

import { Botao } from "@/components/ui/botao";
import { Selecao } from "@/components/ui/campo";
import { IconeDominio } from "@/components/viz/legenda";
import { STATUS } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import { STATUS_AGENDAMENTO, type Equipe, type StatusAgendamento } from "@/lib/types";
import { cn } from "@/lib/utils";

import type { EquipeNaUrl } from "./dados";

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
  /** Agendamentos por status em TODA a malha — não na semana visível. O nome
   *  carrega o escopo porque este é o único número desta tela que ignora a
   *  janela: o filtro é global (alimenta a grade, o trilho inteiro e os 28 dias
   *  do mini-mapa), então a contagem tem que ser do conjunto que o botão de
   *  fato governa. Ver a REGRA dos dois grupos em `planejamento.tsx`. */
  porStatusNaMalha: Record<StatusAgendamento, number>;
  alterado: boolean;
  aoRestaurar: () => void;
}) {
  function alternar(valor: StatusAgendamento) {
    aoMudarStatus(
      status.includes(valor) ? status.filter((s) => s !== valor) : [...status, valor],
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div
        role="group"
        aria-label="Filtrar por status do agendamento. As contagens são de toda a malha, não só da semana no quadro."
        className="flex flex-wrap items-center gap-1.5"
      >
        {/* Rótulo VISÍVEL do escopo, não só nome acessível: tudo em volta desta
            linha — a faixa de resumo e o quadro — fala da SEMANA, e um número
            cru ao lado do rótulo se lê como "nesta semana". Supor isso errado é
            o defeito que a contagem por malha veio consertar, então o escopo
            precisa estar em texto, não deduzível. É também o aviso de que a
            contagem mudou de significado: ela era da semana e passou a ser da
            malha, o que multiplica o número por quase dez sem mudar nada na
            tela — sem este rótulo, a mudança pareceria um erro de cálculo. */}
        <span className="text-2xs font-medium tracking-widest text-ink-3 uppercase">
          Status · toda a malha
        </span>

        {STATUS_AGENDAMENTO.map((s) => {
          const token = STATUS[s];
          const ativo = status.includes(s);

          return (
            <button
              key={s}
              type="button"
              aria-pressed={ativo}
              // O nome acessível repete o escopo porque quem chega ao botão por
              // Tab não passou pelo rótulo do grupo nem pela linha visível
              // acima — ouviria o número sem nada que o situasse. Começa pelo
              // rótulo visível ("Sugerido"), então o texto na tela continua
              // contido no nome (WCAG 2.5.3).
              aria-label={`${token.rotulo}: ${fmt.contar(porStatusNaMalha[s], "agendamento")} em toda a malha`}
              onClick={() => alternar(s)}
              style={ativo ? { color: token.tinta, backgroundColor: token.fundo } : undefined}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium",
                "transition-[background-color,border-color,color] duration-150 ease-[var(--ease-out-quint)]",
                ativo
                  ? "border-transparent"
                  : "border-border bg-surface text-ink-3 hover:border-border-strong hover:text-ink-2",
              )}
            >
              <IconeDominio nome={token.icone} className="size-3.5" />
              <span>{token.rotulo}</span>
              <span className="tnum font-mono text-2xs opacity-70">
                {fmt.n(porStatusNaMalha[s])}
              </span>
            </button>
          );
        })}
      </div>

      {/* Destaque, não filtro: escolher uma equipe aqui não esconde nenhum
          cartão — o quadro (`QuadroSemana`) atenua as linhas das OUTRAS
          equipes, porque toda célula continua sendo destino válido de solta.
          Sem opção "sem equipe": o trilho já É a visão de quem não tem
          turma, e destacar "ninguém" não faz sentido como conceito. */}
      <Selecao
        aria-label="Destacar equipe"
        value={equipe}
        onChange={(evento) => aoMudarEquipe(evento.target.value)}
        className="h-8 w-auto min-w-44 text-xs"
      >
        <option value="">Nenhuma equipe em destaque</option>
        {equipes
          .filter((e) => e.ativo)
          .map((e) => (
            <option key={e.id} value={String(e.id)}>
              {e.nome}
            </option>
          ))}
      </Selecao>

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
