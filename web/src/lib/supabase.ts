import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Cliente do Supabase, apenas servidor.
 *
 * Usa a service_role e por isso NUNCA pode ser importado de um componente
 * cliente. O `import "server-only"` acima transforma um erro de arquitetura em
 * erro de build, que e onde ele deve doer.
 *
 * O painel inteiro le por Server Components e escreve por Server Actions: a
 * chave nao atravessa a rede em nenhum caminho.
 */

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
// Chave secreta nova (`sb_secret_...`). A `service_role` legada continua aceita
// ate o fim de 2026, quando o Supabase a desliga; ate la as duas funcionam aqui.
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  throw new Error(
    "SUPABASE_URL e SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_KEY) sao obrigatorias. " +
      "Copie web/.env.example para web/.env.local e preencha.",
  );
}

export const db = createClient(url, key, {
  db: { schema: "ia" },
  auth: { persistSession: false, autoRefreshToken: false },
});

