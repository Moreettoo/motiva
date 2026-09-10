import type { Cargo, StatusChamado, TipoEventoChamado } from "../types";

/**
 * A maquina de estados do chamado, em TypeScript, para a tela mostrar so os
 * botoes validos. QUEM MANDA e `ia.registrar_evento_chamado`: as duas precisam
 * continuar iguais, e este arquivo tem o teste que prende a copia daqui.
 */

const TERMINAIS: readonly StatusChamado[] = ["concluido", "cancelado"];

export function terminal(status: StatusChamado): boolean {
  return TERMINAIS.includes(status);
}

export function proximoStatus(
  atual: StatusChamado,
  tipo: TipoEventoChamado,
  statusAnterior: StatusChamado | null,
): StatusChamado | null {
  if (terminal(atual)) return null;
  switch (tipo) {
    case "iniciado":
      return atual === "aberto" ? "em_andamento" : null;
    case "finalizado":
      return atual === "em_andamento" || atual === "devolvido" ? "aguardando_aprovacao" : null;
    case "aprovado":
      return atual === "aguardando_aprovacao" ? "concluido" : null;
    case "devolvido":
      return atual === "aguardando_aprovacao" ? "devolvido" : null;
    case "adiamento_solicitado":
      return atual === "aberto" || atual === "em_andamento" ? "adiamento_solicitado" : null;
    case "adiamento_aceito":
    case "adiamento_recusado":
      return atual === "adiamento_solicitado" ? (statusAnterior ?? "aberto") : null;
    case "encerrado_admin":
      return "concluido";
    case "cancelado":
      return "cancelado";
    case "remarcado":
    case "equipe_alterada":
    case "altura_inicial_alterada":
    case "comentario":
      return atual;
    case "criado":
    case "fora_de_ordem":
      return null;
  }
}

export type Acao =
  | "iniciar" | "finalizar" | "pedir_adiamento"
  | "aprovar" | "devolver" | "decidir_adiamento" | "encerrar_admin" | "cancelar" | "informar_altura";

/** Ordem = ordem dos botoes na tela: o passo principal primeiro. */
export function acoesDisponiveis(status: StatusChamado, cargo: Cargo, lideraEstaEquipe: boolean): Acao[] {
  if (terminal(status)) return [];

  if (cargo === "rocador") {
    if (!lideraEstaEquipe) return [];
    if (status === "aberto") return ["iniciar", "pedir_adiamento"];
    if (status === "em_andamento") return ["finalizar", "pedir_adiamento"];
    if (status === "devolvido") return ["finalizar"];
    return [];
  }

  if (cargo === "admin" || cargo === "super_admin") {
    const gestao: Acao[] = [];
    if (status === "aberto") gestao.push("informar_altura");
    if (status === "aguardando_aprovacao") gestao.push("aprovar", "devolver");
    if (status === "adiamento_solicitado") gestao.push("decidir_adiamento");
    gestao.push("encerrar_admin", "cancelar");
    return gestao;
  }

  return [];
}
