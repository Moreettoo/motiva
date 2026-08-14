"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  type LinhaEquipe,
  type Ocupacao,
  type ResumoDia,
} from "../dados";
import { CabecalhoDia } from "./cabecalho-dia";
import { CartaoServico } from "./cartao-servico";
import { CelulaEquipe } from "./celula-equipe";
import { MiniMapa } from "./mini-mapa";
import { Sobrevoo } from "./sobrevoo";
import { TrilhoFila } from "./trilho-fila";
import { useArrasto, type Alvo, type CargaArrasto } from "./usar-arrasto";

/** Primeiro cartão do quadro inteiro (fila, senão a grade): o padrão do roving
 *  tabindex enquanto nada foi arrastado nem selecionado ainda. Sem isso a
 *  grade ficaria sem NENHUM ponto de entrada por Tab na primeira visita. */
function primeiroItemDoQuadro(grade: Grade): number | null {
  if (grade.fila[0]) return grade.fila[0].id;
  for (const linha of grade.linhas) {
    for (const celula of linha.celulas) {
      if (celula.itens[0]) return celula.itens[0].id;
    }
  }
  return null;
}

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
  const refsCartoes = useRef(new Map<number, HTMLElement>());
  const porId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);
  const equipePorId = useMemo(() => new Map(equipes.map((e) => [e.id, e])), [equipes]);

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

  /* Roving tabindex da grade inteira (trilho + calha): só UM cartão entra no
     Tab por vez (as duas paradas do cartão ativo — ver `cartao-servico.tsx`).
     Segue o cartão em voo enquanto ele existir; senão o último selecionado;
     senão um padrão estável. Atualizado em fase de RENDER (não em efeito),
     porque precisa valer já no commit em que o próprio arrasto troca de alvo —
     um padrão de sincronização que o próprio React recomenda para "ajustar
     estado quando outro valor muda" sem entrar num efeito redundante. */
  const idPadrao = useMemo(() => primeiroItemDoQuadro(grade), [grade]);
  const [focoId, setFocoId] = useState<number | null>(idPadrao);
  if (emVoo != null && emVoo !== focoId) setFocoId(emVoo);
  else if (emVoo == null && selecionado != null && selecionado !== focoId) setFocoId(selecionado);
  // Se o item do último foco sumiu da lista (execução, troca de semana...), o
  // padrão cobre — nunca deixa a grade inteira sem nenhum ponto de entrada.
  const idAtivo = focoId != null && porId.has(focoId) ? focoId : idPadrao;

  /* O cartão remonta em outro pai depois de um movimento, então o foco se
     perde — inclusive de novo na reversão do `useOptimistic`, que chega bem
     depois, num commit próprio. Por isso o efeito não tem array de
     dependências (roda em TODO commit) e NÃO pode gatear por `emVoo`: ele já
     volta a `null` no MESMO commit em que o cartão troca de pai (o `fechar()`
     do arrasto e a atualização otimista são despachados juntos no mesmo
     evento), então um contador ou uma dependência em `emVoo` perderia
     justamente o commit em que a restauração é necessária. `idFocoRef` guarda
     o último id em voo e sobrevive a essa transição. A guarda testa
     `isConnected`/`document.body`, nunca `refQuadro.contains`: o segundo é
     falso para qualquer portal e roubaria o foco de dentro da gaveta de
     detalhe. */
  const idFocoRef = useRef<number | null>(null);
  // A regra `react-hooks/refs` supõe o React Compiler, que este projeto não
  // liga (ver o mesmo disable em `usar-arrasto.ts`). Escrever aqui, em vez de
  // num efeito, é o ponto inteiro do padrão: precisa valer no MESMO commit em
  // que `emVoo` ainda é o id antigo, antes de a próxima leitura (no efeito de
  // restauração, sem deps, mais abaixo) já ver `emVoo` de volta a `null`.
  // eslint-disable-next-line react-hooks/refs
  if (emVoo != null) idFocoRef.current = emVoo;
  useLayoutEffect(() => {
    if (selecionado != null) return;
    const alvo = idFocoRef.current;
    if (alvo == null) return;
    const ativo = document.activeElement;
    if (ativo && ativo !== document.body && ativo.isConnected) return;
    refsCartoes.current.get(alvo)?.focus({ preventScroll: true });
  });

  /* `refCartao(id)` precisa devolver A MESMA função entre renders para o
     mesmo id, ou o `memo` de todo cartão quebra a cada render (a prop não é o
     `ref` especial de JSX, é uma prop comum, sujeita a `Object.is`). O cache
     mora num `Map` que não é recriado — só cresce, o que é aceitável na
     escala de agendamentos deste painel. */
  const cacheRefCartao = useRef(new Map<number, (no: HTMLElement | null) => void>());
  const refCartao = useCallback((id: number) => {
    let fn = cacheRefCartao.current.get(id);
    if (!fn) {
      fn = (no: HTMLElement | null) => {
        if (no) refsCartoes.current.set(id, no);
        else refsCartoes.current.delete(id);
      };
      cacheRefCartao.current.set(id, fn);
    }
    return fn;
  }, []);

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
            itens={grade.fila}
            janelaFim={grade.janela.fim}
            realcado={alvoAtual === "fila" && !recusaAtual}
            idEmVoo={emVoo}
            idAtivo={idAtivo}
            selecionado={selecionado}
            salvandoIds={salvandoIds}
            aoPegar={iniciar}
            aoTeclar={aoTeclar}
            aoAbrir={aoSelecionar}
            engolirClique={engolirClique}
            refCartao={refCartao}
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

            {/* Mesma exceção justificada de `idFocoRef`: `refCartao(item.id)`
                lê o cache por id (ver comentário na sua definição) e precisa
                ser chamado aqui, durante o render — é uma prop comum do JSX,
                não o `ref` especial, então não há efeito que a substitua. */}
            {/* eslint-disable-next-line react-hooks/refs */}
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
                      refCartao={refCartao(item.id)}
                    />
                  ))}
                </ul>
              </div>
            ))}

            {grade.linhas.map((linha) => (
              <Linha
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
                refCartao={refCartao}
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

/** A calha grudada com o nome da turma, mais as 7 células da semana. Isolado
 *  do componente principal para o `.map()` das linhas ficar legível — a lista
 *  de props é grande porque a grade é plana (sem `subgrid`), então cada linha
 *  recebe tudo que suas células e cartões precisam de fora. */
function Linha({
  linha,
  previa,
  alvoAtual,
  recusaAtual,
  emVoo,
  selecionado,
  idAtivo,
  salvandoIds,
  aoPegar,
  aoTeclar,
  aoAbrir,
  engolirClique,
  refCartao,
  desfazerDe,
}: {
  linha: LinhaEquipe;
  previa: Map<ChaveCelula, Ocupacao>;
  alvoAtual: Alvo | null;
  recusaAtual: string | null;
  emVoo: number | null;
  selecionado: number | null;
  idAtivo: number | null;
  salvandoIds: ReadonlySet<number>;
  aoPegar: (e: React.PointerEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoTeclar: (e: React.KeyboardEvent<HTMLElement>, carga: CargaArrasto) => void;
  aoAbrir: (id: number) => void;
  engolirClique: (e: React.MouseEvent) => void;
  refCartao: (id: number) => (no: HTMLElement | null) => void;
  desfazerDe: (id: number) => (() => void) | null;
}) {
  const eq = linha.equipe;

  return (
    <>
      <div className="sticky left-0 z-10 flex flex-col justify-center border-r border-b border-border bg-surface px-2 py-1.5">
        <p className="truncate text-2xs font-medium text-ink" title={eq.nome}>
          {eq.nome}
        </p>
        <p className="tnum truncate font-mono text-2xs text-ink-3">
          {fmt.km(Number(eq.capacidade_km_dia))}/dia
          {eq.ativo ? "" : " · desativada"}
        </p>
      </div>

      {linha.celulas.map((celula) => (
        <CelulaEquipe
          key={celula.chave}
          celula={celula}
          equipeNome={eq.nome}
          previa={previa.get(celula.chave) ?? null}
          realcada={alvoAtual === celula.chave && !recusaAtual}
          recusada={alvoAtual === celula.chave && recusaAtual != null}
          filhos={celula.itens.map((item) => (
            <CartaoServico
              key={item.id}
              item={item}
              origem={celula.chave}
              fantasma={item.id === emVoo}
              selecionado={item.id === selecionado}
              salvando={salvandoIds.has(item.id)}
              ativo={item.id === idAtivo}
              desfazer={desfazerDe(item.id)}
              aoPegar={aoPegar}
              aoTeclar={aoTeclar}
              aoAbrir={aoAbrir}
              engolirClique={engolirClique}
              refCartao={refCartao(item.id)}
            />
          ))}
        />
      ))}
    </>
  );
}
