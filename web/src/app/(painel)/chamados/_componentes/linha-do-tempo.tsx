"use client";

import { MOTIVO_ADIAMENTO, TIPO_EVENTO } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import { MOTIVOS_ADIAMENTO, type ChamadoEvento, type MotivoAdiamento } from "@/lib/types";

import { IconeChamado } from "./icones";

/** Como o evento chegou ao banco. "Pelo sistema" é o gatilho de
 *  `ia.agendamentos`: ninguém digitou aquilo, uma escrita em outra tabela o
 *  produziu, e essa diferença é o que separa uma decisão de um efeito dela. */
const ORIGEM: Record<ChamadoEvento["origem"], string> = {
  painel: "pelo painel",
  campo: "pelo app",
  lote: "pelo lote",
  sistema: "pelo sistema",
};

/**
 * Acima de quanto a divergência entre o relógio do aparelho e o do servidor
 * vira informação. Abaixo disso é atraso de rede e ruído; acima, é um celular
 * que passou horas sem sinal, e aí a hora que interessa ao gestor ("quando a
 * equipe estava lá?") não é a que o banco carimbou.
 */
const DIVERGENCIA_MS = 5 * 60_000;

function ehMotivo(v: unknown): v is MotivoAdiamento {
  return typeof v === "string" && (MOTIVOS_ADIAMENTO as readonly string[]).includes(v);
}

function texto(payload: Record<string, unknown>, chave: string): string | null {
  const v = payload[chave];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function numero(payload: Record<string, unknown>, chave: string): number | null {
  const v = payload[chave];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/**
 * A frase que o payload vira na tela.
 *
 * Um evento sem esta função é um rótulo genérico ("Data alterada") que não diz
 * de quando para quando — e a linha do tempo existe justamente para responder
 * isso sem abrir o banco. Cada tipo lê só as chaves que a função SQL grava
 * para ele; o que não for reconhecido simplesmente não aparece, em vez de sair
 * como JSON cru na cara do gestor.
 */
export function detalheDoEvento(
  evento: ChamadoEvento,
  nomeDaEquipe: (id: number) => string,
): string | null {
  const p = evento.payload ?? {};

  switch (evento.tipo) {
    case "criado": {
      const data = texto(p, "data_sugerida");
      return data ? `Prevista para ${fmt.dataCurta(data)}` : null;
    }
    case "finalizado": {
      const altura = numero(p, "altura_final_cm");
      return altura == null ? null : `Altura depois: ${fmt.cm(altura)}`;
    }
    case "aprovado": {
      const km = numero(p, "km_rocados");
      const custo = numero(p, "custo_reais");
      const partes = [km == null ? null : fmt.km(km), custo == null ? null : fmt.brl(custo)].filter(Boolean);
      return partes.length > 0 ? partes.join(" · ") : null;
    }
    case "devolvido":
      return texto(p, "comentario");
    case "adiamento_solicitado": {
      const motivo = ehMotivo(p.motivo) ? MOTIVO_ADIAMENTO[p.motivo] : null;
      const data = texto(p, "data_sugerida");
      const detalhe = texto(p, "detalhe");
      return [motivo, data ? `sugeriu ${fmt.dataCurta(data)}` : null, detalhe].filter(Boolean).join(" · ") || null;
    }
    case "adiamento_aceito": {
      const data = texto(p, "nova_data");
      const resposta = texto(p, "resposta");
      return [data ? `Nova data: ${fmt.dataCurta(data)}` : null, resposta].filter(Boolean).join(" · ") || null;
    }
    case "adiamento_recusado":
      return texto(p, "resposta");
    case "remarcado": {
      const de = texto(p, "de");
      const para = texto(p, "para");
      return de && para ? `De ${fmt.dataCurta(de)} para ${fmt.dataCurta(para)}` : null;
    }
    case "equipe_alterada": {
      const de = numero(p, "de");
      const para = numero(p, "para");
      const antes = de == null ? "sem equipe" : nomeDaEquipe(de);
      const depois = para == null ? "sem equipe" : nomeDaEquipe(para);
      return `De ${antes} para ${depois}`;
    }
    case "altura_inicial_alterada": {
      const altura = numero(p, "altura_inicial_cm");
      return altura == null ? null : fmt.cm(altura);
    }
    case "cancelado":
      return texto(p, "motivo");
    case "encerrado_admin": {
      if (p.legado === true) return "Agendamento marcado como executado fora da tela de chamados";
      const data = texto(p, "data_execucao");
      const observacao = texto(p, "observacao");
      return [data ? `Roçada em ${fmt.dataCurta(data)}` : null, observacao].filter(Boolean).join(" · ") || null;
    }
    case "comentario":
      return texto(p, "texto") ?? texto(p, "comentario");
    case "fora_de_ordem": {
      const original = texto(p, "tipo_original");
      const status = texto(p, "status_no_momento");
      if (!original) return "Evento recebido depois do chamado fechar";
      const rotulo = original in TIPO_EVENTO ? TIPO_EVENTO[original as ChamadoEvento["tipo"]].rotulo : original;
      return status ? `"${rotulo}" chegou com o chamado já ${status}` : `"${rotulo}" chegou fora de ordem`;
    }
    default:
      return null;
  }
}

/**
 * O histórico do chamado, do primeiro evento ao último.
 *
 * `chamado_eventos` é só `insert`: nada aqui pode ser editado nem apagado, e é
 * por isso que esta lista é a resposta a "quem decidiu o quê" numa auditoria.
 * Ordem crescente de propósito — a leitura é a história da roçada, não um mural
 * de novidades.
 */
export function LinhaDoTempo({
  eventos,
  nomeDaEquipe,
}: {
  eventos: ChamadoEvento[];
  nomeDaEquipe: (id: number) => string;
}) {
  if (eventos.length === 0) {
    return <p className="text-sm text-ink-3">Sem eventos registrados.</p>;
  }

  return (
    <ol className="flex flex-col">
      {eventos.map((evento, indice) => {
        const token = TIPO_EVENTO[evento.tipo];
        const detalhe = detalheDoEvento(evento, nomeDaEquipe);
        const ultimo = indice === eventos.length - 1;

        const divergiu =
          Math.abs(new Date(evento.registrado_em).getTime() - new Date(evento.ocorrido_em).getTime()) >
          DIVERGENCIA_MS;

        return (
          <li key={evento.id} className="flex min-w-0 gap-3">
            {/* O trilho: bolinha do evento e o fio até o próximo. O fio some no
                último para a linha não terminar no vazio. */}
            <div className="flex shrink-0 flex-col items-center">
              <span className="mt-0.5 inline-flex size-6 items-center justify-center rounded-full border border-border bg-surface-2 text-ink-2">
                <IconeChamado nome={token.icone} />
              </span>
              {ultimo ? null : <span aria-hidden="true" className="w-px flex-1 bg-border" />}
            </div>

            <div className={`min-w-0 flex-1 ${ultimo ? "pb-0" : "pb-4"}`}>
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-ink">
                <span className="font-medium">{token.rotulo}</span>
                <span className="tnum text-xs text-ink-3">
                  {fmt.dataCurta(evento.registrado_em)}, {fmt.horaMin(evento.registrado_em)}
                </span>
              </p>

              <p className="text-xs text-ink-3">
                {evento.autor_nome} · {ORIGEM[evento.origem]}
              </p>

              {detalhe ? <p className="mt-1 text-sm break-words text-ink-2">{detalhe}</p> : null}

              {/* Só quando divergem de verdade. Igual, seria a mesma hora
                  escrita duas vezes; alguns minutos de diferença é a rede. */}
              {divergiu ? (
                <p className="tnum mt-1 text-2xs text-ink-3">
                  No aparelho: {fmt.horaMin(evento.ocorrido_em)} (enviado às {fmt.horaMin(evento.registrado_em)})
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
