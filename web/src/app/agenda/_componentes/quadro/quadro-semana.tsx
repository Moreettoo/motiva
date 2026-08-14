"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Botao, BotaoIcone } from "@/components/ui/botao";
import { IconeDominio, Legenda } from "@/components/viz/legenda";
import { ORDEM_RISCO, RISCO } from "@/lib/dominio";
import { fmt, inicioDaSemana, somarDias } from "@/lib/format";
import type { Equipe } from "@/lib/types";

import {
  chaveDia,
  previaDoMovimento,
  type ChaveCelula,
  type Grade,
  type ItemAgenda,
  type Ocupacao,
  type ResumoDia,
} from "../dados";
import { CabecalhoDia } from "./cabecalho-dia";
import { CartaoServico } from "./cartao-servico";
import { LinhaTurma } from "./linha-turma";
import { MiniMapa } from "./mini-mapa";
import { Sobrevoo } from "./sobrevoo";
import { TrilhoFila } from "./trilho-fila";
import { useArrasto, type Alvo, type CargaArrasto } from "./usar-arrasto";
import { useFocoGrade } from "./usar-foco-grade";

/** Teto de cartões renderizados no trilho de uma vez — o custo é o CUSTO por
 *  quadro do arrasto (mais uma subárvore no hit-test de cada `pointermove`),
 *  não poupar pixel. Vivia dentro de `trilho-fila.tsx`; subiu pra cá para
 *  `useFocoGrade` (via `filaVisivel`) enxergar exatamente quais ids têm
 *  cartão montado — um id além do teto não tinha cartão nenhum na tela, mas
 *  o roving tabindex não sabia disso e podia zerar a parada de Tab da grade
 *  inteira ao apontar pra ele. */
const TETO_TRILHO = 25;

export function QuadroSemana({
  grade,
  itens,
  equipes,
  hoje,
  semana,
  selecionado,
  salvandoIds,
  desfazerPorId,
  resumo28dias,
  aoNavegar,
  aoSelecionar,
  aoAlocar,
  aoDevolver,
}: {
  grade: Grade;
  itens: ItemAgenda[];
  equipes: Equipe[];
  hoje: string;
  semana: string;
  selecionado: number | null;
  salvandoIds: ReadonlySet<number>;
  desfazerPorId: ReadonlyMap<number, () => void>;
  resumo28dias: ResumoDia[];
  aoNavegar: (semana: string) => void;
  aoSelecionar: (id: number) => void;
  aoAlocar: (item: ItemAgenda, dia: string, equipe: Equipe) => void;
  aoDevolver: (item: ItemAgenda) => void;
}) {
  const [passo, setPasso] = useState("");
  const [desfecho, setDesfecho] = useState("");
  const [filaExpandida, setFilaExpandida] = useState(false);
  const porId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);
  const equipePorId = useMemo(() => new Map(equipes.map((e) => [e.id, e])), [equipes]);
  const filaVisivel = useMemo(
    () => (filaExpandida ? grade.fila : grade.fila.slice(0, TETO_TRILHO)),
    [grade.fila, filaExpandida],
  );

  const validar = useCallback(
    (carga: CargaArrasto, alvo: Alvo): string | null => {
      if (alvo === carga.origem) return null;
      if (alvo === "fila") {
        return porId.get(carga.id)?.equipeId == null
          ? "Este serviço já está na fila."
          : null;
      }
      const celula = grade.porCelula.get(alvo);
      if (!celula) return "Essa célula não existe mais. Recarregue a página.";
      if (celula.dia < hoje) return "Esse dia já passou.";
      if (!celula.aceitaSolta) return "Essa turma está desativada e não recebe serviço novo.";
      return null;
    },
    [grade, hoje, porId],
  );

  const descrever = useCallback(
    (alvo: Alvo, carga: CargaArrasto): string => {
      if (alvo === "fila") return "Fila de decisão. Soltar aqui tira a turma.";
      const celula = grade.porCelula.get(alvo);
      if (!celula) return "";
      const equipe = equipePorId.get(celula.equipeId);
      const item = porId.get(carga.id);
      const previa = item ? previaDoMovimento(grade, item, alvo, equipes).get(alvo) : null;
      const leitura = previa ?? celula;

      return `${fmt.dataLonga(celula.dia)}. ${equipe?.nome ?? "Turma"}. ${fmt.km(leitura.km)} de ${fmt.km(celula.capacidade)} no dia.${leitura.excedida ? " Acima da capacidade." : ""}`;
    },
    [grade, equipePorId, equipes, porId],
  );

  const soltar = useCallback(
    (carga: CargaArrasto, alvo: Alvo) => {
      const item = porId.get(carga.id);
      if (!item) return;

      if (alvo === "fila") {
        aoDevolver(item);
        setDesfecho(`${carga.rotulo} devolvido para a fila.`);
        return;
      }

      const celula = grade.porCelula.get(alvo);
      const equipe = celula ? equipePorId.get(celula.equipeId) : undefined;
      if (!celula || !equipe) return;

      aoAlocar(item, celula.dia, equipe);
      setDesfecho(`${carga.rotulo} alocado para ${fmt.dataLonga(celula.dia)}, ${equipe.nome}.`);
    },
    [porId, grade, equipePorId, aoAlocar, aoDevolver],
  );

  const navegarSemana = useCallback(
    (delta: -1 | 1) => aoNavegar(chaveDia(somarDias(semana, delta * 7))),
    [aoNavegar, semana],
  );

  const { estado, iniciar, aoTeclar, engolirClique } = useArrasto({
    grade,
    validar,
    aoSoltar: soltar,
    descrever,
    anunciar: setPasso,
    aoNavegarSemana: navegarSemana,
  });

  const emVoo =
    estado.fase === "arrastando" || estado.fase === "carregando" ? estado.carga.id : null;
  const itemEmVoo = emVoo == null ? null : (porId.get(emVoo) ?? null);
  const alvoAtual = estado.fase === "arrastando" || estado.fase === "carregando" ? estado.alvo : null;
  const recusaAtual =
    estado.fase === "arrastando" || estado.fase === "carregando" ? estado.recusa : null;

  const previa = useMemo<Map<ChaveCelula, Ocupacao>>(() => {
    if (!itemEmVoo || !alvoAtual || alvoAtual === "fila" || recusaAtual) return new Map();
    return previaDoMovimento(grade, itemEmVoo, alvoAtual, equipes);
  }, [grade, itemEmVoo, alvoAtual, recusaAtual, equipes]);

  // Roving tabindex (`idAtivo`) + restauração de foco pós-remonte: extraído
  // para `usar-foco-grade.ts` (Ruling 14) — é a única parte deste arquivo que
  // mexe com foco/refs de DOM, e separá-la também isola as supressões do
  // eslint que essa mexida exige.
  const { idAtivo, idAtivoNoTrilho, refCartao } = useFocoGrade({
    grade,
    filaVisivel,
    emVoo,
    selecionado,
  });

  // `TrilhoFila`/`LinhaTurma` recebem `refCartao` de aridade 1 (contrato já
  // fixado nas Tarefas 5/6) — estes wrappers só fixam a REGIÃO de cada
  // chamador. Estáveis porque `refCartao` (o hook) é estável; o cache real
  // mora nele, chaveado por (região, id) — ver `usar-foco-grade.ts`.
  const refCartaoTrilho = useCallback((id: number) => refCartao("trilho", id), [refCartao]);
  const refCartaoGrid = useCallback((id: number) => refCartao("grid", id), [refCartao]);

  const desfazerDe = useCallback(
    (id: number) => desfazerPorId.get(id) ?? null,
    [desfazerPorId],
  );

  return (
    <section aria-label="Quadro da semana" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <BotaoIcone rotulo="Semana anterior" tamanho="sm" onClick={() => navegarSemana(-1)}>
            <ChevronLeft />
          </BotaoIcone>
          <p aria-live="polite" className="tnum min-w-0 font-mono text-sm text-ink">
            {fmt.dataCurta(grade.janela.inicio)} – {fmt.dataMedia(grade.janela.fim)}
          </p>
          <BotaoIcone rotulo="Próxima semana" tamanho="sm" onClick={() => navegarSemana(1)}>
            <ChevronRight />
          </BotaoIcone>
          <Botao
            tamanho="sm"
            variante="fantasma"
            onClick={() => aoNavegar(chaveDia(inicioDaSemana(hoje)))}
          >
            Hoje
          </Botao>
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
          </p>
        </div>
      </div>

      <MiniMapa
        resumos={resumo28dias}
        janela={grade.janela.dias}
        aoEscolherSemana={(dia) => aoNavegar(chaveDia(inicioDaSemana(dia)))}
      />

      <div className="flex min-w-0 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="hidden w-60 shrink-0 overflow-y-auto lg:block scroll-thin max-h-[min(78vh,760px)]">
          <TrilhoFila
            itens={filaVisivel}
            total={grade.fila.length}
            expandido={filaExpandida}
            aoExpandir={() => setFilaExpandida(true)}
            janelaFim={grade.janela.fim}
            realcado={alvoAtual === "fila" && !recusaAtual}
            idEmVoo={emVoo}
            idAtivo={idAtivoNoTrilho}
            selecionado={selecionado}
            salvandoIds={salvandoIds}
            aoPegar={iniciar}
            aoTeclar={aoTeclar}
            aoAbrir={aoSelecionar}
            engolirClique={engolirClique}
            refCartao={refCartaoTrilho}
          />
        </div>

        <div className="quadro-pista scroll-thin max-h-[min(78vh,760px)] min-w-0 flex-1">
          <div
            className="quadro-grade"
            style={{ "--linhas": Math.max(1, grade.linhas.length) } as React.CSSProperties}
          >
            {/* Três valores de z-index, escolhidos para o canto vencer sempre:
                canto (grudado nos dois eixos) = 30; eixo horizontal grudado
                (calha da equipe, em toda linha, inclusive a de "Propostas")
                = 10; eixo vertical grudado (cabeçalho do dia, em
                `cabecalho-dia.tsx`) = 20. 30 > 20 e 30 > 10 nas duas
                direções — sem essa folga o canto seria recortado numa das
                rolagens, a depender só da ordem do DOM. */}
            <div className="sticky top-0 left-0 z-30 border-r border-b border-border bg-surface px-2 py-1.5">
              <span className="block text-2xs tracking-widest text-ink-3 uppercase">Equipe</span>
            </div>

            {grade.janela.dias.map((dia, i) => (
              <CabecalhoDia key={dia} dia={dia} hoje={hoje} resumo={grade.porDia[i]} />
            ))}

            <div className="sticky left-0 z-10 border-r border-b border-border bg-surface px-2 py-1.5">
              <span className="block text-2xs font-medium text-ink-2">Propostas da IA</span>
              <span className="block text-2xs text-ink-3">sem turma</span>
            </div>

            {grade.janela.dias.map((dia) => (
              <div key={`prop-${dia}`} className="border-b border-l border-grid p-1.5">
                <ul className="flex min-w-0 flex-col gap-1">
                  {(grade.propostas.get(dia) ?? []).map((item) => (
                    <CartaoServico
                      key={item.id}
                      item={item}
                      origem="fila"
                      compacto
                      fantasma={item.id === emVoo}
                      selecionado={item.id === selecionado}
                      salvando={salvandoIds.has(item.id)}
                      ativo={item.id === idAtivo}
                      desfazer={null}
                      aoPegar={iniciar}
                      aoTeclar={aoTeclar}
                      aoAbrir={aoSelecionar}
                      engolirClique={engolirClique}
                      refCartao={refCartao("propostas", item.id)}
                    />
                  ))}
                </ul>
              </div>
            ))}

            {grade.linhas.map((linha) => (
              <LinhaTurma
                key={linha.equipe.id}
                linha={linha}
                previa={previa}
                alvoAtual={alvoAtual}
                recusaAtual={recusaAtual}
                emVoo={emVoo}
                selecionado={selecionado}
                idAtivo={idAtivo}
                salvandoIds={salvandoIds}
                aoPegar={iniciar}
                aoTeclar={aoTeclar}
                aoAbrir={aoSelecionar}
                engolirClique={engolirClique}
                refCartao={refCartaoGrid}
                desfazerDe={desfazerDe}
              />
            ))}
          </div>
        </div>
      </div>

      <Sobrevoo estado={estado} item={itemEmVoo} />

      <p aria-live="assertive" aria-atomic="true" className="sr-only">
        {passo}
      </p>
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {desfecho}
      </p>
    </section>
  );
}
