import type { StatusChamado } from "../types";

/**
 * Os `errcode` das funcoes SQL de chamado, virados frase.
 *
 * Vive num modulo proprio, e nao dentro de `acoes.ts`, por dois motivos: um
 * arquivo `"use server"` so deve exportar funcoes assincronas, e a API do campo
 * (Fase 3) precisa da MESMA traducao para responder ao aparelho. Duas copias
 * divergiriam, e a que divergisse seria a que o rocador le sem sinal.
 */
export function mensagemDoBanco(e: { code?: string; message: string; details?: string | null }): string {
  switch (e.code) {
    case "P0001":
      return "Este chamado não está num estado que permita essa ação. Recarregue a página.";
    case "P0002":
      return "Chamado não encontrado. Recarregue a página.";
    case "P0003":
      return "O chamado já terminou; o evento ficou registrado como fora de ordem.";
    case "P0004":
      return `Faltou algo obrigatório: ${e.message.replace(/^.*?: /, "")}`;
    default:
      return `O banco recusou: ${e.message}`;
  }
}

/**
 * `P0003` carrega em `detail` o status em que o chamado estava. Serve para a
 * tela dizer "já estava concluído" em vez de "já terminou".
 */
export function statusDoForaDeOrdem(e: { code?: string; details?: string | null }): StatusChamado | null {
  if (e.code !== "P0003") return null;
  const detalhe = e.details?.trim();
  return detalhe === "concluido" || detalhe === "cancelado" ? detalhe : null;
}
