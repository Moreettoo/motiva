# Segurança — o que foi testado, e como refazer o teste

Sete frentes, medidas em **11/09/2026** no banco e no servidor de verdade, dois dias antes da
demonstração. Cada seção diz **o teste que foi feito** e **o que se viu** — não o que o código
promete. Onde nada foi encontrado, está escrito que nada foi encontrado; onde algo foi corrigido,
está escrito o quê.

> **Resumo:** nenhum vazamento de segredo, nenhuma leitura pública do banco, nenhuma rota de API
> aberta. Três coisas foram corrigidas (o `X-Powered-By`, a cobertura do teste de fumaça e o aviso
> no `main.py`) e **duas ficam conhecidas e abertas**: não há CSP, e o `main.py` continua sem
> autenticação — ele não vai ao ar, e isso foi conferido.

---

## a) Os advisors do Supabase

**Teste.** `get_advisors(type: "security")` e `type: "performance"` no projeto, depois das nove
tabelas criadas nesta semana. Como o advisor resume, cada achado foi conferido em SQL direto.

**Segurança — 3 avisos, nenhum novo e nenhum grave:**

| Lint | Nível | O que é |
|---|---|---|
| `rls_enabled_no_policy` (25 tabelas) | INFO | **É o desenho, não o defeito.** RLS ligada sem nenhuma política nega tudo, que é o que se quer: o único caminho até os dados é a chave secreta, no servidor. |
| `extension_in_public` (`btree_gist`) | WARN | A extensão instala ~200 funções de apoio GiST no schema `public`, e elas ficam com `EXECUTE` para `anon`. São funções internas de tipo (`gbt_int4_compress`…): não leem tabela e não devolvem dado do produto. Mover a extensão de schema mexe no índice que a usa — **não fazer antes de 13/09**. |
| `auth_leaked_password_protection` | WARN | Desligado. O Supabase pode checar a senha contra o HaveIBeenPwned no cadastro. É **um clique no painel do Supabase**, não exige migração, e vale ligar — as contas são criadas por convite e ninguém confere a força da senha hoje. |

**Desempenho — 1 lint, 24 achados, todos INFO:** chaves estrangeiras sem índice de cobertura
(`agendamentos.equipe_id`, `chamados.trecho_id`, `convites.*`, `perfis.convidado_por`…). Com 50
trechos e dezenas de chamados nada disso se mede. Vira dívida real quando a malha crescer, não no
domingo.

**Conferência em SQL, porque o advisor resume e um resumo esconde:**

```sql
-- nenhuma tabela de ia ou public sem RLS: devolveu 0 linhas
select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('ia','public') and c.relkind in ('r','p') and c.relrowsecurity = false;

-- nenhum grant para anon/authenticated em tabela ou view: devolveu 0 linhas
select * from information_schema.role_table_grants
where table_schema in ('ia','public') and grantee in ('anon','authenticated','PUBLIC');

-- as 13 funcoes de ia: 0 com EXECUTE para anon/authenticated/PUBLIC, 13 com search_path=''
-- as 2 views de ia: as duas com security_invoker = on
-- storage: as 8 tabelas com RLS ligada e ZERO politicas
```

**Achou algo?** Não. Uma recomendação de baixo custo (ligar a proteção de senha vazada) e duas
dívidas registradas.

---

## b) Segredo no pacote que vai ao navegador

O teste que ninguém tinha feito. **`npm run build`** e depois varredura do que o navegador baixa.

**Teste.** Procura do **prefixo de 20 caracteres** de cada segredo (prefixo, e não o valor inteiro,
para pegar vazamento parcial) em `.next/static` **e** em `.next/server/app` — 277 arquivos —, mais
uma busca por padrão genérico (`sb_secret_`, `sk-proj-`, `github_pat_`, `re_`, `service_role`, e
qualquer coisa com cara de JWT: `eyJ…`).

| Segredo | Resultado |
|---|---|
| `SUPABASE_SERVICE_KEY` (219 chars) | limpo |
| `OPENAI_API_KEY` (164 chars) | limpo |
| `RESEND_API_KEY` (36 chars) | limpo |
| `GITHUB_TOKEN` | **não está no `.env.local` desta máquina** — não testável por valor; coberto pela prova estrutural abaixo |
| `SUPABASE_SECRET_KEY` | idem (o painel ainda usa a `SERVICE_KEY`) |

Nenhum `eyJ…` no pacote do cliente, e nenhum dos padrões genéricos.

**O controle que quase me enganou.** O primeiro roteiro procurava também a chave **publishável** e a
URL pública como *controle positivo* — "se nem isso aparece, a varredura está quebrada". Elas não
apareceram, e a conclusão certa não era "a varredura falhou": é que **o painel nunca cria um cliente
Supabase no navegador**. Toda a autenticação é servidor (`clienteSessao()`), e o `@supabase/supabase-js`
não entra no pacote do cliente. O controle positivo correto é outro — texto de interface — e ele
funciona: `"Roçada"` aparece em 8 arquivos, `"chamado"` em 10. A varredura lê os arquivos; não havia
o que achar.

**A prova estrutural, que cobre os dois segredos sem valor local.** O Next só embute no cliente o que
tem prefixo `NEXT_PUBLIC_`:

- as **únicas** variáveis `NEXT_PUBLIC_` referenciadas no código são `NEXT_PUBLIC_SUPABASE_URL` e
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — as duas públicas por natureza;
- **nenhum** arquivo `"use client"` lê `process.env`;
- os 19 módulos que tocam segredo importam `server-only`, o que transforma um vazamento em erro de
  build.

**Como refazer** (de `web/`, depois de `npm run build`):

```bash
# troque CHAVE pelo nome da variavel; nunca imprima o valor
v=$(grep -E '^SUPABASE_SERVICE_KEY=' .env.local | cut -d= -f2-)
grep -rlF -- "${v:0:20}" .next/static .next/server/app && echo "VAZOU" || echo "limpo"
# controle positivo: prova que o grep esta mesmo lendo os arquivos
grep -rlF -- "Roçada" .next/static | wc -l     # tem que ser > 0
```

**Achou algo?** Não. Confirmado limpo, com controle positivo válido.

---

## c) A chave publishável não lê nada

**Teste.** `npm run fumaca`, estendido nesta onda. Antes ele cobria `ia.trechos` e a leitura de
`ia.chamados`; as nove tabelas da semana de acesso e chamados entraram **depois** daquele teste.

Agora são cinco verificações, e todas exigem o errcode **42501** em vez de "deu algum erro":

| Verificação | Cobre |
|---|---|
| `publishavel nao le nenhuma tabela de ia` | as **15** tabelas, `perfis`, `convites`, `redefinicoes_senha`, `chamado_fotos` e `notificacoes` inclusive |
| `publishavel nao ESCREVE em ia` | `insert`, `update` e `delete` |
| `publishavel nao le a view vw_trecho_status` | a view, que era `SECURITY DEFINER` até 10/09 e por isso contornava o RLS |
| `publishavel nao decide chamado` | `EXECUTE` nas quatro funções de decisão |
| `publishavel nao baixa nem assina foto` | o bucket privado |

**Por que 42501 e não "qualquer erro".** Os dois estados são seguros hoje e significam coisas
diferentes. `42501` é a **ausência de GRANT**, que é o desenho atual (`revoke all from anon,
authenticated`). "Voltou vazio, sem erro" seria grant concedido com o RLS filtrando — ou seja,
**alguém mexeu**. O mesmo vale para as funções: `recusou com P0004` quer dizer que a função
**rodou**, e portanto o `EXECUTE` já teria sido dado.

**O teste foi testado nas duas direções.** Com a chave publishável de verdade, as cinco passam. Com
a chave **secreta** no lugar dela, quatro falham na hora e a quinta falha com
`aprovar_chamado: recusou com P0004, esperado 42501 — a funcao RODOU`. Um teste que não sabe falhar
não prova nada.

> Se um dia o projeto passar a ler do navegador com a chave publishável, estas verificações vão
> falhar. A correção é **reescrevê-las de propósito** — não afrouxá-las para "qualquer erro serve".

**Achou algo?** Não no banco: a chave publishável já estava trancada. O achado foi **no teste**, que
cobria 2 tabelas de 15 e não cobria escrita, view, nem storage.

---

## d) As rotas de API

**Teste.** `npm run build && npx next start -p 3003`, e **curl com cookie de sessão de verdade** —
não leitura de código. Os cookies foram emitidos pelo próprio `@supabase/ssr` (`signInWithPassword`
com uma jarra de cookies falsa), de modo que são exatamente os que o painel aceita. Quatro contas:
`analista.demo`, `lider.1.demo` (lidera a equipe 1), `lider.2.demo` e `admin.demo`.

O alvo: foto **7** pertence ao chamado 14, da **equipe 1**; foto **45** pertence ao chamado 22, da
**equipe 2**.

| Quem | Requisição | Resposta |
|---|---|---|
| sem sessão | `GET /api/campo/estado` | **401** |
| sem sessão | `GET /api/fotos/7` | **401** |
| sem sessão | `POST /api/campo/eventos` | **401** |
| sem sessão | `POST /api/campo/fotos` | **401** |
| analista | `GET /api/campo/estado` | **403** `Seu acesso é somente leitura.` |
| analista | `GET /api/campo/estado?equipe=1` | **403** (o parâmetro não o promove) |
| analista | `GET /api/fotos/7` | **403** |
| analista | `POST /api/campo/eventos` (chamado 14) | 200 com `situacao: "recusado"`, `Seu acesso é somente leitura.` |
| analista | `POST /api/campo/fotos` (chamado 14) | **403** |
| líder da equipe 1 | `GET /api/fotos/7` (da equipe dele) | **302** para `…/storage/v1/object/sign/chamados…` |
| líder da equipe 1 | `GET /api/fotos/45` (**da equipe 2**) | **403** `Sem acesso a esta foto.` |
| líder da equipe 1 | `POST /api/campo/eventos` no chamado **22** | 200 com `recusado`, `Este chamado não é da sua equipe.` |
| líder da equipe 1 | `POST /api/campo/fotos` no chamado **22** | **403** `Este chamado não é da sua equipe.` |
| líder da equipe 1 | `GET /api/campo/estado?equipe=2` e `?equipe=10` | 200, e **sempre a equipe 1** |
| admin | `GET /api/campo/estado` sem `?equipe=` | **400** com a lista de equipes (a tela vira seletor) |
| admin | `GET /api/campo/estado?equipe=2` | 200 |
| admin | `GET /api/fotos/45` | 302 (gestão vê qualquer equipe) |

Dois pontos que merecem leitura atenta, porque **parecem** frouxidão e não são:

- **`POST /api/campo/eventos` responde 200 mesmo recusando.** A situação de cada evento vai no
  corpo. Um `4xx` global faria a fila do aparelho tratar como falha de rede e reenviar para sempre
  um evento que o banco nunca vai aceitar. A autorização acontece **antes** de qualquer escrita
  (`podeAgirNoChamado`), e foi confirmado no banco que os testes acima **não gravaram nada**:
  `ia.chamado_fotos` continuou com 42 linhas.
- **`?equipe=` é ignorado para o Roçador**, e isso foi testado com dois valores diferentes
  (`2` e `10`), não deduzido do código. Se valesse, trocar um número na URL daria a um líder a
  lista de outra equipe.

**Achou algo?** Não. As 18 combinações responderam como a matriz manda.

**O que NÃO foi testado:** a revogação de sessão de uma conta desativada (`ativo = false` deve matar
a sessão na requisição seguinte). Testar exigiria desativar uma conta no banco **compartilhado**, e
não valia o risco a dois dias da demonstração. O código lê `ia.perfis` a cada requisição e devolve
`null` se `ativo` for falso, mas isso é leitura de código, não medição — fica como o único item
desta frente sem prova de campo.

---

## e) O bucket de fotos

**Teste.** Com a chave publishável e com `fetch` anônimo, contra uma foto real do bucket.

| Tentativa | Resultado |
|---|---|
| `list()` no bucket | sem erro, **0 itens** — revela que o bucket existe, **nenhum nome de arquivo** |
| `download(caminho exato)` | bloqueado — `Object not found` (não confirma nem que o arquivo existe) |
| `createSignedUrl(caminho exato)` | bloqueado — `Object not found` |
| `GET /storage/v1/object/public/chamados/<caminho>` | **400** — o bucket não é público |
| URL assinada de 60 s, em **t = 0 s** | **200**, carrega |
| a mesma URL, em **t = 70 s** | **400** — **expirou de verdade** |
| a mesma URL com o token adulterado | **400** |

O bucket é privado, tem `file_size_limit` de 2 MB e aceita só `image/jpeg` — conferido em
`storage.buckets`. As 8 tabelas do schema `storage` têm RLS ligada e **zero políticas**.

O `list()` que responde `[]` em vez de erro é consequência de o RLS **filtrar linhas** em vez de
negar a chamada. Não vaza nome de arquivo, então não é falha — mas é por isso que o teste de fumaça
mira em *baixar* e *assinar*, e não em `list()`.

**Achou algo?** Não. A expiração de 60 s, que era a dúvida real, foi medida esperando o relógio.

---

## f) Cabeçalhos

**Teste.** `curl -D -` contra `npm run start` na porta 3003 — resposta real, HTML e rota de API.

Chegam ao cliente, nas duas: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(self), geolocation=(self), microphone=()` e
`Strict-Transport-Security: max-age=31536000; includeSubDomains` (só em produção, como o
`next.config.ts` define).

**Achado, e corrigido:** vinha também **`X-Powered-By: Next.js`**, no HTML e nas rotas de API. Não é
vulnerabilidade — é entregar de graça qual framework e qual família de CVE tentar primeiro.
`poweredByHeader: false` resolve, e ele é **assado no build**: reiniciar o `next start` não bastou,
o cabeçalho só sumiu depois de `npm run build`.

**O que falta, e fica faltando:** **não há CSP**. É decisão registrada no próprio `next.config.ts` —
o script inline de tema e o Motion exigiriam `nonce`, e não há tempo de medir a regressão antes de
13/09. Sem CSP, um XSS em qualquer tela vira execução de script com a sessão do usuário. O risco é
atenuado por o React escapar tudo por padrão e por não existir `dangerouslySetInnerHTML` de conteúdo
vindo do banco — mas é o buraco conhecido que sobra desta auditoria.

Também ausentes, e de menor peso: `Cross-Origin-Opener-Policy` e `Cross-Origin-Resource-Policy`.

---

## g) O `main.py` não vai ao ar

**O que ele é.** Um FastAPI de desenvolvimento com **três** problemas, cada um bastando sozinho:
nenhuma autenticação em nenhuma rota; `CORSMiddleware` com `allow_origins=["*"]`; e trecho de stack
trace no corpo do erro (`main.py:379`) e em `/diagnostico`. Ele escreve no **mesmo banco** que o
painel lê.

**Teste — o que publica o quê:**

- **não existe** `Dockerfile`, `Procfile`, `vercel.json`, `render.yaml`, `fly.toml` nem `app.yaml`
  em lugar nenhum do repositório;
- **não existe** diretório `api/` na raiz — é dele que a Vercel publicaria função Python;
- o `requirements.txt` está na **raiz**, e a pasta do projeto na Vercel é **`web/`**; não há
  `web/requirements.txt`;
- o **único** workflow do GitHub Actions (`.github/workflows/main.yml`) roda `python analisar_lote.py`,
  nunca `uvicorn`;
- as únicas menções a `uvicorn` fora do próprio arquivo estão em `comandos.txt` e em dois documentos.

**Feito.** Aviso em letras garrafais no topo do `main.py`, dizendo o que ele é, o que não pode
acontecer com ele (Vercel, Render, Railway, Fly, EC2, túnel, `--host 0.0.0.0`) e o que foi conferido.
Mais uma nota no `add_middleware`, porque é ali que alguém tentaria "consertar": **o buraco não é o
CORS**, é a falta de login. Trocar `*` por uma lista de origens restringe o navegador de terceiros e
nunca o `curl` de quem alcança a porta.

**Achou algo?** Não — nada o publica. O que existia era a ausência do aviso, e ela foi corrigida.

---

## O que fica aberto

| # | Item | Risco para 13/09 |
|---|---|---|
| 1 | **Sem CSP** | Médio no papel, baixo na prática: exige um XSS que não existe hoje. É o maior buraco estrutural que sobra. |
| 2 | `main.py` sem autenticação | **Nenhum enquanto não for publicado**, e nada o publica. Vira grave no dia em que alguém subir. |
| 3 | Proteção de senha vazada desligada | Baixo. Um clique no painel do Supabase, sem migração. |
| 4 | `btree_gist` no schema `public` | Baixo. Mexer no schema da extensão antes da demonstração é pior que o aviso. |
| 5 | 24 chaves estrangeiras sem índice | Nenhum nesta escala. |
| 6 | Sessão de conta desativada não medida | Baixo. O código relê `ia.perfis` a cada requisição; falta a prova de campo. |

---

## Refazer tudo, na ordem

```bash
cd web
npm run build          # (b) precisa do pacote pronto
npm run fumaca         # (c) as 5 checagens da chave publishavel
npx next start -p 3003 # (d) e (f) pedem servidor de verdade
```

`npm run verificar` roda tipos, lint, testes, fumaça e build de uma vez — é ele que quebra se
alguém afrouxar as verificações de `scripts/fumaca.mjs`.
