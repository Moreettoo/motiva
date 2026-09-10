/**
 * Cria o primeiro Super Admin, ou nao faz nada se ele ja existe.
 *
 *   node scripts/semear-super-admin.mjs --email enzo.moretto@sasi.com.br --nome "Enzo Moretto"
 *
 * Le web/.env.local como o teste de fumaca. Imprime a senha provisoria uma vez;
 * o primeiro login cai em /definir-senha.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, arr) => (v.startsWith("--") ? [...acc, [v.slice(2), arr[i + 1] ?? ""]] : acc), []),
);
const email = String(args.email ?? "").trim().toLowerCase();
const nome = String(args.nome ?? "").trim();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || nome.length < 2) {
  console.error("Uso: node scripts/semear-super-admin.mjs --email <e-mail> --nome \"<Nome>\"");
  process.exit(1);
}

const db = createClient(env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_KEY, {
  db: { schema: "ia" },
  auth: { persistSession: false },
});

const { data: existente } = await db.from("perfis").select("usuario_id, cargo, ativo").eq("email", email).maybeSingle();
if (existente) {
  console.log(`Ja existe: ${email} (${existente.cargo}, ${existente.ativo ? "ativo" : "desativado"}). Nada a fazer.`);
  process.exit(0);
}

const senha = randomBytes(9).toString("base64url"); // 12 chars, letras e numeros quase sempre; a regra e conferida abaixo
const senhaFinal = /\d/.test(senha) && /[A-Za-z]/.test(senha) ? senha : `${senha}a1`;

const { data: criado, error } = await db.auth.admin.createUser({
  email,
  password: senhaFinal,
  email_confirm: true,
  app_metadata: { cargo: "super_admin" },
  user_metadata: { nome },
});
if (error) {
  console.error("Falha ao criar no Auth:", error.message);
  process.exit(1);
}

const { error: erroPerfil } = await db.from("perfis").insert({
  usuario_id: criado.user.id,
  nome,
  email,
  cargo: "super_admin",
  senha_provisoria: true,
});
if (erroPerfil) {
  console.error("Usuario criado no Auth, mas o perfil falhou:", erroPerfil.message);
  process.exit(1);
}

console.log(`Super Admin criado: ${email}`);
console.log(`Senha provisoria (aparece so agora): ${senhaFinal}`);
console.log("Entre em /entrar; o painel vai pedir a senha definitiva.");
