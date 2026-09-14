# Preparação para os dados reais do Rodoanel — o que só você faz

Lista das tarefas manuais que precisam estar prontas **antes** de o agente começar o plano
`docs/superpowers/plans/2026-09-13-dados-reais-rodoanel.md`. Escrita para quem opera, não para
quem programa. Cada item diz por que existe, quanto tempo leva e como conferir que ficou pronto.

O agente confere tudo isto na Tarefa 0 com `pesquisa/verificar_preparacao.sh` e **para** se algo
bloqueante faltar.

**Estado em 14/09/2026: as três tarefas (13, 14 e 15/09) já rodaram e o painel está em produção
com os dados reais.** Os itens abaixo, marcados **Feito**, são o registro do que foi preparado
antes de começar — mantidos para quem precisar repetir o processo (outra rodovia, outra máquina).

---

## A · Bloqueia o início (cerca de 1h30, nesta ordem)

### A1 · As duas chaves do sistema em arquivos locais (20 min) — **Feito em 13/09/2026**

O painel e o lote leem credenciais de arquivos que ficam **fora do Git** e não existem nesta máquina.

**`web/.env.local`** — copie `web/.env.example` e preencha as 13 variáveis. Onde achar cada uma:

| Variável | Onde achar |
|---|---|
| `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL (é `https://mbkcygsqfcxxcmvkuqyt.supabase.co`) |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API → `service_role` (legacy). Segredo: nunca no navegador |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → `sb_secret_…` (pode ficar vazia) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | mesmo lugar, a chave `sb_publishable_…` (ou a `anon`) |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | platform.openai.com → API keys; modelo `gpt-5.4-mini` |
| `GITHUB_TOKEN`, `GITHUB_REPO` | GitHub → Settings → Developer settings → Fine-grained token com Actions: Read and write no repositório `Moreettoo/motiva` |
| `RESEND_API_KEY`, `EMAIL_REMETENTE` | resend.com → API Keys; remetente `HighwAI <avisos@highwai.pro>` |
| `APP_URL` | `https://motiva-highwai.vercel.app` (sem barra no fim) |
| `CONVITE_VALIDADE_DIAS` | `7` |
| `SEED_SENHA` | qualquer senha com 10+ caracteres. Só o script de limpar o seed usa |

Dica: a Vercel guarda as mesmas 13. Depois do item A5, `cd web && vercel env pull .env.local --environment=production` puxa as não sensíveis; as sensíveis voltam como `[SENSITIVE]` e você cola à mão.

**`.env` na raiz** (para o lote e para a pesquisa). A cópia antiga em `~/motiva/motiva/.env` tem 5 variáveis que provavelmente ainda valem; copie e complete:

```
SUPABASE_URL=https://mbkcygsqfcxxcmvkuqyt.supabase.co
SUPABASE_SERVICE_KEY=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.4-mini
DB_SCHEMA=ia
SUPABASE_DB_URL=postgresql://postgres.mbkcygsqfcxxcmvkuqyt:SENHA@aws-0-us-east-2.pooler.supabase.com:5432/postgres
GEE_PROJECT=...
```

`SUPABASE_DB_URL` e `GEE_PROJECT` vêm dos itens A2 e A4.

Conferir: `grep -c "=" web/.env.local` dá 13 ou mais; `grep -c "=" .env` dá 7.

### A2 · A senha do banco e a cópia de segurança (15 min) — **Feito em 13/09/2026** (backup em `~/motiva-backups/`, refeito antes de cada migração)

Antes de qualquer mudança no banco de produção, fazemos uma cópia. Ela é feita com uma ferramenta que já está instalada nesta máquina (`pg_dump` 18.4), sem Docker.

1. Supabase → Project Settings → Database. Se você não sabe a senha do banco, clique em **Reset database password** e guarde a nova no cofre de senhas.
2. No mesmo painel, botão **Connect** → aba **Session pooler** → copie a URI. Ela tem a forma
   `postgresql://postgres.mbkcygsqfcxxcmvkuqyt:[YOUR-PASSWORD]@aws-0-us-east-2.pooler.supabase.com:5432/postgres`
   (a região é a que o painel mostrar; neste projeto é `us-east-2`).
   Troque `[YOUR-PASSWORD]` pela senha, **sem os colchetes**, e cole em `SUPABASE_DB_URL=` no `.env` da raiz, com o nome da variável na frente. (O pooler é usado porque a conexão direta exige IPv6, que a maioria das redes domésticas não tem.)
3. Rode, na raiz do projeto:

```bash
set -a; source .env; set +a
mkdir -p ~/motiva-backups
/usr/local/opt/libpq/bin/pg_dump "$SUPABASE_DB_URL" --schema=ia --schema=public --no-owner --no-privileges -s -f ~/motiva-backups/$(date +%F)-esquema.sql
/usr/local/opt/libpq/bin/pg_dump "$SUPABASE_DB_URL" --schema=ia --schema=public --no-owner --no-privileges -a -f ~/motiva-backups/$(date +%F)-dados.sql
ls -la ~/motiva-backups
```

Conferir: dois arquivos; o de dados com alguns MB. `connection to server on socket "/tmp/.s.PGSQL.5432"` significa que a variável não carregou (nome errado ou linha grudada na anterior). `password authentication failed` significa senha errada ou colchetes sobrando: refaça o passo 1 e gere uma senha só com letras e números. Se der `could not translate host name`, sua rede está sem internet ou a URI está errada.

### A3 · Acesso do agente ao banco para aplicar as migrações (10 min) — **Feito em 13/09/2026** (opção 2: `psql` com `SUPABASE_DB_URL`, sem MCP)

Duas opções; a primeira é a que o projeto sempre usou.

**Opção 1, MCP do Supabase apontado para o projeto certo.** O MCP desta máquina está logado numa conta que não vê o HighwAI. Crie um token na conta dona do projeto (supabase.com/dashboard/account/tokens → Generate new token, nome `claude-highwai`) e registre um servidor MCP dedicado:

```bash
claude mcp add supabase-highwai -e SUPABASE_ACCESS_TOKEN=SEU_TOKEN -- npx -y @supabase/mcp-server-supabase@latest --project-ref mbkcygsqfcxxcmvkuqyt
```

Depois, numa sessão nova do Claude Code, `/mcp` mostra `supabase-highwai` conectado.

**Opção 2, sem MCP.** Nada a fazer além do item A2: com `SUPABASE_DB_URL` no `.env`, o agente aplica as migrações com `psql`, que já está instalado.

### A4 · Google Earth Engine (15 min, o único item que só um humano consegue fazer) — **Feito em 13/09/2026**

É o satélite. Gratuito para uso acadêmico. Use a conta Google pessoal ou da FIAP, **não** a corporativa (as regras do plano gratuito proíbem registrar como trabalho da empresa empregadora).

1. Abra <https://console.cloud.google.com/earth-engine/configuration> e faça login.
2. "Get started" → uso **não pago** → tipo **Academia & Research** → preencha o formulário (trabalho acadêmico da FIAP, monitoramento de vegetação em rodovia).
3. Escolha o tier **Community**. Não escolha Contributor (exige cartão) nem Partner (revisão manual).
4. Anote o **ID do projeto Cloud** que aparece (algo como `ee-seunome`). Cole em `GEE_PROJECT=` no `.env` da raiz.
5. Na raiz do projeto, com o venv criado (item A6):

```bash
.venv/bin/pip install earthengine-api
.venv/bin/earthengine authenticate
```

Abre o navegador, você autoriza, volta para o terminal. Conferir:

```bash
set -a; source .env; set +a
.venv/bin/python -c "import ee, os; ee.Initialize(project=os.environ['GEE_PROJECT']); print('GEE ok', ee.Number(1).getInfo())"
```

### A5 · Vercel CLI logado (5 min) — **Feito em 13/09/2026** (usado no deploy manual da Tarefa 19 e nos seguintes)

O deploy é manual neste projeto (o gatilho do Git está mudo). Instale e entre:

```bash
npm i -g vercel
vercel login
vercel whoami
```

Conferir: `vercel whoami` mostra seu usuário. O arquivo `.vercel/project.json` já existe na raiz e liga ao projeto certo.

### A6 · Dependências que demoram (10 min, o agente também sabe fazer) — **Feito em 13/09/2026**

Fazer antes economiza a espera no meio do plano. Use o **Python 3.12 do Homebrew**, o mesmo do GitHub Actions: o 3.14 do sistema não instala o `pydantic-core` fixado (sem wheel, tenta compilar em Rust e falha com centenas de linhas).

```bash
cd /Users/enzomoretto/Desktop/motiva/motiva
rm -rf .venv
/usr/local/opt/python@3.12/bin/python3.12 -m venv .venv
.venv/bin/pip install -U pip
.venv/bin/pip install -r docs/requirements.txt pytest openpyxl pandas earthengine-api
cd web && npm install && cd ..
```

Se `docs/requirements.txt` já tiver virado `ml/requirements.txt` (a Tarefa 1 move), use esse caminho.

### A7 · Não commitar a movimentação atual (1 min) — **Feito em 13/09/2026** (organizada na Tarefa 1, `git mv` para `ml/`)

`git status` mostra os arquivos Python apagados da raiz e copiados em `docs/`. **Deixe assim.** A primeira tarefa do agente organiza isso em uma pasta `ml/` e conserta o workflow do GitHub, que hoje espera os arquivos na raiz. Um commit da movimentação como está quebraria a rodada das 06:00.

---

## B · Banco de dados local — o que é e como usar, para quem nunca usou

Você não precisa instalar nenhum servidor de banco de dados. São dois usos diferentes:

### B1 · O banco da pesquisa é um arquivo (SQLite)

`pesquisa/rodoanel.sqlite` é um arquivo que se comporta como um banco de dados: tabelas, consultas, tudo dentro dele. O agente cria e preenche sozinho. Para você **olhar** o que está lá dentro:

**Pelo terminal** (a ferramenta `sqlite3` já vem no macOS):

```bash
sqlite3 pesquisa/rodoanel.sqlite
.tables                                   # lista as tabelas
select transicao, count(*) from pares group by 1;   # 33 cresceram, 53 rocados, 162 estaveis
select * from segmentos limit 5;
.quit
```

**Com uma tela** (recomendado para quem prefere clicar): instale o DB Browser for SQLite e abra o arquivo.

```bash
brew install --cask db-browser-for-sqlite
```

Depois: Abrir banco de dados → `pesquisa/rodoanel.sqlite` → aba "Navegar dados". É uma planilha com abas.

O arquivo é regenerável: apagou, `python -m pesquisa.consolidar` refaz. Por isso ele não vai para o Git; os CSV em `pesquisa/dados/derivados/` vão, e são o registro.

### B2 · O banco do produto continua no Supabase

Nada muda no jeito de usar o painel. As migrações são aplicadas por você (item A3) ou pelo agente com sua chave, sempre depois da cópia de segurança do item A2.

### B3 · Opcional: uma cópia local do banco de produção para ensaiar (20 min, 2 GB de download)

Só vale se você quiser ver as migrações rodando numa cópia antes da produção. Requer o Docker Desktop, que está instalado mas parado.

1. Abra o Docker Desktop (Aplicativos) e espere o ícone ficar verde.
2. Na raiz do projeto: `supabase init` (cria `supabase/config.toml`; responda "N" para as perguntas de IDE) e depois `supabase start`. A primeira vez baixa as imagens.
3. `supabase status -o env` mostra a `DB_URL` local (porta 54322). Carregue a cópia de segurança nela:

```bash
/usr/local/opt/libpq/bin/psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f ~/motiva-backups/$(date +%F)-esquema.sql
/usr/local/opt/libpq/bin/psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f ~/motiva-backups/$(date +%F)-dados.sql
```

4. Agora qualquer migração pode ser testada com `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/ARQUIVO.sql` antes de ir para a produção. `supabase stop` desliga tudo.

Se der erro ao carregar o esquema por causa de tipos do Auth, ignore as linhas de erro que mencionem `auth.` e siga: as tabelas do schema `ia` entram.

---

## C · Decisões que só você toma (confirme ou mude; sem resposta, valem os padrões)

| # | Decisão | Padrão que o plano usa | Onde muda |
|---|---|---|---|
| C1 | Tempo de mobilização da equipe, em dias, descontado da data de cruzar 30 cm | **7** | `ia.concessionarias.mobilizacao_dias` (migração 2) |
| C2 | Altura assumida para a classe 3 ("acima de 30 cm") | **40 cm** (testa 35 e 50) | `pesquisa/validar.py` |
| C3 | Nome, cidade-base e capacidade da equipe do Rodoanel | **Equipe Roçada RodoAnel 01, Barueri, 6 km/dia** | migração 2 |
| C4 | O que fazer com as 10 equipes abstratas da demonstração | **desativar** (ficam no histórico) | migração 2 |
| C5 | O simulador continua visível no menu do Super Admin | **sim** | nada |
| C6 | Conta Google para o GEE | pessoal ou FIAP, **não** corporativa | item A4 |
| C7 | Data da apresentação | **16/09/2026** | `docs/pesquisa/00-diario.md` — mantida; deploy final e relatório fechados em 14/09/2026 |

---

## D · Durante os três dias, o que volta para você

| Quando | O que | Por quê |
|---|---|---|
| Dia 1, antes da Tarefa 11 | Confirmar que a cópia de segurança existe (`ls ~/motiva-backups`) | Nenhuma migração roda sem ela |
| Dia 1, Tarefa 11 e 12 | Se escolheu a opção 2 do item A3, nada; se a opção 1, o MCP precisa estar conectado na sessão | É por ele que a migração é aplicada |
| Dia 2, Tarefa 19 | Estar logado na Vercel (`vercel whoami`) e olhar o painel publicado nos cinco cheques | O deploy é manual |
| Todos os dias, ~06:10 | Abrir a aba Actions do GitHub e ver se a rodada "Reanalise da malha" ficou verde | O lote roda em cima do banco que mudou |
| Dia 3 | Ler `docs/relatorio-motiva.md` e `docs/pesquisa/02-validacao.md` antes de montar os slides | Os números da apresentação saem dali |

---

## E · Conferência final antes de chamar o agente

```bash
cd /Users/enzomoretto/Desktop/motiva/motiva
test -f web/.env.local && echo "OK web/.env.local" || echo "FALTA web/.env.local"
test -f .env && echo "OK .env" || echo "FALTA .env"
ls ~/motiva-backups/*.sql >/dev/null 2>&1 && echo "OK backup" || echo "FALTA backup"
vercel whoami >/dev/null 2>&1 && echo "OK vercel" || echo "FALTA vercel login"
test -d web/node_modules && echo "OK node_modules" || echo "FALTA npm install"
.venv/bin/python --version 2>/dev/null | grep -q " 3.12." && echo "OK venv 3.12" || echo "FALTA venv com Python 3.12"
grep -q "^GEE_PROJECT=." .env && echo "OK GEE_PROJECT" || echo "FALTA GEE_PROJECT (bloqueia so o satelite)"
```

Tudo `OK`: abra o Claude Code com o Opus na pasta do projeto e diga: *"Execute o plano `docs/superpowers/plans/2026-09-13-dados-reais-rodoanel.md` com subagent-driven-development, começando pela Tarefa 0. A spec está em `docs/superpowers/specs/2026-09-13-dados-reais-rodoanel-design.md`."*
