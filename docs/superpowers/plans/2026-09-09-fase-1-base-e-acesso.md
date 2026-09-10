# Fase 1 · Base e acesso — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sincronizar E: com produção e dar ao painel login por e-mail e senha, quatro cargos com matriz de permissões verificada, convite por e-mail com template no repositório, tela de Usuários, RLS ligado em todas as tabelas e chaves novas do Supabase.

**Architecture:** Supabase Auth com `@supabase/ssr`; `proxy.ts` refresca a sessão e redireciona, mas a segurança fica em `src/lib/auth/sessao.ts`, chamado no topo de cada página e dentro de cada Server Action. O cargo mora em `ia.perfis` com cópia em `app_metadata`. Convite e redefinição de senha são fluxos nossos (tabelas `ia.convites` e `ia.redefinicoes_senha`, tokens hasheados), e-mail pelo Resend com React Email. Três grupos de rotas: `(painel)` com o `Shell`, `(publico)` sem, `(campo)` reservado para a Fase 3.

**Tech Stack:** Next.js 16.3.0 (App Router, `proxy.ts`), React 19.2.8, TypeScript, Tailwind v4, nuqs 2, lucide-react, `@supabase/supabase-js` 2, `@supabase/ssr`, `resend`, `@react-email/components`, vitest 3. Postgres 15+ (Supabase), migrações aplicadas pelo MCP `supabase-highwai`.

**Spec:** `docs/superpowers/specs/2026-09-09-acesso-e-chamados-design.md` — leia "O que existe hoje", "Fase 0" e "§1 · Acesso" antes da Tarefa 0.

## Global Constraints

- Código, nomes de arquivo, identificadores, comentários e texto de UI em **português do Brasil**.
- Datas e números **sempre** por `Intl`, através de `src/lib/format.ts`. Nada de `toFixed` solto.
- "Hoje" nunca sai do relógio da máquina: `isoHoje()` formata em `America/Sao_Paulo`.
- Nenhum componente escreve hex. Cor, ícone e rótulo saem de `src/lib/dominio.ts`. Exceção única e documentada: os templates de e-mail em `src/emails/`, porque e-mail não lê variável CSS.
- Cor de status nunca aparece sozinha: sempre com ícone **e** rótulo.
- Estado de filtro, aba e seleção vai para a URL via `nuqs`, não `useState`.
- Animação só em `transform` e `opacity`.
- Server Actions devolvem `Resultado<T>` e **nunca lançam**; queries lançam e o `error.tsx` da rota trata.
- **Toda** Server Action começa por `permitir(...)`. Toda página de `(painel)` começa por `exigirCargo(...)`.
- A chave secreta (`SUPABASE_SECRET_KEY`) só é lida em módulos `server-only`. Nada com `NEXT_PUBLIC_` carrega segredo.
- Cadastro público e anônimo ficam desligados no Supabase Auth; o único caminho para `auth.users` é `auth.admin.createUser`.
- Depois de gravar qualquer arquivo em E:, conferir `tr -d '\000' < arquivo | wc -c` igual a `wc -c < arquivo`. Commit e push ao fim de cada tarefa.
- `npm run verificar` verde ao fim de cada tarefa que toque em `web/`. Rodar de `E:\motiva\web`.

---

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/00000000000000_linha_de_base_ia.sql` | criar | Dump do schema `ia` atual, só leitura, cabeçalho "já aplicado" |
| `supabase/migrations/20260910090000_perfis_convites_redefinicoes.sql` | criar | DDL da Fase 1 (§1 do spec) |
| `supabase/migrations/20260910091000_rls_em_tudo_sem_politicas.sql` | criar | RLS, revokes, `security_invoker` nas views, `search_path` em `gerar_zonas` |
| `schema_ia.sql` | alterar | Cabeçalho "histórico" |
| `web/package.json` | alterar | Dependências novas e scripts `semear:super-admin` |
| `web/.env.example` | alterar | Variáveis novas |
| `web/next.config.ts` | alterar | Cabeçalhos de segurança, `images.remotePatterns` |
| `web/src/lib/supabase.ts` | alterar | Aceita `SUPABASE_SECRET_KEY` com `SUPABASE_SERVICE_KEY` como reserva |
| `web/src/lib/resultado.ts` | criar | Tipo `Resultado<T>` compartilhado |
| `web/src/lib/types.ts` | alterar | `CARGOS`, `Cargo`, `Perfil`, `Convite` |
| `web/src/lib/dominio.ts` | alterar | `CARGO` (rótulo, descrição, ícone) |
| `web/src/lib/auth/permissoes.ts` | criar | Matriz pura: rotas por cargo, quem convida, regras de alteração |
| `web/src/lib/auth/permissoes.test.ts` | criar | Testes da matriz |
| `web/src/lib/auth/tokens.ts` | criar | Token aleatório, hash SHA-256, validade |
| `web/src/lib/auth/tokens.test.ts` | criar | Testes |
| `web/src/lib/auth/servidor.ts` | criar | `clienteSessao()` com cookies (`@supabase/ssr`) |
| `web/src/lib/auth/sessao.ts` | criar | `obterSessao`, `exigirSessao`, `exigirCargo`, `permitir` |
| `web/src/lib/auth/acoes.ts` | criar | `entrar`, `sair`, `definirSenha`, `solicitarRedefinicaoSenha`, `redefinirSenha`, `aceitarConvite` |
| `web/src/proxy.ts` | criar | Refresca sessão, redireciona, manda Roçador para `/campo` |
| `web/src/app/layout.tsx` | alterar | Vira mínimo: html, body, fontes, tema, `NuqsAdapter` |
| `web/src/app/(painel)/layout.tsx` | criar | `exigirSessao`, `<Shell sessao>`; `dynamic = "force-dynamic"` |
| `web/src/app/(painel)/**` | mover | `page.tsx`, `loading.tsx`, `error.tsx`, `agenda/`, `malha/`, `copiloto/`, `simulador/`, `trechos/`, `_componentes/` saem de `src/app/` |
| `web/src/app/(painel)/sem-acesso/page.tsx` | criar | Tela de cargo sem permissão |
| `web/src/app/(publico)/layout.tsx` | criar | Moldura centrada com a marca |
| `web/src/app/(publico)/entrar/page.tsx` + `_componentes/formulario-entrar.tsx` | criar | Login |
| `web/src/app/(publico)/definir-senha/page.tsx` + `_componentes/formulario-definir-senha.tsx` | criar | Troca da senha provisória |
| `web/src/app/(publico)/esqueci-a-senha/page.tsx` + `_componentes/formulario-esqueci.tsx` | criar | Pedido de redefinição |
| `web/src/app/(publico)/redefinir-senha/[token]/page.tsx` + `_componentes/formulario-redefinir.tsx` | criar | Nova senha por token |
| `web/src/app/(publico)/convite/[token]/page.tsx` + `_componentes/formulario-aceite.tsx` | criar | Aceite do convite |
| `web/src/components/shell/shell.tsx` | alterar | Recebe `sessao`, filtra navegação, menu do usuário |
| `web/src/components/shell/barra-lateral.tsx` | alterar | `ItemNavegacao.cargos`, itens por prop, grupo "Administração" |
| `web/src/components/shell/navegacao-movel.tsx`, `barra-superior.tsx`, `paleta-comandos.tsx` | alterar | Recebem `itens` por prop |
| `web/src/components/shell/menu-usuario.tsx` | criar | Nome, cargo, "Sair" |
| `web/src/lib/acoes.ts` | alterar | `permitir(...)` em todas as 12 actions; limite do Copiloto |
| `web/src/lib/email/enviar.ts` | criar | `enviarEmail` pelo Resend |
| `web/src/emails/base.tsx`, `convite.tsx`, `redefinir-senha.tsx` | criar | Templates React Email |
| `web/src/lib/usuarios/queries.ts` | criar | `listarPerfis`, `listarConvitesPendentes`, `contarSuperAdminsAtivos`, `equipesComLider` |
| `web/src/lib/usuarios/acoes.ts` | criar | `convidarUsuario`, `reenviarConvite`, `revogarConvite`, `alterarCargo`, `alterarEquipeLiderada`, `desativarUsuario`, `reativarUsuario` |
| `web/src/app/(painel)/usuarios/page.tsx` + `_componentes/*.tsx` | criar | Tela de Usuários |
| `web/scripts/semear-super-admin.mjs` | criar | Primeiro Super Admin |
| `web/scripts/fumaca.mjs` | alterar | Tabelas novas; chave publishável não lê |
| Superfícies somente leitura (lista na Tarefa 7) | alterar | Prop `podeEscrever` |

---

### Task 0: Fase 0 — E: igual a produção

**Files:**
- Modify: nada no repositório; operações de git e ambiente em `E:\motiva`

- [ ] **Step 1: Conferir que a árvore está limpa e registrar o ponto atual**

Run (Git Bash, em `E:\motiva`):
```bash
git status --short && git log -1 --format='%h %s' && (git tag arquivo/e-design-changes-2026-08-20 f73c249 2>/dev/null || true) && git tag | grep arquivo
```
Expected: `status` lista apenas os cinco documentos de `docs/superpowers` desta sessão como não rastreados (eles já estão em `origin/main`, enviados de E: em 10/09, e são idênticos: o `reset` do Step 2 os assume sem conflito); HEAD `f73c249 design: design changes`; tag presente (a sessão de planejamento já a criou e enviou).

- [ ] **Step 2: Buscar e alinhar com origin/main**

```bash
git fetch origin && git rev-parse origin/main && git reset --hard origin/main && git log -1 --format='%h %s'
```
Expected: `3faee68 feat(modelo): retreina o pkl na fisica v3.3 e reexporta o painel`.

- [ ] **Step 3: Trazer o CLAUDE.md atual e unir o `.env.local`**

```bash
cp /c/Users/enzom/motiva-recuperado/CLAUDE.md /e/motiva/CLAUDE.md
wc -c /e/motiva/CLAUDE.md /c/Users/enzom/motiva-recuperado/CLAUDE.md
diff <(sed 's/=.*//' /e/motiva/web/.env.local | sort) <(sed 's/=.*//' /c/Users/enzom/motiva-recuperado/web/.env.local | sort)
```
Expected: os dois `CLAUDE.md` com o mesmo tamanho. O `diff` lista variáveis que só existem em C: (GitHub); copie as linhas faltantes de C: para o `.env.local` de E: à mão, sem sobrescrever as que já existem.

- [ ] **Step 4: Reinstalar dependências**

```bash
cd /e/motiva/web && rm -rf node_modules && npm ci
cd /e/motiva && rm -rf venv && python -m venv venv && ./venv/Scripts/pip install -r requirements.txt
```
Expected: `npm ci` termina sem erro; `pip` instala `scikit-learn==1.9.0` e `numpy==2.2.4`.

- [ ] **Step 5: Portão verde**

```bash
cd /e/motiva/web && npm run verificar
```
Expected: tipos, lint, testes, fumaça e build passam. Se `esbuild` ou `node` disserem "não é um aplicativo válido", o disco perdeu escrita: repita o Step 4.

---

### Task 1: Dependências, variáveis e configuração do Next

**Files:**
- Modify: `web/package.json`
- Modify: `web/.env.example`
- Modify: `web/next.config.ts`
- Modify: `web/src/lib/supabase.ts:16-24`
- Create: `web/src/lib/resultado.ts`
- Modify: `web/src/lib/acoes.ts:18`

**Interfaces:**
- Produces: `export type Resultado<T = void> = { ok: true; dados: T } | { ok: false; erro: string }` em `@/lib/resultado`, re-exportado por `@/lib/acoes` para não quebrar importadores.

- [ ] **Step 1: Instalar**

```bash
cd /e/motiva/web && npm install @supabase/ssr resend @react-email/components && npm ls @supabase/ssr resend @react-email/components
```
Expected: três pacotes listados sem `ERR`.

- [ ] **Step 2: Variáveis de ambiente**

Acrescente ao fim de `web/.env.example`:
```bash
# Sessao do usuario (Supabase Auth). A publishavel pode ir ao navegador; a secreta NUNCA.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
# Chave secreta nova (sb_secret_...). Se vazia, o painel usa SUPABASE_SERVICE_KEY, que vale ate o fim de 2026.
SUPABASE_SECRET_KEY=

# Convite e redefinicao de senha saem pelo Resend. Sem dominio verificado o Resend so entrega
# para o e-mail da propria conta; a tela mostra o link copiavel de qualquer jeito.
RESEND_API_KEY=
EMAIL_REMETENTE="HighwAI <onboarding@resend.dev>"
# Base dos links de convite e redefinicao.
APP_URL=http://localhost:3000
CONVITE_VALIDADE_DIAS=7
```
Preencha `web/.env.local` com `NEXT_PUBLIC_SUPABASE_URL=https://mbkcygsqfcxxcmvkuqyt.supabase.co` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_Yii5juqkwA0Iz7gJILj0_Q_7j5dZjsW`.

- [ ] **Step 3: Tipo compartilhado**

Crie `web/src/lib/resultado.ts`:
```ts
/**
 * Contrato de toda Server Action: nunca lança, sempre devolve isto.
 * Vive num módulo próprio porque `sessao.ts` (server-only, sem "use server")
 * precisa do tipo, e um módulo "use server" só deve exportar funções.
 */
export type Resultado<T = void> = { ok: true; dados: T } | { ok: false; erro: string };
```
Em `web/src/lib/acoes.ts`, troque a linha `export type Resultado<T = void> = ...` por:
```ts
export type { Resultado } from "./resultado";
```

- [ ] **Step 4: Chave secreta com reserva**

Em `web/src/lib/supabase.ts`, substitua o bloco das linhas 16–24 por:
```ts
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
```

- [ ] **Step 5: Cabeçalhos e imagens**

Substitua `web/next.config.ts` por:
```ts
import type { NextConfig } from "next";

/* Sem CSP nesta versao: o script inline de tema e o Motion exigiriam nonce e
   nao ha tempo para medir a regressao antes de 13/09. Os cabecalhos abaixo nao
   quebram nada e fecham o obvio. */
const CABECALHOS_SEGURANCA = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // Camera e GPS so para a propria origem: e o app de campo quem usa.
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: CABECALHOS_SEGURANCA }];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "mbkcygsqfcxxcmvkuqyt.supabase.co", pathname: "/storage/v1/**" },
    ],
  },
};

export default nextConfig;
```

- [ ] **Step 6: Verificar e commitar**

```bash
npm run tipos && npm run lint && git add -A && git commit -m "chore(acesso): dependencias, variaveis e cabecalhos de seguranca" && git push origin main
```
Expected: sem erro de tipo (o `Resultado` re-exportado continua resolvendo em `planejamento.tsx` e nos outros importadores).

---

### Task 2: Migrações — linha de base, DDL da Fase 1 e RLS

**Files:**
- Create: `supabase/migrations/00000000000000_linha_de_base_ia.sql`
- Create: `supabase/migrations/20260910090000_perfis_convites_redefinicoes.sql`
- Create: `supabase/migrations/20260910091000_rls_em_tudo_sem_politicas.sql`
- Modify: `schema_ia.sql:1`
- Modify: `web/scripts/fumaca.mjs`

**Interfaces:**
- Produces: tabelas `ia.perfis`, `ia.convites`, `ia.redefinicoes_senha`, coluna `ia.equipes.lider_id`. Views com `security_invoker`. `anon` e `authenticated` sem nenhum privilégio em `ia` e `public`.

- [ ] **Step 1: Linha de base, só leitura**

Gere o DDL atual com o MCP `supabase-highwai` (`execute_sql`) usando a consulta abaixo e cole o resultado em `supabase/migrations/00000000000000_linha_de_base_ia.sql`, precedido do cabeçalho:
```sql
-- LINHA DE BASE, JA APLICADA. Nao rode este arquivo.
-- Retrato do schema `ia` em 2026-09-10, gerado a partir do banco, para o repositorio
-- voltar a ser a fonte do DDL. As 10 migracoes anteriores viviam so no historico do Supabase.
```
Consulta para as tabelas (uma linha por objeto):
```sql
select 'create table '||c.oid::regclass||' ('||string_agg(a.attname||' '||format_type(a.atttypid,a.atttypmod)||case when a.attnotnull then ' not null' else '' end||coalesce(' default '||pg_get_expr(d.adbin,d.adrelid),''), ', ' order by a.attnum)||');' as ddl
from pg_class c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
where c.relnamespace='ia'::regnamespace and c.relkind='r' group by c.oid
union all select pg_get_constraintdef(oid)||' -- '||conrelid::regclass||'.'||conname from pg_constraint where connamespace='ia'::regnamespace
union all select indexdef||';' from pg_indexes where schemaname='ia'
union all select 'create or replace view ia.'||viewname||' as '||definition from pg_views where schemaname='ia';
```
Acrescente no topo de `schema_ia.sql`: `-- HISTORICO (04/08/2026). O DDL vigente esta em supabase/migrations/. Nao rode.`

- [ ] **Step 2: DDL da Fase 1**

Crie `supabase/migrations/20260910090000_perfis_convites_redefinicoes.sql` com exatamente o bloco "DDL da Fase 1" do spec (§1), acrescido de:
```sql
comment on table ia.perfis is 'Uma linha por usuario do Auth. `cargo` e a verdade; app_metadata.cargo e copia para o proxy e para RLS futura.';
comment on column ia.equipes.lider_id is 'Exatamente um lider por equipe (unique). NULL = equipe sem lider; ninguem ve os chamados dela no app ate um Rocador ser convidado.';
create or replace function ia.carimbar_atualizado_em() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
create trigger tg_perfis_atualizado_em before update on ia.perfis
  for each row execute function ia.carimbar_atualizado_em();
```
Aplique com o MCP: `apply_migration(name: "perfis_convites_redefinicoes", query: <conteúdo>)`.

- [ ] **Step 3: RLS em tudo, sem políticas**

Crie `supabase/migrations/20260910091000_rls_em_tudo_sem_politicas.sql`:
```sql
-- Fecha o buraco medido em 09/09: anon tinha SELECT/INSERT/UPDATE/DELETE em quatro tabelas de `ia`.
-- Nenhuma politica: so a chave secreta (que ignora RLS) chega as tabelas. Painel, lote e API do
-- campo usam a chave secreta no servidor; nada quebra neles.
do $$
declare t record;
begin
  for t in select schemaname, tablename from pg_tables where schemaname in ('ia','public') loop
    execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
  end loop;
end $$;

revoke all on all tables in schema ia from anon, authenticated;
revoke all on all sequences in schema ia from anon, authenticated;
revoke all on all functions in schema ia from anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema ia revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- As views eram SECURITY DEFINER (advisor ERROR): leitura pela view ignorava o RLS das tabelas.
alter view ia.vw_trecho_status set (security_invoker = on);
alter view ia.trechos_por_zona set (security_invoker = on);

-- advisor WARN: search_path mutavel.
alter function ia.gerar_zonas set search_path = '';
```
Aplique com o MCP (`apply_migration`, nome `rls_em_tudo_sem_politicas`). Depois rode `get_advisors(type: "security")`: os achados `rls_disabled_in_public` e `security_definer_view` devem ter sumido.

- [ ] **Step 4: Smoke test passa a vigiar o buraco**

Em `web/scripts/fumaca.mjs`, depois do bloco que cria `db`, acrescente:
```js
/* A chave publishavel NAO pode ler nada. Se este teste passar a "ok", alguem ligou uma politica
   permissiva ou desligou o RLS, e o banco inteiro voltou a ser publico. */
const publico = createClient(env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  db: { schema: "ia" },
  auth: { persistSession: false },
});
```
E ao fim, antes do resumo de falhas:
```js
await checar(
  "publishavel nao le ia.trechos",
  async () => {
    const { data, error } = await publico.from("trechos").select("id").limit(1);
    if (error) return { data: [{ bloqueado: true }], error: null }; // erro de permissao e o esperado
    return { data, error: null };
  },
  (data) => (Array.isArray(data) && data.length === 0) || data?.[0]?.bloqueado ? null : "a chave publishavel conseguiu ler trechos",
);
await checar("perfis", () => db.from("perfis").select("usuario_id, cargo, ativo").limit(5), (d) => (Array.isArray(d) ? null : "forma inesperada"));
await checar("convites", () => db.from("convites").select("id, email, expira_em").limit(5), (d) => (Array.isArray(d) ? null : "forma inesperada"));
```
Ajuste `checar` para aceitar `data` vazio nestas duas (a validação acima já aceita array vazio).

- [ ] **Step 5: Verificar e commitar**

```bash
cd /e/motiva/web && npm run fumaca && cd .. && git add -A && git commit -m "feat(banco): perfis, convites, redefinicoes; RLS em tudo sem politicas; DDL versionado" && git push origin main
```
Expected: fumaça com `ok publishavel nao le ia.trechos`.

---

### Task 3: Cargo no domínio e a matriz de permissões (pura, testada)

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/dominio.ts`
- Create: `web/src/lib/auth/permissoes.ts`
- Create: `web/src/lib/auth/permissoes.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const CARGOS = ["super_admin", "admin", "analista", "rocador"] as const;
  export type Cargo = (typeof CARGOS)[number];
  export type Perfil = { usuario_id: string; nome: string; email: string; cargo: Cargo; ativo: boolean;
    senha_provisoria: boolean; convidado_por: string | null; criado_em: string; ultimo_acesso_em: string | null;
    desativado_em: string | null };
  export type Convite = { id: string; email: string; cargo: Cargo; equipe_id: number | null; expira_em: string;
    criado_por: string; criado_em: string; enviado_em: string | null; aceito_em: string | null; revogado_em: string | null };
  export const CARGO: Record<Cargo, { rotulo: string; descricao: string; icone: string }>;
  export const ROTAS_PUBLICAS: readonly string[];
  export function ehRotaPublica(pathname: string): boolean;
  export function podeVerRota(cargo: Cargo, pathname: string): boolean;
  export function rotaInicial(cargo: Cargo): "/" | "/campo";
  export function podeEscrever(cargo: Cargo): boolean;
  export function podeConvidar(convidador: Cargo, alvo: Cargo): boolean;
  export function motivoParaNaoAlterar(a: { autorId: string; autorCargo: Cargo; alvoId: string; alvoCargo: Cargo;
    alvoAtivo: boolean; novoCargo: Cargo | null; desativar: boolean; superAdminsAtivos: number }): string | null;
  ```

- [ ] **Step 1: Tipos**

Em `web/src/lib/types.ts`, depois de `ORIGENS`, acrescente:
```ts
/** Cargos de acesso. Ordem: do maior ao menor poder; `CARGO` em dominio.ts da o rotulo. */
export const CARGOS = ["super_admin", "admin", "analista", "rocador"] as const;
export type Cargo = (typeof CARGOS)[number];

export type Perfil = {
  usuario_id: string;
  nome: string;
  email: string;
  cargo: Cargo;
  ativo: boolean;
  senha_provisoria: boolean;
  convidado_por: string | null;
  criado_em: string;
  ultimo_acesso_em: string | null;
  desativado_em: string | null;
};

export type Convite = {
  id: string;
  email: string;
  cargo: Cargo;
  equipe_id: number | null;
  expira_em: string;
  criado_por: string;
  criado_em: string;
  enviado_em: string | null;
  aceito_em: string | null;
  revogado_em: string | null;
};
```
E em `Equipe`, acrescente `lider_id: string | null;`.

- [ ] **Step 2: Vocabulário**

Em `web/src/lib/dominio.ts`, importe `Cargo` de `./types` e acrescente depois de `STATUS`:
```ts
export const CARGO: Record<Cargo, { rotulo: string; descricao: string; icone: string }> = {
  super_admin: { rotulo: "Super Admin", descricao: "Tudo, inclusive o Laboratório", icone: "ShieldCheck" },
  admin: { rotulo: "Admin", descricao: "Gestão da malha, chamados e usuários", icone: "UserCog" },
  analista: { rotulo: "Analista", descricao: "Painel, Malha e Agenda, somente leitura", icone: "Eye" },
  rocador: { rotulo: "Roçador", descricao: "Líder de equipe: só a tela de campo", icone: "Tractor" },
};
```

- [ ] **Step 3: Testes primeiro**

Crie `web/src/lib/auth/permissoes.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import {
  ehRotaPublica,
  motivoParaNaoAlterar,
  podeConvidar,
  podeEscrever,
  podeVerRota,
  rotaInicial,
} from "./permissoes";

describe("podeVerRota", () => {
  it("super_admin vê tudo, inclusive o Laboratório", () => {
    for (const rota of ["/", "/malha", "/agenda", "/trechos/31", "/copiloto", "/chamados", "/usuarios", "/campo", "/simulador"]) {
      expect(podeVerRota("super_admin", rota)).toBe(true);
    }
  });
  it("admin não vê o Laboratório", () => {
    expect(podeVerRota("admin", "/simulador")).toBe(false);
    expect(podeVerRota("admin", "/chamados")).toBe(true);
    expect(podeVerRota("admin", "/usuarios")).toBe(true);
    expect(podeVerRota("admin", "/campo")).toBe(true);
  });
  it("analista vê painel, malha, agenda, trecho e copiloto; nada de operação", () => {
    for (const rota of ["/", "/malha", "/agenda", "/trechos/3", "/copiloto"]) expect(podeVerRota("analista", rota)).toBe(true);
    for (const rota of ["/chamados", "/usuarios", "/campo", "/simulador"]) expect(podeVerRota("analista", rota)).toBe(false);
  });
  it("rocador só vê /campo", () => {
    expect(podeVerRota("rocador", "/campo")).toBe(true);
    for (const rota of ["/", "/agenda", "/chamados", "/usuarios", "/simulador"]) expect(podeVerRota("rocador", rota)).toBe(false);
  });
  it("prefixo não vaza: /campoX não é /campo", () => {
    expect(podeVerRota("rocador", "/campos")).toBe(false);
  });
  it("rotas de serviço são de todos", () => {
    for (const cargo of ["super_admin", "admin", "analista", "rocador"] as const) {
      expect(podeVerRota(cargo, "/sem-acesso")).toBe(true);
      expect(podeVerRota(cargo, "/definir-senha")).toBe(true);
    }
  });
});

describe("rotaInicial e podeEscrever", () => {
  it("rocador começa no campo, o resto no painel", () => {
    expect(rotaInicial("rocador")).toBe("/campo");
    expect(rotaInicial("analista")).toBe("/");
  });
  it("só admin e super_admin escrevem no painel", () => {
    expect(podeEscrever("super_admin")).toBe(true);
    expect(podeEscrever("admin")).toBe(true);
    expect(podeEscrever("analista")).toBe(false);
    expect(podeEscrever("rocador")).toBe(false);
  });
});

describe("podeConvidar", () => {
  it("super_admin convida qualquer cargo", () => {
    for (const alvo of ["super_admin", "admin", "analista", "rocador"] as const) expect(podeConvidar("super_admin", alvo)).toBe(true);
  });
  it("admin convida tudo abaixo de super_admin", () => {
    expect(podeConvidar("admin", "super_admin")).toBe(false);
    expect(podeConvidar("admin", "admin")).toBe(true);
    expect(podeConvidar("admin", "rocador")).toBe(true);
  });
  it("analista e rocador não convidam", () => {
    expect(podeConvidar("analista", "rocador")).toBe(false);
    expect(podeConvidar("rocador", "rocador")).toBe(false);
  });
});

describe("motivoParaNaoAlterar", () => {
  const base = { autorId: "a", autorCargo: "admin" as const, alvoId: "b", alvoCargo: "analista" as const, alvoAtivo: true, novoCargo: null, desativar: false, superAdminsAtivos: 2 };
  it("ninguém altera a si mesmo", () => {
    expect(motivoParaNaoAlterar({ ...base, alvoId: "a", desativar: true })).toMatch(/a si mesmo/);
  });
  it("admin não promove a super_admin", () => {
    expect(motivoParaNaoAlterar({ ...base, novoCargo: "super_admin" })).toMatch(/Super Admin/);
    expect(motivoParaNaoAlterar({ ...base, autorCargo: "super_admin", novoCargo: "super_admin" })).toBeNull();
  });
  it("admin não mexe em super_admin", () => {
    expect(motivoParaNaoAlterar({ ...base, alvoCargo: "super_admin", desativar: true })).toMatch(/Super Admin/);
  });
  it("o último super_admin ativo fica", () => {
    const ultimo = { ...base, autorCargo: "super_admin" as const, alvoCargo: "super_admin" as const, superAdminsAtivos: 1 };
    expect(motivoParaNaoAlterar({ ...ultimo, desativar: true })).toMatch(/último Super Admin/);
    expect(motivoParaNaoAlterar({ ...ultimo, novoCargo: "admin" })).toMatch(/último Super Admin/);
    expect(motivoParaNaoAlterar({ ...ultimo, superAdminsAtivos: 2, novoCargo: "admin" })).toBeNull();
  });
  it("alteração comum passa", () => {
    expect(motivoParaNaoAlterar({ ...base, novoCargo: "admin" })).toBeNull();
    expect(motivoParaNaoAlterar({ ...base, desativar: true })).toBeNull();
  });
});

describe("ehRotaPublica", () => {
  it("reconhece as quatro rotas e seus filhos", () => {
    expect(ehRotaPublica("/entrar")).toBe(true);
    expect(ehRotaPublica("/convite/abc")).toBe(true);
    expect(ehRotaPublica("/redefinir-senha/xyz")).toBe(true);
    expect(ehRotaPublica("/esqueci-a-senha")).toBe(true);
    expect(ehRotaPublica("/")).toBe(false);
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `cd /e/motiva/web && npx vitest run src/lib/auth/permissoes.test.ts`
Expected: FAIL, módulo `./permissoes` não encontrado.

- [ ] **Step 5: Implementação**

Crie `web/src/lib/auth/permissoes.ts`:
```ts
import type { Cargo } from "../types";

/**
 * A matriz de acesso, em um lugar só e sem I/O.
 *
 * O proxy, o Shell (que filtra a navegação), cada página (`exigirCargo`) e cada
 * action (`permitir`) leem daqui. Se dois deles discordassem, a tela mostraria
 * um item que o servidor recusa, ou esconderia um que ele aceita.
 */

const TODOS: readonly Cargo[] = ["super_admin", "admin", "analista", "rocador"];
const GESTAO: readonly Cargo[] = ["super_admin", "admin"];
const LEITURA: readonly Cargo[] = ["super_admin", "admin", "analista"];

/** Rotas que existem para quem NAO tem sessao. Prefixo casa filhos (`/convite/<token>`). */
export const ROTAS_PUBLICAS = ["/entrar", "/esqueci-a-senha", "/redefinir-senha", "/convite"] as const;

type Tela = { prefixo: string; exato?: boolean; cargos: readonly Cargo[] };

const TELAS: readonly Tela[] = [
  { prefixo: "/", exato: true, cargos: LEITURA },
  { prefixo: "/malha", cargos: LEITURA },
  { prefixo: "/agenda", cargos: LEITURA },
  { prefixo: "/trechos", cargos: LEITURA },
  { prefixo: "/copiloto", cargos: LEITURA },
  { prefixo: "/chamados", cargos: GESTAO },
  { prefixo: "/usuarios", cargos: GESTAO },
  { prefixo: "/campo", cargos: ["super_admin", "admin", "rocador"] },
  { prefixo: "/simulador", cargos: ["super_admin"] },
  { prefixo: "/sem-acesso", cargos: TODOS },
  { prefixo: "/definir-senha", cargos: TODOS },
];

function casa(prefixo: string, pathname: string, exato = false): boolean {
  if (exato) return pathname === prefixo;
  return pathname === prefixo || pathname.startsWith(`${prefixo}/`);
}

export function ehRotaPublica(pathname: string): boolean {
  return ROTAS_PUBLICAS.some((p) => casa(p, pathname));
}

/** Rota desconhecida (ex.: `/api/...`) devolve true: quem a serve decide. */
export function podeVerRota(cargo: Cargo, pathname: string): boolean {
  const tela = TELAS.find((t) => casa(t.prefixo, pathname, t.exato));
  return tela ? tela.cargos.includes(cargo) : true;
}

export function rotaInicial(cargo: Cargo): "/" | "/campo" {
  return cargo === "rocador" ? "/campo" : "/";
}

export function podeEscrever(cargo: Cargo): boolean {
  return GESTAO.includes(cargo);
}

export function podeConvidar(convidador: Cargo, alvo: Cargo): boolean {
  if (convidador === "super_admin") return true;
  if (convidador === "admin") return alvo !== "super_admin";
  return false;
}

/** `null` = pode. Texto = motivo legivel da recusa, que a tela e a action mostram igual. */
export function motivoParaNaoAlterar(a: {
  autorId: string;
  autorCargo: Cargo;
  alvoId: string;
  alvoCargo: Cargo;
  alvoAtivo: boolean;
  novoCargo: Cargo | null;
  desativar: boolean;
  superAdminsAtivos: number;
}): string | null {
  if (!GESTAO.includes(a.autorCargo)) return "Você não tem permissão para alterar usuários.";
  if (a.autorId === a.alvoId) return "Você não pode alterar a si mesmo. Peça a outro administrador.";
  if (a.autorCargo === "admin" && a.alvoCargo === "super_admin") return "Um Admin não altera um Super Admin.";
  if (a.novoCargo === "super_admin" && a.autorCargo !== "super_admin") return "Só um Super Admin promove a Super Admin.";
  const tiraSuperAdmin = a.alvoCargo === "super_admin" && a.alvoAtivo && (a.desativar || (a.novoCargo != null && a.novoCargo !== "super_admin"));
  if (tiraSuperAdmin && a.superAdminsAtivos <= 1) return "Este é o último Super Admin ativo; promova outro antes.";
  return null;
}
```

- [ ] **Step 6: Rodar e ver passar; commitar**

Run: `npx vitest run src/lib/auth/permissoes.test.ts`
Expected: PASS, todos os testes.
```bash
git add -A && git commit -m "feat(acesso): cargos no dominio e matriz de permissoes pura" && git push origin main
```

---

### Task 4: Tokens, cliente de sessão, camada de acesso e proxy

**Files:**
- Create: `web/src/lib/auth/tokens.ts`
- Create: `web/src/lib/auth/tokens.test.ts`
- Create: `web/src/lib/auth/servidor.ts`
- Create: `web/src/lib/auth/sessao.ts`
- Create: `web/src/proxy.ts`

**Interfaces:**
- Consumes: `podeVerRota`, `rotaInicial`, `ehRotaPublica` (Task 3); `db` (`@/lib/supabase`); `Resultado` (`@/lib/resultado`).
- Produces:
  ```ts
  export function gerarToken(): string;                         // 43 chars base64url-safe, 192 bits
  export function hashToken(token: string): Promise<string>;   // sha-256 hex, 64 chars
  export function prazo(horas: number, agora?: Date): Date;
  export function expirado(expiraEm: string | Date, agora?: Date): boolean;
  export const SENHA_MINIMA = 10;
  export function erroDaSenha(senha: string): string | null;
  export function clienteSessao(): Promise<SupabaseClient>;    // @supabase/ssr, cookies do request
  export type Sessao = { usuarioId: string; email: string; nome: string; cargo: Cargo; equipeId: number | null; senhaProvisoria: boolean };
  export const obterSessao: () => Promise<Sessao | null>;
  export function exigirSessao(opcoes?: { permitirSenhaProvisoria?: boolean }): Promise<Sessao>;
  export function exigirCargo(...cargos: Cargo[]): Promise<Sessao>;
  export function permitir(...cargos: Cargo[]): Promise<Resultado<Sessao>>;
  ```

- [ ] **Step 1: Testes dos tokens**

Crie `web/src/lib/auth/tokens.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { erroDaSenha, expirado, gerarToken, hashToken, prazo } from "./tokens";

describe("gerarToken", () => {
  it("tem 43 caracteres seguros para URL e não repete", () => {
    const a = gerarToken();
    const b = gerarToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
});

describe("hashToken", () => {
  it("é determinístico, hex de 64 caracteres, e não devolve o próprio token", async () => {
    const h1 = await hashToken("abc");
    const h2 = await hashToken("abc");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashToken("abd")).not.toBe(h1);
  });
});

describe("prazo e expirado", () => {
  const agora = new Date("2026-09-10T12:00:00Z");
  it("7 dias à frente ainda vale; um segundo depois do prazo, não", () => {
    const limite = prazo(7 * 24, agora);
    expect(limite.toISOString()).toBe("2026-09-17T12:00:00.000Z");
    expect(expirado(limite, new Date("2026-09-17T11:59:59Z"))).toBe(false);
    expect(expirado(limite, new Date("2026-09-17T12:00:00Z"))).toBe(true);
  });
});

describe("erroDaSenha", () => {
  it("exige 10 caracteres com letra e número", () => {
    expect(erroDaSenha("curta1")).toMatch(/10 caracteres/);
    expect(erroDaSenha("semnumeroaqui")).toMatch(/letras e números/);
    expect(erroDaSenha("1234567890")).toMatch(/letras e números/);
    expect(erroDaSenha("rodovia-2026")).toBeNull();
  });
});
```
Run: `npx vitest run src/lib/auth/tokens.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 2: Tokens**

Crie `web/src/lib/auth/tokens.ts`:
```ts
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
```
Run: `npx vitest run src/lib/auth/tokens.test.ts` → PASS.

- [ ] **Step 3: Cliente de sessão**

Crie `web/src/lib/auth/servidor.ts`:
```ts
import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Cliente do Supabase que enxerga a SESSAO DO USUARIO pelos cookies do request.
 *
 * Nao confundir com `db` (`@/lib/supabase`): aquele usa a chave secreta e le
 * dados; este usa a publishavel e so serve a autenticacao (quem e, entrar,
 * sair, trocar a propria senha). Um por request: e leve, e a doc do Supabase
 * pede exatamente isso.
 */
export function configPublica(): { url: string; chave: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY sao obrigatorias para a sessao. " +
        "Veja web/.env.example.",
    );
  }
  return { url, chave };
}

export async function clienteSessao() {
  const { url, chave } = configPublica();
  const jarra = await cookies();

  return createServerClient(url, chave, {
    cookies: {
      getAll() {
        return jarra.getAll();
      },
      setAll(paraGravar) {
        try {
          paraGravar.forEach(({ name, value, options }) => jarra.set(name, value, options));
        } catch {
          // Renderizacao de Server Component nao pode gravar cookie. Tudo bem:
          // o proxy ja refrescou a sessao antes de a pagina rodar.
        }
      },
    },
  });
}
```

- [ ] **Step 4: Camada de acesso**

Crie `web/src/lib/auth/sessao.ts`:
```ts
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import type { Resultado } from "../resultado";
import { db } from "../supabase";
import type { Cargo } from "../types";
import { clienteSessao } from "./servidor";

/**
 * A UNICA fonte de "quem esta pedindo".
 *
 * O proxy redireciona por conveniencia; a doc do Next 16 e explicita que ele
 * "should not be your only line of defense". Toda pagina chama `exigirCargo`
 * e toda Server Action chama `permitir`. Sem excecao: uma action sem guarda e
 * um POST publico que escreve com a chave secreta.
 */
export type Sessao = {
  usuarioId: string;
  email: string;
  nome: string;
  cargo: Cargo;
  /** Equipe que a pessoa lidera (`ia.equipes.lider_id`). So Rocador costuma ter. */
  equipeId: number | null;
  senhaProvisoria: boolean;
};

export const obterSessao = cache(async (): Promise<Sessao | null> => {
  const supabase = await clienteSessao();
  const { data, error } = await supabase.auth.getClaims();
  const usuarioId = data?.claims?.sub;
  if (error || !usuarioId) return null;

  // O cargo autoritativo e o do perfil, nao o do token: desativar alguem tem
  // que valer na proxima requisicao, e o token vive ate uma hora.
  const { data: perfil } = await db
    .from("perfis")
    .select("email, nome, cargo, ativo, senha_provisoria, equipes!equipes_lider_id_fkey ( id )")
    .eq("usuario_id", usuarioId)
    .maybeSingle();

  if (!perfil || !perfil.ativo) return null;

  const equipes = perfil.equipes as unknown as { id: number }[] | { id: number } | null;
  const equipe = Array.isArray(equipes) ? equipes[0] : equipes;

  return {
    usuarioId,
    email: perfil.email as string,
    nome: perfil.nome as string,
    cargo: perfil.cargo as Cargo,
    equipeId: equipe?.id ?? null,
    senhaProvisoria: Boolean(perfil.senha_provisoria),
  };
});

export async function exigirSessao(opcoes?: { permitirSenhaProvisoria?: boolean }): Promise<Sessao> {
  const sessao = await obterSessao();
  if (!sessao) redirect("/entrar");
  if (sessao.senhaProvisoria && !opcoes?.permitirSenhaProvisoria) redirect("/definir-senha");
  return sessao;
}

export async function exigirCargo(...cargos: Cargo[]): Promise<Sessao> {
  const sessao = await exigirSessao();
  if (!cargos.includes(sessao.cargo)) redirect("/sem-acesso");
  return sessao;
}

/** Versao para Server Action: nao redireciona, devolve o contrato `Resultado`. */
export async function permitir(...cargos: Cargo[]): Promise<Resultado<Sessao>> {
  const sessao = await obterSessao();
  if (!sessao) return { ok: false, erro: "Sua sessão expirou. Entre de novo." };
  if (!cargos.includes(sessao.cargo)) {
    return {
      ok: false,
      erro: sessao.cargo === "analista" ? "Seu acesso é somente leitura." : "Você não tem permissão para esta ação.",
    };
  }
  return { ok: true, dados: sessao };
}
```
Se o embed `equipes!equipes_lider_id_fkey` for recusado pelo PostgREST (o nome da FK aparece em `list_tables` do MCP), troque por uma segunda consulta: `db.from("equipes").select("id").eq("lider_id", usuarioId).maybeSingle()`.

- [ ] **Step 5: Proxy**

Crie `web/src/proxy.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { ehRotaPublica, podeVerRota, rotaInicial } from "@/lib/auth/permissoes";
import type { Cargo } from "@/lib/types";

/**
 * Refresca a sessao e redireciona. NAO e camada de seguranca: Server Actions e
 * route handlers passam por fora do matcher, e a doc do Next 16 manda checar
 * em cada um deles (`permitir`, `exigirCargo`).
 *
 * O cargo lido aqui vem de `app_metadata` do token, copia gravada pela action
 * de convite. Ele so decide REDIRECIONAMENTO; a decisao de acesso e do perfil.
 */
export async function proxy(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(paraGravar) {
          paraGravar.forEach(({ name, value }) => request.cookies.set(name, value));
          resposta = NextResponse.next({ request });
          paraGravar.forEach(({ name, value, options }) => resposta.cookies.set(name, value, options));
        },
      },
    },
  );

  // Nada entre criar o cliente e `getClaims()`: a doc do Supabase avisa que
  // codigo no meio pode deixar a sessao sem refrescar.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; app_metadata?: { cargo?: string } } | undefined;

  const caminho = request.nextUrl.pathname;
  const ehApi = caminho.startsWith("/api/");
  const publica = ehRotaPublica(caminho);

  if (!claims?.sub) {
    if (publica) return resposta;
    if (ehApi) return NextResponse.json({ erro: "Sessão necessária." }, { status: 401 });
    const destino = request.nextUrl.clone();
    destino.pathname = "/entrar";
    destino.search = "";
    if (caminho !== "/") destino.searchParams.set("proximo", caminho);
    return NextResponse.redirect(destino);
  }

  const cargo = claims.app_metadata?.cargo as Cargo | undefined;

  // Logado em /entrar ou /esqueci-a-senha: nao ha o que fazer la.
  if (cargo && (caminho === "/entrar" || caminho === "/esqueci-a-senha")) {
    return NextResponse.redirect(new URL(rotaInicial(cargo), request.url));
  }

  if (cargo && !ehApi && !publica && !podeVerRota(cargo, caminho)) {
    const destino = cargo === "rocador" ? "/campo" : "/sem-acesso";
    return NextResponse.redirect(new URL(destino, request.url));
  }

  return resposta;
}

export const config = {
  matcher: [
    // Tudo, menos estaticos, o service worker, os icones, o manifesto e o assetlinks do APK.
    "/((?!_next/static|_next/image|favicon.ico|serwist|icones|\\.well-known|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
```

- [ ] **Step 6: Tipos e commit**

Run: `npm run tipos && npx vitest run src/lib/auth`
Expected: sem erro; testes de `permissoes` e `tokens` passam.
```bash
git add -A && git commit -m "feat(acesso): tokens, cliente de sessao, camada de acesso e proxy" && git push origin main
```

---

### Task 5: Grupos de rota, navegação por cargo e o Shell com sessão

**Files:**
- Modify: `web/src/app/layout.tsx`
- Create: `web/src/app/(painel)/layout.tsx`
- Move: `web/src/app/{page,loading,error}.tsx`, `web/src/app/{agenda,malha,copiloto,simulador,trechos,_componentes}/` → `web/src/app/(painel)/`
- Create: `web/src/app/(painel)/sem-acesso/page.tsx`
- Create: `web/src/app/(publico)/layout.tsx`
- Create: `web/src/components/shell/navegacao.ts`
- Modify: `web/src/components/shell/barra-lateral.tsx`, `navegacao-movel.tsx`, `barra-superior.tsx`, `paleta-comandos.tsx`, `shell.tsx`
- Create: `web/src/components/shell/menu-usuario.tsx`
- Modify: as seis páginas do painel (guarda de cargo)

**Interfaces:**
- Consumes: `Sessao`, `exigirSessao`, `exigirCargo` (Task 4); `itensDeNavegacao` (este task); `sair` (Task 6, chegará depois: aqui o botão importa a action já com o nome final).
- Produces:
  ```ts
  export type ItemNavegacao = { href: string; rotulo: string; icone: LucideIcon; descricao: string; grupo: GrupoNavegacao };
  export const NAVEGACAO: ItemNavegacao[];
  export function itensDeNavegacao(cargo: Cargo): ItemNavegacao[];
  export function rotaAtiva(pathname: string, href: string): boolean;
  // Shell({ sessao, children }); BarraLateral({ cargo, ultimaAnalise }); NavegacaoMovel({ cargo });
  // BarraSuperior({ trechos, cargo, usuario: { nome, cargo } }); PaletaComandos({ trechos, cargo, aberta, aoAbrir, aoFechar })
  ```

- [ ] **Step 1: Mover as rotas para `(painel)`**

```bash
cd /e/motiva/web/src/app && mkdir "(painel)" "(publico)" && git mv page.tsx loading.tsx error.tsx agenda malha copiloto simulador trechos _componentes "(painel)/" && ls "(painel)" && grep -rn "@/app/_componentes\|from \"\\.\\./\\.\\./_componentes" /e/motiva/web/src || echo "nenhum import absoluto para consertar"
```
Expected: os nove itens dentro de `(painel)`; nenhum import a consertar (os imports são relativos ou por `@/lib`, `@/components`). Se o grep achar algo, troque para `@/app/(painel)/_componentes/...`.

- [ ] **Step 2: Layout raiz mínimo**

Em `web/src/app/layout.tsx`: remova `import { Shell } ...`; remova o bloco `export const dynamic = "force-dynamic";` **e** seu comentário (eles vão para o layout do painel); no JSX troque `<NuqsAdapter><Shell>{children}</Shell></NuqsAdapter>` por `<NuqsAdapter>{children}</NuqsAdapter>`. Nada mais muda: `metadata`, `viewport`, fontes, `SCRIPT_TEMA` e o skip-link ficam.

- [ ] **Step 3: Layout do painel**

Crie `web/src/app/(painel)/layout.tsx`:
```tsx
import { redirect } from "next/navigation";

import { Shell } from "@/components/shell/shell";
import { rotaInicial } from "@/lib/auth/permissoes";
import { exigirSessao } from "@/lib/auth/sessao";

/**
 * Nada aqui pode ser pre-renderizado: o `analisar_lote.py` reescreve previsoes
 * e agendamentos todo dia por fora do app. Antes isto ficava no layout raiz;
 * saiu de la porque `/campo` precisa ser estatico para o service worker.
 */
export const dynamic = "force-dynamic";

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  // Guarda do casco. Cada pagina repete a sua (`exigirCargo`): layout nao
  // re-renderiza em toda navegacao, e a doc do Next manda checar perto do dado.
  const sessao = await exigirSessao();
  if (sessao.cargo === "rocador") redirect(rotaInicial(sessao.cargo));

  return <Shell sessao={sessao}>{children}</Shell>;
}
```

- [ ] **Step 4: Layout público**

Crie `web/src/app/(publico)/layout.tsx`:
```tsx
import { Marca } from "@/components/shell/marca";

/** Moldura das telas sem sessao: entrar, convite, senha. Sem Shell, sem dados. */
export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <main id="conteudo" className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Marca tamanho={28} comTexto />
          <p className="text-sm text-ink-3">Regulação de solo · Motiva</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-6" style={{ boxShadow: "var(--shadow-md)" }}>
          {children}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Navegação como módulo neutro**

Crie `web/src/components/shell/navegacao.ts` movendo para cá `GRUPOS`, `GrupoNavegacao`, `ItemNavegacao`, `NAVEGACAO` e `rotaAtiva` de `barra-lateral.tsx` (linhas 22–56), com estas mudanças:
```ts
import {
  CalendarRange, ClipboardList, FlaskConical, LayoutDashboard, MessageSquareText, Smartphone, Users, Waypoints,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { podeVerRota } from "@/lib/auth/permissoes";
import type { Cargo } from "@/lib/types";

/* Modulo sem "use client" e sem JSX de proposito: o Shell (servidor) e os quatro
   consumidores (cliente) leem a mesma lista. Um componente de servidor nao
   pode ler constante de um modulo "use client". */

export const GRUPOS = [
  { chave: "operacao", rotulo: "Operação" },
  { chave: "administracao", rotulo: "Administração" },
  { chave: "laboratorio", rotulo: "Laboratório" },
] as const;

export type GrupoNavegacao = (typeof GRUPOS)[number]["chave"];

export type ItemNavegacao = {
  href: string;
  rotulo: string;
  icone: LucideIcon;
  descricao: string;
  grupo: GrupoNavegacao;
};

export const NAVEGACAO: ItemNavegacao[] = [
  { href: "/", rotulo: "Painel", icone: LayoutDashboard, descricao: "Visão geral da malha", grupo: "operacao" },
  { href: "/malha", rotulo: "Malha", icone: Waypoints, descricao: "Trechos por rodovia, em régua de km", grupo: "operacao" },
  { href: "/agenda", rotulo: "Agenda", icone: CalendarRange, descricao: "Roçadas sugeridas e aprovadas", grupo: "operacao" },
  { href: "/chamados", rotulo: "Chamados", icone: ClipboardList, descricao: "Ordens de roçada: execução, aprovação e adiamentos", grupo: "operacao" },
  { href: "/copiloto", rotulo: "Copiloto", icone: MessageSquareText, descricao: "Perguntas em português sobre a malha", grupo: "operacao" },
  { href: "/campo", rotulo: "Campo", icone: Smartphone, descricao: "A tela da equipe, para suporte e teste", grupo: "operacao" },
  { href: "/usuarios", rotulo: "Usuários", icone: Users, descricao: "Convites, cargos e equipes lideradas", grupo: "administracao" },
  { href: "/simulador", rotulo: "Simulador", icone: FlaskConical, descricao: "Crescimento previsto em um ponto qualquer", grupo: "laboratorio" },
];

export function rotaAtiva(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** A navegacao e a matriz de permissoes aplicada a lista: nao decide acesso, reflete. */
export function itensDeNavegacao(cargo: Cargo): ItemNavegacao[] {
  return NAVEGACAO.filter((item) => podeVerRota(cargo, item.href));
}
```
Em `barra-lateral.tsx`: apague as linhas 22–56 e importe `GRUPOS, itensDeNavegacao, rotaAtiva` de `./navegacao`; a assinatura vira `BarraLateral({ cargo, ultimaAnalise }: { cargo: Cargo; ultimaAnalise?: string | null })`; logo após `const pathname = usePathname();` acrescente `const itens = itensDeNavegacao(cargo);` e, na linha do filtro por grupo (`NAVEGACAO.filter(...)`), use `itens.filter(...)`. Grupo sem item já é pulado (`if (itens.length === 0) return null;`).

Em `navegacao-movel.tsx`: importe de `./navegacao`; assinatura `NavegacaoMovel({ cargo }: { cargo: Cargo })`; `const itens = itensDeNavegacao(cargo);` e troque as duas ocorrências de `NAVEGACAO` por `itens`. Abaixo de `md` a barra tem no máximo 6 itens para Super Admin: mantenha `repeat(${itens.length}, minmax(0, 1fr))`.

Em `paleta-comandos.tsx`: importe `itensDeNavegacao` de `./navegacao`; acrescente a prop `cargo: Cargo` em `PaletaComandos` e repasse ao componente interno que monta `rotas`; ali troque `NAVEGACAO.map(...)` por `itensDeNavegacao(cargo).map(...)`.

Em `barra-superior.tsx`: importe `itensDeNavegacao` de `./navegacao` e `MenuUsuario` de `./menu-usuario`; `montarTrilha(pathname: string, itens: ItemNavegacao[])` usa `itens.find(...)` em vez de `NAVEGACAO.find(...)`; assinatura `BarraSuperior({ trechos, cargo, usuario }: { trechos: TrechoNaPaleta[]; cargo: Cargo; usuario: { nome: string; cargo: Cargo } })`; `const itens = itensDeNavegacao(cargo)`; `useMemo(() => montarTrilha(pathname, itens), [pathname, itens])`; passe `cargo={cargo}` a `<PaletaComandos>`; renderize `<MenuUsuario usuario={usuario} />` como último filho do `div.ml-auto`.

- [ ] **Step 6: Menu do usuário**

Crie `web/src/components/shell/menu-usuario.tsx`:
```tsx
"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";

import { Botao } from "@/components/ui/botao";
import { sair } from "@/lib/auth/acoes";
import { CARGO } from "@/lib/dominio";
import type { Cargo } from "@/lib/types";

/** Quem esta logado, e a saida. Nome e cargo em texto: a paleta de status e do dado, nao de gente. */
export function MenuUsuario({ usuario }: { usuario: { nome: string; cargo: Cargo } }) {
  const [saindo, iniciar] = useTransition();
  const iniciais = usuario.nome
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="hidden size-8 items-center justify-center rounded-full bg-surface-3 font-mono text-xs font-semibold text-ink-2 sm:inline-flex"
      >
        {iniciais}
      </span>
      <span className="hidden min-w-0 flex-col leading-tight md:flex">
        <span className="truncate text-sm font-medium text-ink">{usuario.nome}</span>
        <span className="truncate text-2xs text-ink-3">{CARGO[usuario.cargo].rotulo}</span>
      </span>
      <Botao
        variante="fantasma"
        tamanho="sm"
        carregando={saindo}
        iconeEsquerda={<LogOut />}
        aria-label="Sair da conta"
        onClick={() => iniciar(() => sair())}
      >
        <span className="hidden sm:inline">Sair</span>
      </Botao>
    </div>
  );
}
```

- [ ] **Step 7: Shell com sessão**

Em `web/src/components/shell/shell.tsx`: importe `type Sessao` de `@/lib/auth/sessao`; assinatura `Shell({ sessao, children }: { sessao: Sessao; children: React.ReactNode })`; passe `cargo={sessao.cargo}` a `<BarraLateral>` e a `<NavegacaoMovel>`, e `cargo={sessao.cargo} usuario={{ nome: sessao.nome, cargo: sessao.cargo }}` a `<BarraSuperior>`.

- [ ] **Step 8: Tela de sem acesso**

Crie `web/src/app/(painel)/sem-acesso/page.tsx`:
```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { ShieldOff } from "lucide-react";

import { classesBotao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/vazio";
import { rotaInicial } from "@/lib/auth/permissoes";
import { exigirSessao } from "@/lib/auth/sessao";
import { CARGO } from "@/lib/dominio";

export const metadata: Metadata = { title: "Sem acesso" };

export default async function PaginaSemAcesso() {
  const sessao = await exigirSessao();
  return (
    <div className="mx-auto max-w-xl py-16">
      <EstadoVazio
        icone={<ShieldOff />}
        titulo="Esta tela não faz parte do seu acesso"
        descricao={`Você entrou como ${CARGO[sessao.cargo].rotulo}: ${CARGO[sessao.cargo].descricao}. Se precisar desta tela, peça a um administrador.`}
        acao={
          <Link href={rotaInicial(sessao.cargo)} className={classesBotao("primario", "sm")}>
            Voltar ao início
          </Link>
        }
      />
    </div>
  );
}
```

- [ ] **Step 9: Guarda em cada página**

Acrescente, como **primeira linha** do corpo da função de página (antes do `Promise.all`):
- `(painel)/page.tsx`, `(painel)/malha/page.tsx`, `(painel)/agenda/page.tsx`, `(painel)/copiloto/page.tsx`, `(painel)/trechos/[id]/page.tsx`: `const sessao = await exigirCargo("super_admin", "admin", "analista");`
- `(painel)/simulador/page.tsx`: `await exigirCargo("super_admin");`

com `import { exigirCargo } from "@/lib/auth/sessao";`. Em `trechos/[id]/page.tsx` a guarda vai em `PaginaTrecho`, não em `generateMetadata`. A variável `sessao` será usada na Task 7 (prop `podeEscrever`); até lá, prefixe com `void sessao;` para o lint não reclamar de variável sem uso.

- [ ] **Step 10: Build e commit**

Run: `npm run tipos && npm run lint && npm run build`
Expected: build lista `/entrar` ainda inexistente como 404 normal; `(painel)` compila; nenhum aviso de "cannot access on server" (a lista de navegação está no módulo neutro).
```bash
git add -A && git commit -m "feat(acesso): grupos de rota, navegacao por cargo e Shell com sessao" && git push origin main
```

---

### Task 6: Entrar, sair e senha provisória

**Files:**
- Create: `web/src/lib/auth/acoes.ts`
- Create: `web/src/app/(publico)/entrar/page.tsx`
- Create: `web/src/app/(publico)/entrar/_componentes/formulario-entrar.tsx`
- Create: `web/src/app/(publico)/definir-senha/page.tsx`
- Create: `web/src/app/(publico)/definir-senha/_componentes/formulario-definir-senha.tsx`

**Interfaces:**
- Consumes: `clienteSessao`, `obterSessao`, `erroDaSenha`, `podeVerRota`, `rotaInicial`, `db`.
- Produces:
  ```ts
  export async function entrar(e: { email: string; senha: string; proximo?: string | null }): Promise<Resultado<{ destino: string }>>;
  export async function sair(): Promise<never>;
  export async function definirSenha(e: { senha: string; confirmacao: string }): Promise<Resultado<{ destino: string }>>;
  ```

- [ ] **Step 1: Actions de sessão**

Crie `web/src/lib/auth/acoes.ts`:
```ts
"use server";

import { redirect } from "next/navigation";

import type { Resultado } from "../resultado";
import { db } from "../supabase";
import type { Cargo } from "../types";
import { podeVerRota, rotaInicial } from "./permissoes";
import { clienteSessao } from "./servidor";
import { obterSessao } from "./sessao";
import { erroDaSenha } from "./tokens";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** So caminho interno que o cargo pode ver; qualquer outra coisa cai na rota inicial. */
function destinoSeguro(proximo: string | null | undefined, cargo: Cargo): string {
  if (proximo && proximo.startsWith("/") && !proximo.startsWith("//") && podeVerRota(cargo, proximo)) return proximo;
  return rotaInicial(cargo);
}

export async function entrar(entrada: {
  email: string;
  senha: string;
  proximo?: string | null;
}): Promise<Resultado<{ destino: string }>> {
  const email = entrada.email.trim().toLowerCase();
  if (!EMAIL.test(email) || entrada.senha.length === 0) return { ok: false, erro: "Informe e-mail e senha." };

  const supabase = await clienteSessao();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: entrada.senha });
  // Uma mensagem so para "nao existe" e "senha errada": nao confirmar quem tem conta.
  if (error || !data.user) return { ok: false, erro: "E-mail ou senha não conferem." };

  const { data: perfil } = await db
    .from("perfis")
    .select("cargo, ativo, senha_provisoria")
    .eq("usuario_id", data.user.id)
    .maybeSingle();

  if (!perfil || !perfil.ativo) {
    await supabase.auth.signOut();
    return { ok: false, erro: "Esta conta está desativada. Fale com um administrador." };
  }

  await db.from("perfis").update({ ultimo_acesso_em: new Date().toISOString() }).eq("usuario_id", data.user.id);

  const cargo = perfil.cargo as Cargo;
  if (perfil.senha_provisoria) return { ok: true, dados: { destino: "/definir-senha" } };
  return { ok: true, dados: { destino: destinoSeguro(entrada.proximo, cargo) } };
}

export async function sair(): Promise<never> {
  const supabase = await clienteSessao();
  await supabase.auth.signOut();
  redirect("/entrar");
}

/** Troca da senha provisoria (primeiro Super Admin, ou qualquer conta marcada). */
export async function definirSenha(entrada: { senha: string; confirmacao: string }): Promise<Resultado<{ destino: string }>> {
  const sessao = await obterSessao();
  if (!sessao) return { ok: false, erro: "Sua sessão expirou. Entre de novo." };

  const erro = erroDaSenha(entrada.senha);
  if (erro) return { ok: false, erro };
  if (entrada.senha !== entrada.confirmacao) return { ok: false, erro: "As duas senhas não são iguais." };

  const supabase = await clienteSessao();
  const { error } = await supabase.auth.updateUser({ password: entrada.senha });
  if (error) return { ok: false, erro: `Não foi possível gravar a senha: ${error.message}` };

  await db.from("perfis").update({ senha_provisoria: false }).eq("usuario_id", sessao.usuarioId);
  return { ok: true, dados: { destino: rotaInicial(sessao.cargo) } };
}
```

- [ ] **Step 2: Página e formulário de entrar**

Crie `web/src/app/(publico)/entrar/page.tsx`:
```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { rotaInicial } from "@/lib/auth/permissoes";
import { obterSessao } from "@/lib/auth/sessao";

import { FormularioEntrar } from "./_componentes/formulario-entrar";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function PaginaEntrar({ searchParams }: { searchParams: Promise<{ proximo?: string }> }) {
  const sessao = await obterSessao();
  if (sessao) redirect(rotaInicial(sessao.cargo));
  const { proximo } = await searchParams;
  return <FormularioEntrar proximo={proximo ?? null} />;
}
```
Crie `web/src/app/(publico)/entrar/_componentes/formulario-entrar.tsx`:
```tsx
"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";

import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada } from "@/components/ui/campo";
import { entrar } from "@/lib/auth/acoes";

export function FormularioEntrar({ proximo }: { proximo: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    iniciar(async () => {
      const resultado = await entrar({ email, senha, proximo });
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      // `replace` + `refresh`: a pagina de destino precisa ler o cookie novo, e
      // a de login nao deve ficar no historico do botao voltar.
      router.replace(resultado.dados.destino);
      router.refresh();
    });
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-ink">Entrar</h1>
        <p className="mt-1 text-sm text-ink-3">Acesso por convite. Não existe cadastro.</p>
      </div>

      {erro ? <Aviso tom="critical" titulo={erro} /> : null}

      <Campo rotulo="E-mail" obrigatorio>
        <Entrada type="email" inputMode="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Campo>
      <Campo rotulo="Senha" obrigatorio>
        <Entrada type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
      </Campo>

      <Botao type="submit" variante="primario" className="w-full" carregando={pendente} iconeEsquerda={<LogIn />}>
        Entrar
      </Botao>

      <p className="text-center text-sm">
        <Link href="/esqueci-a-senha" className="text-ink-2 underline-offset-4 hover:underline">
          Esqueci a senha
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 3: Definir senha**

Crie `web/src/app/(publico)/definir-senha/page.tsx`:
```tsx
import type { Metadata } from "next";

import { exigirSessao } from "@/lib/auth/sessao";

import { FormularioDefinirSenha } from "./_componentes/formulario-definir-senha";

export const metadata: Metadata = { title: "Definir senha" };
export const dynamic = "force-dynamic";

export default async function PaginaDefinirSenha() {
  const sessao = await exigirSessao({ permitirSenhaProvisoria: true });
  return <FormularioDefinirSenha nome={sessao.nome} />;
}
```
Crie `web/src/app/(publico)/definir-senha/_componentes/formulario-definir-senha.tsx`:
```tsx
"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";

import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada } from "@/components/ui/campo";
import { definirSenha } from "@/lib/auth/acoes";
import { SENHA_MINIMA, erroDaSenha } from "@/lib/auth/tokens";

export function FormularioDefinirSenha({ nome }: { nome: string }) {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const local = erroDaSenha(senha) ?? (senha !== confirmacao ? "As duas senhas não são iguais." : null);
    setErro(local);
    if (local) return;
    iniciar(async () => {
      const resultado = await definirSenha({ senha, confirmacao });
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      router.replace(resultado.dados.destino);
      router.refresh();
    });
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-ink">Defina sua senha, {nome.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-ink-3">A senha provisória vale só para este primeiro acesso.</p>
      </div>
      {erro ? <Aviso tom="critical" titulo={erro} /> : null}
      <Campo rotulo="Nova senha" dica={`Pelo menos ${SENHA_MINIMA} caracteres, com letras e números.`} obrigatorio>
        <Entrada type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
      </Campo>
      <Campo rotulo="Repita a senha" obrigatorio>
        <Entrada type="password" autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
      </Campo>
      <Botao type="submit" variante="primario" className="w-full" carregando={pendente} iconeEsquerda={<KeyRound />}>
        Guardar senha
      </Botao>
    </form>
  );
}
```

- [ ] **Step 4: Verificar no navegador e commitar**

Run: `npm run tipos && npm run lint && npm run dev`. Abra `http://localhost:3000/agenda` sem sessão → redireciona para `/entrar?proximo=/agenda`. Ainda não há usuário: a tela deve mostrar "E-mail ou senha não conferem" para qualquer tentativa. Confira tema claro e escuro e largura 390 px (o cartão ocupa a largura toda sem estourar).
```bash
git add -A && git commit -m "feat(acesso): entrar, sair e senha provisoria" && git push origin main
```

---

### Task 7: Guarda em toda action e superfícies somente leitura

**Files:**
- Modify: `web/src/lib/acoes.ts` (as 12 actions)
- Create: `web/src/components/ui/aviso-somente-leitura.tsx`
- Modify: `web/src/app/(painel)/page.tsx`, `agenda/page.tsx`, `malha/page.tsx`, `trechos/[id]/page.tsx`
- Modify: `web/src/app/(painel)/agenda/_componentes/planejamento.tsx`, `painel-agendamento.tsx`, `quadro/quadro-semana.tsx`, `quadro/usar-arrasto.ts`, `quadro/trilho-fila.tsx`
- Modify: `web/src/app/(painel)/_componentes/exigem-decisao.tsx`, `web/src/app/(painel)/malha/_componentes/malha-cliente.tsx`, `painel-trecho.tsx`, `web/src/app/(painel)/trechos/_componentes/acoes-trecho.tsx`, `registrar-medicao.tsx`

**Interfaces:**
- Consumes: `permitir` (Task 4), `podeEscrever` (Task 3), `sessao` já obtida nas páginas (Task 5, Step 9).
- Produces: prop `podeEscrever: boolean` em `PlanejamentoAgenda`, `MalhaCliente`, `ExigemDecisao`, `AcoesTrecho`; prop `somenteLeitura: boolean` em `QuadroSemana`, `TrilhoFila` e na opção do hook `usarArrasto`.

- [ ] **Step 1: Guarda nas actions**

Em `web/src/lib/acoes.ts`, importe `permitir` de `./auth/sessao` e insira como **primeiras linhas do corpo** de cada action:

Escritas (`mudarStatusAgendamento`, `atribuirEquipe`, `aprovarAgendamento`, `criarRocadaManual`, `alocarAgendamento`, `desfazerAlocacao`, `devolverParaFila`, `remarcarAgendamento`, `registrarMedicao`, `enfileirarAnaliseDoTrecho`):
```ts
  const sessao = await permitir("super_admin", "admin");
  if (!sessao.ok) return sessao;
```
Leituras (`consultarAnalise`, `perguntarAoCopiloto`):
```ts
  const sessao = await permitir("super_admin", "admin", "analista");
  if (!sessao.ok) return sessao;
```
O retorno `sessao` no ramo `ok: false` é atribuível a qualquer `Resultado<T>`; o compilador aceita sem cast. Onde `sessao` não for usada depois, escreva `void sessao;` na linha seguinte.

- [ ] **Step 2: Limite do Copiloto**

Ainda em `acoes.ts`, acima de `perguntarAoCopiloto`:
```ts
/** 20 perguntas por hora por pessoa. Contador em memoria por instancia: na Vercel
 *  cada instancia conta a sua, o que basta para conter um laco e nao um ataque. */
const LIMITE_COPILOTO_POR_HORA = 20;
const perguntasRecentes = new Map<string, number[]>();

function dentroDoLimite(usuarioId: string, agora = Date.now()): boolean {
  const janela = (perguntasRecentes.get(usuarioId) ?? []).filter((t) => agora - t < 3_600_000);
  if (janela.length >= LIMITE_COPILOTO_POR_HORA) {
    perguntasRecentes.set(usuarioId, janela);
    return false;
  }
  janela.push(agora);
  perguntasRecentes.set(usuarioId, janela);
  return true;
}
```
E em `perguntarAoCopiloto`, logo depois da guarda:
```ts
  if (!dentroDoLimite(sessao.dados.usuarioId)) {
    return { ok: false, erro: `Você fez ${LIMITE_COPILOTO_POR_HORA} perguntas na última hora. Espere um pouco antes da próxima.` };
  }
```

- [ ] **Step 3: Aviso compartilhado**

Crie `web/src/components/ui/aviso-somente-leitura.tsx`:
```tsx
import { Eye } from "lucide-react";

/** Uma frase, no topo da tela, para o Analista saber por que nao ha botoes. */
export function AvisoSomenteLeitura({ podeEscrever }: { podeEscrever: boolean }) {
  if (podeEscrever) return null;
  return (
    <p className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-ink-2">
      <Eye aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
      Acesso somente leitura: você vê tudo, mas as ações ficam com Admin e Super Admin.
    </p>
  );
}
```

- [ ] **Step 4: Páginas passam a permissão**

Em cada página, a partir da `sessao` da Task 5: `const escreve = podeEscrever(sessao.cargo);` (import de `@/lib/auth/permissoes`) e renderize `<AvisoSomenteLeitura podeEscrever={escreve} />` logo abaixo do `CabecalhoPagina`.
- `(painel)/page.tsx`: `<ExigemDecisao ... podeEscrever={escreve} />`.
- `(painel)/agenda/page.tsx`: `<PlanejamentoAgenda ... podeEscrever={escreve} />`.
- `(painel)/malha/page.tsx`: `<MalhaCliente ... podeEscrever={escreve} />`.
- `(painel)/trechos/[id]/page.tsx`: `<AcoesTrecho ... podeEscrever={escreve} />` e `{escreve ? <RegistrarMedicao .../> : null}` no lugar do card de medição (o `HistoricoTrecho` ao lado passa a ocupar a linha inteira quando sozinho).

- [ ] **Step 5: Agenda**

`planejamento.tsx`: nova prop `podeEscrever: boolean`; o botão "Nova roçada" (`Botao` com `CalendarPlus`) só renderiza com `podeEscrever`; `<QuadroSemana somenteLeitura={!podeEscrever} ...>`; `<PainelAgendamento podeEscrever={podeEscrever} ...>`; `<PainelNovaRocada>` só monta com `podeEscrever`.

`quadro-semana.tsx`: prop `somenteLeitura` repassada a `usarArrasto({ ..., desativado: somenteLeitura })` e a `<TrilhoFila somenteLeitura>`; os cartões recebem `arrastavel={!somenteLeitura}` e, sem ele, não expõem alça nem `aria-grabbed`.

`usar-arrasto.ts`: opção `desativado?: boolean`; quando verdadeira, o handler de `pointerdown` retorna antes de capturar o ponteiro e os atalhos de teclado de mover cartão são ignorados. Nada mais muda no hook.

`painel-agendamento.tsx`: prop `podeEscrever`; o bloco de botões de status (Aprovar, Marcar como executada, Reabrir, Descartar), o seletor "Equipe responsável" e o formulário "Remarcar" só renderizam com `podeEscrever`; no lugar deles, quando falso, um `<AvisoSomenteLeitura podeEscrever={false} />`.

- [ ] **Step 6: Painel, malha e trecho**

`exigem-decisao.tsx`: prop `podeEscrever`; os botões que chamam `mudarStatusAgendamento` e `aprovarAgendamento` só renderizam com ela; o cartão continua mostrando a decisão pendente como leitura.

`malha-cliente.tsx` → `painel-trecho.tsx`: prop `podeEscrever` repassada; o par Aprovar/Descartar da gaveta só renderiza com ela.

`acoes-trecho.tsx`: prop `podeEscrever`; "Reanalisar trecho", "Aprovar roçada" e "Descartar sugestão" só renderizam com ela. Sem nenhum botão, o componente devolve `null` e o cabeçalho fecha sem a área de ações.

- [ ] **Step 7: Testar a mão e commitar**

Não há usuário ainda; a verificação de tela vem na Task 13. Aqui, tipos e lint:
```bash
npm run tipos && npm run lint && npm run testes && git add -A && git commit -m "feat(acesso): guarda de cargo em toda action e superficies somente leitura" && git push origin main
```

---

### Task 8: E-mail pelo Resend com templates no repositório

**Files:**
- Create: `web/src/lib/email/enviar.ts`
- Create: `web/src/emails/base.tsx`
- Create: `web/src/emails/convite.tsx`
- Create: `web/src/emails/redefinir-senha.tsx`
- Create: `web/src/lib/auth/links.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function enviarEmail(e: { para: string; assunto: string; react: ReactElement }): Promise<Resultado<{ id: string | null }>>;
  export function urlDoApp(caminho: string): string;   // APP_URL + caminho
  export function EmailConvite(p: { nomeConvidador: string; cargoRotulo: string; equipeNome: string | null; link: string; validoAte: string }): ReactElement;
  export function EmailRedefinirSenha(p: { link: string; validoAte: string }): ReactElement;
  ```

- [ ] **Step 1: Links**

Crie `web/src/lib/auth/links.ts`:
```ts
/** Base dos links que saem por e-mail. Sem barra final; `APP_URL` vem do ambiente. */
export function urlDoApp(caminho: string): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${caminho.startsWith("/") ? caminho : `/${caminho}`}`;
}
```

- [ ] **Step 2: Envio**

Crie `web/src/lib/email/enviar.ts`:
```ts
import "server-only";

import type { ReactElement } from "react";
import { Resend } from "resend";

import type { Resultado } from "../resultado";

/**
 * Unica porta de saida de e-mail do sistema. O Supabase NAO envia e-mail: convite
 * e redefinicao sao fluxos nossos, e o template mora em `src/emails/`.
 *
 * Modo de teste do Resend (sem dominio verificado): so entrega para o e-mail da
 * propria conta; qualquer outro destinatario volta erro, e quem chamou mostra o
 * link copiavel na tela. Por isso o retorno e `Resultado`, nunca `throw`.
 */
export async function enviarEmail(e: {
  para: string;
  assunto: string;
  react: ReactElement;
}): Promise<Resultado<{ id: string | null }>> {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) {
    return {
      ok: false,
      erro: "O envio de e-mail precisa da variável RESEND_API_KEY. Configure-a no ambiente (web/.env.local ou na Vercel).",
    };
  }

  const resend = new Resend(chave);
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_REMETENTE ?? "HighwAI <onboarding@resend.dev>",
    to: e.para,
    subject: e.assunto,
    react: e.react,
  });

  if (error) return { ok: false, erro: `O Resend recusou o envio: ${error.message}` };
  return { ok: true, dados: { id: data?.id ?? null } };
}
```

- [ ] **Step 3: Base visual**

Crie `web/src/emails/base.tsx`:
```tsx
import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

/**
 * UNICA excecao a regra "nenhum hex fora de globals.css": cliente de e-mail nao
 * le variavel CSS. Os valores sao copias literais dos tokens do tema claro:
 * --bg, --surface-2, --ink, --ink-3, --accent, --accent-ink, --accent-line, --border.
 */
export const CORES = {
  fundo: "#f7f7f4",
  cartao: "#ffffff",
  tinta: "#0c100e",
  tinta3: "#676f6a",
  acento: "#4d7c0f",
  acentoTexto: "#ffffff",
  limao: "#a3e635",
  borda: "#e4e4dc",
} as const;

export const FONTE = "Geist, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function BaseEmail({ previa, children }: { previa: string; children: ReactNode }) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{previa}</Preview>
      <Body style={{ margin: 0, backgroundColor: CORES.fundo, fontFamily: FONTE, color: CORES.tinta }}>
        <Container style={{ maxWidth: 520, margin: "0 auto", padding: "32px 16px" }}>
          {/* O filete de limao e a unica cor de marca: no e-mail ele faz o papel do simbolo. */}
          <Section style={{ height: 3, backgroundColor: CORES.limao, borderRadius: "10px 10px 0 0" }} />
          <Section style={{ backgroundColor: CORES.cartao, border: `1px solid ${CORES.borda}`, borderRadius: "0 0 10px 10px", padding: 28 }}>
            <Text style={{ margin: "0 0 16px", fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", color: CORES.tinta3 }}>
              HighwAI · Regulação de solo para a Motiva
            </Text>
            {children}
          </Section>
          <Hr style={{ borderColor: CORES.borda, margin: "20px 0 8px" }} />
          <Text style={{ fontSize: 12, lineHeight: "18px", color: CORES.tinta3, margin: 0 }}>
            Você recebeu este e-mail porque alguém da operação da Motiva cadastrou este endereço no HighwAI.
            Se não esperava por ele, pode ignorar: nada acontece sem o seu clique.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const estiloTitulo = { margin: "0 0 12px", fontSize: 20, lineHeight: "26px", fontWeight: 600, color: CORES.tinta } as const;
export const estiloTexto = { margin: "0 0 12px", fontSize: 15, lineHeight: "23px", color: CORES.tinta } as const;
export const estiloBotao = {
  display: "inline-block",
  backgroundColor: CORES.acento,
  color: CORES.acentoTexto,
  fontSize: 15,
  fontWeight: 600,
  padding: "12px 20px",
  borderRadius: 8,
  textDecoration: "none",
} as const;
export const estiloLinkCru = { margin: "16px 0 0", fontSize: 12, lineHeight: "18px", color: CORES.tinta3, wordBreak: "break-all" } as const;
```

- [ ] **Step 4: Convite**

Crie `web/src/emails/convite.tsx`:
```tsx
import { Button, Heading, Text } from "@react-email/components";

import { BaseEmail, estiloBotao, estiloLinkCru, estiloTexto, estiloTitulo } from "./base";

export function EmailConvite({
  nomeConvidador,
  cargoRotulo,
  equipeNome,
  link,
  validoAte,
}: {
  nomeConvidador: string;
  cargoRotulo: string;
  equipeNome: string | null;
  link: string;
  /** Ja formatado por `fmt.dataMedia`, ex.: "17 de set. de 2026". */
  validoAte: string;
}) {
  return (
    <BaseEmail previa={`${nomeConvidador} convidou você para o HighwAI como ${cargoRotulo}.`}>
      <Heading as="h1" style={estiloTitulo}>Você foi convidado para o HighwAI</Heading>
      <Text style={estiloTexto}>
        {nomeConvidador} cadastrou você como <strong>{cargoRotulo}</strong>
        {equipeNome ? <> e líder da <strong>{equipeNome}</strong></> : null}. O HighwAI é o painel que
        planeja e acompanha a roçada da faixa de domínio das rodovias da Motiva.
      </Text>
      <Text style={estiloTexto}>Para entrar, escolha um nome e uma senha. Leva um minuto.</Text>
      <Button href={link} style={estiloBotao}>Aceitar convite</Button>
      <Text style={estiloTexto}>O convite vale até {validoAte}. Depois disso, peça um novo a quem convidou você.</Text>
      <Text style={estiloLinkCru}>Se o botão não abrir, copie este endereço: {link}</Text>
    </BaseEmail>
  );
}
```

- [ ] **Step 5: Redefinição**

Crie `web/src/emails/redefinir-senha.tsx`:
```tsx
import { Button, Heading, Text } from "@react-email/components";

import { BaseEmail, estiloBotao, estiloLinkCru, estiloTexto, estiloTitulo } from "./base";

export function EmailRedefinirSenha({ link, validoAte }: { link: string; validoAte: string }) {
  return (
    <BaseEmail previa="Link para definir uma senha nova no HighwAI.">
      <Heading as="h1" style={estiloTitulo}>Redefinir sua senha</Heading>
      <Text style={estiloTexto}>Alguém pediu uma senha nova para esta conta do HighwAI. Se foi você, siga pelo botão.</Text>
      <Button href={link} style={estiloBotao}>Definir senha nova</Button>
      <Text style={estiloTexto}>O link vale até {validoAte} e funciona uma vez só. Se não foi você, ignore: sua senha continua a mesma.</Text>
      <Text style={estiloLinkCru}>Se o botão não abrir, copie este endereço: {link}</Text>
    </BaseEmail>
  );
}
```

- [ ] **Step 6: Tipos e commit**

```bash
npm run tipos && npm run lint && git add -A && git commit -m "feat(email): envio pelo Resend e templates de convite e redefinicao" && git push origin main
```

---

### Task 9: Convites — criar, reenviar, revogar e aceitar

**Files:**
- Create: `web/src/lib/usuarios/convites.ts`
- Create: `web/src/lib/usuarios/queries.ts`
- Create: `web/src/lib/usuarios/acoes.ts`
- Modify: `web/src/lib/auth/acoes.ts` (acrescenta `aceitarConvite`)
- Create: `web/src/app/(publico)/convite/[token]/page.tsx`
- Create: `web/src/app/(publico)/convite/[token]/_componentes/formulario-aceite.tsx`

**Interfaces:**
- Consumes: `gerarToken`, `hashToken`, `prazo`, `expirado`, `erroDaSenha`, `enviarEmail`, `EmailConvite`, `urlDoApp`, `permitir`, `podeConvidar`, `CARGO`, `fmt`.
- Produces:
  ```ts
  export type SituacaoConvite = "valido" | "expirado" | "revogado" | "aceito" | "inexistente";
  export async function buscarConvitePorToken(token: string): Promise<{ situacao: SituacaoConvite; convite: Convite | null; equipeNome: string | null; convidadorNome: string | null }>;
  export const listarPerfis: () => Promise<Perfil[]>;
  export const listarConvitesPendentes: () => Promise<(Convite & { convidador_nome: string; equipe_nome: string | null })[]>;
  export const contarSuperAdminsAtivos: () => Promise<number>;
  export const equipesParaConvite: () => Promise<{ id: number; nome: string; lider_nome: string | null }[]>;
  export async function convidarUsuario(e: { email: string; cargo: Cargo; equipeId: number | null; substituirLider: boolean }): Promise<Resultado<{ id: string; link: string; emailEnviado: boolean; aviso: string | null }>>;
  export async function reenviarConvite(id: string): Promise<Resultado<{ link: string; emailEnviado: boolean; aviso: string | null }>>;
  export async function revogarConvite(id: string): Promise<Resultado>;
  export async function aceitarConvite(e: { token: string; nome: string; senha: string; confirmacao: string }): Promise<Resultado<{ destino: string }>>;
  ```

- [ ] **Step 1: Busca por token (server-only, sem "use server")**

Crie `web/src/lib/usuarios/convites.ts`:
```ts
import "server-only";

import { hashToken, expirado } from "../auth/tokens";
import { db } from "../supabase";
import type { Convite } from "../types";

export type SituacaoConvite = "valido" | "expirado" | "revogado" | "aceito" | "inexistente";

/** O banco so conhece o hash: o token inteiro existe apenas no link. */
export async function buscarConvitePorToken(token: string): Promise<{
  situacao: SituacaoConvite;
  convite: Convite | null;
  equipeNome: string | null;
  convidadorNome: string | null;
}> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { situacao: "inexistente", convite: null, equipeNome: null, convidadorNome: null };

  const { data } = await db
    .from("convites")
    .select("*, equipe:equipes ( nome ), convidador:perfis!convites_criado_por_fkey ( nome )")
    .eq("token_hash", await hashToken(token))
    .maybeSingle();

  if (!data) return { situacao: "inexistente", convite: null, equipeNome: null, convidadorNome: null };

  const linha = data as unknown as Convite & { equipe: { nome: string } | null; convidador: { nome: string } | null };
  const situacao: SituacaoConvite = linha.aceito_em
    ? "aceito"
    : linha.revogado_em
      ? "revogado"
      : expirado(linha.expira_em)
        ? "expirado"
        : "valido";

  return { situacao, convite: linha, equipeNome: linha.equipe?.nome ?? null, convidadorNome: linha.convidador?.nome ?? null };
}
```

- [ ] **Step 2: Consultas da tela de usuários**

Crie `web/src/lib/usuarios/queries.ts`:
```ts
import "server-only";

import { cache } from "react";

import { db } from "../supabase";
import type { Convite, Perfil } from "../types";

function erro(contexto: string, e: { message: string } | null): never {
  throw new Error(`Falha ao ler ${contexto}: ${e?.message ?? "erro desconhecido"}`);
}

export const listarPerfis = cache(async (): Promise<(Perfil & { equipe_liderada: { id: number; nome: string } | null })[]> => {
  const { data, error } = await db
    .from("perfis")
    .select("*, equipe_liderada:equipes!equipes_lider_id_fkey ( id, nome )")
    .order("ativo", { ascending: false })
    .order("nome");
  if (error) erro("os usuários", error);
  return (data ?? []).map((p) => {
    const eq = p.equipe_liderada as unknown as { id: number; nome: string }[] | { id: number; nome: string } | null;
    return { ...(p as unknown as Perfil), equipe_liderada: Array.isArray(eq) ? (eq[0] ?? null) : eq };
  });
});

export const listarConvitesPendentes = cache(
  async (): Promise<(Convite & { convidador_nome: string; equipe_nome: string | null })[]> => {
    const { data, error } = await db
      .from("convites")
      .select("*, convidador:perfis!convites_criado_por_fkey ( nome ), equipe:equipes ( nome )")
      .is("aceito_em", null)
      .is("revogado_em", null)
      .order("criado_em", { ascending: false });
    if (error) erro("os convites", error);
    return (data ?? []).map((c) => {
      const linha = c as unknown as Convite & { convidador: { nome: string } | null; equipe: { nome: string } | null };
      return { ...linha, convidador_nome: linha.convidador?.nome ?? "—", equipe_nome: linha.equipe?.nome ?? null };
    });
  },
);

export const contarSuperAdminsAtivos = cache(async (): Promise<number> => {
  const { count, error } = await db
    .from("perfis")
    .select("usuario_id", { count: "exact", head: true })
    .eq("cargo", "super_admin")
    .eq("ativo", true);
  if (error) erro("os super admins", error);
  return count ?? 0;
});

export const equipesParaConvite = cache(async (): Promise<{ id: number; nome: string; lider_nome: string | null }[]> => {
  const { data, error } = await db
    .from("equipes")
    .select("id, nome, lider:perfis!equipes_lider_id_fkey ( nome )")
    .eq("ativo", true)
    .order("nome");
  if (error) erro("as equipes", error);
  return (data ?? []).map((e) => {
    const lider = e.lider as unknown as { nome: string } | { nome: string }[] | null;
    const nome = Array.isArray(lider) ? lider[0]?.nome : lider?.nome;
    return { id: e.id as number, nome: e.nome as string, lider_nome: nome ?? null };
  });
});
```
Os nomes de FK (`convites_criado_por_fkey`, `equipes_lider_id_fkey`) são os que o Postgres gera para as colunas do DDL da Task 2; confirme em `list_tables(verbose: true)` do MCP se o PostgREST recusar o embed.

- [ ] **Step 3: Actions de convite**

Crie `web/src/lib/usuarios/acoes.ts`:
```ts
"use server";

import { createElement } from "react";
import { revalidatePath } from "next/cache";

import { EmailConvite } from "@/emails/convite";

import { urlDoApp } from "../auth/links";
import { podeConvidar } from "../auth/permissoes";
import { permitir } from "../auth/sessao";
import { gerarToken, hashToken, prazo } from "../auth/tokens";
import { CARGO } from "../dominio";
import { enviarEmail } from "../email/enviar";
import { fmt } from "../format";
import type { Resultado } from "../resultado";
import { db } from "../supabase";
import { CARGOS, type Cargo } from "../types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALIDADE_HORAS = Number(process.env.CONVITE_VALIDADE_DIAS ?? "7") * 24;

function revalidarUsuarios() {
  revalidatePath("/usuarios");
}

/** Gera token novo, grava o hash e manda o e-mail. Usado por criar e reenviar. */
async function emitirConvite(conviteId: string, destinatario: { email: string; cargo: Cargo; equipeNome: string | null; convidadorNome: string }) {
  const token = gerarToken();
  const expiraEm = prazo(VALIDADE_HORAS);
  const { error } = await db
    .from("convites")
    .update({ token_hash: await hashToken(token), expira_em: expiraEm.toISOString() })
    .eq("id", conviteId);
  if (error) return { ok: false as const, erro: `Não foi possível gravar o convite: ${error.message}` };

  const link = urlDoApp(`/convite/${token}`);
  const envio = await enviarEmail({
    para: destinatario.email,
    assunto: "Você foi convidado para o HighwAI",
    react: createElement(EmailConvite, {
      nomeConvidador: destinatario.convidadorNome,
      cargoRotulo: CARGO[destinatario.cargo].rotulo,
      equipeNome: destinatario.equipeNome,
      link,
      validoAte: fmt.dataMedia(expiraEm),
    }),
  });
  if (envio.ok) await db.from("convites").update({ enviado_em: new Date().toISOString() }).eq("id", conviteId);

  return { ok: true as const, link, emailEnviado: envio.ok, aviso: envio.ok ? null : envio.erro };
}

export async function convidarUsuario(entrada: {
  email: string;
  cargo: Cargo;
  equipeId: number | null;
  substituirLider: boolean;
}): Promise<Resultado<{ id: string; link: string; emailEnviado: boolean; aviso: string | null }>> {
  const sessao = await permitir("super_admin", "admin");
  if (!sessao.ok) return sessao;

  const email = entrada.email.trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, erro: "Informe um e-mail válido." };
  if (!CARGOS.includes(entrada.cargo)) return { ok: false, erro: "Cargo inválido." };
  if (!podeConvidar(sessao.dados.cargo, entrada.cargo)) return { ok: false, erro: "Só um Super Admin convida outro Super Admin." };

  let equipeNome: string | null = null;
  if (entrada.cargo === "rocador") {
    if (entrada.equipeId == null) return { ok: false, erro: "Escolha a equipe que esta pessoa vai liderar." };
    const { data: equipe } = await db
      .from("equipes")
      .select("nome, ativo, lider:perfis!equipes_lider_id_fkey ( nome )")
      .eq("id", entrada.equipeId)
      .maybeSingle();
    if (!equipe || !equipe.ativo) return { ok: false, erro: "Equipe não encontrada ou desativada." };
    const lider = equipe.lider as unknown as { nome: string } | { nome: string }[] | null;
    const liderNome = Array.isArray(lider) ? lider[0]?.nome : lider?.nome;
    if (liderNome && !entrada.substituirLider) {
      return { ok: false, erro: `A ${equipe.nome} já tem líder (${liderNome}). Marque "substituir o líder atual" para continuar.` };
    }
    equipeNome = equipe.nome as string;
  }

  const { data: existente } = await db.from("perfis").select("usuario_id").eq("email", email).maybeSingle();
  if (existente) return { ok: false, erro: "Já existe uma conta com este e-mail." };

  const { data: linha, error } = await db
    .from("convites")
    .insert({
      email,
      cargo: entrada.cargo,
      equipe_id: entrada.cargo === "rocador" ? entrada.equipeId : null,
      token_hash: `pendente-${crypto.randomUUID()}`, // substituido por emitirConvite logo abaixo
      expira_em: new Date().toISOString(),
      criado_por: sessao.dados.usuarioId,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // 23505: ux_convite_pendente_por_email.
    if (error.code === "23505") return { ok: false, erro: "Já existe um convite pendente para este e-mail. Reenvie ou revogue aquele." };
    return { ok: false, erro: `Não foi possível criar o convite: ${error.message}` };
  }
  if (!linha) return { ok: false, erro: "O convite não foi criado. Tente de novo." };

  const emissao = await emitirConvite(linha.id as string, { email, cargo: entrada.cargo, equipeNome, convidadorNome: sessao.dados.nome });
  if (!emissao.ok) return emissao;

  revalidarUsuarios();
  return { ok: true, dados: { id: linha.id as string, link: emissao.link, emailEnviado: emissao.emailEnviado, aviso: emissao.aviso } };
}

export async function reenviarConvite(id: string): Promise<Resultado<{ link: string; emailEnviado: boolean; aviso: string | null }>> {
  const sessao = await permitir("super_admin", "admin");
  if (!sessao.ok) return sessao;

  const { data: convite } = await db
    .from("convites")
    .select("id, email, cargo, aceito_em, revogado_em, equipe:equipes ( nome )")
    .eq("id", id)
    .maybeSingle();
  if (!convite || convite.aceito_em || convite.revogado_em) return { ok: false, erro: "Este convite não está mais pendente." };

  const equipe = convite.equipe as unknown as { nome: string } | { nome: string }[] | null;
  const emissao = await emitirConvite(convite.id as string, {
    email: convite.email as string,
    cargo: convite.cargo as Cargo,
    equipeNome: Array.isArray(equipe) ? (equipe[0]?.nome ?? null) : (equipe?.nome ?? null),
    convidadorNome: sessao.dados.nome,
  });
  if (!emissao.ok) return emissao;

  revalidarUsuarios();
  return { ok: true, dados: { link: emissao.link, emailEnviado: emissao.emailEnviado, aviso: emissao.aviso } };
}

export async function revogarConvite(id: string): Promise<Resultado> {
  const sessao = await permitir("super_admin", "admin");
  if (!sessao.ok) return sessao;

  const { error } = await db
    .from("convites")
    .update({ revogado_em: new Date().toISOString() })
    .eq("id", id)
    .is("aceito_em", null);
  if (error) return { ok: false, erro: `Não foi possível revogar: ${error.message}` };

  revalidarUsuarios();
  return { ok: true, dados: undefined };
}
```

- [ ] **Step 4: Aceite**

Acrescente a `web/src/lib/auth/acoes.ts` (imports: `buscarConvitePorToken` de `../usuarios/convites`):
```ts
export async function aceitarConvite(entrada: {
  token: string;
  nome: string;
  senha: string;
  confirmacao: string;
}): Promise<Resultado<{ destino: string }>> {
  const achado = await buscarConvitePorToken(entrada.token);
  if (achado.situacao !== "valido" || !achado.convite) {
    const motivo: Record<string, string> = {
      expirado: "Este convite expirou. Peça um novo a quem convidou você.",
      revogado: "Este convite foi cancelado.",
      aceito: "Este convite já foi usado. Entre com sua senha.",
      inexistente: "Convite não encontrado. Confira o link do e-mail.",
    };
    return { ok: false, erro: motivo[achado.situacao] };
  }

  const nome = entrada.nome.trim().replace(/\s+/g, " ");
  if (nome.length < 2 || nome.length > 120) return { ok: false, erro: "Escreva seu nome como a equipe conhece você." };
  const erroSenha = erroDaSenha(entrada.senha);
  if (erroSenha) return { ok: false, erro: erroSenha };
  if (entrada.senha !== entrada.confirmacao) return { ok: false, erro: "As duas senhas não são iguais." };

  const convite = achado.convite;
  const { data: criado, error } = await db.auth.admin.createUser({
    email: convite.email,
    password: entrada.senha,
    email_confirm: true,
    app_metadata: { cargo: convite.cargo },
    user_metadata: { nome },
  });
  if (error || !criado.user) {
    if (error?.message.toLowerCase().includes("already")) return { ok: false, erro: "Já existe uma conta com este e-mail. Entre com sua senha." };
    return { ok: false, erro: `Não foi possível criar a conta: ${error?.message ?? "erro desconhecido"}` };
  }

  const { error: erroPerfil } = await db.from("perfis").insert({
    usuario_id: criado.user.id,
    nome,
    email: convite.email,
    cargo: convite.cargo,
    convidado_por: convite.criado_por,
  });
  if (erroPerfil) return { ok: false, erro: `A conta foi criada mas o perfil não: ${erroPerfil.message}. Fale com um administrador.` };

  if (convite.cargo === "rocador" && convite.equipe_id != null) {
    // Substitui o lider anterior, se houver: quem convidou ja confirmou isso.
    await db.from("equipes").update({ lider_id: criado.user.id }).eq("id", convite.equipe_id);
  }

  await db
    .from("convites")
    .update({ aceito_em: new Date().toISOString(), usuario_id: criado.user.id })
    .eq("id", convite.id);

  const supabase = await clienteSessao();
  await supabase.auth.signInWithPassword({ email: convite.email, password: entrada.senha });
  return { ok: true, dados: { destino: rotaInicial(convite.cargo) } };
}
```

- [ ] **Step 5: Página do convite**

Crie `web/src/app/(publico)/convite/[token]/page.tsx`:
```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { MailX } from "lucide-react";

import { classesBotao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/vazio";
import { CARGO } from "@/lib/dominio";
import { buscarConvitePorToken } from "@/lib/usuarios/convites";

import { FormularioAceite } from "./_componentes/formulario-aceite";

export const metadata: Metadata = { title: "Convite" };
export const dynamic = "force-dynamic";

const TEXTO: Record<string, { titulo: string; descricao: string }> = {
  expirado: { titulo: "Este convite expirou", descricao: "Convites valem 7 dias. Peça um novo a quem convidou você." },
  revogado: { titulo: "Este convite foi cancelado", descricao: "Quem convidou você desfez o convite. Se for engano, peça outro." },
  aceito: { titulo: "Este convite já foi usado", descricao: "A conta já existe. Entre com sua senha." },
  inexistente: { titulo: "Convite não encontrado", descricao: "Confira se o link do e-mail veio inteiro." },
};

export default async function PaginaConvite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const achado = await buscarConvitePorToken(token);

  if (achado.situacao !== "valido" || !achado.convite) {
    const texto = TEXTO[achado.situacao];
    return (
      <EstadoVazio
        icone={<MailX />}
        titulo={texto.titulo}
        descricao={texto.descricao}
        acao={
          <Link href="/entrar" className={classesBotao("secundario", "sm")}>
            Ir para a tela de entrar
          </Link>
        }
      />
    );
  }

  return (
    <FormularioAceite
      token={token}
      email={achado.convite.email}
      cargoRotulo={CARGO[achado.convite.cargo].rotulo}
      equipeNome={achado.equipeNome}
      convidadorNome={achado.convidadorNome}
    />
  );
}
```
Crie `web/src/app/(publico)/convite/[token]/_componentes/formulario-aceite.tsx`: mesmo esqueleto de `FormularioDefinirSenha` (Task 6), com título "Crie seu acesso", um parágrafo "{convidadorNome} convidou você como {cargoRotulo}{equipeNome ? `, líder da ${equipeNome}` : ""}.", o e-mail em `Entrada` `readOnly`, um `Campo` "Seu nome" (`autoComplete="name"`), os dois campos de senha, e o botão "Criar acesso e entrar" chamando `aceitarConvite({ token, nome, senha, confirmacao })` e navegando para `destino` com `router.replace` + `router.refresh()`.

- [ ] **Step 6: Tipos e commit**

```bash
npm run tipos && npm run lint && git add -A && git commit -m "feat(usuarios): convites por token com e-mail e aceite" && git push origin main
```

---

### Task 10: Esqueci a senha e redefinição por link

**Files:**
- Modify: `web/src/lib/auth/acoes.ts` (acrescenta `solicitarRedefinicaoSenha`, `redefinirSenha`)
- Create: `web/src/app/(publico)/esqueci-a-senha/page.tsx` + `_componentes/formulario-esqueci.tsx`
- Create: `web/src/app/(publico)/redefinir-senha/[token]/page.tsx` + `_componentes/formulario-redefinir.tsx`

**Interfaces:**
- Produces:
  ```ts
  export async function solicitarRedefinicaoSenha(e: { email: string }): Promise<Resultado<{ aviso: string | null }>>;
  export async function redefinirSenha(e: { token: string; senha: string; confirmacao: string }): Promise<Resultado<{ destino: string }>>;
  ```

- [ ] **Step 1: Actions**

Acrescente a `web/src/lib/auth/acoes.ts` (imports: `createElement` de `react`, `EmailRedefinirSenha` de `@/emails/redefinir-senha`, `enviarEmail`, `urlDoApp`, `gerarToken`, `hashToken`, `prazo`, `expirado`, `fmt`):
```ts
const REDEFINICAO_HORAS = 1;

/** Sempre responde igual: nao revela se o e-mail tem conta. */
export async function solicitarRedefinicaoSenha(entrada: { email: string }): Promise<Resultado<{ aviso: string | null }>> {
  const email = entrada.email.trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, erro: "Informe um e-mail válido." };

  const { data: perfil } = await db.from("perfis").select("usuario_id, ativo").eq("email", email).maybeSingle();
  if (!perfil || !perfil.ativo) return { ok: true, dados: { aviso: null } };

  // Um pedido a cada 5 minutos por conta: o resto e ruido de repeticao.
  const { data: recente } = await db
    .from("redefinicoes_senha")
    .select("criado_em")
    .eq("usuario_id", perfil.usuario_id)
    .gte("criado_em", new Date(Date.now() - 5 * 60_000).toISOString())
    .limit(1);
  if (recente && recente.length > 0) return { ok: true, dados: { aviso: null } };

  const token = gerarToken();
  const expiraEm = prazo(REDEFINICAO_HORAS);
  await db.from("redefinicoes_senha").insert({
    usuario_id: perfil.usuario_id,
    token_hash: await hashToken(token),
    expira_em: expiraEm.toISOString(),
  });

  const envio = await enviarEmail({
    para: email,
    assunto: "Redefinir sua senha do HighwAI",
    react: createElement(EmailRedefinirSenha, { link: urlDoApp(`/redefinir-senha/${token}`), validoAte: fmt.horaMin(expiraEm) }),
  });
  // Em modo de teste do Resend o envio falha para quase todo mundo; a tela diz isso
  // sem dizer se a conta existe: o aviso e sobre o correio, nao sobre a conta.
  return { ok: true, dados: { aviso: envio.ok ? null : "O serviço de e-mail está em modo de teste; se você não receber, peça a um administrador uma senha provisória." } };
}

export async function redefinirSenha(entrada: { token: string; senha: string; confirmacao: string }): Promise<Resultado<{ destino: string }>> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(entrada.token)) return { ok: false, erro: "Link inválido. Peça um novo em 'Esqueci a senha'." };
  const erro = erroDaSenha(entrada.senha);
  if (erro) return { ok: false, erro };
  if (entrada.senha !== entrada.confirmacao) return { ok: false, erro: "As duas senhas não são iguais." };

  const { data: pedido } = await db
    .from("redefinicoes_senha")
    .select("id, usuario_id, expira_em, usada_em")
    .eq("token_hash", await hashToken(entrada.token))
    .maybeSingle();
  if (!pedido || pedido.usada_em || expirado(pedido.expira_em)) {
    return { ok: false, erro: "Este link não vale mais. Peça um novo em 'Esqueci a senha'." };
  }

  const { data: perfil } = await db.from("perfis").select("email, cargo, ativo").eq("usuario_id", pedido.usuario_id).maybeSingle();
  if (!perfil || !perfil.ativo) return { ok: false, erro: "Esta conta está desativada." };

  const { error } = await db.auth.admin.updateUserById(pedido.usuario_id, { password: entrada.senha });
  if (error) return { ok: false, erro: `Não foi possível gravar a senha: ${error.message}` };

  await db.from("redefinicoes_senha").update({ usada_em: new Date().toISOString() }).eq("id", pedido.id);
  await db.from("perfis").update({ senha_provisoria: false }).eq("usuario_id", pedido.usuario_id);

  const supabase = await clienteSessao();
  await supabase.auth.signInWithPassword({ email: perfil.email as string, password: entrada.senha });
  return { ok: true, dados: { destino: rotaInicial(perfil.cargo as Cargo) } };
}
```

- [ ] **Step 2: Telas**

`esqueci-a-senha/page.tsx`: Server Component que só renderiza `<FormularioEsqueci />`. O formulário (cliente) tem um `Campo` "E-mail", botão "Enviar link", e depois do envio troca o formulário por um `Aviso tom="good"` com "Se este e-mail tiver conta, mandamos um link que vale 1 hora" mais o `aviso` devolvido, quando houver, em `Aviso tom="info"`. Link "Voltar para entrar".

`redefinir-senha/[token]/page.tsx`: recebe `params.token`; não valida no servidor (a action valida); renderiza `<FormularioRedefinir token={token} />`, que é o `FormularioDefinirSenha` da Task 6 com título "Senha nova" e chamando `redefinirSenha({ token, senha, confirmacao })`.

- [ ] **Step 3: Commit**

```bash
npm run tipos && npm run lint && git add -A && git commit -m "feat(acesso): esqueci a senha e redefinicao por link" && git push origin main
```

---

### Task 11: Tela de Usuários

**Files:**
- Modify: `web/src/lib/usuarios/acoes.ts` (acrescenta `alterarCargo`, `alterarEquipeLiderada`, `desativarUsuario`, `reativarUsuario`)
- Create: `web/src/app/(painel)/usuarios/page.tsx`
- Create: `web/src/app/(painel)/usuarios/loading.tsx`, `error.tsx` (copie os de `agenda/`)
- Create: `web/src/app/(painel)/usuarios/_componentes/gestao-usuarios.tsx`
- Create: `web/src/app/(painel)/usuarios/_componentes/tabela-usuarios.tsx`
- Create: `web/src/app/(painel)/usuarios/_componentes/convites-pendentes.tsx`
- Create: `web/src/app/(painel)/usuarios/_componentes/painel-convidar.tsx`
- Create: `web/src/app/(painel)/usuarios/_componentes/painel-usuario.tsx`

**Interfaces:**
- Consumes: queries e actions da Task 9; `motivoParaNaoAlterar`, `podeConvidar`; `PainelLateral`, `Tabela*`, `Chip`, `Campo`, `Selecao`, `Entrada`, `Botao`, `Aviso`, `EstadoVazio`, `useNotificacao`; `fmt`.
- Produces:
  ```ts
  export async function alterarCargo(usuarioId: string, cargo: Cargo): Promise<Resultado>;
  export async function alterarEquipeLiderada(usuarioId: string, equipeId: number | null, substituirLider: boolean): Promise<Resultado>;
  export async function desativarUsuario(usuarioId: string): Promise<Resultado>;
  export async function reativarUsuario(usuarioId: string): Promise<Resultado>;
  ```

- [ ] **Step 1: Actions de alteração**

Acrescente a `web/src/lib/usuarios/acoes.ts` (import `motivoParaNaoAlterar` de `../auth/permissoes` e `contarSuperAdminsAtivos` de `./queries`):
```ts
async function alvoDe(usuarioId: string) {
  const { data } = await db.from("perfis").select("usuario_id, cargo, ativo").eq("usuario_id", usuarioId).maybeSingle();
  return data as { usuario_id: string; cargo: Cargo; ativo: boolean } | null;
}

export async function alterarCargo(usuarioId: string, cargo: Cargo): Promise<Resultado> {
  const sessao = await permitir("super_admin", "admin");
  if (!sessao.ok) return sessao;
  if (!CARGOS.includes(cargo)) return { ok: false, erro: "Cargo inválido." };

  const alvo = await alvoDe(usuarioId);
  if (!alvo) return { ok: false, erro: "Usuário não encontrado. Recarregue a página." };

  const motivo = motivoParaNaoAlterar({
    autorId: sessao.dados.usuarioId, autorCargo: sessao.dados.cargo,
    alvoId: alvo.usuario_id, alvoCargo: alvo.cargo, alvoAtivo: alvo.ativo,
    novoCargo: cargo, desativar: false, superAdminsAtivos: await contarSuperAdminsAtivos(),
  });
  if (motivo) return { ok: false, erro: motivo };

  // Quem deixa de ser Rocador deixa a equipe sem lider: um Admin nao lidera turma.
  if (alvo.cargo === "rocador" && cargo !== "rocador") {
    await db.from("equipes").update({ lider_id: null }).eq("lider_id", usuarioId);
  }

  const { error } = await db.from("perfis").update({ cargo }).eq("usuario_id", usuarioId);
  if (error) return { ok: false, erro: `Não foi possível alterar o cargo: ${error.message}` };
  const { error: erroAuth } = await db.auth.admin.updateUserById(usuarioId, { app_metadata: { cargo } });
  if (erroAuth) return { ok: false, erro: `O perfil mudou, mas o token não: ${erroAuth.message}. Tente de novo.` };

  revalidarUsuarios();
  return { ok: true, dados: undefined };
}

export async function alterarEquipeLiderada(usuarioId: string, equipeId: number | null, substituirLider: boolean): Promise<Resultado> {
  const sessao = await permitir("super_admin", "admin");
  if (!sessao.ok) return sessao;

  const alvo = await alvoDe(usuarioId);
  if (!alvo) return { ok: false, erro: "Usuário não encontrado. Recarregue a página." };
  if (alvo.cargo !== "rocador") return { ok: false, erro: "Só um Roçador lidera equipe." };

  if (equipeId != null) {
    const { data: equipe } = await db.from("equipes").select("nome, ativo, lider_id").eq("id", equipeId).maybeSingle();
    if (!equipe || !equipe.ativo) return { ok: false, erro: "Equipe não encontrada ou desativada." };
    if (equipe.lider_id && equipe.lider_id !== usuarioId && !substituirLider) {
      return { ok: false, erro: `A ${equipe.nome} já tem líder. Marque "substituir o líder atual" para continuar.` };
    }
  }

  // Solta a equipe anterior e assume a nova. Duas escritas simples: o UNIQUE de
  // `lider_id` garante que a pessoa nunca fica com duas.
  await db.from("equipes").update({ lider_id: null }).eq("lider_id", usuarioId);
  if (equipeId != null) {
    const { error } = await db.from("equipes").update({ lider_id: usuarioId }).eq("id", equipeId);
    if (error) return { ok: false, erro: `Não foi possível gravar a equipe: ${error.message}` };
  }

  revalidarUsuarios();
  return { ok: true, dados: undefined };
}

async function mudarAtivo(usuarioId: string, ativo: boolean): Promise<Resultado> {
  const sessao = await permitir("super_admin", "admin");
  if (!sessao.ok) return sessao;

  const alvo = await alvoDe(usuarioId);
  if (!alvo) return { ok: false, erro: "Usuário não encontrado. Recarregue a página." };

  const motivo = motivoParaNaoAlterar({
    autorId: sessao.dados.usuarioId, autorCargo: sessao.dados.cargo,
    alvoId: alvo.usuario_id, alvoCargo: alvo.cargo, alvoAtivo: alvo.ativo,
    novoCargo: null, desativar: !ativo, superAdminsAtivos: await contarSuperAdminsAtivos(),
  });
  if (motivo) return { ok: false, erro: motivo };

  // `ban_duration` bloqueia login novo; a sessao viva morre na proxima requisicao
  // porque `obterSessao` le `ativo`. "876000h" sao 100 anos; "none" desfaz.
  const { error: erroAuth } = await db.auth.admin.updateUserById(usuarioId, { ban_duration: ativo ? "none" : "876000h" });
  if (erroAuth) return { ok: false, erro: `Não foi possível ${ativo ? "reativar" : "desativar"} no Auth: ${erroAuth.message}` };

  const agora = new Date().toISOString();
  const { error } = await db
    .from("perfis")
    .update(ativo ? { ativo: true, desativado_em: null, desativado_por: null } : { ativo: false, desativado_em: agora, desativado_por: sessao.dados.usuarioId })
    .eq("usuario_id", usuarioId);
  if (error) return { ok: false, erro: `Não foi possível gravar o perfil: ${error.message}` };

  if (!ativo) await db.from("equipes").update({ lider_id: null }).eq("lider_id", usuarioId);

  revalidarUsuarios();
  return { ok: true, dados: undefined };
}

export async function desativarUsuario(usuarioId: string): Promise<Resultado> {
  return mudarAtivo(usuarioId, false);
}

export async function reativarUsuario(usuarioId: string): Promise<Resultado> {
  return mudarAtivo(usuarioId, true);
}
```

- [ ] **Step 2: Página**

Crie `web/src/app/(painel)/usuarios/page.tsx`:
```tsx
import type { Metadata } from "next";

import { CabecalhoPagina, MetricaCabecalho } from "@/components/shell/cabecalho-pagina";
import { exigirCargo } from "@/lib/auth/sessao";
import { fmt } from "@/lib/format";
import { contarSuperAdminsAtivos, equipesParaConvite, listarConvitesPendentes, listarPerfis } from "@/lib/usuarios/queries";

import { GestaoUsuarios } from "./_componentes/gestao-usuarios";

export const metadata: Metadata = {
  title: "Usuários",
  description: "Quem acessa o HighwAI, com que cargo, e que equipe lidera. Convites por e-mail.",
};

export default async function PaginaUsuarios() {
  const sessao = await exigirCargo("super_admin", "admin");
  const [perfis, convites, equipes, superAdmins] = await Promise.all([
    listarPerfis(),
    listarConvitesPendentes(),
    equipesParaConvite(),
    contarSuperAdminsAtivos(),
  ]);

  const ativos = perfis.filter((p) => p.ativo).length;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Usuários"
        destaque
        metricas={
          <>
            <MetricaCabecalho rotulo="Ativos" valor={fmt.n(ativos)} />
            <MetricaCabecalho rotulo="Convites pendentes" valor={fmt.n(convites.length)} />
          </>
        }
      />
      <GestaoUsuarios
        perfis={perfis}
        convites={convites}
        equipes={equipes}
        superAdminsAtivos={superAdmins}
        eu={{ usuarioId: sessao.usuarioId, cargo: sessao.cargo }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Orquestrador cliente com estado na URL**

Crie `gestao-usuarios.tsx` (`"use client"`): recebe as quatro listas e `eu`; estado na URL com `useQueryState("convidar", parseAsBoolean.withDefault(false))` e `useQueryState("usuario")` (string, id do perfil aberto); cabeçalho do bloco com o botão primário "Convidar" (`UserPlus`) que liga `convidar=true`; renderiza `<ConvitesPendentes>` (só quando há convites), `<TabelaUsuarios>`, `<PainelConvidar aberto={convidar} ...>` e `<PainelUsuario perfil={perfis.find(p => p.usuario_id === usuario)} ...>`. Toda action passa por um `executar(nome, fn)` que usa `useTransition`, mostra `useNotificacao` (`good` no sucesso, `critical` persistente com `duracao: 0` no erro) e chama `router.refresh()`.

- [ ] **Step 4: Tabela**

`tabela-usuarios.tsx`: `Tabela rotulo="Usuários"` com colunas Nome (com o e-mail em `text-xs text-ink-3` abaixo), Cargo (`Chip` com o ícone de `CARGO[cargo].icone` via `IconeDominio` e o rótulo), Equipe liderada (nome ou "—"; para Roçador sem equipe, chip `warning` "sem equipe"), Situação (`Chip tom="good"` Ativo / `Chip tom="neutro"` Desativado, com ícone), Último acesso (`relativoEmDias` ou "nunca entrou"). Linha inteira clicável abre `?usuario=<id>`; a linha de quem está logado ganha o sufixo "(você)". Lista vazia: `EstadoVazio` "Só você por aqui" com ação "Convidar alguém".

- [ ] **Step 5: Convites pendentes**

`convites-pendentes.tsx`: `Cartao` "Convites pendentes" com uma linha por convite: e-mail, cargo (chip), equipe, "convidado por X, vale até dd/mm" e três botões `sm`: "Reenviar" (chama `reenviarConvite`, mostra o link novo num `Aviso tom="info"` com botão "Copiar link" via `navigator.clipboard.writeText`), "Copiar link" (só se a action de criação devolveu o link nesta sessão; caso contrário o botão é "Reenviar", que gera um novo) e "Revogar" (confirmação em dois passos como o "Descartar" da agenda). Convite expirado aparece com chip `warning` "expirado" e só "Reenviar" e "Revogar".

- [ ] **Step 6: Gaveta de convite**

`painel-convidar.tsx`: `PainelLateral titulo="Convidar" descricao="A pessoa recebe um e-mail e define nome e senha ao aceitar." largura="sm"`. Campos: E-mail (`Entrada type="email"`); Cargo (`Selecao` com `CARGOS.filter((c) => podeConvidar(eu.cargo, c))`, rótulo e descrição de `CARGO`); quando cargo = `rocador`, Equipe (`Selecao` das `equipes`, cada opção "Nome · líder: Fulano" ou "Nome · sem líder") e, se a equipe escolhida tem líder, um `<label>` com checkbox "substituir o líder atual (Fulano)". Rodapé: "Enviar convite" (`carregando`) e "Cancelar". Sucesso: a gaveta troca o formulário por um `Aviso tom="good"` "Convite criado" com o link em `<code>` e o botão "Copiar link"; se `emailEnviado` for falso, um segundo `Aviso tom="warning"` com `aviso` e a frase "Mande o link por outro canal". Erro: `Aviso tom="critical"` acima do formulário.

- [ ] **Step 7: Gaveta do usuário**

`painel-usuario.tsx`: `PainelLateral` com o nome no título e o e-mail na descrição. Seções: **Cargo** (`Selecao` + botão "Alterar cargo"; a opção `super_admin` só aparece para `eu.cargo === "super_admin"`); **Equipe liderada** (só para Roçador: `Selecao` com "Nenhuma" + equipes + checkbox de substituição + botão "Gravar"); **Situação** (botão `perigo` "Desativar acesso" com confirmação em dois passos, ou `secundario` "Reativar"); **Histórico** (`Leitura` com convidado em, último acesso, desativado em). Antes de habilitar cada botão, chame `motivoParaNaoAlterar` com os dados do cliente e mostre o motivo como `dica` do `Campo` quando houver; o servidor repete a checagem.

- [ ] **Step 8: Verificação e commit**

Run: `npm run tipos && npm run lint && npm run build`
```bash
git add -A && git commit -m "feat(usuarios): tela de usuarios com convites, cargo, equipe e desativacao" && git push origin main
```

---

### Task 12: Primeiro Super Admin e configuração do Supabase e da Vercel

**Files:**
- Create: `web/scripts/semear-super-admin.mjs`
- Modify: `web/package.json` (script)

- [ ] **Step 1: Script**

Crie `web/scripts/semear-super-admin.mjs`:
```js
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
```
Em `web/package.json`, scripts: `"semear:super-admin": "node scripts/semear-super-admin.mjs"`.

- [ ] **Step 2: Configurar o Auth no dashboard**

No projeto `mbkcygsqfcxxcmvkuqyt`, em **Authentication**:
- *Sign In / Providers → Email*: manter ligado; **desligar** "Allow new users to sign up"; "Confirm email" pode ficar ligado (as contas nascem confirmadas por `email_confirm: true`).
- *Sign In / Providers*: **desligar** "Allow anonymous sign-ins".
- *URL Configuration*: Site URL `https://motiva-highwai.vercel.app`; Redirect URLs `http://localhost:3000/**` e `https://motiva-highwai.vercel.app/**`.
- *Passwords*: Minimum length `10`; "Leaked password protection" ligado se o plano permitir.
- *Sessions*: JWT expiry `3600`. Não mexer no resto.

Em **Project Settings → API Keys**: criar uma chave secreta (`sb_secret_…`) chamada `painel-e-lote` e gravá-la em `web/.env.local` como `SUPABASE_SECRET_KEY`. Confirmar que a publishável `sb_publishable_Yii5juqkwA0Iz7gJILj0_Q_7j5dZjsW` está ativa.

- [ ] **Step 3: Criar o Super Admin e entrar**

```bash
cd /e/motiva/web && npm run semear:super-admin -- --email enzo.moretto@sasi.com.br --nome "Enzo Moretto"
```
Expected: imprime a senha provisória. Rode `npm run dev`, entre em `/entrar`, use a senha, caia em `/definir-senha`, defina a definitiva e chegue ao Painel com a lateral mostrando Chamados (404 por enquanto), Campo (404) e Usuários.

- [ ] **Step 4: Vercel**

Em `vercel.com/enzomoretto-6868s-projects/motiva` → Settings → Environment Variables (Production e Preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `EMAIL_REMETENTE`, `APP_URL=https://motiva-highwai.vercel.app`, `CONVITE_VALIDADE_DIAS=7`. Deploy manual, como registrado em `deploy-vercel-motiva`:
```bash
cd /e/motiva && rm -rf /c/Users/enzom/AppData/Local/Temp/motiva-deploy && mkdir -p /c/Users/enzom/AppData/Local/Temp/motiva-deploy && git archive HEAD | tar -x -C /c/Users/enzom/AppData/Local/Temp/motiva-deploy && mkdir -p /c/Users/enzom/AppData/Local/Temp/motiva-deploy/.vercel && cp .vercel/project.json /c/Users/enzom/AppData/Local/Temp/motiva-deploy/.vercel/ && cd /c/Users/enzom/AppData/Local/Temp/motiva-deploy && vercel --prod --yes
```
Depois confira com o MCP da Vercel (`list_deployments`) que o deploy novo está `READY` e abra `https://motiva-highwai.vercel.app/` → deve redirecionar para `/entrar`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(acesso): script do primeiro super admin" && git push origin main
```

---

### Task 13: Verificação no navegador, por cargo

**Files:** nenhum novo. Corrija o que aparecer e commite como `fix(acesso): ...`.

- [ ] **Step 1: Contas de teste**

Logado como Super Admin em `/usuarios`, convide `enzo.moretto+admin@sasi.com.br` (Admin), `+analista` (Analista) e `+lider` (Roçador, equipe "Equipe Roçada SP-Interior 01"). Em modo de teste o Resend entrega os três para a sua caixa; se não entregar, use o link copiável. Aceite os três em janelas anônimas, com senhas distintas.

- [ ] **Step 2: Roteiro, tema claro e escuro, 1280 px e 390 px**

| Passo | Esperado |
|---|---|
| Sem sessão, abrir `/agenda` | vai para `/entrar?proximo=/agenda`; após entrar, volta para `/agenda` |
| Senha errada | "E-mail ou senha não conferem", campo mantém o e-mail |
| Admin | lateral: Painel, Malha, Agenda, Chamados, Copiloto, Campo, Usuários; sem Laboratório; `/simulador` na URL → `/sem-acesso` |
| Analista | lateral: Painel, Malha, Agenda, Copiloto; aviso "somente leitura" no topo; agenda sem "Nova roçada", sem arrasto, gaveta sem botões; `/chamados` na URL → `/sem-acesso`; Copiloto responde |
| Analista força uma action | no DevTools, chamar `fetch` do endpoint da action (copiar de uma requisição do Admin) devolve `{ ok: false, erro: "Seu acesso é somente leitura." }` |
| Roçador | `/` → `/campo` (404 até a Fase 3; o redirect é o que se testa) |
| Usuários, como Admin | seletor de cargo não oferece Super Admin; alterar o próprio cargo é recusado com motivo; desativar o Super Admin é recusado |
| Desativar o Analista | na aba dele, o próximo clique cai em `/entrar`; reativar devolve o acesso |
| Convite expirado | alterar `expira_em` no banco para ontem e abrir o link → tela "Este convite expirou" |
| Esqueci a senha | link chega (ou aviso de modo de teste); senha nova entra; o link usado de novo diz que não vale mais |
| `npm run verificar` | verde |
| `get_advisors(security)` no MCP | sem `rls_disabled_in_public` e sem `security_definer_view` |

- [ ] **Step 3: Commit final da fase**

```bash
git add -A && git commit -m "fix(acesso): achados da verificacao no navegador" && git push origin main
```

---

## Auto-revisão do plano

- **Cobertura do spec §1:** sessão (T4), cargos e matriz (T3), rotas e Shell (T5), convite (T8–T9), redefinição (T10), usuários (T11), bootstrap e configuração (T12), RLS e chaves (T2, T1), DDL versionado (T2), cabeçalhos (T1), somente leitura (T7), Copiloto com limite (T7). Fase 0 (T0).
- **Nomes consistentes:** `permitir`/`exigirCargo`/`obterSessao` (T4) são os usados em T5, T7, T9–T11; `podeConvidar`/`motivoParaNaoAlterar` (T3) em T9 e T11; `enviarEmail`/`EmailConvite`/`urlDoApp` (T8) em T9–T10; `buscarConvitePorToken` (T9) em `aceitarConvite` e na página do convite.
- **Cortes para domingo, se apertar:** T10 inteira (redefinição) pode ficar para depois da demonstração: o Admin tem "reenviar convite" e o seed tem senhas conhecidas. Em T11, a gaveta do usuário pode nascer só com "Desativar/Reativar" e "Alterar cargo"; equipe liderada entra na Fase 2, que precisa dela para os chamados.
