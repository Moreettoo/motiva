import { diasEntre, fmt, isoHoje } from "@/lib/format";
import type { AgendamentoDetalhado, TrechoStatus } from "@/lib/types";
import { groupBy } from "@/lib/utils";

/**
 * Perguntas de partida montadas sobre a malha de hoje.
 *
 * Nada aqui e frase de exemplo: cada sugestao so entra se existir o dado que a
 * torna respondivel. Perguntar "onde o risco de incendio e maior" sem nenhum
 * trecho com essa observacao entregaria ao gestor uma pergunta que o copiloto
 * so pode responder com "nao tenho esse dado".
 */

const MAXIMO = 6;
const JANELA_AGRUPAMENTO_DIAS = 14;

export function montarSugestoes(
  trechos: TrechoStatus[],
  agendamentos: AgendamentoDetalhado[],
): string[] {
  const hoje = isoHoje();
  const perguntas: string[] = [];

  function adicionar(pergunta: string) {
    if (!perguntas.includes(pergunta)) perguntas.push(pergunta);
  }

  const tensos = trechos.filter((t) => t.risco === "critica" || t.risco === "alta");

  const rodoviaMaisTensa = [...groupBy(tensos, (t) => t.rodovia).entries()].sort(
    (a, b) => b[1].length - a[1].length,
  )[0];
  if (rodoviaMaisTensa) {
    adicionar(`Quais trechos da ${rodoviaMaisTensa[0]} vencem esta semana?`);
  }

  const critico = trechos.find((t) => t.risco === "critica");
  if (critico) {
    adicionar(`Por que o km ${fmt.d1(Number(critico.km_inicio))} da ${critico.rodovia} ficou crítico?`);
  }

  if (trechos.some((t) => /inc[eê]ndio/i.test(t.observacoes ?? ""))) {
    adicionar("Onde o risco de incêndio é maior?");
  }

  const proximas = agendamentos.filter((a) => {
    const dias = diasEntre(hoje, a.data_sugerida);
    return dias >= 0 && dias <= JANELA_AGRUPAMENTO_DIAS && a.status !== "descartado";
  });
  const agrupavel = [...groupBy(proximas, (a) => a.trecho.rodovia).entries()]
    .filter(([, lista]) => lista.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)[0];
  adicionar(
    agrupavel
      ? `Que roçadas da ${agrupavel[0]} posso agrupar na mesma saída?`
      : "Que roçadas posso agrupar na mesma semana?",
  );

  const semEquipe = agendamentos.filter(
    (a) => a.equipe_id == null && (a.status === "sugerido" || a.status === "aprovado"),
  );
  if (semEquipe.length >= 2) {
    adicionar("Quais roçadas ainda estão sem equipe?");
  }

  const ufMaisTensa = [...groupBy(tensos, (t) => t.uf).entries()].sort(
    (a, b) => b[1].length - a[1].length,
  )[0];
  if (ufMaisTensa) {
    adicionar(`O que é mais urgente em ${ufMaisTensa[0]}?`);
  }

  adicionar("Quais roçadas caem nos próximos 7 dias?");

  return perguntas.slice(0, MAXIMO);
}
