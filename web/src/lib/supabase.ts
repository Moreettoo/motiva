import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Cliente do Supabase — apenas servidor.
 *
 * Usa a service_role e por isso NUNCA pode ser importado de um componente
 * cliente. O `import "server-only"` acima transforma um erro de arquitetura em
 * erro de build, que e onde ele deve doer.
 *
 * O painel inteiro le por Server Components e escreve por Server Actions: a
 * chave nao atravessa a rede em nenhum caminho.
 */

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  throw new Error(
    "SUPABASE_URL e SUPABASE_SERVICE_KEY sao obrigatorias. " +
      "Copie web/.env.example para web/.env.local e preencha as duas.",
  );
}

export const db = createClient(url, key, {
  db: { schema: "ia" },
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Endereco do backend FastAPI que roda o modelo .pkl e a decisao da LLM. */
export const API_URL = process.env.MOTIVA_API_URL ?? "http://127.0.0.1:8000";
