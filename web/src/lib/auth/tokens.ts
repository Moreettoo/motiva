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

/**
 * Dias de validade de um convite, lidos de uma variavel de ambiente.
 *
 * `Number(process.env.X ?? "7")` parecia bastar e nao bastava, porque a
 * variavel tem tres jeitos de existir errada e os tres viram numero sem
 * reclamar. Uma variavel PRESENTE E VAZIA -- `CONVITE_VALIDADE_DIAS=` no
 * .env.local, ou o campo em branco no painel da Vercel -- passa pelo `??`
 * (string vazia nao e nullish) e `Number("")` e ZERO. Com zero, `prazo(0)` e
 * agora, `expirado` compara com `<=`, e TODO convite nasce vencido: a pessoa
 * abre o link recem-recebido e le "Este convite expirou". Texto nao numerico
 * da NaN, e `prazo(NaN).toISOString()` levanta RangeError no meio da action.
 *
 * O padrao de 7 vale para vazio, ausente, NaN, zero e negativo: uma validade
 * que nao e um numero positivo nao e uma configuracao, e um engano.
 */
export function diasDeValidade(bruto: string | undefined, padrao = 7): number {
  const n = Number(bruto);
  return Number.isFinite(n) && n > 0 ? n : padrao;
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
