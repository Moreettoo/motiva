/**
 * Token aleatorio, hash e validade, sem I/O.
 *
 * Web Crypto (e nao `node:crypto`): o mesmo modulo roda no proxy, que nao tem
 * Buffer. O banco guarda so o hash; o token inteiro so existe no link do e-mail.
 */

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** 43 caracteres de 6 bits cada (258 bits sorteados, 192 aproveitados): sobra. */
export function gerarToken(): string {
  const bytes = new Uint8Array(43);
  crypto.getRandomValues(bytes);
  let saida = "";
  for (const b of bytes) saida += ALFABETO[b & 63];
  return saida;
}

export async function hashToken(token: string): Promise<string> {
  const resumo = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(resumo), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function prazo(horas: number, agora: Date = new Date()): Date {
  return new Date(agora.getTime() + horas * 3_600_000);
}

export function expirado(expiraEm: string | Date, agora: Date = new Date()): boolean {
  return new Date(expiraEm).getTime() <= agora.getTime();
}

export const SENHA_MINIMA = 10;

/** Mesma regra no cliente (dica do campo) e no servidor (recusa). */
export function erroDaSenha(senha: string): string | null {
  if (senha.length < SENHA_MINIMA) return `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`;
  if (!/\d/.test(senha) || !/[A-Za-zÀ-ÿ]/.test(senha)) return "Misture letras e números.";
  return null;
}
