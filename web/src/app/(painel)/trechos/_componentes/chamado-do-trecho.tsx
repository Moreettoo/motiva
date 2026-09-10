import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  CircleCheck,
  CircleSlash,
  ClipboardList,
  Clock,
  Hourglass,
  OctagonAlert,
  Play,
  Ruler,
  Undo2,
  Users,
} from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo, CartaoRodape } from "@/components/ui/cartao";
import { diasDeAtraso, estaAtrasado } from "@/lib/chamados/numero";
import { STATUS_CHAMADO_TOKEN } from "@/lib/dominio";
import { fmt, parseData, relativoEmDias } from "@/lib/format";
import type { ChamadoDetalhado, StatusChamado } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * A ordem de serviço do trecho, do lado do card de decisão.
 *
 * Card PRÓPRIO, e não uma seção dentro de `DecisaoIa`, porque as duas coisas
 * têm autores e tempos diferentes: `DecisaoIa` explica por que esta data foi
 * escolhida, e quem a escolheu foi a IA ou um gestor, uma vez. Isto aqui é o
 * que está acontecendo em campo agora, e quem o move é a equipe, do celular.
 * Misturá-los deixaria um card cujo conteúdo muda sem que a decisão que ele
 * explica tenha mudado.
 *
 * Sem ações. Aprovar, devolver e decidir adiamento exigem as fotos lado a lado,
 * km, custo e comentário: é a gaveta de `/chamados`, e o link leva até ela.
 * Duas telas para a mesma decisão, cada uma com metade do contexto, é pior que
 * um clique a mais.
 */

/* Ponte entre o nome de ícone de `STATUS_CHAMADO_TOKEN` e o componente, igual
   ao que `icone-cargo.tsx` faz para os cargos: o mapa de
   `components/viz/legenda.tsx` cobre risco, status de agendamento e procedência
   do clima, e nenhum dos sete estados do chamado — por lá "Play" cai no
   `?? Circle` e o chip desenha uma bolinha vazia, que na tela lê como ícone que
   não carregou. Local também porque esta página é Server Component: importar o
   chip da agenda arrastaria `cartao-servico.tsx`, e com ele todo o motor de
   arrasto, para o pacote de cliente deste trecho. */
const ICONES_CHAMADO = {
  Clock,
  Play,
  Hourglass,
  Undo2,
  CalendarClock,
  CircleCheck,
  CircleSlash,
} as const;

function ChipChamado({ status }: { status: StatusChamado }) {
  const token = STATUS_CHAMADO_TOKEN[status];
  const Icone = ICONES_CHAMADO[token.icone as keyof typeof ICONES_CHAMADO];

  return (
    <span
      title={token.descricao}
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1.5 rounded-full px-2",
        "text-xs font-medium whitespace-nowrap",
      )}
      style={{ color: token.tinta, backgroundColor: token.fundo }}
    >
      <Icone aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">{token.rotulo}</span>
    </span>
  );
}

export function ChamadoDoTrecho({
  chamado,
  hojeIso,
}: {
  chamado: ChamadoDetalhado;
  hojeIso: string;
}) {
  const equipe = chamado.agendamento.equipe;
  const data = chamado.agendamento.data_sugerida;
  const atrasado = estaAtrasado(chamado.status, data, hojeIso);
  const diasAtraso = diasDeAtraso(data, hojeIso);

  /* "Informada" quer dizer que alguém mediu; "prevista", que o número saiu do
     modelo. A procedência aparece porque a altura inicial vira
     `altura_antes_cm` na execução, e daí entra no histórico do trecho e no
     treino da próxima previsão: um número previsto tratado como medido
     realimentaria o modelo com a própria saída dele. */
  const alturaInformada = chamado.altura_inicial_origem === "informada";

  return (
    <Cartao>
      <CartaoCabecalho
        como="h2"
        icone={<ClipboardList />}
        titulo="O chamado deste trecho"
        descricao="A ordem de serviço aberta pela aprovação desta roçada, e em que pé ela está."
        acoes={<ChipChamado status={chamado.status} />}
      />

      <CartaoCorpo>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span aria-hidden="true" className="block h-0.5 w-10 shrink-0 self-center rounded-sm bg-accent-line" />
          <span className="tnum font-mono text-2xl leading-none font-semibold text-ink">
            {chamado.numero}
          </span>
        </div>

        {/* Atraso é do chamado `aberto` que passou da data, e só dele: em
            andamento não é atraso, é trabalho (ver `estaAtrasado`). Cor com
            ícone e rótulo, como o resto da escala de status. */}
        {atrasado ? (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-critical-soft px-2 py-1 text-xs text-critical-ink">
            <OctagonAlert aria-hidden="true" className="size-3.5 shrink-0" />
            A equipe ainda não começou, {fmt.contar(diasAtraso, "dia")} depois da data prevista.
          </p>
        ) : null}

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-ink-3">Data prevista</dt>
          <dd className="tnum text-right font-mono text-ink">
            {fmt.dataMedia(data)}{" "}
            <span className="text-ink-3">· {relativoEmDias(data, parseData(hojeIso))}</span>
          </dd>

          <dt className="text-ink-3">Equipe</dt>
          <dd className="text-right break-words text-ink">
            {equipe ? (
              <span className="inline-flex items-center gap-1.5">
                <Users aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
                {equipe.nome}
                {equipe.lider_nome ? (
                  <span className="text-ink-3">· {equipe.lider_nome}</span>
                ) : null}
              </span>
            ) : (
              "Sem equipe"
            )}
          </dd>

          <dt className="text-ink-3">Altura inicial</dt>
          <dd className="tnum text-right font-mono text-ink">
            {fmt.cm(chamado.altura_inicial_cm)}
            <span className="ml-1.5 font-sans text-2xs text-ink-3">
              {alturaInformada ? "medida em campo" : "prevista pelo modelo"}
            </span>
          </dd>

          {chamado.altura_final_cm != null ? (
            <>
              <dt className="text-ink-3">Altura depois</dt>
              <dd className="tnum text-right font-mono text-ink">
                {fmt.cm(chamado.altura_final_cm)}
              </dd>
            </>
          ) : null}
        </dl>

        {/* A altura medida é a que vale, e dizê-lo aqui é o que separa este
            número de uma extrapolação: com origem `prevista`, ninguém foi ao
            trecho ANTES da roçada, e a altura inicial é o modelo respondendo
            sobre si mesmo.

            A frase nomeia a altura INICIAL, e não "este chamado": a altura
            final pode já existir (a equipe mede ao fechar), e uma frase sobre o
            chamado inteiro negaria uma medição que está impressa duas linhas
            acima. */}
        {alturaInformada ? null : (
          <p className="mt-3 flex items-start gap-1.5 text-2xs text-ink-3">
            <Ruler aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
            Ninguém mediu o trecho antes desta roçada: a altura inicial é a
            previsão do modelo na abertura do chamado.
          </p>
        )}
      </CartaoCorpo>

      <CartaoRodape>
        <Link
          href={`/chamados?chamado=${chamado.id}`}
          className="inline-flex items-center gap-1.5 rounded-sm text-accent transition-colors duration-150 ease-[var(--ease-out-quint)] hover:text-ink"
        >
          Abrir em Chamados
          <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0" />
        </Link>
        <span className="tnum">aberto em {fmt.dataMedia(chamado.criado_em)}</span>
      </CartaoRodape>
    </Cartao>
  );
}
