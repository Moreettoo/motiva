"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleCheck, RefreshCw } from "lucide-react";

import type { EventoCampo, FotoLocal } from "@/lib/campo/contratos";
import { aplicarPendencias } from "@/lib/campo/fila";
import { SESSAO_EXPIRADA } from "@/lib/campo/sincronizar";
import { fmt, hojeNoFusoDoPainel } from "@/lib/format";
import type { MotivoAdiamento } from "@/lib/types";

import { borda, BotaoCampo, ESCALA, Rotulo } from "./base";
import { CabecalhoCampo } from "./cabecalho-campo";
import { DetalheChamado } from "./detalhe-chamado";
import { FluxoAdiar } from "./fluxo-adiar";
import { FluxoFinalizar } from "./fluxo-finalizar";
import { FluxoIniciar } from "./fluxo-iniciar";
import { IndicadorSincronizacao } from "./indicador-sincronizacao";
import { ListaChamados } from "./lista-chamados";
import { useSincronizacao } from "./usar-sincronizacao";

/**
 * A tela do campo inteira, num componente cliente puro.
 *
 * NADA aqui pode depender de cookie, header ou banco no primeiro render: este
 * HTML e prerenderizado no build, guardado pelo service worker e servido a
 * frio, sem rede, para QUALQUER equipe. Quem sabe de quem e a sessao e a API;
 * quem guarda o dado e o IndexedDB.
 *
 * NAVEGACAO. A pilha de vistas mora em estado local, nao na URL, porque o app
 * roda em `display: standalone`: com a pilha do historico vazia, o botao voltar
 * do Android FECHA o app. Cada abertura de vista empurra uma entrada com
 * `history.pushState`, e `popstate` desempilha — assim voltar volta uma tela em
 * vez de sair.
 *
 * `?equipe=` (so gestor) e lido de `window.location.search` e gravado com
 * `history.replaceState`, e nao com `nuqs` como o plano sugeria. Dois motivos:
 * `nuqs` quer ser dono da URL e brigaria com o `pushState` das vistas acima; e
 * ele le a URL por `useSearchParams`, exatamente o tipo de leitura de request
 * que tiraria esta pagina do prerender estatico.
 */

type Vista =
  | { nome: "lista" }
  | { nome: "detalhe"; chamadoId: number }
  | { nome: "iniciar"; chamadoId: number }
  | { nome: "finalizar"; chamadoId: number }
  | { nome: "adiar"; chamadoId: number };

const LISTA: Vista = { nome: "lista" };

type Aviso = { texto: string; em: number };

export function AppCampo() {
  /**
   * A equipe escolhida, lida da URL JA NO PRIMEIRO RENDER do cliente.
   *
   * Nao pode ser um efeito, e isso foi medido: `useSincronizacao(equipeId)`
   * recebia `null` no primeiro render, disparava a primeira sincronizacao, e
   * quando o efeito chegava com a equipe de verdade a guarda `emCurso` do hook
   * engolia a segunda tentativa — a tela ficava para sempre no esqueleto,
   * "Carregando os chamados da sua equipe…", com a API respondendo 200.
   *
   * `typeof window` decide o ramo: no prerender do build nao ha URL nenhuma e o
   * estado nasce `{ lida: false, id: null }`, que pinta o MESMO esqueleto que o
   * cliente pinta no primeiro render (o IndexedDB ainda nao respondeu). Nenhuma
   * API de request e tocada, entao a pagina continua estatica.
   *
   * "Ja li a URL?" e "qual equipe?" andam juntos num estado so: separados,
   * dariam um render intermediario em que a URL foi lida e a equipe ainda nao
   * chegou, e o gestor veria o esqueleto piscar antes do seletor.
   */
  const [urlEquipe, setUrlEquipe] = useState<{ lida: boolean; id: number | null }>(() => {
    if (typeof window === "undefined") return { lida: false, id: null };
    const n = Number(new URLSearchParams(window.location.search).get("equipe"));
    return { lida: true, id: Number.isInteger(n) && n > 0 ? n : null };
  });
  const [equipesOferecidas, setEquipesOferecidas] = useState<{ id: number; nome: string }[] | null>(null);
  const [pilha, setPilha] = useState<Vista[]>([LISTA]);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const equipeId = urlEquipe.id;
  const vista = pilha[pilha.length - 1];

  const { estado, fila, carregado, rede, sincronizando, ultimoRelatorio, recarregar, enviarAgora, registrar } =
    useSincronizacao(equipeId);

  /**
   * O voltar, do Android e do navegador.
   *
   * A pilha e cortada na PROFUNDIDADE que o proprio historico carrega, nunca
   * decrementada de um. Isso foi medido: `history.go(-2)`, que e o que fechar um
   * fluxo faz, dispara UM unico `popstate`, nao dois. Um handler que tirasse um
   * item por evento deixava a tela no detalhe quando devia voltar para a lista,
   * e a pilha em React ficava dessincronizada do historico do navegador — o
   * defeito seguinte seria o voltar do Android engolindo toques mortos.
   *
   * A entrada inicial de `/campo` nao tem `profundidade` (o `state` dela e do
   * router do Next), e `?? 1` a resolve como "a lista".
   */
  useEffect(() => {
    const voltar = (e: PopStateEvent) => {
      const profundidade = (e.state as { profundidade?: number } | null)?.profundidade ?? 1;
      setPilha((atual) => (profundidade < atual.length ? atual.slice(0, Math.max(1, profundidade)) : atual));
    };
    window.addEventListener("popstate", voltar);
    return () => window.removeEventListener("popstate", voltar);
  }, []);

  const abrir = useCallback((nova: Vista) => {
    setPilha((atual) => {
      const proxima = [...atual, nova];
      window.history.pushState({ profundidade: proxima.length }, "");
      return proxima;
    });
  }, []);

  /* Voltar pela tela usa `history.back()`, nao `setPilha`: assim a entrada
     empurrada em `abrir` tambem sai do historico, e as duas pilhas continuam
     com o mesmo tamanho. */
  const voltar = useCallback(() => window.history.back(), []);

  /**
   * Fechar um fluxo e cair na lista, em um salto.
   *
   * Os passos saem da `profundidade` gravada na ENTRADA ATUAL do historico, e
   * nao do tamanho da pilha em React. Isso tambem foi medido, e o sintoma foi
   * grave: com as duas contagens dessincronizadas, `history.go` passou da
   * entrada de `/campo` e levou a aba para `chrome://newtab` — o app
   * simplesmente saiu do ar depois de a pessoa registrar a rocada. Lendo do
   * historico nao ha como passar do inicio.
   */
  const voltarAteLista = useCallback(() => {
    const profundidade = (window.history.state as { profundidade?: number } | null)?.profundidade ?? 1;
    if (profundidade > 1) window.history.go(-(profundidade - 1));
  }, []);

  const escolherEquipe = useCallback((id: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set("equipe", String(id));
    // `replaceState` preserva o `state`: a profundidade da entrada atual nao muda
    // por trocar de equipe, so a query string.
    window.history.replaceState(window.history.state, "", url);
    setUrlEquipe({ lida: true, id });
    setEquipesOferecidas(null);
  }, []);

  /* O gestor cai aqui: a API recusou com 400 e mandou a lista de equipes. O
     Rocador nunca ve este caminho, porque para ele a equipe vem da sessao. */
  useEffect(() => {
    if (!urlEquipe.lida || urlEquipe.id != null || rede === "offline") return;
    let vivo = true;
    void fetch("/api/campo/estado", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.status === 400 ? r.json() : null))
      .then((corpo: { equipes?: { id: number; nome: string }[] } | null) => {
        if (vivo && corpo?.equipes) setEquipesOferecidas(corpo.equipes);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [rede, urlEquipe]);

  const anunciar = useCallback((texto: string) => setAviso({ texto, em: Date.now() }), []);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  /**
   * O caminho de gravacao de TODOS os fluxos.
   *
   * A palavra do aviso vem da REDE no momento da gravacao, nao do resultado do
   * envio: "Guardado no aparelho" e a verdade imediata e nunca fica errada; o
   * indicador do topo conta o resto da historia quando o envio acontecer.
   */
  const gravar = useCallback(
    async (evento: EventoCampo, fotos: FotoLocal[]) => {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      await registrar(evento, fotos);
      anunciar(offline ? "Guardado no aparelho" : "Enviado");
      voltarAteLista();
    },
    [anunciar, registrar, voltarAteLista],
  );

  const chamados = aplicarPendencias(estado?.chamados ?? [], fila);
  const chamadoDaVista = vista.nome === "lista" ? null : (chamados.find((c) => c.id === vista.chamadoId) ?? null);
  const naFila = new Set(fila.map((i) => i.chamado_id));

  const casca = (
    <>
      <IndicadorSincronizacao
        estado={estado}
        fila={fila}
        carregado={carregado}
        rede={rede}
        sincronizando={sincronizando}
        aoEnviar={() => void enviarAgora()}
        aoAtualizar={() => void recarregar()}
      />
      <CabecalhoCampo estado={estado} fila={fila} />
    </>
  );

  return (
    <div className="min-h-dvh">
      {casca}

      <main className="mx-auto max-w-lg px-4 py-4">
        {ultimoRelatorio?.erro === SESSAO_EXPIRADA ? (
          <SessaoVencida pendentes={fila.length} />
        ) : equipesOferecidas != null && equipeId == null ? (
          <SeletorEquipe equipes={equipesOferecidas} aoEscolher={escolherEquipe} />
        ) : estado == null && !carregado ? (
          /* Ainda lendo o aparelho. O esqueleto vem ANTES da pergunta "tem
             sinal?", senao a tela responde uma pergunta que ainda nao sabe. */
          <Esqueleto />
        ) : estado == null && rede === "offline" ? (
          <SemDadoSemRede aoTentar={() => void recarregar()} />
        ) : estado == null ? (
          <Esqueleto />
        ) : chamadoDaVista == null ? (
          <ListaChamados chamados={chamados} fila={fila} hoje={hojeNoFusoDoPainel()} aoAbrir={(id) => abrir({ nome: "detalhe", chamadoId: id })} />
        ) : vista.nome === "detalhe" ? (
          <DetalheChamado
            chamado={chamadoDaVista}
            pendente={naFila.has(chamadoDaVista.id)}
            aoVoltar={voltar}
            aoIniciar={() => abrir({ nome: "iniciar", chamadoId: chamadoDaVista.id })}
            aoFinalizar={() => abrir({ nome: "finalizar", chamadoId: chamadoDaVista.id })}
            aoAdiar={() => abrir({ nome: "adiar", chamadoId: chamadoDaVista.id })}
          />
        ) : vista.nome === "iniciar" ? (
          <FluxoIniciar
            chamado={chamadoDaVista}
            aoVoltar={voltar}
            aoRegistrar={(fotos, eventoId, ocorridoEm) =>
              gravar({ evento_id: eventoId, chamado_id: chamadoDaVista.id, tipo: "iniciado", payload: {}, ocorrido_em: ocorridoEm }, fotos)
            }
          />
        ) : vista.nome === "finalizar" ? (
          <FluxoFinalizar
            chamado={chamadoDaVista}
            aoVoltar={voltar}
            aoRegistrar={(fotos, eventoId, ocorridoEm, alturaFinalCm) =>
              gravar(
                {
                  evento_id: eventoId,
                  chamado_id: chamadoDaVista.id,
                  tipo: "finalizado",
                  payload: { altura_final_cm: alturaFinalCm },
                  ocorrido_em: ocorridoEm,
                },
                fotos,
              )
            }
          />
        ) : (
          <FluxoAdiar
            chamado={chamadoDaVista}
            aoVoltar={voltar}
            aoRegistrar={(eventoId, ocorridoEm, payload: { motivo: MotivoAdiamento; detalhe: string | null; data_sugerida: string | null }) =>
              gravar(
                { evento_id: eventoId, chamado_id: chamadoDaVista.id, tipo: "adiamento_solicitado", payload, ocorrido_em: ocorridoEm },
                [],
              )
            }
          />
        )}
      </main>

      {aviso ? <Confirmacao texto={aviso.texto} /> : null}
    </div>
  );
}

/**
 * A palavra depois de gravar. Nunca um giro sozinho: num app offline, "onde
 * foi parar o que eu acabei de registrar" e a unica pergunta que importa.
 */
function Confirmacao({ texto }: { texto: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={borda("var(--border-strong)")}
      className="fade fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-lg items-center gap-2 rounded-lg border bg-surface-2 px-4 py-3 shadow-lg"
    >
      <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-good-ink" />
      <p className={`${ESCALA.corpo} font-medium`}>{texto}</p>
    </div>
  );
}

function SessaoVencida({ pendentes }: { pendentes: number }) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <div>
        <h1 className={ESCALA.tela}>Sua sessão venceu</h1>
        <p className={`${ESCALA.corpo} mt-2 text-ink-2`}>
          Entre de novo para enviar o que está guardado.
          {/* `fmt.contar` e nao interpolacao crua: com uma pendencia a frase saia
              "Os 1 registros no aparelho continuam aqui", e essa e a tela que o
              gestor vai olhar por cima do ombro do rocador. */}
          {pendentes > 0 ? ` ${fmt.contar(pendentes, "registro")} no aparelho ${pendentes === 1 ? "continua" : "continuam"} aqui; nada foi perdido.` : ""}
        </p>
      </div>
      {/* Ancora de verdade, e nao `router.push`: a rota de destino esta fora do
          grupo (campo) e a navegacao do cliente nao a tem no bundle. */}
      <a
        href="/entrar?proximo=/campo"
        className={`${ESCALA.corpo} flex h-14 w-full items-center justify-center rounded-lg bg-accent font-medium text-accent-ink active:bg-accent-hover`}
      >
        Entrar de novo
      </a>
    </div>
  );
}

function SemDadoSemRede({ aoTentar }: { aoTentar: () => void }) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <div>
        <h1 className={ESCALA.tela}>Nada guardado no aparelho</h1>
        <p className={`${ESCALA.corpo} mt-2 text-ink-2`}>
          Conecte-se uma vez para baixar os chamados da sua equipe. Depois disso o app abre sem sinal.
        </p>
      </div>
      <BotaoCampo variante="primario" icone={<RefreshCw className="size-5" />} onClick={aoTentar}>
        Tentar de novo
      </BotaoCampo>
    </div>
  );
}

function SeletorEquipe({ equipes, aoEscolher }: { equipes: { id: number; nome: string }[]; aoEscolher: (id: number) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className={ESCALA.tela}>Escolha a equipe</h1>
        <p className={`${ESCALA.corpo} mt-1 text-ink-2`}>
          Você entrou como gestor. O app de campo mostra os chamados de uma equipe por vez.
        </p>
      </div>
      <ul className="space-y-2">
        {equipes.map((e) => (
          <li key={e.id}>
            <BotaoCampo variante="secundario" className="justify-start" onClick={() => aoEscolher(e.id)}>
              {e.nome}
            </BotaoCampo>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="space-y-6">
      <div>
        <Rotulo>Hoje</Rotulo>
        <ul className="mt-2 space-y-2" aria-label="Carregando os chamados">
          {[0, 1, 2].map((i) => (
            <li key={i} className="animate-pulse rounded-lg border border-border bg-surface p-4">
              <div className="h-5 w-2/3 rounded-sm bg-surface-3" />
              <div className="mt-2 h-4 w-1/2 rounded-sm bg-surface-3" />
              <div className="mt-3 h-6 w-28 rounded-full bg-surface-3" />
            </li>
          ))}
        </ul>
      </div>
      <p className={`${ESCALA.corpo} text-ink-2`}>Carregando os chamados da sua equipe…</p>
    </div>
  );
}
