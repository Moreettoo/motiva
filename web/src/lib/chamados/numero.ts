import { diasEntre } from "../format";
import type { StatusChamado } from "../types";

/** Espelha `ia.proximo_numero_chamado`: o banco numera; a tela so formata para previa e testes. */
export function formatarNumero(ano: number, sequencia: number): string {
  return `CH-${ano}-${String(sequencia).padStart(4, "0")}`;
}

/** Positivo = dias alem da data prevista. Datas `AAAA-MM-DD`, `hoje` vem de `isoHoje()`. */
export function diasDeAtraso(dataSugerida: string, hoje: string): number {
  return diasEntre(dataSugerida, hoje);
}

/** "Atrasado" e so o chamado que a equipe ainda nem comecou depois da data. Em andamento nao e atraso, e trabalho. */
export function estaAtrasado(status: StatusChamado, dataSugerida: string, hoje: string): boolean {
  return status === "aberto" && diasDeAtraso(dataSugerida, hoje) > 0;
}
