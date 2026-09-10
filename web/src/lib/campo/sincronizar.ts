import { atualizarItem, fotosDoEvento, gravarEstado, listarFila, marcarFotoEnviada, removerDaFila } from "./banco-local";
import type { EstadoCampo, ItemFila, ResultadoEvento } from "./contratos";
import { esperaAntesDaTentativa, ordenarFila } from "./fila";

/**
 * O UNICO caminho de saida do aparelho para o servidor. Roda na pagina e no
 * service worker (por isso nao importa React nem `window`; `fetch` e IndexedDB
 * existem nos dois). A ordem e sagrada: as fotos de um evento antes do evento,
 * e os eventos na ordem em que aconteceram, porque `iniciado` depois de
 * `finalizado` e recusado pelo servidor.
 */

export type RelatorioSync = { enviados: number; foraDeOrdem: number; recusados: number; pendentes: number; erro: string | null };

const semSincronizado = (e: Omit<EstadoCampo, "sincronizadoEm">): EstadoCampo => ({ ...e, sincronizadoEm: new Date().toISOString() });

export async function baixarEstado(equipeId: number | null): Promise<EstadoCampo | null> {
  const url = equipeId != null ? `/api/campo/estado?equipe=${equipeId}` : "/api/campo/estado";
  const resposta = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (resposta.status === 401) throw new Error("sessao_expirada");
  if (!resposta.ok) throw new Error(`estado ${resposta.status}`);
  const estado = semSincronizado((await resposta.json()) as Omit<EstadoCampo, "sincronizadoEm">);
  await gravarEstado(estado);
  return estado;
}

async function enviarFotos(item: ItemFila): Promise<void> {
  for (const foto of await fotosDoEvento(item.evento_id)) {
    if (foto.enviada) continue;
    const corpo = new FormData();
    corpo.set("arquivo", foto.blob, `${foto.foto_id}.jpg`);
    corpo.set("chamado_id", String(foto.chamado_id));
    corpo.set("evento_id", foto.evento_id);
    corpo.set("etapa", foto.etapa);
    corpo.set("papel", foto.papel);
    corpo.set("largura_px", String(foto.largura_px));
    corpo.set("altura_px", String(foto.altura_px));
    corpo.set("capturada_em", foto.capturada_em);
    if (foto.latitude != null) corpo.set("latitude", String(foto.latitude));
    if (foto.longitude != null) corpo.set("longitude", String(foto.longitude));
    if (foto.precisao_m != null) corpo.set("precisao_m", String(foto.precisao_m));

    const resposta = await fetch("/api/campo/fotos", { method: "POST", body: corpo, credentials: "same-origin" });
    if (resposta.status === 401) throw new Error("sessao_expirada");
    if (!resposta.ok) throw new Error(`foto ${resposta.status}: ${(await resposta.text()).slice(0, 120)}`);
    await marcarFotoEnviada(foto.foto_id);
  }
}

export async function sincronizarFila(opcoes: { origem: "pagina" | "worker"; equipeId?: number | null }): Promise<RelatorioSync> {
  const relatorio: RelatorioSync = { enviados: 0, foraDeOrdem: 0, recusados: 0, pendentes: 0, erro: null };
  const fila = ordenarFila(await listarFila());
  const agora = Date.now();

  for (const item of fila) {
    const podeTentarEm = new Date(item.criado_em).getTime() + esperaAntesDaTentativa(item.tentativas);
    if (item.tentativas > 0 && agora < podeTentarEm && opcoes.origem === "pagina") continue;

    try {
      await enviarFotos(item);
      const resposta = await fetch("/api/campo/eventos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ eventos: [{ evento_id: item.evento_id, chamado_id: item.chamado_id, tipo: item.tipo, payload: item.payload, ocorrido_em: item.ocorrido_em }] }),
      });
      if (resposta.status === 401) throw new Error("sessao_expirada");
      if (!resposta.ok) throw new Error(`eventos ${resposta.status}`);

      const { resultados } = (await resposta.json()) as { resultados: ResultadoEvento[] };
      const r = resultados[0];
      if (r.situacao === "aplicado" || r.situacao === "repetido") {
        await removerDaFila(item.evento_id);
        relatorio.enviados += 1;
      } else if (r.situacao === "fora_de_ordem") {
        // O servidor guardou o evento e avisou o gestor. Sai da fila: reenviar nao muda nada.
        await removerDaFila(item.evento_id);
        relatorio.foraDeOrdem += 1;
      } else {
        // Recusado por regra (ex.: fotos faltando). Fica na fila com o motivo, para a pessoa ver e corrigir.
        await atualizarItem({ ...item, tentativas: item.tentativas + 1, ultimo_erro: r.erro ?? "recusado" });
        relatorio.recusados += 1;
      }
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "falha de rede";
      if (mensagem === "sessao_expirada") {
        relatorio.erro = "sessao_expirada";
        break; // nada mais vai passar; a tela pede login e a fila fica intacta
      }
      await atualizarItem({ ...item, tentativas: item.tentativas + 1, ultimo_erro: mensagem });
      relatorio.erro = mensagem;
      break; // sem rede: parar e tentar de novo depois, mantendo a ordem
    }
  }

  relatorio.pendentes = (await listarFila()).length;
  if (relatorio.erro !== "sessao_expirada" && relatorio.enviados > 0) {
    try {
      await baixarEstado(opcoes.equipeId ?? null);
    } catch {
      // o estado velho continua valendo; a proxima abertura tenta de novo
    }
  }
  return relatorio;
}

/** Background Sync: o Chrome acorda o worker quando a rede voltar. Falha em silencio onde nao existe (iOS). */
export async function pedirSincronizacaoEmSegundoPlano(): Promise<boolean> {
  try {
    const registro = await navigator.serviceWorker?.ready;
    const sync = (registro as unknown as { sync?: { register(tag: string): Promise<void> } } | undefined)?.sync;
    if (!sync) return false;
    await sync.register("campo-sincronizar");
    return true;
  } catch {
    return false;
  }
}
