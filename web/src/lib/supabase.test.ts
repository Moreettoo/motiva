import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Único teste do módulo que mexe em env var e mocka import — os demais
 * `src/**\/*.test.ts` são só função pura (ver comentário em vitest.config.ts).
 * Vale a exceção aqui: `supabase.ts` decide a chave de acesso ao banco de
 * produção lendo `process.env` na importação, e foi exatamente essa escolha
 * (`??` em vez de `||`) que quebrou o build — ver
 * docs/operacao/preparacao-dados-reais.md:24 e a Tarefa 12.
 *
 * `server-only` não é uma dependência instalada (o Next.js a resolve por
 * alias do seu próprio bundler); o mock abaixo evita que o import falhe fora
 * do Next.
 */
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, key: string) => ({ key }),
}));

const AMBIENTE_ORIGINAL = { ...process.env };

function limparEnv() {
  for (const chave of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_KEY"]) {
    delete process.env[chave];
  }
}

afterEach(() => {
  process.env = { ...AMBIENTE_ORIGINAL };
  vi.resetModules();
});

describe("cliente do supabase: escolha da chave de acesso", () => {
  it("cai para SUPABASE_SERVICE_KEY quando SUPABASE_SECRET_KEY existe mas está vazia", async () => {
    limparEnv();
    process.env.SUPABASE_URL = "https://exemplo.supabase.co";
    process.env.SUPABASE_SECRET_KEY = ""; // como o web/.env.local documentado permite
    process.env.SUPABASE_SERVICE_KEY = "chave-de-servico-valida";

    vi.resetModules();
    const { db } = await import("./supabase");
    expect((db as unknown as { key: string }).key).toBe("chave-de-servico-valida");
  });

  it("usa SUPABASE_SECRET_KEY quando ela vem preenchida", async () => {
    limparEnv();
    process.env.SUPABASE_URL = "https://exemplo.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "chave-secreta-nova";
    process.env.SUPABASE_SERVICE_KEY = "chave-de-servico-legada";

    vi.resetModules();
    const { db } = await import("./supabase");
    expect((db as unknown as { key: string }).key).toBe("chave-secreta-nova");
  });

  it("lanca erro se nenhuma das duas chaves estiver disponivel", async () => {
    limparEnv();
    process.env.SUPABASE_URL = "https://exemplo.supabase.co";

    vi.resetModules();
    await expect(import("./supabase")).rejects.toThrow(/obrigatorias/);
  });
});
