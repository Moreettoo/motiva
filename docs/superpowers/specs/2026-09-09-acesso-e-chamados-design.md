# Acesso, chamados e app de campo — design

Data: 2026-09-09 · Prazo: demonstração no domingo **13/09/2026** · Escopo: `web/`, `analisar_lote.py`,
migrações no schema `ia`, configuração do Supabase Auth e do Storage, pacote Android (TWA).

Este documento registra o que foi decidido numa sessão de perguntas em 09/09 e o que o código e
o banco responderam sozinhos. Os planos de implementação (`docs/superpowers/plans/2026-09-09-fase-*.md`)
argumentam a partir daqui; quem executa lê os dois.

---

## O que existe hoje, medido em 09/09/2026

**Segurança: nenhuma.** Não há login, sessão, `proxy.ts`, rota de API nem cabeçalho de segurança.
As 12 Server Actions de `web/src/lib/acoes.ts` são POSTs públicos que escrevem no banco com a
chave `service_role`. RLS está desligado nas 16 tabelas (`ia` e `public`). A chave anônima do
projeto tem `SELECT`, `INSERT`, `UPDATE` e `DELETE` em `agendamentos`, `medicoes`, `previsoes` e
`trechos`, e `SELECT` no resto. Qualquer pessoa com a URL do projeto altera a agenda.

**Nada de pessoa no modelo.** `auth.users` tem 0 linhas. `ia.equipes` são 10 turmas abstratas
(nome, base, capacidade, ativo), sem e-mail, líder ou dispositivo. Não existe tabela de perfil,
convite, chamado ou foto. `storage.buckets` tem 0 linhas. Não há envio de e-mail de nenhum tipo.

**Execução nunca é registrada.** O painel lê `ia.execucoes` (histórico do trecho, e a feature
`dias_desde_rocada_inicio` do modelo v3.1) mas **nunca escreve** nela. "Marcar como executada"
troca só `agendamentos.status`. O lote das 06:00 descarta todo `aprovado` com `data_sugerida <
hoje` olhando apenas o status (`analisar_lote.py`, `fechar_obsoletos`), sem consultar execuções.

**DDL não versionado.** `schema_ia.sql` é o DDL de 04/08 e não contém `equipes`, `execucoes`,
`concessionarias`, `zonas_clima`, a view nem as colunas `origem`/`equipe_id`/`atualizado_em`. As
10 migrações posteriores vivem só no histórico do Supabase.

**Duas árvores divergentes.** `E:\motiva` tem dois commits `design: design changes` (20/08) que
nunca foram enviados; todos os 34 blobs deles existem em `origin/main` no commit `caa948a`. E: não
contém os 8 commits do modelo v3.2/v3.3 que estão em produção (`3faee68`). O Event Log registra
milhares de erros do disco E: nos últimos 7 dias.

**Next.js 16.3.0.** `middleware.ts` virou `proxy.ts` (runtime Node, não é camada de segurança, e o
matcher não cobre Server Actions). Server Actions aceitam 1 MB de corpo. Turbopack é o bundler
padrão e um plugin que injete `webpack` faz o build falhar. `unstable_cache` está deprecado mas
funciona; não migramos agora.

---

## Decisões da sessão de 09/09

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Árvore de trabalho | **E:\motiva**, sincronizada com `origin/main` na Fase 0. Verificar cada arquivo gravado byte a byte; push cedo. |
| 2 | Ordem das entregas | Acesso → Chamados → App de campo → Sino. Demonstração até domingo 13/09. |
| 3 | Provedor de auth | Supabase Auth. |
| 4 | Método de login | E-mail e senha, com "esqueci a senha". Sem magic link, sem SSO. |
| 5 | Envio de e-mail | Resend pela API, templates React Email versionados no repo. O Supabase **nunca** envia e-mail. |
| 6 | Domínio remetente | Nenhum por enquanto: modo de teste do Resend (entrega só para o e-mail da própria conta). Domínio vira variável de ambiente. |
| 7 | Primeiro Super Admin | Script idempotente com a chave de serviço, e-mail `enzo.moretto@sasi.com.br`. |
| 8 | MFA | Depois, fase opcional. |
| 9 | Onde vive o cargo | `ia.perfis` é a verdade; cópia em `app_metadata.cargo` do usuário no Auth. |
| 10 | Quem convida | Super Admin e Admin convidam qualquer cargo **abaixo de Super Admin** (Admin cria Admin). |
| 11 | Analista | Painel, Malha, Agenda, detalhe do trecho e Copiloto, tudo somente leitura. Sem Chamados. |
| 12 | Plataforma do app | PWA em `/campo` dentro do Next; APK por Trusted Web Activity (PWABuilder). |
| 13 | Roçador na web | Cai em `/campo`. Admin e Super Admin também acessam `/campo`, escolhendo a equipe. |
| 14 | Equipe × pessoa | **Exatamente um líder por equipe** (`ia.equipes.lider_id`). |
| 15 | Chamado × agenda | 1 chamado por agendamento; nasce por gatilho quando o agendamento vira `aprovado` com equipe. Retroativo para os 12 aprovados. |
| 16 | Estados | aberto, em_andamento, aguardando_aprovacao, devolvido, adiamento_solicitado, concluido, cancelado. |
| 17 | Altura inicial | Admin informa se quiser; se não informar, entra a altura prevista pelo modelo. A origem fica gravada. |
| 18 | Fotos | 2 obrigatórias por etapa, até 4 extras, comprimidas no aparelho, com GPS e hora. Altura final em cm no fechamento. |
| 19 | Aprovação | Transação completa (execução + medição + agendamento executado + chamado concluído) e reanálise automática do trecho. |
| 20 | Adiamento | Equipe pede com motivo e data sugerida; admin decide e define a data. |
| 21 | Lote × chamado | Vencido vira "atrasado"; o lote só cancela chamado `aberto` sem evento após 7 dias da data, e ignora chamados ativos. |
| 22 | Atalho do admin | "Marcar como executada" vira "Encerrar administrativamente", com observação obrigatória e marca `sem_evidencia`. |
| 23 | Tela de Chamados | Fila de decisão no topo, lista filtrável por URL, gaveta de detalhe. Número legível CH-AAAA-NNNN. |
| 24 | Avisos | Só o sino dentro do painel e do app. Sem e-mail de aviso nesta versão. |
| 25 | APK | Link de download (GitHub Releases) na tela de Usuários e em `/campo`, com QR code. |
| 26 | Aparelhos | Android 10+, Chrome atualizado. Sem iPhone na primeira versão. |
| 27 | Offline | Fila local, sincroniza sozinha, servidor tem a palavra final; evento fora de ordem vira alerta. |
| 28 | Convite | E-mail, cargo e equipe; qualquer domínio; validade 7 dias; nome e senha definidos no aceite. |
| 29 | Desligar pessoa | Desativar, nunca excluir. |
| 30 | Marca do e-mail | HighwAI, com "para a Motiva" no texto. Sem logotipo da Motiva. |
| 31 | RLS | Ligado nas 16 tabelas, **sem políticas**, anônimo revogado. Migrar para chaves publishável e secreta. |
| 32 | Formato | Spec + planos em `docs/superpowers`, commitados e enviados ao GitHub. |
| 33 | Seed | Script idempotente com um usuário por cargo, líder para as 10 equipes, chamados nos 7 estados. |
| 34 | Teste | Enzo tem um Android para o teste em modo avião. |

Uma decisão mudou depois da pergunta 31 por causa do prazo, e foi aprovada na revisão da seção 1:
**o app de campo fala com o próprio painel** (rotas de API no mesmo domínio, autenticadas pelo
cookie de sessão, escrevendo com a chave secreta depois de checar o cargo), e não direto com o
Supabase. Isso dispensa políticas RLS por cargo até domingo. RLS entra na forma "ligado em tudo,
nenhuma política": só a chave secreta passa, e ela nunca sai do servidor.

---

## Fase 0 · Base

E: fica, mas fica igual a produção. Passos, nesta ordem, todos em `E:\motiva`:

1. `git fetch origin` e `git tag arquivo/e-design-changes-2026-08-20 f73c249` (nada se perde,
   mesmo sendo redundante).
2. `git reset --hard origin/main` (árvore limpa, verificado em 09/09; os dois commits locais são
   subconjunto de `caa948a`).
3. Copiar `C:\Users\enzom\motiva-recuperado\CLAUDE.md` para `E:\motiva\CLAUDE.md` (é gitignored;
   a cópia de E: é a versão antiga de 413 linhas).
4. Conferir `web/.env.local`: a cópia de C: tem mais variáveis (GitHub); unir as duas.
5. `cd web && npm ci`; `python -m venv venv && venv\Scripts\pip install -r requirements.txt`.
6. `npm run verificar` verde antes de qualquer tarefa da Fase 1.

Os cinco documentos desta sessão (este spec e os planos das fases 1 a 4) já estão em `origin/main`,
commitados a partir de E: em 10/09 por um worktree temporário, sem tocar na árvore de trabalho; a tag
`arquivo/e-design-changes-2026-08-20` também já foi criada e enviada. As cópias não rastreadas em
`docs/superpowers` são idênticas às commitadas e o `reset` do passo 2 as assume sem conflito.

Regra permanente enquanto o disco E: durar: depois de gravar um arquivo, conferir tamanho e
ausência de bytes NUL (`tr -d '\000' < arquivo | wc -c` igual a `wc -c < arquivo`); commitar e dar
push ao fim de cada tarefa. O GitHub é a rede de segurança.

---

## §1 · Acesso

### Sessão

Pacote `@supabase/ssr`. Três clientes, três papéis:

| Cliente | Chave | Onde | Para quê |
|---|---|---|---|
| `db` (`src/lib/supabase.ts`, existente) | secreta (`SUPABASE_SECRET_KEY`, com `SUPABASE_SERVICE_KEY` como reserva) | servidor, `server-only` | toda leitura e escrita de dados, e a API admin do Auth |
| `clienteSessao()` (`src/lib/auth/servidor.ts`, novo) | publishável | servidor (páginas, actions, route handlers) | ler e refrescar a sessão do usuário pelos cookies; login, logout, troca de senha |
| `proxy.ts` (novo, raiz de `web/src`) | publishável | antes de toda requisição | refrescar cookie, redirecionar quem não está logado, mandar Roçador para `/campo` |

O proxy é conveniência de navegação. **A segurança mora em `src/lib/auth/sessao.ts`**, chamado
no topo de cada página e dentro de cada Server Action e route handler:

```ts
export type Sessao = {
  usuarioId: string; email: string; nome: string;
  cargo: Cargo; equipeId: number | null; ativo: boolean; senhaProvisoria: boolean;
};
export const obterSessao: () => Promise<Sessao | null>;          // cache() por requisição
export function exigirSessao(): Promise<Sessao>;                 // redirect("/entrar") se não há
export function exigirCargo(...cargos: Cargo[]): Promise<Sessao>; // redirect("/sem-acesso") se não pode
export function permitir(...cargos: Cargo[]): Promise<Resultado<Sessao>>; // versão para actions
```

`obterSessao` lê as claims do token (`getClaims`, verificação local com as chaves assimétricas do
projeto) e **uma** linha de `ia.perfis` (nome, cargo, equipe, ativo, senha provisória). O cargo
autoritativo é o do perfil; a cópia em `app_metadata` existe para o proxy, que não consulta o
banco, e para políticas RLS futuras. Perfil `ativo = false` equivale a não ter sessão. Perfil com
`senha_provisoria = true` é redirecionado a `/definir-senha` até trocar.

As 12 actions existentes ganham `const s = await permitir(...); if (!s.ok) return s;` na
primeira linha. Analista recebe `{ ok: false, erro: "Seu acesso é somente leitura." }` em qualquer
escrita, mesmo forçando a chamada. `enfileirarAnaliseDoTrecho` conta como escrita (dispara CI e
grava previsão). `consultarAnalise` e `perguntarAoCopiloto` são leitura, com Copiloto limitado a
20 perguntas por hora por usuário (contador em memória por instância, suficiente para a Vercel).

### Cargos

```ts
export const CARGOS = ["super_admin", "admin", "analista", "rocador"] as const;
export type Cargo = (typeof CARGOS)[number];
```

`src/lib/auth/permissoes.ts` é função pura com teste, fonte única da matriz:

| Tela | Super Admin | Admin | Analista | Roçador |
|---|---|---|---|---|
| `/` Painel, `/malha`, `/agenda`, `/trechos/[id]` | edita | edita | só lê | não |
| `/copiloto` | sim | sim | sim, 20/h | não |
| `/chamados` | sim | sim | não | não |
| `/usuarios` | sim | sim, exceto criar Super Admin | não | não |
| `/campo` | sim, escolhe equipe | sim, escolhe equipe | não | única tela; equipe fixa |
| `/simulador` (Laboratório) | sim | não | não | não |

```ts
export function podeVerRota(cargo: Cargo, pathname: string): boolean;
export function rotaInicial(cargo: Cargo): "/" | "/campo";
export function podeEscrever(cargo: Cargo): boolean;                 // analista e rocador: false
export function podeConvidar(convidador: Cargo, alvo: Cargo): boolean; // super_admin: todos; admin: todos exceto super_admin
export function podeAlterarUsuario(autor: Sessao, alvo: Perfil, totalSuperAdmins: number): string | null; // motivo da recusa ou null
export function itensDeNavegacao(cargo: Cargo): ItemNavegacao[];
```

`ItemNavegacao` em `barra-lateral.tsx` ganha `cargos: Cargo[]`. A lista `NAVEGACAO` continua
sendo a fonte; os quatro consumidores (lateral, barra móvel, paleta, trilha) passam a receber a
lista já filtrada pelo `Shell`, que é Server Component e lê a sessão. Itens novos: **Chamados**
(`ClipboardList`, grupo operação), **Usuários** (`Users`, grupo novo "Administração"), **Campo**
(`Smartphone`, grupo operação, só Admin e Super Admin). Roçador não vê o `Shell`: `/campo` tem
layout próprio.

Analista vê as telas com os controles de escrita **ausentes**, não desabilitados: o `Shell`
entrega `podeEscrever` por prop e cada componente que hoje renderiza botão de ação recebe a
prop. Lista de superfícies a tocar: gaveta da agenda (`painel-agendamento.tsx`), quadro
(arrasto desligado em `usar-arrasto.ts` via prop `somenteLeitura`), botão "Nova roçada"
(`planejamento.tsx`), "Exigem decisão" no painel (`exigem-decisao.tsx`), gaveta da malha
(`painel-trecho.tsx`), cabeçalho do trecho (`acoes-trecho.tsx`) e "Registrar medição"
(`registrar-medicao.tsx`). Um aviso discreto no topo dessas telas diz "Acesso somente leitura".

### Estrutura de rotas

O layout raiz (`src/app/layout.tsx`) fica **mínimo**: `<html>`, `<body>`, fontes, script de tema,
`NuqsAdapter`. Perde `export const dynamic = "force-dynamic"`. Três grupos de rotas, cada um com
layout aninhado próprio:

| Grupo | Layout | Rotas | `dynamic` |
|---|---|---|---|
| `(painel)` | `<Shell>` com a sessão, exige sessão e cargo ≠ rocador | `/`, `/malha`, `/agenda`, `/copiloto`, `/simulador`, `/trechos/[id]`, `/chamados`, `/usuarios`, `/sem-acesso` | `force-dynamic` (o lote escreve por fora) |
| `(publico)` | moldura centrada com a marca, sem Shell | `/entrar`, `/esqueci-a-senha`, `/redefinir-senha/[token]`, `/convite/[token]`, `/definir-senha` | dinâmico por ler token |
| `(campo)` | tela cheia, tema escuro, `<SerwistProvider>` | `/campo` | **estático** (nada de cookie na renderização; dados vêm da API) |

Mover os arquivos para dentro de `(painel)` não muda URL nem imports (`@/...`). `not-found.tsx` de
`trechos/[id]` continua no lugar.

### Convite

Tabela `ia.convites`; token aleatório de 32 bytes em base64url, guardado como SHA-256 hex;
validade `CONVITE_VALIDADE_DIAS` (7). Um convite pendente por e-mail (índice único parcial).

Fluxo:

1. Admin ou Super Admin abre a gaveta `?convidar=true` em `/usuarios`: e-mail, cargo (lista
   filtrada por `podeConvidar`), equipe quando cargo = Roçador (lista de equipes ativas; equipe
   que já tem líder aparece com o nome dele e exige marcar "substituir líder").
2. `convidarUsuario` grava o convite, envia o e-mail pelo Resend (template `Convite`) e devolve
   também o link, que a tela mostra com botão de copiar. **O link na tela é o corte mínimo**: em
   modo de teste o Resend só entrega para o e-mail da conta.
3. A pessoa abre `/convite/[token]`: a página valida (pendente, não expirado) e mostra nome, e-mail
   fixo, senha e confirmação. Estados terminais têm tela própria: expirado (com "pedir novo
   convite", que avisa quem convidou pelo sino), revogado, já aceito, inválido.
4. `aceitarConvite` cria o usuário no Auth (`admin.createUser` com `email_confirm: true`,
   `app_metadata.cargo`, `user_metadata.nome`), insere `ia.perfis`, define `equipes.lider_id`
   quando Roçador, marca `aceito_em`, faz login e redireciona para `rotaInicial(cargo)`.

Reenviar gera token novo e invalida o anterior (mesma linha, `token_hash` novo, `enviado_em`).
Revogar grava `revogado_em`. Cadastro público e anônimo ficam **desligados** no Supabase Auth;
o único caminho para `auth.users` é `admin.createUser`.

### Redefinição de senha

Mesmo mecanismo do convite, tabela `ia.redefinicoes_senha`, validade 1 hora. `/esqueci-a-senha`
sempre responde "se este e-mail tiver conta, enviamos o link", sem revelar existência.
`/redefinir-senha/[token]` grava a senha por `admin.updateUserById(id, { password })`, marca
`usada_em`, faz login. Regras de senha: mínimo 10 caracteres, validadas no cliente e no servidor;
"proteção contra senha vazada" ligada no dashboard se o plano do projeto permitir.

### Usuários

`/usuarios`, Admin e Super Admin. Lista em tabela: nome, e-mail, cargo (chip), equipe liderada,
situação (Ativo, Desativado, Convite pendente até dd/mm), último acesso. Seção separada "Convites
pendentes" com reenviar, copiar link e revogar. Gaveta `?usuario=<id>` com: alterar cargo, alterar
equipe liderada, desativar ou reativar, e histórico (convidado por, aceito em, desativado por).

Regras, todas em `podeAlterarUsuario` e repetidas no servidor:
- ninguém altera o próprio cargo nem se desativa;
- o último Super Admin ativo não pode ser rebaixado nem desativado;
- Admin não cria nem promove a Super Admin;
- desativar = `admin.updateUserById(id, { ban_duration: "876000h" })` + `perfis.ativo = false` +
  `desativado_em`, `desativado_por`; a próxima requisição da pessoa cai em `/entrar` porque
  `obterSessao` lê `ativo`. Reativar = `ban_duration: "none"` + `ativo = true`;
- desativar um Roçador líder deixa a equipe sem líder (`lider_id = null`); a tela de Usuários e a
  de Chamados mostram "equipe sem líder" onde importa.

### Bootstrap e configuração

`npm run semear:super-admin -- --email enzo.moretto@sasi.com.br --nome "Enzo Moretto"`: cria o
usuário com senha provisória impressa no terminal e `senha_provisoria = true`; rodar de novo não
duplica (procura por e-mail em `ia.perfis`).

No dashboard do Supabase (Authentication): **desligar** "Allow new users to sign up" e "Allow
anonymous sign-ins"; Site URL `https://motiva-highwai.vercel.app`; Redirect URLs com
`http://localhost:3000/**` e `https://motiva-highwai.vercel.app/**`; senha mínima 10. Em API Keys:
criar chave secreta `sb_secret_…` (vai para `SUPABASE_SECRET_KEY`) e usar a publishável
`sb_publishable_Yii5juqkwA0Iz7gJILj0_Q_7j5dZjsW` em `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
As chaves legadas continuam funcionando até o fim de 2026; o código aceita as duas.

Variáveis novas do painel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `EMAIL_REMETENTE` (padrão `HighwAI <onboarding@resend.dev>`),
`APP_URL` (padrão `http://localhost:3000`), `CONVITE_VALIDADE_DIAS` (7). Todas no `.env.example` e na
Vercel.

### RLS e chaves

Migração `rls_em_tudo_sem_politicas`: `enable row level security` nas 8 tabelas de `ia` e nas 8
de `public`; `revoke all` de `anon` e `authenticated` em todas as tabelas, sequências e funções
dos dois schemas; `alter view ia.vw_trecho_status set (security_invoker = on)` e o mesmo em
`ia.trechos_por_zona`; `alter function ia.gerar_zonas set search_path = ''`. O painel, o lote e a
API do campo usam a chave secreta, que ignora RLS; nada quebra neles. O smoke test
(`scripts/fumaca.mjs`) ganha uma checagem que **falha se a chave publishável conseguir ler**
`ia.trechos`.

### DDL versionado

O DDL passa a morar em `supabase/migrations/AAAAMMDDHHMMSS_nome.sql`, aplicado pelo MCP do Supabase
(`apply_migration`, que registra o nome no histórico) e commitado. A primeira migração da Fase 1 é
`00000000000000_linha_de_base_ia.sql`: o `pg_dump` lógico do schema `ia` como está hoje, só para
leitura, com cabeçalho dizendo que **já está aplicado**. `schema_ia.sql` ganha um cabeçalho
"histórico, ver supabase/migrations".

### DDL da Fase 1

```sql
create table ia.perfis (
  usuario_id        uuid primary key references auth.users(id) on delete cascade,
  nome              text not null check (length(nome) between 2 and 120),
  email             text not null unique check (email = lower(email)),
  cargo             text not null check (cargo in ('super_admin','admin','analista','rocador')),
  ativo             boolean not null default true,
  senha_provisoria  boolean not null default false,
  convidado_por     uuid references ia.perfis(usuario_id),
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  ultimo_acesso_em  timestamptz,
  desativado_em     timestamptz,
  desativado_por    uuid references ia.perfis(usuario_id)
);

alter table ia.equipes
  add column lider_id uuid unique references ia.perfis(usuario_id) on delete set null;

create table ia.convites (
  id           uuid primary key default gen_random_uuid(),
  email        text not null check (email = lower(email)),
  cargo        text not null check (cargo in ('super_admin','admin','analista','rocador')),
  equipe_id    bigint references ia.equipes(id) on delete set null,
  token_hash   text not null unique,
  expira_em    timestamptz not null,
  criado_por   uuid not null references ia.perfis(usuario_id),
  criado_em    timestamptz not null default now(),
  enviado_em   timestamptz,
  aceito_em    timestamptz,
  revogado_em  timestamptz,
  usuario_id   uuid references auth.users(id) on delete set null
);
create unique index ux_convite_pendente_por_email
  on ia.convites (email) where aceito_em is null and revogado_em is null;

create table ia.redefinicoes_senha (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  token_hash  text not null unique,
  expira_em   timestamptz not null,
  criado_em   timestamptz not null default now(),
  usada_em    timestamptz
);
```

`gen_random_uuid()` vem do `pgcrypto`, já instalado. Nenhuma dessas tabelas tem política RLS
porque só a chave secreta as alcança.

### Cabeçalhos e limites

`next.config.ts` deixa de ser vazio: `headers()` com `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
`Permissions-Policy: camera=(self), geolocation=(self)`, e `Strict-Transport-Security` em
produção; `images.remotePatterns` para `mbkcygsqfcxxcmvkuqyt.supabase.co`. Sem CSP nesta versão:
o script inline de tema e o Motion exigiriam nonce e não há tempo para medir a regressão.

---

## §2 · Chamados

### Modelo

```sql
create table ia.contadores (
  chave  text primary key,
  ultimo integer not null default 0
);

create table ia.chamados (
  id                     bigserial primary key,
  numero                 text not null unique,                 -- CH-2026-0001
  agendamento_id         bigint not null unique references ia.agendamentos(id) on delete restrict,
  trecho_id              bigint not null references ia.trechos(id) on delete cascade,
  status                 text not null default 'aberto' check (status in
                           ('aberto','em_andamento','aguardando_aprovacao','devolvido',
                            'adiamento_solicitado','concluido','cancelado')),
  status_anterior        text check (status_anterior in ('aberto','em_andamento','devolvido')),
  altura_inicial_cm      numeric check (altura_inicial_cm between 0 and 300),
  altura_inicial_origem  text not null default 'prevista' check (altura_inicial_origem in ('prevista','informada')),
  altura_final_cm        numeric check (altura_final_cm between 0 and 300),
  km_rocados             numeric check (km_rocados >= 0),
  custo_reais            numeric check (custo_reais >= 0),
  observacao_conclusao   text,
  sem_evidencia          boolean not null default false,
  iniciado_em            timestamptz,
  finalizado_em          timestamptz,
  concluido_em           timestamptz,
  cancelado_em           timestamptz,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);
create index idx_chamados_status on ia.chamados (status, atualizado_em desc);

create table ia.chamado_eventos (
  id             bigserial primary key,
  chamado_id     bigint not null references ia.chamados(id) on delete cascade,
  evento_id      uuid not null unique,                         -- gerado no aparelho: idempotência
  tipo           text not null check (tipo in
                   ('criado','iniciado','finalizado','aprovado','devolvido',
                    'adiamento_solicitado','adiamento_aceito','adiamento_recusado',
                    'remarcado','equipe_alterada','altura_inicial_alterada',
                    'cancelado','encerrado_admin','fora_de_ordem','comentario')),
  autor_id       uuid references ia.perfis(usuario_id),
  autor_nome     text not null,                                -- cópia: sobrevive à desativação
  origem         text not null check (origem in ('painel','campo','lote','sistema')),
  payload        jsonb not null default '{}'::jsonb,
  ocorrido_em    timestamptz not null,                         -- relógio de quem agiu
  registrado_em  timestamptz not null default now()            -- relógio do servidor
);
create index idx_chamado_eventos_chamado on ia.chamado_eventos (chamado_id, registrado_em);

create table ia.chamado_fotos (
  id            bigserial primary key,
  chamado_id    bigint not null references ia.chamados(id) on delete cascade,
  evento_id     uuid not null,                                 -- o iniciar/finalizar a que pertence
  etapa         text not null check (etapa in ('inicio','fim')),
  papel         text not null check (papel in ('medida','extensao','resultado','extra')),
  caminho       text not null unique,                          -- chamados/<chamado>/<evento>/<uuid>.jpg
  largura_px    integer not null,
  altura_px     integer not null,
  bytes         integer not null,
  latitude      numeric,
  longitude     numeric,
  precisao_m    numeric,
  capturada_em  timestamptz not null,
  enviada_em    timestamptz not null default now(),
  autor_id      uuid references ia.perfis(usuario_id)
);
create index idx_chamado_fotos_chamado on ia.chamado_fotos (chamado_id, etapa);

create table ia.chamado_adiamentos (
  id              bigserial primary key,
  chamado_id      bigint not null references ia.chamados(id) on delete cascade,
  evento_id       uuid not null unique,
  motivo          text not null check (motivo in
                    ('chuva','equipamento','acesso_bloqueado','seguranca_trafego','falta_efetivo','outro')),
  detalhe         text,
  data_sugerida   date,
  solicitado_por  uuid references ia.perfis(usuario_id),
  solicitado_em   timestamptz not null default now(),
  decidido_por    uuid references ia.perfis(usuario_id),
  decidido_em     timestamptz,
  decisao         text check (decisao in ('aceito','recusado')),
  nova_data       date,
  resposta        text
);
create unique index ux_adiamento_pendente_por_chamado
  on ia.chamado_adiamentos (chamado_id) where decisao is null;

create table ia.notificacoes (
  id               bigserial primary key,
  destinatario_id  uuid not null references ia.perfis(usuario_id) on delete cascade,
  tipo             text not null,
  titulo           text not null,
  texto            text,
  href             text,
  chamado_id       bigint references ia.chamados(id) on delete cascade,
  lida_em          timestamptz,
  criado_em        timestamptz not null default now()
);
create index idx_notificacoes_destinatario on ia.notificacoes (destinatario_id, lida_em, criado_em desc);
```

A equipe **não** é copiada para `chamados`: mora em `agendamentos.equipe_id`, como hoje. Bucket
`chamados` no Storage, **privado**, limite de 2 MB por objeto, só `image/jpeg`.

### Numeração

`ia.proximo_numero_chamado()`: `insert into ia.contadores (chave, ultimo) values ('CH-'||ano, 1)
on conflict (chave) do update set ultimo = contadores.ultimo + 1 returning ultimo`, formatado
`CH-AAAA-NNNN`. Gatilho `before insert` em `ia.chamados` preenche `numero`.

### Nascimento e sincronia pelo banco

Gatilho `after insert or update of status, equipe_id, data_sugerida on ia.agendamentos`, função
`ia.tg_agendamentos_chamado()`:

| Mudança no agendamento | Efeito |
|---|---|
| vira `aprovado` com `equipe_id` e não há chamado | insere chamado `aberto`; `altura_inicial_cm` = `altura_atual_cm` da última previsão do trecho (ou última medição), `origem = 'prevista'`; evento `criado`, origem `sistema` |
| vira `aprovado` sem equipe | nada (chamado nasce quando a equipe chegar) |
| `equipe_id` muda com chamado não concluído | evento `equipe_alterada` com equipe anterior e nova |
| `data_sugerida` muda com chamado não concluído | evento `remarcado` com data anterior e nova |
| vira `descartado` ou `sugerido` com chamado não concluído | chamado `cancelado`, `cancelado_em`, evento `cancelado` com o motivo (`descartado` ou `reaberto como sugestão`) |
| vira `executado` com chamado não concluído | chamado `concluido` com `sem_evidencia = true` (caminho legado; a UI deixa de usá-lo) |

O gatilho grava `autor_nome` = nome do perfil em `current_setting('app.autor', true)` quando a
action o define via `set_config` na mesma transação, senão `'sistema'`. Migração retroativa: para
cada `aprovado` com equipe hoje, um `insert` que dispara o mesmo gatilho.

### Estados e transições

```
aberto ──iniciar──▶ em_andamento ──finalizar──▶ aguardando_aprovacao ──aprovar──▶ concluido
  │                     │   ▲                          │
  │                     │   └────── finalizar ───── devolvido ◀── devolver ──┘
  └──pedir adiamento──▶ adiamento_solicitado ◀── pedir adiamento ──┘ (de em_andamento)
                            │ aceitar → volta ao status_anterior com data nova
                            │ recusar → volta ao status_anterior
qualquer não concluído ──cancelar / encerrar administrativamente──▶ cancelado / concluido(sem_evidencia)
```

| Evento | De | Para | Quem | Exigências |
|---|---|---|---|---|
| `iniciado` | aberto | em_andamento | Roçador líder da equipe (ou Admin em `/campo`) | 2 fotos (`medida`, `extensao`) com o mesmo `evento_id` já no Storage |
| `finalizado` | em_andamento, devolvido | aguardando_aprovacao | idem | 2 fotos (`resultado`, `extensao`) + `altura_final_cm` |
| `aprovado` | aguardando_aprovacao | concluido | Admin, Super Admin | `km_rocados` (pré: extensão do trecho), `custo_reais` opcional |
| `devolvido` | aguardando_aprovacao | devolvido | Admin, Super Admin | comentário obrigatório |
| `adiamento_solicitado` | aberto, em_andamento | adiamento_solicitado | Roçador | motivo; detalhe e data sugerida opcionais |
| `adiamento_aceito` | adiamento_solicitado | `status_anterior` | Admin, Super Admin | nova data (grava `agendamentos.data_sugerida`) |
| `adiamento_recusado` | adiamento_solicitado | `status_anterior` | Admin, Super Admin | resposta opcional |
| `encerrado_admin` | aberto, em_andamento, devolvido, adiamento_solicitado | concluido (`sem_evidencia`) | Admin, Super Admin | data da execução e observação obrigatória |
| `cancelado` | qualquer não terminal | cancelado | Admin, Super Admin (descartar na agenda) ou lote | motivo |
| `fora_de_ordem` | terminal | inalterado | qualquer origem campo | grava o evento recebido e notifica os admins |

A máquina vive duas vezes, de propósito: em `src/lib/chamados/maquina.ts` (função pura, testada,
que a UI usa para mostrar só os botões válidos) e dentro de `ia.registrar_evento_chamado`, que é
quem manda. Um evento cujo `evento_id` já existe devolve o chamado atual sem alterar nada.

### Funções SQL (tudo ou nada)

```sql
ia.registrar_evento_chamado(p_chamado_id bigint, p_evento_id uuid, p_tipo text, p_autor uuid,
                            p_origem text, p_payload jsonb, p_ocorrido_em timestamptz)
  returns ia.chamados
ia.aprovar_chamado(p_chamado_id bigint, p_autor uuid, p_km_rocados numeric, p_custo_reais numeric,
                   p_observacao text) returns bigint          -- id da execução
ia.encerrar_chamado_admin(p_chamado_id bigint, p_autor uuid, p_data_execucao date,
                          p_altura_depois_cm numeric, p_observacao text) returns bigint
ia.decidir_adiamento(p_adiamento_id bigint, p_autor uuid, p_aceito boolean, p_nova_data date,
                     p_resposta text) returns ia.chamados
```

`aprovar_chamado`, na ordem: valida status `aguardando_aprovacao` e `altura_final_cm`; insere
`ia.execucoes` (`agendamento_id`, `trecho_id`, `equipe_id`, `data_execucao = finalizado_em` em
Brasília, `km_rocados`, `altura_antes_cm = altura_inicial_cm`, `altura_depois_cm =
altura_final_cm`, `custo_reais`, `observacao`); insere `ia.medicoes` (`data = data_execucao`,
`altura_cm = altura_final_cm`); `update agendamentos set status = 'executado'` (o gatilho vê o
chamado já `concluido` e não age); atualiza o chamado; insere evento `aprovado`; cria notificação
para o líder. A action `aprovarChamado` chama a função e, em seguida, `enfileirarAnalise(trecho)`,
a menos que o admin desmarque "reanalisar o trecho" no formulário. Se o GitHub recusar (já há
execução em voo), o chamado continua aprovado e a tela avisa.

Todas as funções são `security definer`, `set search_path = ''`, com `revoke execute` de `anon`,
`authenticated` e `public`. O painel as chama por `db.rpc(...)` com a chave secreta.

### Lote

`fechar_obsoletos` passa a receber o chamado do agendamento aprovado:

- chamado em `em_andamento`, `aguardando_aprovacao`, `devolvido` ou `adiamento_solicitado`: **não
  toca**, imprime `[chamado ativo]`;
- chamado `aberto` sem evento além de `criado` e `data_sugerida < hoje - 7`: descarta o
  agendamento (o gatilho cancela o chamado com motivo `vencido sem atividade há 7 dias`, origem
  `lote`);
- chamado `aberto` vencido há menos de 7 dias: não toca; o painel mostra "atrasado".

`sugerido` continua sendo fechado como hoje. `LIMIAR_DIAS` e `LIMIAR_FECHAR_DIAS` não mudam.

### View

`ia.vw_trecho_status` ganha `chamado_id`, `chamado_numero`, `chamado_status` (do chamado do
agendamento aberto). O tipo `TrechoStatus` recebe os três campos; o smoke test também.

### Tela `/chamados`

- **Fila de decisão**, três blocos com contagem e os cartões mais urgentes: *Aguardando aprovação*
  (por `finalizado_em`), *Adiamento pedido* (por `solicitado_em`), *Atrasados* (`aberto` com
  `data_sugerida < hoje`, por atraso). Bloco vazio mostra a frase "Nada esperando você" em vez de
  sumir.
- **Lista** com filtros na URL (`?status=`, `?equipe=`, `?rodovia=`, `?de=`, `?ate=`, `?busca=`),
  ordenada por urgência e depois por data; colunas: número, trecho (rodovia e faixa de km), equipe
  e líder, data prevista, estado (chip com ícone), última atividade. Estado na URL via `nuqs`.
- **Gaveta** `?chamado=<id>`: cabeçalho com número, estado e trecho; linha do tempo
  (`chamado_eventos`, autor, origem, hora do aparelho e do servidor quando divergem em mais de 5
  minutos); fotos antes e depois lado a lado com hora, distância do GPS ao ponto médio do trecho
  e precisão; dados de altura (inicial com origem, final); ações do estado atual: aprovar (com
  km e custo), devolver (com comentário), decidir adiamento (com data), encerrar
  administrativamente, cancelar. Ver fotos abre em tamanho cheio.
- **Novo chamado**: a gaveta `PainelNovaRocada` ganha campo opcional "altura atual (cm)" e passa a
  ser usada também aqui. `criarRocadaManual` aceita `alturaInicialCm` e, depois do insert, grava
  `altura_inicial_cm`/`origem = 'informada'` no chamado que o gatilho criou.
- **Agenda e trecho**: cartão do quadro ganha o número e o chip de estado do chamado; a gaveta do
  agendamento ganha link "abrir chamado"; a página do trecho mostra o chamado atual no card de
  decisão. O botão "Marcar como executada" da agenda vira "Encerrar administrativamente" e abre
  o formulário com data e observação.

Vocabulário em `dominio.ts`: `STATUS_CHAMADO` (rótulo, ícone, tinta, fundo) e `MOTIVO_ADIAMENTO`
(rótulo). Chips sempre com ícone e rótulo.

### Sino

`ia.notificacoes` é gravada dentro das funções SQL: `finalizado` e `adiamento_solicitado` notificam
todos os Admin e Super Admin ativos; `criado`, `remarcado`, `equipe_alterada`, `devolvido`,
`adiamento_aceito`, `adiamento_recusado` e `cancelado` notificam o líder da equipe. O `Shell` lê
a contagem de não lidas da sessão; o ícone `Bell` na barra superior abre uma lista com marcar
como lida e link. Em `/campo`, o topo mostra a mesma contagem, vinda da API de estado.

### Seed de demonstração

`npm run semear:demonstracao` (idempotente, marca tudo com `payload.demo = true` e e-mails
`@demo.highwai.com.br`): usuários `super.demo`, `admin.demo`, `analista.demo` e um `lider.NN.demo`
por equipe, senha única lida de `SEED_SENHA` (padrão impressa); chamados em cada um dos sete
estados sobre trechos distintos, com 4 fotos JPEG de exemplo (`web/scripts/fixtures/`) enviadas
ao bucket; um adiamento pendente; um atrasado. `npm run semear:demonstracao -- --limpar` remove.

---

## §3 · App de campo

### Onde vive e por que abre sem sinal

Grupo `(campo)`, rota `/campo`, página **cliente pura**: o servidor entrega só a casca. Como nada
lê cookie na renderização, o HTML é estático e entra no precache do service worker; abrir a frio,
sem rede, funciona. A autenticação da rota é feita pelo proxy (redireciona para `/entrar` sem
sessão) e, para os dados, pela API. Sem rede o proxy não roda, o service worker serve a casca e a
página lê o IndexedDB, que só tem dados de quem fez login. `sair` apaga IndexedDB e caches.

Layout do grupo: tela cheia, tema escuro forçado (`data-theme="dark"` no wrapper, com a paleta
existente), botões de 56 px, tipografia um passo maior, sem barra lateral. `<SerwistProvider
swUrl="/serwist/sw.js">` registra o service worker.

### Service worker

`@serwist/turbopack` (devDependency, junto com `esbuild`): `next.config.ts` envolve a config com
`withSerwist`; route handler `src/app/serwist/[path]/route.ts` com `createSerwistRoute({ swSrc:
"src/app/sw.ts", useNativeEsbuild: true, additionalPrecacheEntries: [{ url: "/campo", revision }] })`;
`src/app/sw.ts` com `precacheEntries: self.__SW_MANIFEST`, `defaultCache` de
`@serwist/turbopack/worker`, `fallbacks` apontando navegações sob `/campo` para a casca
precacheada, e um ouvinte de `sync` com a tag `campo-sincronizar` que acorda a fila. O proxy
ignora `/serwist/`. Plano B, se o pacote falhar no build até sábado meio-dia: service worker
manual em `public/sw.js` com precache da casca e dos chunks listados por um script pós-build.
Aviso da doc: "Test this feature with `next build && next start`. Dev mode is not a reliable
reference".

### Dados locais

`idb` (dependência de runtime, 1 KB). Banco `highwai-campo`, versão 1, stores:

| Store | Chave | Conteúdo |
|---|---|---|
| `estado` | `"atual"` | snapshot de `/api/campo/estado`: chamados da equipe, trechos, equipe, líder, pendências, `sincronizadoEm` |
| `fila` | `evento_id` | eventos pendentes: `{ evento_id, chamado_id, tipo, payload, ocorrido_em, fotos: string[], tentativas, ultimo_erro }` |
| `fotos` | `foto_id` | `{ foto_id, evento_id, chamado_id, etapa, papel, blob, largura, altura, bytes, latitude, longitude, precisao_m, capturada_em, enviada: boolean, caminho? }` |

### Captura e compressão

`<input type="file" accept="image/*" capture="environment">` abre a câmera nativa e funciona
offline. `src/lib/campo/imagem.ts`: `createImageBitmap` → canvas → `toBlob("image/jpeg", 0.82)` com
o lado maior em 1600 px (`dimensoesReduzidas`, pura e testada). GPS por
`navigator.geolocation.getCurrentPosition` no momento da captura, com `enableHighAccuracy`, 8 s de
limite; sem GPS a foto entra com latitude nula e a tela avisa. Hora da captura = relógio do
aparelho; o servidor grava `enviada_em` e, no evento, `registrado_em`.

### Sincronização

`src/lib/campo/sincronizar.ts`, disparada (a) ao abrir o app, (b) no evento `online`, (c) pelo
`sync` do service worker quando disponível, (d) pelo botão "Enviar agora". Ordem por evento, na
ordem da fila: fotos do evento (uma requisição multipart cada, até 3 tentativas com espera
exponencial) e depois o evento. Um evento só sai da fila depois do `200` do servidor; `409` (fora
de ordem) também retira da fila e marca o item como "registrado fora de ordem". Falha de rede
mantém na fila com `tentativas + 1`. `estado` é rebaixado depois de cada lote enviado.

Indicador permanente no topo: "Tudo enviado", "N pendentes de envio", "Sem sinal, guardando no
aparelho", com o botão "Enviar agora" quando há pendências e rede. Cada cartão de chamado mostra
o selo "aguardando envio" enquanto tiver evento seu na fila.

### API do campo

Todas em `src/app/api/campo/`, exigem `obterSessao()`; Roçador só enxerga a própria equipe; Admin e
Super Admin passam `?equipe=<id>`. Respostas JSON em português, erros `{ erro: string }`.

| Rota | Método | Corpo | Resposta |
|---|---|---|---|
| `/api/campo/estado` | GET | `?equipe=` opcional | `{ equipe, lider, chamados: ChamadoCampo[], trechos: TrechoCampo[], notificacoesNaoLidas, servidorEm }`; chamados em estados não terminais mais os concluídos dos últimos 7 dias |
| `/api/campo/fotos` | POST multipart | `arquivo` (jpeg ≤ 2 MB), `chamado_id`, `evento_id`, `etapa`, `papel`, `largura_px`, `altura_px`, `latitude?`, `longitude?`, `precisao_m?`, `capturada_em` | `201 { id, caminho }`; idempotente por (`evento_id`, `papel`, `capturada_em`) |
| `/api/campo/eventos` | POST JSON | `{ eventos: [{ evento_id, chamado_id, tipo, payload, ocorrido_em }] }` | `200 { resultados: [{ evento_id, situacao: "aplicado" | "repetido" | "fora_de_ordem" | "recusado", erro?, chamado? }] }` |
| `/api/fotos/[id]` | GET | — | `302` para URL assinada de 60 s no bucket, ou `403` |

`registrar_evento_chamado` exige, para `iniciado` e `finalizado`, pelo menos as duas fotos
nomeadas com o mesmo `evento_id` já em `chamado_fotos`; por isso as fotos sobem antes. Um evento
para chamado terminal é gravado como `fora_de_ordem` e responde `409` com `situacao:
"fora_de_ordem"`, sem lançar erro.

### Telas do campo

1. **Lista**: cabeçalho com nome da equipe, líder, sino e indicador de sincronização; grupos
   *Hoje*, *Atrasados*, *Próximos*, *Aguardando aprovação*, *Concluídos recentes*; cartão com
   número, rodovia e km, data, estado, altura inicial e selo de envio pendente.
2. **Detalhe**: trecho (rodovia, faixa, sentido, extensão, espécie, limite), altura inicial com a
   frase "informada pelo gestor" ou "prevista pelo modelo", observações do trecho, motivo do
   agendamento, linha do tempo resumida, e o botão do próximo passo (Iniciar, Finalizar, ou o
   estado de espera). "Pedir adiamento" fica como ação secundária em `aberto` e `em_andamento`.
3. **Iniciar**: dois quadros de foto obrigatórios com nome ("Medida do mato, com a régua",
   "Extensão do trecho"), até 4 extras, revisão e "Registrar início".
4. **Finalizar**: dois quadros ("Como ficou", "Extensão do trecho"), extras, campo "Altura final em
   cm" (teclado numérico, vírgula aceita), revisão e "Enviar para aprovação".
5. **Adiar**: lista de motivos, detalhe, data sugerida, "Pedir adiamento".
6. **Devolvido**: mostra o comentário do gestor no topo do detalhe e reabre "Finalizar".

Textos curtos, sem jargão, confirmação em uma tela de revisão antes de gravar. Cada gravação
mostra "Guardado no aparelho" ou "Enviado", nunca um spinner sem palavra.

### APK

1. `src/app/manifest.ts`: `name: "HighwAI Campo"`, `short_name: "Campo"`, `start_url: "/campo"`,
   `scope: "/"`, `display: "standalone"`, `background_color` e `theme_color` `#0a0d0c`, ícones
   192, 512 e 512 maskable em `public/icones/` (PNG gerados de um SVG por script).
2. Deploy em produção (`vercel --prod` sobre `git archive`, como já é feito) e Lighthouse "PWA
   instalável" verde.
3. PWABuilder (pwabuilder.com) com a URL de produção → pacote Android: id `br.com.highwai.campo`,
   nome "HighwAI Campo", "Create new signing key", display standalone. O zip traz o APK assinado, o
   AAB, `assetlinks.json`, a keystore e o arquivo com as senhas. Keystore e senhas ficam **fora do
   repositório**, no cofre de senhas do Enzo; sem eles não há atualização do APK.
4. `assetlinks.json` vai para `web/public/.well-known/assetlinks.json` e o painel é redeployado; a
   verificação de propriedade é o que tira a barra do Chrome. Funciona em domínio vercel.app;
   trocar de domínio depois exige APK novo.
5. APK publicado em GitHub Releases (`campo-v0.1.0.apk` + SHA-256). `/usuarios` e `/campo`
   mostram QR code (gerado no servidor como SVG, sem dependência) e as instruções de "instalar de
   fonte desconhecida".

Corte mínimo: se o TWA não sair a tempo, a demonstração usa "Adicionar à tela inicial" do Chrome,
que instala a mesma PWA.

---

## §4 · Sino, roteiro e verificação

### Roteiro da demonstração (domingo)

Contas do seed; celular Android com o APK instalado e já logado como líder da equipe do trecho
escolhido; navegador com o painel.

1. **Entrar** como `admin.demo`. Painel abre; lateral mostra Chamados e Usuários; Laboratório não.
2. **Usuários**: convidar um e-mail real (o do Enzo) como Analista; mostrar o e-mail do Resend e o
   link copiável; abrir o link em aba anônima, definir nome e senha, entrar como Analista: telas
   sem botões de ação, aviso "somente leitura", tentativa de acessar `/chamados` cai em
   `/sem-acesso`.
3. **Agenda**, como admin: aprovar uma sugestão da IA com equipe. Abrir `/chamados`: o chamado
   nasceu com número, altura prevista, estado aberto.
4. **Celular em modo avião**: abrir o app, o chamado está lá; Iniciar com duas fotos; Finalizar com
   duas fotos e altura final; indicador "4 pendentes de envio, sem sinal".
5. **Sair do modo avião**: sincroniza sozinho; no painel, o chamado passa a "aguardando aprovação"
   e o sino do admin conta 1.
6. **Aprovar** na gaveta: fotos antes e depois lado a lado; km pré-preenchido; confirmar. Página do
   trecho mostra a execução, a medição nova e "reanálise em andamento".
7. **Adiamento**: em outro chamado, o celular pede adiamento por chuva com data; o painel mostra
   na fila; admin aceita e a agenda move o cartão.
8. **Encerrar administrativamente** um terceiro chamado, mostrando a observação obrigatória e a
   marca "sem evidência" na linha do tempo.
9. Fechar com `/usuarios`: QR code do APK.

### Verificação

- **Funções puras com teste** (`vitest`): `permissoes.ts` (matriz completa, quem convida quem,
  regras de alteração), `chamados/maquina.ts` (toda transição válida e inválida), `campo/fila.ts`
  (ordem, idempotência, marcação fora de ordem), `campo/imagem.ts` (`dimensoesReduzidas`),
  `auth/tokens.ts` (validade, hash), `chamados/numero.ts` (formato).
- **Smoke** (`scripts/fumaca.mjs`): tabelas novas, view com colunas de chamado, bucket existe e é
  privado, chave publishável **não** lê `ia.trechos`.
- **Roteiro no Chrome**, por cargo, tema claro e escuro, larguras 390 e 1280: login, telas
  permitidas e negadas, ações ausentes para Analista, fluxo de chamado ponta a ponta com o
  DevTools em "Offline" para o campo.
- **Roteiro no Android**: instalar APK, entrar, modo avião, iniciar com fotos reais, finalizar,
  voltar o sinal, ver a sincronização, aprovar no painel. Repetir com o app fechado durante o
  retorno do sinal para exercitar o Background Sync.
- `npm run verificar` verde ao fim de cada tarefa que toque em `web/`.

### Riscos e sinais

| Risco | Sinal | Saída |
|---|---|---|
| Disco E: perde escrita | arquivo com tamanho certo e bytes NUL; `esbuild`/`node` "não é aplicativo válido" | conferência byte a byte, push por tarefa, clone C: como reserva |
| `@serwist/turbopack` falha no build ou não precacheia `/campo` | `next build` erra ou `/campo` offline dá página do Chrome | plano B: `public/sw.js` manual |
| Foto acima de 4,5 MB na Vercel | `413` na rota de fotos | compressão a 1600 px já deixa em ~400 KB; limite de 2 MB no bucket |
| Relógio do aparelho errado | `ocorrido_em` muito distante de `registrado_em` | a linha do tempo mostra as duas horas; `data_execucao` sai do servidor |
| Deploy Git→Vercel mudo | commit no GitHub sem deploy | `vercel --prod` sobre `git archive`, conferir `list_deployments` |
| Resend em modo de teste | e-mail para outro endereço volta erro | link copiável na tela; domínio depois |
| Sessão expirada offline | ao voltar o sinal a API responde `401` | o app mostra "entre de novo" e mantém a fila; login refaz o envio |
| Proxy com matcher errado bloqueia estáticos ou o SW | ícones ou `/serwist/sw.js` redirecionam para `/entrar` | matcher exclui `_next`, `serwist`, `.well-known`, `manifest`, `icones` |

### LGPD, em uma nota

Dados pessoais tratados: nome, e-mail, cargo, e localização e hora de fotos de trabalho tiradas
pelo líder da equipe em via pública. Base: execução de contrato de trabalho e interesse legítimo
da concessionária. Acesso restrito por cargo; fotos em bucket privado com URL de 60 s; desativação
preserva histórico operacional e bloqueia acesso. Retenção: indefinida nesta versão, a decidir com
a Motiva.

### Fora de escopo agora

MFA, SSO, e-mail de aviso, Web Push, políticas RLS por cargo, leitura direta do Supabase pelo
cliente, iPhone, Play Store, CSP, migração de `unstable_cache` para `use cache`, autenticação no
`main.py` (continua sendo ferramenta local; a nota no CLAUDE.md passa a dizer que ele **não pode
ser publicado**).
