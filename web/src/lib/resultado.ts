/**
 * Contrato de toda Server Action: nunca lança, sempre devolve isto.
 * Vive num módulo próprio porque `sessao.ts` (server-only, sem "use server")
 * precisa do tipo, e um módulo "use server" só deve exportar funções.
 */
export type Resultado<T = void> = { ok: true; dados: T } | { ok: false; erro: string };
