"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, OctagonAlert } from "lucide-react";

import { Botao, BotaoIcone } from "@/components/ui/botao";
import { IconeDominio, Legenda } from "@/components/viz/legenda";
import { ORDEM_RISCO, RISCO } from "@/lib/dominio";
import { fmt, inicioDaSemana, somarDias } from "@/lib/format";
import type { Equipe } from "@/lib/types";
import { cn } from "@/lib/utils";

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
import { alvoPropostas, ehAlvoPropostas } from "./navegacao";
import { Sobrevoo } from "./sobrevoo";
import { TrilhoResponsivo, useTrilhoEstreito } from "./trilho-responsivo";
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
  equipeFoco,
  totalAtrasados,
  semanaAtraso,
  selecionado,
  salvandoIds,
  desfazerPorId,
  resumo28dias,
  aoNavegar,
  aoIrParaAtrasados,
  aoSelecionar,
  aoAlocar,
  aoDevolver,
}: {
  grade: Grade;
  itens: ItemAgenda[];
  equipes: Equipe[];
  hoje: string;
  semana: string;
  /** id da equipe em destaque (seletor de `controles.tsx`), ou `null` sem
   *  destaque. Escalar de propósito: desce até `CelulaEquipe` (memo) e não
   *  pode virar objeto/função recriada a cada render, sob pena de derrubar o
   *  memo dos ~130 cartões durante o `pointermove` do arrasto. */
  equipeFoco: number | null;
  /** Da malha inteira, não só da semana visível — ver o comentário em
   *  `planejamento.tsx`. */
  totalAtrasados: number;
  /** Segunda-feira da semana do atrasado mais antigo; `null` sem nenhum. */
  semanaAtraso: string | null;
  selecionado: number | null;
  salvandoIds: ReadonlySet<number>;
  desfazerPorId: ReadonlyMap<number, () => void>;
  resumo28dias: ResumoDia[];
  aoNavegar: (semana: string) => void;
  /** Clique em "X vencidos · ir para a semana". Diferente de `aoNavegar`
   *  puro: "atrasado" só existe em `sugerido`/`aprovado` (ver `dados.tsx`),
   *  então quem chama também precisa garantir os dois no filtro de status —
   *  senão o número promete um cartão que o filtro escondeu, e o clique leva
   *  a uma semana onde ele não está na grade. */
  aoIrParaAtrasados: () => void;
  aoSelecionar: (id: number) => void;
  aoAlocar: (item: ItemAgenda, dia: string, equipe: Equipe) => void;
  aoDevolver: (item: ItemAgenda) => void;
}) {
  const [passo, setPasso] = useState("");
  const [desfecho, setDesfecho] = useState("");
  const [anuncioDestaque, setAnuncioDestaque] = useState("");
  const [filaExpandida, setFilaExpandida] = useState(false);
  // Fechada por padrão: a doca não deveria cobrir a grade assim que a página
  // abre no estreito. Independente de `filaExpandida` — ver o comentário em
  // `TrilhoResponsivo` sobre por que são dois eixos, não um.
  const [docaAberta, setDocaAberta] = useState(false);
  const estreito = useTrilhoEstreito();
  // Abaixo de `lg`, o trilho só é um alvo de navegação alcançável quando a
  // doca está aberta — colapsada ele é `inert` (ver `TrilhoResponsivo`).
  // Sem isto, `proximoAlvo` continuaria oferecendo "fila" como destino de
  // Shift+seta/seta simples e `validar` aceitaria, apontando para um cartão
  // que existe no DOM mas não pode receber foco.
  const filaDisponivel = !estreito || docaAberta;
  const porId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);
  const equipePorId = useMemo(() => new Map(equipes.map((e) => [e.id, e])), [equipes]);
  const equipeFocoNome = equipeFoco != null ? (equipePorId.get(equipeFoco)?.nome ?? null) : null;

  // Mesma condição de `linhaAtenuada` (dados.tsx): equipe em foco sem
  // NENHUMA linha nesta semana não atenua ninguém — atenuar a semana toda
  // sem nada para contrastar seria o oposto de "destacar". O anúncio
  // precisa concordar com isso, senão descreve um destaque que a tela não
  // está mostrando.
  const focoVisivelNaSemana = useMemo(
    () => equipeFoco != null && grade.linhas.some((l) => l.equipe.id === equipeFoco),
    [equipeFoco, grade.linhas],
  );

  // Quem não vê a tela não percebe a opacidade das linhas atenuadas — só o
  // aria-live abaixo conta essa história. Pula o PRIMEIRO commit (a guarda de
  // `montado`) para não anunciar "destaque removido" assim que a página abre
  // sem nenhum filtro na URL, que não é uma MUDANÇA, é o estado inicial.
  // Depende de `focoVisivelNaSemana`, não só do nome: trocar de SEMANA com o
  // MESMO destaque ativo pode fazer a equipe em foco ganhar ou perder a
  // linha, e o anúncio precisa reavaliar nesse momento — não só quando o
  // destaque em si muda.
  const montado = useRef(false);
  useEffect(() => {
    if (!montado.current) {
      montado.current = true;
      return;
    }
    setAnuncioDestaque(
      !equipeFocoNome
        ? "Destaque de equipe removido."
        : focoVisivelNaSemana
          ? `${equipeFocoNome} em destaque. As demais equipes aparecem atenuadas no quadro.`
          : `${equipeFocoNome} em destaque. Nenhum serviço desta equipe nesta semana — nada atenuado.`,
    );
  }, [equipeFocoNome, focoVisivelNaSemana]);
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
      // Pseudo-alvo da linha "Propostas da IA" (ver `alvoPropostas`, em
      // `navegacao.ts`): nunca um destino real, `grade.porCelula` não o
      // conhece. A regra 4 da spec (§1) proíbe marcar um dia sem equipe —
      // esta é a frase literal que ela pede.
      if (ehAlvoPropostas(alvo)) return "Escolha uma equipe — um dia só é marcado com turma.";
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
    filaDisponivel,
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
  // para `usar-foco-grade.ts` porque é a única parte deste arquivo que mexe
  // com foco/refs de DOM, e separá-la também isola as supressões do eslint
  // que essa mexida exige.
  const { idAtivo, idAtivoNoTrilho, refCartao, aoFocar } = useFocoGrade({
    grade,
    filaVisivel,
    emVoo,
    selecionado,
    filaDisponivel,
  });

  // `TrilhoFila`/`LinhaTurma` recebem `refCartao`/`aoFocar` de aridade 1 — a
  // região de cada chamador é fixa, então só falta fechar o id por chamada.
  // Estáveis porque os dois hooks são estáveis; o cache real mora neles,
  // chaveado por (região, id) — ver `usar-foco-grade.ts`.
  const refCartaoTrilho = useCallback((id: number) => refCartao("trilho", id), [refCartao]);
  const refCartaoGrid = useCallback((id: number) => refCartao("grid", id), [refCartao]);
  const aoFocarTrilho = useCallback((id: number) => aoFocar("trilho", id), [aoFocar]);
  const aoFocarGrid = useCallback((id: number) => aoFocar("grid", id), [aoFocar]);

  const desfazerDe = useCallback(
    (id: number) => desfazerPorId.get(id) ?? null,
    [desfazerPorId],
  );

  const idTitulo = useId();

  return (
    <section aria-labelledby={idTitulo} className="flex min-w-0 flex-col gap-3">
      {/* `linha-do-tempo.tsx`/`fila-decisao.tsx` (apagados) tinham cada um o
          próprio `<h2>`; sem eles a página pulava de `<h1>` direto para o
          `<h3>` do trilho — um vão que só quem navega por cabeçalhos sente.
          `sr-only` porque o cabeçalho visual já é a navegação de semana logo
          abaixo; o texto existe para a árvore de heading, não para a tela. */}
      <h2 id={idTitulo} className="sr-only">
        Quadro da semana
      </h2>

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

          {totalAtrasados > 0 && semanaAtraso ? (
            <Botao
              tamanho="sm"
              variante="perigo"
              iconeEsquerda={<OctagonAlert />}
              onClick={aoIrParaAtrasados}
            >
              {fmt.contar(totalAtrasados, "vencido")} · ir para a semana
            </Botao>
          ) : null}
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
        <TrilhoResponsivo
          docaAberta={docaAberta}
          aoAlternarDoca={() => setDocaAberta((atual) => !atual)}
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
          aoFocar={aoFocarTrilho}
        />

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

            {grade.janela.dias.map((dia) => {
              // A linha de Propostas nunca aceita solta (regra 4, spec §1):
              // soltar aqui marcaria um dia sem equipe. `data-celula-recusada`
              // deixa o hit-test do ponteiro reconhecer a região SEM que ela
              // vire um alvo válido — o mesmo atributo que `CelulaEquipe` usa
              // para célula passada/turma desativada, ver `usar-arrasto.ts`.
              const alvo = alvoPropostas(dia);
              const recusadaAqui = alvoAtual === alvo && recusaAtual != null;
              return (
                <div
                  key={`prop-${dia}`}
                  data-celula-recusada={alvo}
                  className={cn(
                    "border-b border-l border-grid p-1.5",
                    recusadaAqui && "ring-2 ring-ink-3 ring-inset cursor-not-allowed",
                  )}
                >
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
                        aoFocar={aoFocar("propostas", item.id)}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}

            {grade.linhas.map((linha) => (
              <LinhaTurma
                key={linha.equipe.id}
                linha={linha}
                atenuada={focoVisivelNaSemana && linha.equipe.id !== equipeFoco}
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
                aoFocar={aoFocarGrid}
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
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {anuncioDestaque}
      </p>
    </section>
  );
}
