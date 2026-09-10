import "server-only";

import type { Sessao } from "../auth/sessao";
import { db } from "../supabase";

/**
 * As duas perguntas que toda rota de `/api/campo` faz antes de escrever:
 * "de que equipe e esta pessoa?" e "este chamado e dessa equipe?".
 *
 * Vive fora dos route handlers porque as tres rotas precisam da MESMA resposta:
 * se `estado` e `eventos` discordassem sobre a equipe, o aparelho baixaria uma
 * lista que o servidor depois recusa, e o rocador veria a fila encalhar sem
 * explicacao no meio da rodovia.
 *
 * O contrato de erro e `{ erro, status }` e nao excecao: a rota devolve isso
 * como corpo JSON sem try/catch, e o texto e o mesmo que a tela mostra.
 */

export type EquipeCampo = { id: number; nome: string; lider_nome: string };

/** `equipes` acompanha a recusa quando a escolha e do gestor: a tela vira um seletor em vez de um beco. */
export type RecusaEquipe = { erro: string; status: number; equipes?: { id: number; nome: string }[] };

export function recusou(r: EquipeCampo | RecusaEquipe): r is RecusaEquipe {
  return "erro" in r;
}

/* Um lider por equipe (`ia.equipes.lider_id` e unique), entao o embed volta
   objeto; o PostgREST as vezes serializa relacao 1-1 como lista de um, e por
   isso os dois casos entram. */
type LinhaEquipe = { id: number; nome: string; lider: { nome: string } | { nome: string }[] | null };

function nomeDoLider(linha: LinhaEquipe): string {
  const l = Array.isArray(linha.lider) ? linha.lider[0] : linha.lider;
  return l?.nome ?? "sem líder";
}

async function lerEquipe(id: number): Promise<EquipeCampo | null> {
  const { data } = await db
    .from("equipes")
    .select("id, nome, lider:perfis!equipes_lider_id_fkey ( nome )")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const linha = data as unknown as LinhaEquipe;
  return { id: linha.id, nome: linha.nome, lider_nome: nomeDoLider(linha) };
}

/**
 * As equipes que o seletor do gestor oferece.
 *
 * TODAS as ativas, inclusive as sem lider: o gestor abre `/campo` para conferir
 * o que a equipe esta vendo, e uma equipe recem-criada — justamente a que ele
 * mais precisa olhar — ainda nao tem Rocador convidado. Filtrar por `lider_id`
 * deixaria o seletor vazio no dia em que ele importa.
 */
async function equipesAtivas(): Promise<{ id: number; nome: string }[]> {
  const { data } = await db.from("equipes").select("id, nome").eq("ativo", true).order("nome");
  return (data ?? []) as { id: number; nome: string }[];
}

/**
 * A equipe cujos chamados esta sessao pode ver e mover.
 *
 * Rocador: a equipe que ele lidera, e `?equipe=` e IGNORADO. Nao e comodidade
 * de implementacao: se o parametro valesse, trocar um numero na URL do app
 * daria a um lider a lista de outra equipe.
 *
 * Admin e Super Admin nao lideram equipe nenhuma, entao para eles o parametro e
 * obrigatorio — e a recusa carrega as equipes para a tela poder perguntar.
 * Analista e somente leitura no painel e nao tem nada a fazer aqui.
 */
export async function equipeDaSessao(sessao: Sessao, equipePedida: number | null): Promise<EquipeCampo | RecusaEquipe> {
  if (sessao.cargo === "rocador") {
    if (sessao.equipeId == null) return { erro: "Você ainda não lidera uma equipe. Peça a um administrador.", status: 403 };
    const equipe = await lerEquipe(sessao.equipeId);
    return equipe ?? { erro: "A equipe que você lidera não foi encontrada. Fale com um administrador.", status: 404 };
  }

  if (sessao.cargo !== "admin" && sessao.cargo !== "super_admin") {
    return { erro: "Seu acesso é somente leitura.", status: 403 };
  }

  if (equipePedida == null) return { erro: "Escolha a equipe.", status: 400, equipes: await equipesAtivas() };
  const equipe = await lerEquipe(equipePedida);
  return equipe ?? { erro: "Equipe não encontrada.", status: 404 };
}

/**
 * Esta sessao pode MOVER este chamado?
 *
 * As rotas de escrita (`/api/campo/fotos`, `/api/campo/eventos`) perguntam isto
 * e NAO pedem `?equipe=`. Dois motivos, um pratico e um de desenho.
 *
 * O pratico: `lib/campo/sincronizar.ts` — o unico caminho de saida do aparelho,
 * que roda tambem dentro do service worker — manda `?equipe=` apenas em
 * `baixarEstado`. As duas rotas de escrita recebem so o corpo. Exigir o
 * parametro nelas deixava o envio de Admin e de Super Admin travado em
 * `400 Escolha a equipe`, com a fila reenviando para sempre: medido no teste
 * offline, com a mensagem `foto 400: {"erro":"Escolha a equipe."}` guardada em
 * `ultimo_erro`.
 *
 * O de desenho, que e o que importa: a pergunta de autorizacao de uma escrita e
 * sobre o OBJETO que ela move, e o objeto ja vem identificado no corpo. A
 * equipe sai do chamado, nao de uma dica que o cliente escreve na URL — e assim
 * nao existe nem a possibilidade de um `?equipe=` trocado abrir o chamado de
 * outra equipe. `?equipe=` continua valendo em `/estado`, onde ele responde uma
 * pergunta diferente e legitima: QUAL lista devolver.
 *
 * Mesma matriz de `/api/fotos/[id]`: Rocador so na equipe que lidera, gestao em
 * qualquer uma, Analista em nenhuma.
 */
export async function podeAgirNoChamado(sessao: Sessao, chamadoId: number): Promise<RecusaEquipe | null> {
  if (sessao.cargo === "analista") return { erro: "Seu acesso é somente leitura.", status: 403 };

  if (sessao.cargo === "rocador") {
    if (sessao.equipeId == null) return { erro: "Você ainda não lidera uma equipe. Peça a um administrador.", status: 403 };
    if (!(await chamadoPertenceAEquipe(chamadoId, sessao.equipeId))) {
      return { erro: "Este chamado não é da sua equipe.", status: 403 };
    }
    return null;
  }

  const { data } = await db.from("chamados").select("id").eq("id", chamadoId).maybeSingle();
  return data ? null : { erro: "Chamado não encontrado.", status: 404 };
}

/**
 * O chamado e desta equipe?
 *
 * A equipe do chamado mora no AGENDAMENTO, nao no chamado: remarcar de equipe e
 * uma alteracao do agendamento, e o chamado acompanha. Ler de `chamados` daria
 * uma resposta velha depois de `equipe_alterada`.
 */
export async function chamadoPertenceAEquipe(chamadoId: number, equipeId: number): Promise<boolean> {
  const { data } = await db
    .from("chamados")
    .select("id, agendamento:agendamentos!inner ( equipe_id )")
    .eq("id", chamadoId)
    .eq("agendamento.equipe_id", equipeId)
    .maybeSingle();
  return data != null;
}

/** `?equipe=abc` e `?equipe=-1` valem o mesmo que nao passar nada. */
export function equipeDaBusca(busca: URLSearchParams): number | null {
  const bruto = busca.get("equipe");
  if (bruto == null) return null;
  const n = Number(bruto);
  return Number.isInteger(n) && n > 0 ? n : null;
}
