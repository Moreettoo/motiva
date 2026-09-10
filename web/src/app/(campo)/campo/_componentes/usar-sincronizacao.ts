"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { enfileirar, guardarFoto, lerEstado, listarFila, listarForaDeOrdem, verForaDeOrdem } from "@/lib/campo/banco-local";
import type { EstadoCampo, EventoCampo, ForaDeOrdem, FotoLocal, ItemFila } from "@/lib/campo/contratos";
import { baixarEstado, pedirSincronizacaoEmSegundoPlano, sincronizarFila, type RelatorioSync } from "@/lib/campo/sincronizar";

export type SituacaoRede = "online" | "offline";

/**
 * `navigator.onLine` e estado de FORA do React, e o app de campo abre offline
 * com frequencia: ler no primeiro efeito ja seria tarde (e a regra
 * `react-hooks/set-state-in-effect` recusa o `setState` sincrono no efeito).
 * `useSyncExternalStore` le no proprio render e reassina os dois eventos.
 * A resposta do servidor e "online" porque a casca e prerenderizada no build,
 * sem navegador; o cliente corrige no primeiro render.
 */
function assinarRede(aoMudar: () => void) {
  window.addEventListener("online", aoMudar);
  window.addEventListener("offline", aoMudar);
  return () => {
    window.removeEventListener("online", aoMudar);
    window.removeEventListener("offline", aoMudar);
  };
}
const lerRede = (): SituacaoRede => (navigator.onLine ? "online" : "offline");
const redeNoServidor = (): SituacaoRede => "online";

/**
 * `useSincronizacao` e nao `usarSincronizacao` (o nome do arquivo continua em
 * portugues, como `usar-arrasto.ts` e `usar-largura.ts`): a regra
 * `react-hooks/rules-of-hooks` reconhece hook pelo prefixo `use`, e sem ele o
 * lint nao verifica nenhuma das regras dos hooks aqui dentro.
 *
 * Estado da tela = IndexedDB + fila, nunca a rede diretamente. A rede so
 * alimenta o IndexedDB. Assim a tela e a mesma com ou sem sinal; o que muda e
 * o indicador.
 */
export function useSincronizacao(equipeId: number | null) {
  const [estado, setEstado] = useState<EstadoCampo | null>(null);
  const [fila, setFila] = useState<ItemFila[]>([]);
  const [foraDeOrdem, setForaDeOrdem] = useState<ForaDeOrdem[]>([]);
  /**
   * "Ja terminei de ler o aparelho?" — e NAO `estado != null`.
   *
   * Os dois significados de `estado === null` sao diferentes e a tela precisa
   * distingui-los: "o IndexedDB ainda nao respondeu" e "o IndexedDB esta
   * vazio". Sem esta bandeira eles se confundem, e foi medido num aparelho com
   * armazenamento lento (+700 ms por leitura): abrindo /campo a frio SEM SINAL,
   * o app mostrava "Nada guardado no aparelho — conecte-se uma vez para baixar
   * os chamados", com botao "Tentar de novo", por 1,4 s ANTES da lista real
   * aparecer. E a pior frase possivel na pior hora possivel: o rocador, na
   * beira da pista e sem sinal, lendo que o trabalho do dia nao esta ali.
   *
   * Vale tambem para o indicador do topo: antes da primeira leitura ninguem
   * sabe quantas pendencias existem, entao "Tudo enviado" ali e chute — e ele
   * piscava por ~300 ms mesmo com o armazenamento rapido.
   */
  const [carregado, setCarregado] = useState(false);
  const rede = useSyncExternalStore(assinarRede, lerRede, redeNoServidor);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimoRelatorio, setUltimoRelatorio] = useState<RelatorioSync | null>(null);
  const emCurso = useRef(false);

  const relerLocal = useCallback(async () => {
    const [e, f, fdo] = await Promise.all([lerEstado(), listarFila(), listarForaDeOrdem()]);
    setEstado(e);
    setFila(f);
    setForaDeOrdem(fdo.filter((x) => !x.visto));
    setCarregado(true);
  }, []);

  /** A pessoa dispensou o aviso de fora de ordem. E ela quem fecha, nao um relogio. */
  const dispensarForaDeOrdem = useCallback(
    async (eventoId: string) => {
      await verForaDeOrdem(eventoId);
      await relerLocal();
    },
    [relerLocal],
  );

  const enviarAgora = useCallback(async () => {
    if (emCurso.current || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    emCurso.current = true;
    setSincronizando(true);
    try {
      const relatorio = await sincronizarFila({ origem: "pagina", equipeId });
      setUltimoRelatorio(relatorio);
      if (relatorio.pendentes === 0 && relatorio.erro == null) {
        await baixarEstado(equipeId).catch(() => null);
      }
    } finally {
      emCurso.current = false;
      setSincronizando(false);
      await relerLocal();
    }
  }, [equipeId, relerLocal]);

  const recarregar = useCallback(async () => {
    try {
      await baixarEstado(equipeId);
    } catch {
      // sem rede: fica o que esta no aparelho
    }
    await relerLocal();
  }, [equipeId, relerLocal]);

  const registrar = useCallback(
    async (evento: EventoCampo, fotos: FotoLocal[]) => {
      for (const foto of fotos) await guardarFoto(foto);
      await enfileirar({ ...evento, fotos: fotos.map((f) => f.foto_id), tentativas: 0, ultimo_erro: null, criado_em: new Date().toISOString() });
      await relerLocal();
      await pedirSincronizacaoEmSegundoPlano();
      void enviarAgora();
    },
    [enviarAgora, relerLocal],
  );

  useEffect(() => {
    /* A primeira leitura do IndexedDB e assincrona por natureza — nao ha como
       ler o banco local durante o render — entao o `setState` chega depois da
       montagem, que e exatamente o caso que a regra abaixo generaliza. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void relerLocal().then(() => (navigator.onLine ? enviarAgora() : undefined));

    const online = () => void enviarAgora();
    const mensagem = (e: MessageEvent) => {
      if (e.data?.tipo === "sincronizar") void enviarAgora();
    };
    const visivel = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void enviarAgora();
    };

    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visivel);
    navigator.serviceWorker?.addEventListener("message", mensagem);
    return () => {
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visivel);
      navigator.serviceWorker?.removeEventListener("message", mensagem);
    };
  }, [enviarAgora, relerLocal]);

  return { estado, fila, foraDeOrdem, carregado, rede, sincronizando, ultimoRelatorio, recarregar, enviarAgora, registrar, dispensarForaDeOrdem };
}
