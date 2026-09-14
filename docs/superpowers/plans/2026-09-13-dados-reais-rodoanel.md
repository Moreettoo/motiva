# Dados reais do Rodoanel — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a base fictícia do HighwAI pelos dados reais do Rodoanel Oeste (SP-021): 60 trechos georreferenciados, 248 observações de campo em duas datas, validação do modelo contra elas com número de erro medido e calibração, regra de medição vencida no lote, página `/validacao` no painel, importador do levantamento semanal da Motiva e NDVI Sentinel-2 por segmento validado contra a verdade de campo.

**Architecture:** O pipeline Python de produção sai da raiz para `ml/` sem mudar de comportamento. Um pacote novo `pesquisa/` lê os arquivos da Motiva, consolida em CSV + SQLite, confronta o modelo com os 195 pares sem roçada e grava o resultado no Supabase pelo mesmo caminho que o importador semanal usará. O produto ganha sete tabelas (`faixas`, `levantamentos`, `validacoes`, `validacao_pares`, `calibracoes`, `ndvi_observacoes`, `ndvi_analises`), colunas de origem em `trechos`, `medicoes`, `execucoes` e `previsoes`, e a view passa a mostrar só trecho ativo. O lote aplica o fator de calibração, usa solo por trecho e não prevê sobre medição com mais de 120 dias. O satélite roda em trilha paralela e nunca bloqueia a trilha principal.

**Tech Stack:** Python 3.12 do Homebrew (`/usr/local/opt/python@3.12/bin/python3.12`, o mesmo do GitHub Actions) no venv `.venv` da raiz. O 3.14 do sistema **não serve**: `pydantic-core==2.27.2`, fixado pelo `requirements.txt`, não tem wheel para ele e tenta compilar em Rust. Demais: `openpyxl`, `pytest`, `httpx`, `supabase==2.11.0`, `earthengine-api`, `scipy` (vem com o scikit-learn); Postgres no Supabase (schema `ia`), `pg_dump` 18.4 da libpq local; Next.js 16.3, React 19.2, TypeScript, Tailwind v4, vitest 3; GitHub Actions; Vercel CLI (deploy manual).

**Spec:** `docs/superpowers/specs/2026-09-13-dados-reais-rodoanel-design.md` — leia inteira antes da Tarefa 0. As armadilhas dos arquivos estão em `docs/PLANO_MOTIVA.md` §4. A lista do que só o humano faz está em `docs/operacao/preparacao-dados-reais.md`.

## Global Constraints

- Código, nomes de arquivo, identificadores, comentários e textos de UI em **português do Brasil**. Código Python **sem acentos** em identificadores e comentários (convenção do `ml/`).
- Todo número de relatório sai de JSON produzido por código e é renderizado por `pesquisa/rodoanel/relatorio.py`. Ninguém digita resultado em markdown.
- **Nada de produção é apagado.** Ocultar é `ativo = false`; fechar é `status = 'descartado'`.
- Produção só muda por migração versionada em `supabase/migrations/`, e só depois do backup (`~/motiva-backups/`, Tarefa 11).
- A regra de medição vencida (Tarefa 10) e a migração 1 (Tarefa 11) chegam ao `main` **antes** de `publicar_rodoanel.py` (Tarefa 13) e antes das 06:00 de Brasília do dia seguinte, hora em que o lote roda.
- Tabela nova: RLS ligado, zero políticas, `grant all ... to service_role`.
- O fator de calibração entra **fora** de `web/src/lib/modelo/arvores.ts` e fora de `ml/modelo.py`. Os testes de paridade não mudam.
- Painel: datas e números por `Intl` via `src/lib/format.ts`; "hoje" por `isoHoje()`; nenhum hex fora de `globals.css`; cor de status sempre com ícone e rótulo; toda página de `(painel)` começa por `exigirCargo(...)`; Server Actions devolvem `Resultado<T>` e nunca lançam; queries lançam.
- `npm run verificar` (tipos, lint, testes, fumaça, build) verde ao fim de cada tarefa que toque em `web/`. Roda de `web/` com `web/.env.local` presente.
- `python -m pytest` verde ao fim de cada tarefa que toque em `pesquisa/` ou `ml/`. Roda da raiz, com `.venv` ativo.
- Commit ao fim de cada tarefa, com mensagem no padrão do repositório (`feat(pesquisa): ...`, `fix(lote): ...`, `docs(pesquisa): ...`, sem acentos). Push nas tarefas 1, 11, 15, 19 e 22 no mínimo; push a qualquer hora é seguro porque a Vercel não publica por push.
- Toda tarefa termina com uma linha em `docs/pesquisa/00-diario.md`: `- AAAA-MM-DD HH:MM · Tarefa N · o que rodou · resultado em uma linha · commit abc1234`.

---

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `ml/*.py`, `ml/requirements.txt`, `ml/modelo_gramas.pkl`, `ml/validacao_campo.json`, `ml/previsao_gramas_colab.ipynb`, `ml/comandos.txt` | mover (da raiz, via `git mv`) | Pipeline de produção, intocado em comportamento |
| `ml/modelo.py`, `ml/exportar_modelo.py`, `ml/gerar_fixture_features.py`, `ml/validar_campo.py` | alterar | Caminhos relativos ao arquivo, não ao diretório de trabalho |
| `ml/clima.py` | alterar | `buscar_serie_arquivo()` para janelas no passado |
| `ml/calibracao.py` | criar | Fator vigente de `ia.calibracoes` |
| `ml/analise.py` | alterar | Medição vencida, fator, solo por trecho, dia ideal, contexto da LLM |
| `ml/analisar_lote.py` | alterar | Só trecho ativo, calibrações, mobilização, resumo separa "vencida" |
| `ml/tests/test_analise.py`, `ml/tests/test_calibracao.py` | criar | Testes com `sb` falso |
| `.github/workflows/main.yml` | alterar | Caminhos em `ml/` |
| `pytest.ini`, `.gitignore` | criar/alterar | `pythonpath`, `testpaths`; ignorar sqlite e caches |
| `pesquisa/__init__.py`, `pesquisa/rodoanel/__init__.py` | criar | Caminhos e constantes do Rodoanel; põe `ml/` no `sys.path` |
| `pesquisa/requirements.txt` | criar | Dependências da pesquisa |
| `pesquisa/dados/brutos/` | criar | Cópia dos 2 xlsx e 2 kmz |
| `pesquisa/rodoanel/planilha.py` | criar | Parser do RA-RET (unifilar) |
| `pesquisa/rodoanel/marcos.py` | criar | Marcos, reordenação, eixo, interpolação, projeção |
| `pesquisa/rodoanel/poligonos.py` | criar | Polígonos de roçada, esquema deslocado, atribuição a marcos |
| `pesquisa/rodoanel/segmentos.py` | criar | Segmentos, pares, matriz, medição derivada, execuções inferidas |
| `pesquisa/rodoanel/banco.py` | criar | SQLite: esquema, gravação, CSV |
| `pesquisa/rodoanel/clima_janela.py` | criar | Duas zonas, cache JSON da série ERA5 |
| `pesquisa/rodoanel/solo_km.py` | criar | SoilGrids por marco, cache JSON |
| `pesquisa/rodoanel/validacao.py` | criar | Linhas, previsão, métricas, calibração, sensibilidade |
| `pesquisa/rodoanel/relatorio.py` | criar | Markdown a partir de JSON; diário |
| `pesquisa/rodoanel/supabase_io.py` | criar | Gravação idempotente no Supabase |
| `pesquisa/consolidar.py`, `pesquisa/validar.py`, `pesquisa/publicar_rodoanel.py`, `pesquisa/importar_levantamento.py` | criar | CLIs |
| `pesquisa/ndvi/gee_check.py`, `geometrias.py`, `ndvi_datas.py`, `analisar_ndvi.py`, `ndvi_serie.py`, `analisar_serie.py` | criar | Trilha do satélite |
| `pesquisa/tests/*.py` | criar | pytest |
| `pesquisa/verificar_preparacao.sh` | criar | Confere a lista manual |
| `supabase/migrations/20260913100000_rodoanel_base_real.sql` | criar | Estrutura (spec §6.1) |
| `supabase/migrations/20260913101000_rodoanel_higiene_e_view.sql` | criar | Dados e view (spec §6.2) |
| `web/scripts/fumaca.mjs` | alterar | 7 tabelas novas |
| `web/src/lib/types.ts`, `web/src/lib/dominio.ts` | alterar | Tipos e vocabulário novos |
| `web/src/lib/queries.ts`, `web/src/lib/chamados/queries.ts` | alterar | Descartar trecho inativo |
| `web/src/lib/calibracao-regra.ts`, `web/src/lib/calibracao-regra.test.ts`, `web/src/lib/calibracao.ts` | criar | Fator vigente no painel |
| `web/src/lib/simulacao.ts`, `web/src/lib/simulacao.test.ts` | alterar | `fator` |
| `web/src/lib/validacao/queries.ts`, `web/src/lib/levantamentos/queries.ts` | criar | Leituras das tabelas novas |
| `web/src/app/(painel)/validacao/page.tsx`, `loading.tsx`, `error.tsx`, `_componentes/*.tsx` | criar | A página |
| `web/src/components/shell/navegacao.ts`, `web/src/lib/auth/permissoes.ts` (+ test) | alterar | Item e rota `/validacao` |
| `web/src/app/(painel)/copiloto/_componentes/ficha-modelo.tsx`, `copiloto/page.tsx` | alterar | "Precisão medida" |
| `web/src/app/(painel)/trechos/_componentes/levantamento-campo.tsx`, `trechos/[id]/page.tsx` | criar/alterar | Cartão do levantamento |
| `web/src/app/(painel)/simulador/**` | alterar | Passa e exibe o fator |
| `docs/pesquisa/00-diario.md`, `01-consolidacao.md`, `02-validacao.md`, `03-ndvi.md`, `04-producao.md` | criar | Registros |
| `docs/relatorio-motiva.md` | criar | Resposta aos 5 pontos |
| `docs/operacao/deploy.md`, `docs/operacao/seguranca.md`, `ml/main.py` (cabeçalho) | alterar | Caminhos em `ml/`, macOS |

---

## Dia 1

### Task 0: Conferir a preparação manual e abrir o diário

**Files:**
- Create: `pesquisa/verificar_preparacao.sh`
- Create: `docs/pesquisa/00-diario.md`

**Interfaces:**
- Produces: o script sai com código 0 quando tudo o que o humano precisava fazer está feito; cada linha de saída começa com `OK` ou `FALTA`.

- [ ] **Step 1: Escrever o script**

```bash
#!/usr/bin/env bash
# Confere docs/operacao/preparacao-dados-reais.md. Sai com 1 se algo bloqueante faltar.
set -u
cd "$(dirname "$0")/.."
falhas=0
ok()    { printf 'OK     %s\n' "$1"; }
falta() { printf 'FALTA  %s\n' "$1"; falhas=$((falhas+1)); }

[ -f web/.env.local ] && ok "web/.env.local existe" || falta "web/.env.local (13 variaveis; ver a lista manual A1)"
for v in SUPABASE_URL SUPABASE_SERVICE_KEY NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY OPENAI_API_KEY APP_URL SEED_SENHA; do
  grep -qE "^$v=." web/.env.local 2>/dev/null && ok "web/.env.local tem $v" || falta "web/.env.local sem $v"
done
[ -f .env ] && ok ".env da raiz existe" || falta ".env da raiz (SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY, DB_SCHEMA=ia, GEE_PROJECT)"
for v in SUPABASE_URL SUPABASE_SERVICE_KEY OPENAI_API_KEY; do
  grep -qE "^$v=." .env 2>/dev/null && ok ".env tem $v" || falta ".env sem $v"
done
grep -qE "^GEE_PROJECT=." .env 2>/dev/null && ok ".env tem GEE_PROJECT" || printf 'AVISO  .env sem GEE_PROJECT: a trilha do satelite fica bloqueada ate existir\n'

ls ~/motiva-backups/*esquema*.sql >/dev/null 2>&1 && ok "backup de esquema em ~/motiva-backups" || falta "backup do banco (lista manual A3)"
ls ~/motiva-backups/*dados*.sql   >/dev/null 2>&1 && ok "backup de dados em ~/motiva-backups"   || falta "backup de dados do banco (lista manual A3)"

command -v vercel >/dev/null 2>&1 && vercel whoami >/dev/null 2>&1 && ok "vercel CLI logado" || falta "vercel CLI instalado e logado (lista manual A5)"
[ -d web/node_modules ] && ok "web/node_modules" || falta "npm install em web/ (lista manual A6)"
[ -x .venv/bin/python ] && ok ".venv" || falta "venv com o Python 3.12 do Homebrew (lista manual A6)"
.venv/bin/python --version 2>/dev/null | grep -q " 3\.12\." && ok ".venv e Python 3.12" || falta ".venv nao e Python 3.12: rm -rf .venv && /usr/local/opt/python@3.12/bin/python3.12 -m venv .venv (lista manual A6)"
[ -f pesquisa/dados/brutos/classificacao_rocada.kmz ] && ok "dados brutos copiados" || printf 'AVISO  pesquisa/dados/brutos ainda vazio: a Tarefa 2 copia\n'

if [ -x .venv/bin/python ] && grep -qE "^GEE_PROJECT=." .env 2>/dev/null; then
  .venv/bin/python - <<'PY' && ok "Earth Engine autenticado" || falta "earthengine authenticate (lista manual A4)"
import os, sys
try:
    import ee
    from dotenv import load_dotenv
    load_dotenv()
    ee.Initialize(project=os.environ["GEE_PROJECT"])
    ee.Number(1).getInfo()
except Exception as e:
    print("   ", type(e).__name__, str(e)[:120]); sys.exit(1)
PY
fi

printf '\n%d item(ns) bloqueante(s) faltando.\n' "$falhas"
[ "$falhas" -eq 0 ]
```

- [ ] **Step 2: Rodar**

Run: `chmod +x pesquisa/verificar_preparacao.sh && pesquisa/verificar_preparacao.sh`
Expected: todas as linhas `OK` (avisos sobre GEE e dados brutos são aceitáveis neste ponto). Se algo estiver `FALTA`, pare e peça ao humano o item da lista manual antes de seguir. Não contorne.

- [ ] **Step 3: Abrir o diário**

Crie `docs/pesquisa/00-diario.md`:

```markdown
# Diário dos dados reais do Rodoanel

Uma linha por tarefa concluída, em ordem. Formato: `- AAAA-MM-DD HH:MM · Tarefa N · o que rodou · resultado em uma linha · commit abc1234`.
Hora de Brasília. Números só quando saíram de código.

- 2026-09-13 HH:MM · Tarefa 0 · `pesquisa/verificar_preparacao.sh` · preparação manual conferida · commit (a preencher)
```

- [ ] **Step 4: Commit**

```bash
git add pesquisa/verificar_preparacao.sh docs/pesquisa/00-diario.md
git commit -m "chore(pesquisa): conferencia da preparacao manual e diario"
```

---

### Task 1: O pipeline Python vai para `ml/` e o workflow aponta para lá

A árvore de trabalho tem os arquivos da raiz apagados e cópias não rastreadas em `docs/`. O workflow roda `python analisar_lote.py` na raiz. Esta tarefa põe tudo em `ml/`, e nada muda de comportamento.

**Files:**
- Move: raiz → `ml/`: `analisar_lote.py analise.py clima.py comandos.txt exportar_modelo.py gerador_v3_1_rebrota.py gerar_fixture_features.py main.py modelo.py modelo_gramas.pkl requirements.txt solo.py treinar_modelo.py validacao_campo.json validar_campo.py`
- Move: `schema_ia.sql` → `supabase/schema_ia.sql`; `abc.html` → `docs/abc.html`; `docs/previsao_gramas_colab.ipynb` → `ml/`
- Modify: `.github/workflows/main.yml`, `ml/modelo.py`, `ml/exportar_modelo.py`, `ml/gerar_fixture_features.py`, `ml/validar_campo.py`, `ml/main.py`, `docs/operacao/seguranca.md`, `docs/operacao/deploy.md`, `.gitignore`
- Create: `pytest.ini`

- [ ] **Step 1: Confirmar que as cópias em `docs/` são idênticas ao que está no Git e restaurar a raiz**

```bash
cd /Users/enzomoretto/Desktop/motiva/motiva
for f in analisar_lote.py analise.py clima.py comandos.txt exportar_modelo.py gerador_v3_1_rebrota.py gerar_fixture_features.py main.py modelo.py modelo_gramas.pkl requirements.txt solo.py treinar_modelo.py validacao_campo.json validar_campo.py; do
  git show "HEAD:$f" | cmp -s - "docs/$f" && echo "igual  $f" || echo "DIFERE $f"
done
git show HEAD:schema_ia.sql | cmp -s - supabase/schema_ia.sql && echo "igual schema_ia.sql" || echo "DIFERE schema_ia.sql"
git show HEAD:abc.html | cmp -s - docs/abc.html && echo "igual abc.html" || echo "DIFERE abc.html"
```

Expected: tudo `igual`. Se algo `DIFERE`, a cópia em `docs/` tem edição não commitada: rode `diff` e decida com o humano antes de apagar.

```bash
git checkout -- analisar_lote.py analise.py clima.py comandos.txt exportar_modelo.py gerador_v3_1_rebrota.py gerar_fixture_features.py main.py modelo.py modelo_gramas.pkl requirements.txt solo.py treinar_modelo.py validacao_campo.json validar_campo.py schema_ia.sql abc.html
rm docs/analisar_lote.py docs/analise.py docs/clima.py docs/comandos.txt docs/exportar_modelo.py docs/gerador_v3_1_rebrota.py docs/gerar_fixture_features.py docs/main.py docs/modelo.py docs/modelo_gramas.pkl docs/requirements.txt docs/solo.py docs/treinar_modelo.py docs/validacao_campo.json docs/validar_campo.py supabase/schema_ia.sql docs/abc.html
mkdir -p ml
git mv analisar_lote.py analise.py clima.py comandos.txt exportar_modelo.py gerador_v3_1_rebrota.py gerar_fixture_features.py main.py modelo.py modelo_gramas.pkl requirements.txt solo.py treinar_modelo.py validacao_campo.json validar_campo.py ml/
git mv schema_ia.sql supabase/schema_ia.sql
git mv abc.html docs/abc.html
git mv docs/previsao_gramas_colab.ipynb ml/previsao_gramas_colab.ipynb
git status --short
```

Expected: só renomeações (`R`), mais `?? docs/PLANO_MOTIVA.md`, `?? "docs/Arquivos - Dados challenge MOTIVA/"` e `?? .DS_Store`.

- [ ] **Step 2: Caminhos relativos ao arquivo, não ao diretório de trabalho**

Em `ml/modelo.py`, troque a linha `CAMINHO = os.getenv("MODELO_PKL", "modelo_gramas.pkl")` por:

```python
CAMINHO = os.getenv("MODELO_PKL") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "modelo_gramas.pkl")
```

Em `ml/exportar_modelo.py`, troque `DESTINO = Path("web/src/lib/modelo")` e `CAMINHO_PKL = "modelo_gramas.pkl"` por:

```python
RAIZ = Path(__file__).resolve().parents[1]
DESTINO = RAIZ / "web" / "src" / "lib" / "modelo"
CAMINHO_PKL = str(Path(__file__).resolve().parent / "modelo_gramas.pkl")
```

Em `ml/gerar_fixture_features.py`, troque `DESTINO = Path("web/src/lib/modelo/fixture-features.json")` por:

```python
DESTINO = Path(__file__).resolve().parents[1] / "web" / "src" / "lib" / "modelo" / "fixture-features.json"
```

Em `ml/validar_campo.py`, troque `ARQUIVO = os.getenv("VALIDACAO_CAMPO", "validacao_campo.json")` por:

```python
ARQUIVO = os.getenv("VALIDACAO_CAMPO") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "validacao_campo.json")
```

Em `ml/main.py`, no cabeçalho, troque a frase `o `requirements.txt` fica na raiz e nao em `web/`, que e a pasta do projeto na Vercel;` por `o `requirements.txt` fica em `ml/` e nao em `web/`, que e a pasta do projeto na Vercel;`.

- [ ] **Step 3: Workflow**

Em `.github/workflows/main.yml`, o job passa a ser:

```yaml
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
          cache-dependency-path: ml/requirements.txt

      - name: Instalar dependencias
        run: pip install -r ml/requirements.txt

      - name: Rodar analise
        working-directory: ml
        env:
          SUPABASE_URL:         ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          OPENAI_API_KEY:       ${{ secrets.OPENAI_API_KEY }}
          DB_SCHEMA:            ia
          OPENAI_MODEL:         gpt-5.4-mini
          LIMIAR_DIAS:          "45"
          TRECHO_ID:            ${{ inputs.trecho_id }}
        run: python analisar_lote.py
```

- [ ] **Step 4: Documentação que citava a raiz**

Em `docs/operacao/seguranca.md`, seção g, troque `o `requirements.txt` está na **raiz**, e a pasta do projeto na Vercel é **`web/`**; não há `web/requirements.txt`;` por `o `requirements.txt` está em **`ml/`**, e a pasta do projeto na Vercel é **`web/`**; não há `web/requirements.txt`;`. Em `docs/operacao/deploy.md`, troque `` `modelo_gramas.pkl` (5,5 MB) `` por `` `ml/modelo_gramas.pkl` (5,5 MB) ``.

- [ ] **Step 5: `.gitignore` e `pytest.ini`**

Acrescente ao fim de `.gitignore`:

```
# Pesquisa: o SQLite e regeneravel; os caches de rede tambem
pesquisa/rodoanel.sqlite
pesquisa/dados/cache/
backups/
.pytest_cache/
```

Crie `pytest.ini` na raiz:

```ini
[pytest]
testpaths = pesquisa/tests ml/tests
pythonpath = . ml ml/tests
addopts = -q
```

- [ ] **Step 6: venv e prova de que o modelo carrega de `ml/`**

```bash
/usr/local/opt/python@3.12/bin/python3.12 -m venv .venv      # 3.12, igual ao Actions; o 3.14 nao instala o pydantic-core fixado
.venv/bin/pip install -q -U pip
.venv/bin/pip install -q -r ml/requirements.txt pytest
cd /tmp && /Users/enzomoretto/Desktop/motiva/motiva/.venv/bin/python -c "import sys; sys.path.insert(0,'/Users/enzomoretto/Desktop/motiva/motiva/ml'); import modelo; print(modelo.TREINADO_EM, modelo.N_LINHAS)"
cd /Users/enzomoretto/Desktop/motiva/motiva
```

Expected: imprime a data de treino e o número de linhas, rodando de `/tmp`, o que prova que o `.pkl` é achado pelo caminho do arquivo. Se der `InconsistentVersionWarning`, a versão do scikit-learn no venv não é 1.9.0: refaça o `pip install` com o `requirements.txt` de `ml/`.

- [ ] **Step 7: Commit e push**

```bash
git add -A ml supabase/schema_ia.sql docs/abc.html .github/workflows/main.yml docs/operacao/seguranca.md docs/operacao/deploy.md .gitignore pytest.ini
git commit -m "chore(ml): pipeline python sai da raiz para ml/ e o workflow aponta para la"
git push origin main
```

O push aqui é deliberado: a rodada das 06:00 de amanhã já roda com os caminhos novos, e um erro de caminho aparece no log do Actions em vez de ficar escondido.

---

### Task 2: Esqueleto de `pesquisa/`, dados brutos e SQLite

**Files:**
- Create: `pesquisa/__init__.py`, `pesquisa/rodoanel/__init__.py`, `pesquisa/requirements.txt`, `pesquisa/rodoanel/banco.py`, `pesquisa/tests/__init__.py`, `pesquisa/tests/test_banco.py`
- Create: `pesquisa/dados/brutos/` (cópias), `pesquisa/dados/derivados/.gitkeep`

**Interfaces:**
- Produces: `pesquisa.rodoanel.RAIZ, ML, BRUTOS, DERIVADOS, CACHE, SQLITE, DOCS_PESQUISA, RODOVIA, UF, CONCESSIONARIA, ESPECIE_PREMISSA, ALTURA_LIMITE_CM`; `banco.abrir(caminho=SQLITE) -> sqlite3.Connection`, `banco.substituir(con, tabela, linhas: list[dict])`, `banco.gravar_csv(caminho, linhas: list[dict])`, `banco.ler_csv(caminho) -> list[dict]`.

- [ ] **Step 1: Pacote e constantes**

`pesquisa/__init__.py` fica vazio. `pesquisa/rodoanel/__init__.py`:

```python
"""Pesquisa sobre os dados reais do Rodoanel Oeste (SP-021).

Reaproveita o pipeline de producao em `ml/` (clima, solo, modelo) e NAO o
modifica daqui: o que precisa mudar la e feito la, com teste la.
"""
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
ML = RAIZ / "ml"
PESQUISA = RAIZ / "pesquisa"
BRUTOS = PESQUISA / "dados" / "brutos"
DERIVADOS = PESQUISA / "dados" / "derivados"
CACHE = PESQUISA / "dados" / "cache"
SQLITE = PESQUISA / "rodoanel.sqlite"
DOCS_PESQUISA = RAIZ / "docs" / "pesquisa"

if str(ML) not in sys.path:
    sys.path.insert(0, str(ML))

RODOVIA = "SP-021 Rodoanel Oeste"
UF = "SP"
CONCESSIONARIA = "RodoAnel"
ESPECIE_PREMISSA = "braquiaria"
ALTURA_LIMITE_CM = 30.0

ARQ_LEV_1 = BRUTOS / "RA-RET-ROÇ-LIMP-2026-03-13.xlsx"
ARQ_LEV_2 = BRUTOS / "RA-RET-ROÇ-LIMP-2026-03-20.xlsx"
ARQ_MARCOS = BRUTOS / "Marco km_rodoanel 2.kmz"
ARQ_POLIGONOS = BRUTOS / "classificacao_rocada.kmz"
```

`pesquisa/requirements.txt`:

```
-r ../ml/requirements.txt
openpyxl==3.1.5
pandas==2.3.3
pytest==8.4.2
earthengine-api==1.6.11
```

Se alguma versão não existir no PyPI na hora do `pip install`, use a mais recente da mesma série maior e registre no diário.

- [ ] **Step 2: Copiar os brutos**

```bash
mkdir -p pesquisa/dados/brutos pesquisa/dados/derivados pesquisa/dados/cache pesquisa/tests
touch pesquisa/dados/derivados/.gitkeep pesquisa/tests/__init__.py
cp "docs/Arquivos - Dados challenge MOTIVA/02. Dados Gestão verde - Atual/Retigrafico/RA-RET-ROÇ-LIMP-2026-03-13.xlsx" pesquisa/dados/brutos/
cp "docs/Arquivos - Dados challenge MOTIVA/02. Dados Gestão verde - Atual/Retigrafico/RA-RET-ROÇ-LIMP-2026-03-20.xlsx" pesquisa/dados/brutos/
cp "docs/Arquivos - Dados challenge MOTIVA/01. Rodovia Motiva - Rodoanel/Marco km_rodoanel 2.kmz" pesquisa/dados/brutos/
cp "docs/Arquivos - Dados challenge MOTIVA/01. Rodovia Motiva - Rodoanel/classificacao_rocada.kmz" pesquisa/dados/brutos/
.venv/bin/pip install -q -r pesquisa/requirements.txt
ls -la pesquisa/dados/brutos
```

Expected: 4 arquivos (120 KB, 120 KB, 3 KB, 1,9 MB).

- [ ] **Step 3: Teste do banco**

`pesquisa/tests/test_banco.py`:

```python
from pesquisa.rodoanel import banco


def test_abrir_cria_as_tabelas(tmp_path):
    con = banco.abrir(tmp_path / "t.sqlite")
    nomes = {r[0] for r in con.execute("select name from sqlite_master where type='table'")}
    assert {"segmentos", "faixas", "observacoes", "pares", "solo_marco", "clima_dia",
            "validacoes", "ndvi_observacoes", "ndvi_serie"} <= nomes


def test_substituir_apaga_e_regrava(tmp_path):
    con = banco.abrir(tmp_path / "t.sqlite")
    banco.substituir(con, "faixas", [{"codigo": "a", "nome": "A", "linha_planilha": 1, "lado": "externa", "em_escopo": 1, "ordem": 1}])
    banco.substituir(con, "faixas", [{"codigo": "b", "nome": "B", "linha_planilha": 2, "lado": "interna", "em_escopo": 0, "ordem": 2}])
    assert [r[0] for r in con.execute("select codigo from faixas")] == ["b"]


def test_csv_ida_e_volta(tmp_path):
    caminho = tmp_path / "x.csv"
    banco.gravar_csv(caminho, [{"a": 1, "b": "x"}, {"a": 2, "b": "y"}])
    assert banco.ler_csv(caminho) == [{"a": "1", "b": "x"}, {"a": "2", "b": "y"}]
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `.venv/bin/python -m pytest pesquisa/tests/test_banco.py`
Expected: FAIL, `ModuleNotFoundError` ou `AttributeError` em `banco`.

- [ ] **Step 5: Implementar `banco.py`**

```python
"""SQLite local da pesquisa. Sem servidor: um arquivo, regeneravel."""
from __future__ import annotations

import csv
import sqlite3
from pathlib import Path

from . import SQLITE

ESQUEMA = """
create table if not exists segmentos (
  km_marco_m integer primary key, km_inicio real, km_fim real, latitude real, longitude real,
  metodo_rocada text, area_rocada_m2 real, areas_por_metodo text);
create table if not exists faixas (
  codigo text primary key, nome text, linha_planilha integer, lado text, em_escopo integer, ordem integer);
create table if not exists observacoes (
  data text, km_marco_m integer, faixa text, classe integer, arquivo text,
  primary key (data, km_marco_m, faixa));
create table if not exists pares (
  km_marco_m integer, faixa text, classe_d1 integer, classe_d2 integer, transicao text,
  primary key (km_marco_m, faixa));
create table if not exists solo_marco (
  km_marco_m integer primary key, fertilidade real, capacidade_mm real, fonte text,
  nitrogenio_g_kg real, distancia_km real);
create table if not exists clima_dia (
  zona text, data text, tmed real, tmin real, tmax real, umidade real, chuva real, radiacao real, et0 real,
  primary key (zona, data));
create table if not exists validacoes (chave text primary key, json text);
create table if not exists ndvi_observacoes (
  km_marco_m integer, data_imagem text, data_alvo text, defasagem_dias integer,
  ndvi_medio real, ndvi_mediana real, ndvi_p10 real, ndvi_p90 real, n_pixels integer, nuvem_pct real,
  primary key (km_marco_m, data_imagem));
create table if not exists ndvi_serie (
  km_marco_m integer, data_imagem text, ndvi_mediana real, n_pixels integer, nuvem_pct real,
  primary key (km_marco_m, data_imagem));
"""


def abrir(caminho: str | Path = SQLITE) -> sqlite3.Connection:
    con = sqlite3.connect(str(caminho))
    con.executescript(ESQUEMA)
    return con


def substituir(con: sqlite3.Connection, tabela: str, linhas: list[dict]) -> None:
    """Apaga a tabela inteira e grava `linhas`. Regravar e a forma de idempotencia aqui."""
    con.execute(f"delete from {tabela}")
    if linhas:
        colunas = list(linhas[0].keys())
        marcas = ",".join("?" for _ in colunas)
        con.executemany(
            f"insert into {tabela} ({','.join(colunas)}) values ({marcas})",
            [tuple(l[c] for c in colunas) for l in linhas],
        )
    con.commit()


def gravar_csv(caminho: str | Path, linhas: list[dict]) -> None:
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with caminho.open("w", newline="", encoding="utf-8") as f:
        if not linhas:
            return
        w = csv.DictWriter(f, fieldnames=list(linhas[0].keys()), lineterminator="\n")
        w.writeheader()
        w.writerows(linhas)


def ler_csv(caminho: str | Path) -> list[dict]:
    with Path(caminho).open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))
```

- [ ] **Step 6: Rodar e ver passar**

Run: `.venv/bin/python -m pytest pesquisa/tests/test_banco.py`
Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
git add pesquisa pytest.ini
git commit -m "feat(pesquisa): esqueleto do pacote, dados brutos da Motiva e sqlite local"
```

---

### Task 3: Parser da planilha RA-RET (unifilar)

**Files:**
- Create: `pesquisa/rodoanel/planilha.py`, `pesquisa/tests/test_planilha.py`

**Interfaces:**
- Produces: `planilha.FAIXAS: tuple[(linha:int, nome:str, codigo:str, lado:str, em_escopo:bool)]`; `planilha.PONTO_MEDIO_CM = {1: 5.0, 2: 20.0, 3: 40.0}`; `planilha.CODIGOS_EM_ESCOPO: frozenset[str]`; `planilha.data_do_nome(nome) -> date`; `planilha.ler(caminho, data=None) -> Levantamento`; `Levantamento(arquivo, data, data_interna, rodovia_texto, marcos: tuple[int,...], observacoes: tuple[Observacao,...])` com `.classe(km_m, faixa) -> int|None` e `.por_faixa(faixa) -> dict[km_m, int|None]`; `Observacao(km_m:int, faixa:str, classe:int|None)`.

- [ ] **Step 1: Teste**

`pesquisa/tests/test_planilha.py`:

```python
from collections import Counter
from datetime import date

import pytest

from pesquisa.rodoanel import ARQ_LEV_1, ARQ_LEV_2, planilha


def test_data_vem_do_nome_do_arquivo():
    assert planilha.data_do_nome(ARQ_LEV_1.name) == date(2026, 3, 13)
    assert planilha.data_do_nome(ARQ_LEV_2.name) == date(2026, 3, 20)


def test_marcos_sao_60_de_0_a_29300():
    lev = planilha.ler(ARQ_LEV_1)
    assert len(lev.marcos) == 60
    assert lev.marcos[:3] == (0, 500, 1000)
    assert lev.marcos[-2:] == (29000, 29300)


def test_data_interna_e_template_nas_duas():
    assert planilha.ler(ARQ_LEV_1).data_interna == date(2025, 3, 28)
    assert planilha.ler(ARQ_LEV_2).data_interna == date(2025, 3, 28)


def test_contagens_medidas_em_13_09_2026():
    lev1 = planilha.ler(ARQ_LEV_1)
    lev2 = planilha.ler(ARQ_LEV_2)
    assert Counter(lev1.por_faixa("cant_lateral_externa").values()) == {1: 30, 2: 10, 3: 15, None: 5}
    assert Counter(lev1.por_faixa("cant_central_interna").values()) == {1: 36, 2: 5, 3: 7, None: 12}
    assert Counter(lev2.por_faixa("cant_lateral_externa").values()) == {1: 37, 2: 15, 3: 3, None: 5}
    assert Counter(lev2.por_faixa("cant_dispositivo_int").values()) == {1: 10, 3: 1, None: 49}


def test_faixas_sem_dado_vem_como_nao_se_aplica():
    lev = planilha.ler(ARQ_LEV_1)
    assert set(lev.por_faixa("marginal_externa").values()) == {None}
    assert set(lev.por_faixa("pista_interna").values()) == {None}


def test_total_de_observacoes_e_60_marcos_x_12_faixas():
    assert len(planilha.ler(ARQ_LEV_1).observacoes) == 720


def test_quatro_faixas_em_escopo():
    assert planilha.CODIGOS_EM_ESCOPO == {"cant_lateral_externa", "cant_central_externa",
                                          "cant_central_interna", "cant_lateral_interna"}


def test_valor_desconhecido_e_erro():
    with pytest.raises(ValueError):
        planilha._classe("7")
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/bin/python -m pytest pesquisa/tests/test_planilha.py`
Expected: FAIL com `AttributeError: module ... has no attribute 'ler'`.

- [ ] **Step 3: Implementar**

`pesquisa/rodoanel/planilha.py`:

```python
"""Leitura da planilha RA-RET-ROC-LIMP (aba ROCADA), o 'unifilar' de rocada da Motiva.

Estrutura verificada por codigo em 13/09/2026 nas duas planilhas:
  - linha 9: marcos de km em METROS, colunas F..BM (60 valores: 0, 500, ..., 29000, 29300)
  - linhas 10..25: uma faixa transversal por linha; a coluna B tem o nome
  - celula BF6: data 'LEVANTAMENTO DE CAMPO', 2025-03-28 nas duas (template desatualizado)
  - valores: 1, 2, 3 (classes de altura), 'X' (nao se aplica) ou vazio (idem)

A data do levantamento vem do NOME do arquivo. A interna e guardada so para
registrar a divergencia (`data_no_arquivo` em ia.levantamentos).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

import openpyxl

LINHA_KM = 9
COLUNA_INICIO = 6     # F
COLUNA_FIM = 65       # BM, inclusive
COLUNA_NOME = 2       # B
CELULA_DATA_INTERNA = "BF6"
CELULA_RODOVIA = "B8"

#: (linha na planilha, nome exatamente como esta la, codigo, lado, em_escopo)
FAIXAS: tuple[tuple[int, str, str, str, bool], ...] = (
    (10, "CANT. DISPOSITIVO EXT.",  "cant_dispositivo_ext",  "externa", False),
    (11, "CANT. MARGINAL EXTERNA",  "cant_marginal_externa", "externa", False),
    (12, "MARGINAL EXTERNA",        "marginal_externa",      "externa", False),
    (14, "CANT. LATERAL EXTERNA",   "cant_lateral_externa",  "externa", True),
    (15, "PISTA EXTERNA",           "pista_externa",         "externa", False),
    (17, "CANT. CENTRAL EXTERNA",   "cant_central_externa",  "externa", True),
    (18, "CANT. CENTRAL INTERNA",   "cant_central_interna",  "interna", True),
    (19, "PISTA INTERNA",           "pista_interna",         "interna", False),
    (21, "CANT. LATERAL INTERNA",   "cant_lateral_interna",  "interna", True),
    (22, "MARGINAL INTERNA",        "marginal_interna",      "interna", False),
    (24, "CANT. MARGINAL INTERNA",  "cant_marginal_interna", "interna", False),
    (25, "CANT. DISPOSITIVO INT.",  "cant_dispositivo_int",  "interna", False),
)
CODIGOS_EM_ESCOPO = frozenset(f[2] for f in FAIXAS if f[4])
NOME_POR_CODIGO = {f[2]: f[1] for f in FAIXAS}
ORDEM_POR_CODIGO = {f[2]: i + 1 for i, f in enumerate(FAIXAS)}

PONTO_MEDIO_CM = {1: 5.0, 2: 20.0, 3: 40.0}
_NAO_SE_APLICA = {None, "", "X", "x"}


@dataclass(frozen=True)
class Observacao:
    km_m: int
    faixa: str
    classe: int | None


@dataclass(frozen=True)
class Levantamento:
    arquivo: str
    data: date
    data_interna: date | None
    rodovia_texto: str
    marcos: tuple[int, ...]
    observacoes: tuple[Observacao, ...]

    def por_faixa(self, faixa: str) -> dict[int, int | None]:
        return {o.km_m: o.classe for o in self.observacoes if o.faixa == faixa}

    def classe(self, km_m: int, faixa: str) -> int | None:
        for o in self.observacoes:
            if o.km_m == km_m and o.faixa == faixa:
                return o.classe
        raise KeyError((km_m, faixa))


def data_do_nome(nome: str) -> date:
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", nome)
    if not m:
        raise ValueError(f"o nome {nome!r} nao traz uma data AAAA-MM-DD")
    return date(int(m[1]), int(m[2]), int(m[3]))


def _classe(valor) -> int | None:
    if valor in _NAO_SE_APLICA:
        return None
    if isinstance(valor, str):
        valor = valor.strip()
        if valor in _NAO_SE_APLICA:
            return None
    try:
        n = int(float(valor))
    except (TypeError, ValueError):
        raise ValueError(f"valor de classe desconhecido: {valor!r}") from None
    if n not in (1, 2, 3):
        raise ValueError(f"classe fora de 1..3: {valor!r}")
    return n


def _data(valor) -> date | None:
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    return None


def ler(caminho: str | Path, data: date | None = None) -> Levantamento:
    caminho = Path(caminho)
    wb = openpyxl.load_workbook(caminho, data_only=True)
    ws = wb[wb.sheetnames[0]]

    marcos: list[int] = []
    for c in range(COLUNA_INICIO, COLUNA_FIM + 1):
        v = ws.cell(LINHA_KM, c).value
        if v is None:
            raise ValueError(f"{caminho.name}: marco vazio na coluna {c}")
        marcos.append(int(v))
    if len(marcos) != 60 or marcos != sorted(marcos):
        raise ValueError(f"{caminho.name}: esperava 60 marcos crescentes, li {len(marcos)}")

    obs: list[Observacao] = []
    for linha, nome, codigo, _lado, _escopo in FAIXAS:
        lido = str(ws.cell(linha, COLUNA_NOME).value or "").strip()
        if lido != nome:
            raise ValueError(f"{caminho.name}: linha {linha} deveria ser {nome!r}, e {lido!r}")
        for i, c in enumerate(range(COLUNA_INICIO, COLUNA_FIM + 1)):
            obs.append(Observacao(marcos[i], codigo, _classe(ws.cell(linha, c).value)))

    return Levantamento(
        arquivo=caminho.name,
        data=data or data_do_nome(caminho.name),
        data_interna=_data(ws[CELULA_DATA_INTERNA].value),
        rodovia_texto=str(ws[CELULA_RODOVIA].value or "").strip(),
        marcos=tuple(marcos),
        observacoes=tuple(obs),
    )
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv/bin/python -m pytest pesquisa/tests/test_planilha.py`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add pesquisa/rodoanel/planilha.py pesquisa/tests/test_planilha.py
git commit -m "feat(pesquisa): parser da planilha unifilar RA-RET com as 12 faixas e as classes"
```

---

### Task 4: Marcos de km, reordenação e eixo

**Files:**
- Create: `pesquisa/rodoanel/marcos.py`, `pesquisa/tests/test_marcos.py`

**Interfaces:**
- Produces: `marcos.ORDEM_CORRIGIDA`, `marcos.COMPRIMENTO_PLANILHA_M = 29300`, `marcos.ler_marcos(caminho) -> list[(lat, lon)]`, `marcos.reordenar(pontos) -> list`, `marcos.haversine_m(a, b) -> float`, `marcos.montar_eixo(pontos_ordenados) -> Eixo`, `marcos.carregar(caminho) -> Eixo`; `Eixo.pontos`, `Eixo.chainage`, `Eixo.comprimento_m`, `Eixo.escala`, `Eixo.posicao(km_m) -> (lat, lon)`, `Eixo.projetar(lat, lon) -> (chainage_m, distancia_m)`, `Eixo.km_planilha(lat, lon) -> (km_m, distancia_m)`.

- [ ] **Step 1: Teste**

`pesquisa/tests/test_marcos.py`:

```python
import math

import pytest

from pesquisa.rodoanel import ARQ_MARCOS, marcos


@pytest.fixture(scope="module")
def eixo():
    return marcos.carregar(ARQ_MARCOS)


def test_sao_30_marcos_e_a_ordem_corrigida_e_permutacao():
    assert len(marcos.ler_marcos(ARQ_MARCOS)) == 30
    assert sorted(marcos.ORDEM_CORRIGIDA) == list(range(30))


def test_reordenado_o_eixo_tem_29_km_e_nenhum_salto_absurdo(eixo):
    assert 28_975 <= eixo.comprimento_m <= 29_075          # medido: 29.025 m
    passos = [b - a for a, b in zip(eixo.chainage, eixo.chainage[1:])]
    assert max(passos) <= 2_100                              # a unica lacuna real: 2.042 m
    assert min(passos) >= 500


def test_na_ordem_do_arquivo_o_eixo_seria_absurdo():
    brutos = marcos.ler_marcos(ARQ_MARCOS)
    total = sum(marcos.haversine_m(a, b) for a, b in zip(brutos, brutos[1:]))
    assert total > 45_000                                    # medido: 48.482 m


def test_escala_para_o_km_da_planilha(eixo):
    assert math.isclose(eixo.escala, 29_300 / 29_025, rel_tol=2e-3)


def test_posicao_nas_pontas(eixo):
    assert eixo.posicao(0) == eixo.pontos[0]
    lat, lon = eixo.posicao(29_300)
    assert math.isclose(lat, eixo.pontos[-1][0], abs_tol=1e-6)
    assert math.isclose(lon, eixo.pontos[-1][1], abs_tol=1e-6)


def test_posicao_do_km_15_medida(eixo):
    lat, lon = eixo.posicao(15_000)
    assert math.isclose(lat, -23.515647, abs_tol=2e-4)
    assert math.isclose(lon, -46.817408, abs_tol=2e-4)


def test_projetar_um_marco_devolve_o_proprio_chainage(eixo):
    lat, lon = eixo.pontos[10]
    c, d = eixo.projetar(lat, lon)
    assert math.isclose(c, eixo.chainage[10], abs_tol=1.0)
    assert d < 1.0
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/bin/python -m pytest pesquisa/tests/test_marcos.py`
Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Implementar**

`pesquisa/rodoanel/marcos.py`:

```python
"""Os 30 marcos de km (Marco km_rodoanel 2.kmz) e o eixo da rodovia que eles formam.

O arquivo E um zip de verdade (doc.kml dentro), ao contrario do de poligonos.
Os placemarks so tem coordenada. Dois deles (indices 28 e 29 do arquivo) estao
fora de ordem: sao os marcos que preenchem lacunas da sequencia. Ver
docs/PLANO_MOTIVA.md 4.3. Com a ordem corrigida o eixo mede 29.025 m, coerente
com os 29,3 km da planilha; na ordem do arquivo mediria 48 km.
"""
from __future__ import annotations

import math
import zipfile
from dataclasses import dataclass
from pathlib import Path
import xml.etree.ElementTree as ET

NS = {"k": "http://www.opengis.net/kml/2.2"}
ORDEM_CORRIGIDA = tuple(range(0, 8)) + (29,) + (8, 9) + (28,) + tuple(range(10, 28))
COMPRIMENTO_PLANILHA_M = 29_300.0
RAIO_TERRA_M = 6_371_008.8


def ler_marcos(caminho: str | Path) -> list[tuple[float, float]]:
    """(lat, lon) de cada placemark, na ordem do arquivo."""
    with zipfile.ZipFile(caminho) as z:
        nome = next(n for n in z.namelist() if n.lower().endswith(".kml"))
        raiz = ET.fromstring(z.read(nome))
    pontos = []
    for pm in raiz.findall(".//k:Placemark", NS):
        lon, lat, *_ = (float(x) for x in pm.find(".//k:coordinates", NS).text.strip().split(","))
        pontos.append((lat, lon))
    return pontos


def reordenar(pontos: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if len(pontos) != len(ORDEM_CORRIGIDA):
        raise ValueError(f"esperava {len(ORDEM_CORRIGIDA)} marcos, li {len(pontos)}")
    return [pontos[i] for i in ORDEM_CORRIGIDA]


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    la1, lo1 = map(math.radians, a)
    la2, lo2 = map(math.radians, b)
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * RAIO_TERRA_M * math.asin(math.sqrt(h))


@dataclass(frozen=True)
class Eixo:
    pontos: tuple[tuple[float, float], ...]
    chainage: tuple[float, ...]

    @property
    def comprimento_m(self) -> float:
        return self.chainage[-1]

    @property
    def escala(self) -> float:
        """Multiplica o chainage do eixo para chegar ao km da planilha (29.300 m)."""
        return COMPRIMENTO_PLANILHA_M / self.comprimento_m

    def posicao(self, km_m: float) -> tuple[float, float]:
        """Ponto do eixo correspondente ao km da PLANILHA, em metros."""
        c = min(max(km_m / self.escala, 0.0), self.comprimento_m)
        for i in range(len(self.pontos) - 1):
            c0, c1 = self.chainage[i], self.chainage[i + 1]
            if c0 <= c <= c1:
                t = 0.0 if c1 == c0 else (c - c0) / (c1 - c0)
                (la1, lo1), (la2, lo2) = self.pontos[i], self.pontos[i + 1]
                return (la1 + t * (la2 - la1), lo1 + t * (lo2 - lo1))
        return self.pontos[-1]

    def projetar(self, lat: float, lon: float) -> tuple[float, float]:
        """(chainage em metros, distancia ao eixo em metros) do ponto mais proximo."""
        kx = 111_320.0 * math.cos(math.radians(lat))
        ky = 110_574.0
        melhor_d, melhor_c = math.inf, 0.0
        for i in range(len(self.pontos) - 1):
            (la1, lo1), (la2, lo2) = self.pontos[i], self.pontos[i + 1]
            ax, ay = (lo1 - lon) * kx, (la1 - lat) * ky
            bx, by = (lo2 - lon) * kx, (la2 - lat) * ky
            vx, vy = bx - ax, by - ay
            l2 = vx * vx + vy * vy
            t = 0.0 if l2 == 0 else min(1.0, max(0.0, -(ax * vx + ay * vy) / l2))
            d = math.hypot(ax + t * vx, ay + t * vy)
            if d < melhor_d:
                melhor_d = d
                melhor_c = self.chainage[i] + t * (self.chainage[i + 1] - self.chainage[i])
        return melhor_c, melhor_d

    def km_planilha(self, lat: float, lon: float) -> tuple[float, float]:
        c, d = self.projetar(lat, lon)
        return c * self.escala, d


def montar_eixo(pontos_ordenados: list[tuple[float, float]]) -> Eixo:
    chainage = [0.0]
    for a, b in zip(pontos_ordenados, pontos_ordenados[1:]):
        chainage.append(chainage[-1] + haversine_m(a, b))
    return Eixo(tuple(pontos_ordenados), tuple(chainage))


def carregar(caminho: str | Path) -> Eixo:
    return montar_eixo(reordenar(ler_marcos(caminho)))
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv/bin/python -m pytest pesquisa/tests/test_marcos.py`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add pesquisa/rodoanel/marcos.py pesquisa/tests/test_marcos.py
git commit -m "feat(pesquisa): marcos de km reordenados e eixo com interpolacao e projecao"
```


---

### Task 5: Polígonos de roçada, esquema deslocado e atribuição a marcos

**Files:**
- Create: `pesquisa/rodoanel/poligonos.py`, `pesquisa/tests/test_poligonos.py`

**Interfaces:**
- Consumes: `marcos.Eixo.km_planilha(lat, lon)`.
- Produces: `poligonos.METODOS: tuple[str, ...]`; `Poligono(indice, metodo, km_descricao, latitude, longitude, area_m2, aneis: tuple[tuple[(lon, lat), ...], ...])`; `poligonos.ler_poligonos(caminho) -> list[Poligono]`; `poligonos.marco_de(km_m: float) -> int`; `poligonos.atribuir(poligonos, eixo) -> dict[int, tuple[int, float]]` (índice → (marco, distância ao eixo em m)); `poligonos.resumo_por_marco(poligonos, atribuicao) -> dict[int, dict]` com `metodo_dominante`, `area_total_m2`, `areas: dict[str, float]`, `n_poligonos`.

- [ ] **Step 1: Teste**

`pesquisa/tests/test_poligonos.py`:

```python
from collections import Counter

import pytest

from pesquisa.rodoanel import ARQ_MARCOS, ARQ_POLIGONOS, marcos, poligonos
from pesquisa.rodoanel.segmentos import MARCOS


@pytest.fixture(scope="module")
def pols():
    return poligonos.ler_poligonos(ARQ_POLIGONOS)


@pytest.fixture(scope="module")
def eixo():
    return marcos.carregar(ARQ_MARCOS)


def test_642_poligonos_nas_4_classes(pols):
    assert len(pols) == 642
    assert Counter(p.metodo for p in pols) == {
        "Apenas manual": 342,
        "Spider, Giro-Zero ou Trator com trincheira": 180,
        "Trator com braço articulado": 106,
        "Spider, com ancoragem": 14,
    }


def test_area_total_medida(pols):
    assert abs(sum(p.area_m2 for p in pols) - 981_817) < 1.0


def test_esquema_deslocado_le_lat_lon_area_certos(pols):
    p = pols[0]
    assert -23.7 < p.latitude < -23.3
    assert -46.9 < p.longitude < -46.6
    assert p.area_m2 > 0
    assert len(p.aneis) >= 1 and len(p.aneis[0]) >= 4


def test_marco_de():
    assert poligonos.marco_de(0) == 0
    assert poligonos.marco_de(499) == 0
    assert poligonos.marco_de(500) == 500
    assert poligonos.marco_de(29_149) == 29_000
    assert poligonos.marco_de(29_150) == 29_300
    assert poligonos.marco_de(31_000) == 29_300
    assert poligonos.marco_de(-40) == 0


def test_atribuicao_concorda_com_a_descricao(pols, eixo):
    atrib = poligonos.atribuir(pols, eixo)
    assert set(atrib) == {p.indice for p in pols}
    assert all(m in MARCOS for m, _ in atrib.values())
    concordam = sum(1 for p in pols if abs(atrib[p.indice][0] // 1000 - p.km_descricao) <= 1)
    assert concordam / len(pols) >= 0.95            # medido: 642 de 642


def test_resumo_por_marco(pols, eixo):
    resumo = poligonos.resumo_por_marco(pols, poligonos.atribuir(pols, eixo))
    assert abs(sum(r["area_total_m2"] for r in resumo.values()) - 981_817) < 1.0
    assert all(r["metodo_dominante"] in poligonos.METODOS for r in resumo.values())
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/bin/python -m pytest pesquisa/tests/test_poligonos.py`
Expected: FAIL, módulo inexistente (o `import ... segmentos` também falha; a Tarefa 6 o cria — até lá, comente essa linha e use `set(range(0, 29001, 500)) | {29300}`).

- [ ] **Step 3: Implementar**

`pesquisa/rodoanel/poligonos.py`:

```python
"""Os 642 poligonos de classificacao_rocada.kmz: metodo de rocada e area, nao especie.

Duas armadilhas medidas (docs/PLANO_MOTIVA.md 4.1 e 4.2):
  - o arquivo tem extensao .kmz mas e XML puro: abre-se com ElementTree, nao com zipfile;
  - o <Schema> declara classe, KM, Latitude, Longitude, Area_m2, mas os SimpleData
    gravados estao deslocados: name="classe" traz a LATITUDE, name="KM" traz a
    LONGITUDE e name="Latitude" traz a AREA em m2. A classe verdadeira esta em
    <name> e o km inteiro em <description>.
"""
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
import xml.etree.ElementTree as ET

from .marcos import Eixo

NS = {"k": "http://www.opengis.net/kml/2.2"}
METODOS = (
    "Spider, Giro-Zero ou Trator com trincheira",
    "Apenas manual",
    "Trator com braço articulado",
    "Spider, com ancoragem",
)


@dataclass(frozen=True)
class Poligono:
    indice: int
    metodo: str
    km_descricao: int
    latitude: float
    longitude: float
    area_m2: float
    aneis: tuple[tuple[tuple[float, float], ...], ...]   # cada anel: ((lon, lat), ...)


def _anel(texto: str) -> tuple[tuple[float, float], ...]:
    pontos = []
    for trio in texto.strip().split():
        lon, lat, *_ = (float(x) for x in trio.split(","))
        pontos.append((lon, lat))
    return tuple(pontos)


def ler_poligonos(caminho: str | Path) -> list[Poligono]:
    raiz = ET.parse(caminho).getroot()
    saida: list[Poligono] = []
    for i, pm in enumerate(raiz.findall(".//k:Placemark", NS)):
        metodo = (pm.findtext("k:name", default="", namespaces=NS) or "").strip()
        if metodo not in METODOS:
            raise ValueError(f"placemark {i}: metodo desconhecido {metodo!r}")
        km = int((pm.findtext("k:description", default="0", namespaces=NS) or "0").strip())
        dados = {s.get("name"): s.text for s in pm.findall(".//k:SimpleData", NS)}
        aneis = tuple(_anel(c.text) for c in pm.findall(".//k:outerBoundaryIs//k:coordinates", NS))
        if not aneis:
            raise ValueError(f"placemark {i}: sem anel externo")
        saida.append(Poligono(
            indice=i, metodo=metodo, km_descricao=km,
            latitude=float(dados["classe"]),      # deslocado: e a latitude
            longitude=float(dados["KM"]),         # deslocado: e a longitude
            area_m2=float(dados["Latitude"]),     # deslocado: e a area
            aneis=aneis,
        ))
    return saida


def marco_de(km_m: float) -> int:
    """Marco da planilha (0, 500, ..., 29000, 29300) que cobre o km dado em metros.

    Os dois ultimos marcos dividem os 300 m finais: 29000 cobre [29000, 29150) e
    29300 cobre [29150, 29300]. Ver a spec 3, decisao 7.
    """
    if km_m >= 29_150:
        return 29_300
    return int(max(0.0, min(29_000.0, math.floor(km_m / 500.0) * 500.0)))


def atribuir(poligonos: list[Poligono], eixo: Eixo) -> dict[int, tuple[int, float]]:
    """indice -> (marco, distancia do centroide ao eixo em m)."""
    saida = {}
    for p in poligonos:
        km_m, dist = eixo.km_planilha(p.latitude, p.longitude)
        saida[p.indice] = (marco_de(km_m), dist)
    return saida


def resumo_por_marco(poligonos: list[Poligono], atribuicao: dict[int, tuple[int, float]]) -> dict[int, dict]:
    areas: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    n: dict[int, int] = defaultdict(int)
    for p in poligonos:
        marco = atribuicao[p.indice][0]
        areas[marco][p.metodo] += p.area_m2
        n[marco] += 1
    saida = {}
    for marco, por_metodo in areas.items():
        dominante = max(por_metodo.items(), key=lambda kv: kv[1])[0]
        saida[marco] = {
            "metodo_dominante": dominante,
            "area_total_m2": round(sum(por_metodo.values()), 1),
            "areas": {k: round(v, 1) for k, v in sorted(por_metodo.items())},
            "n_poligonos": n[marco],
        }
    return saida
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv/bin/python -m pytest pesquisa/tests/test_poligonos.py`
Expected: 6 passed (com a linha de `MARCOS` descomentada depois da Tarefa 6; até lá, o substituto literal).

- [ ] **Step 5: Commit**

```bash
git add pesquisa/rodoanel/poligonos.py pesquisa/tests/test_poligonos.py
git commit -m "feat(pesquisa): poligonos de rocada com o esquema deslocado e atribuicao por marco"
```

---

### Task 6: Segmentos, pares, matriz de transição e a consolidação (Fase 0)

**Files:**
- Create: `pesquisa/rodoanel/segmentos.py`, `pesquisa/rodoanel/relatorio.py`, `pesquisa/consolidar.py`, `pesquisa/tests/test_segmentos.py`, `pesquisa/tests/test_consolidacao.py`
- Create (gerados): `pesquisa/dados/derivados/{segmentos,faixas,observacoes,pares,marcos_ordenados,poligonos}.csv`, `docs/pesquisa/01-consolidacao.md`

**Interfaces:**
- Consumes: `planilha.Levantamento`, `marcos.Eixo`, `poligonos.resumo_por_marco`.
- Produces: `segmentos.MARCOS: tuple[int, ...]` (60); `segmentos.BBOX = (lat_min, lat_max, lon_min, lon_max)`; `segmentos.limites_km(m) -> (km_inicio, km_fim)`; `Segmento(km_marco_m, km_inicio, km_fim, latitude, longitude, metodo_rocada, area_rocada_m2, areas_por_metodo)`; `segmentos.montar_segmentos(eixo, resumo) -> list[Segmento]`; `Par(km_m, faixa, classe_d1, classe_d2)` com `.transicao in {"cresceu","rocado","estavel"}`; `segmentos.montar_pares(lev1, lev2) -> list[Par]`; `segmentos.matriz_transicao(pares) -> dict[(int,int), int]`; `segmentos.medicao_derivada(lev) -> dict[int, tuple[int, str]]` (marco → (pior classe em escopo, faixa)); `segmentos.execucoes_inferidas(lev1, lev2) -> list[dict]`; `relatorio.consolidacao(...) -> str`, `relatorio.escrever(caminho, texto)`, `relatorio.diario(linha)`.

- [ ] **Step 1: Testes**

`pesquisa/tests/test_segmentos.py`:

```python
from datetime import date

from pesquisa.rodoanel import planilha, segmentos
from pesquisa.rodoanel.planilha import Levantamento, Observacao


def _lev(data, classes: dict[tuple[int, str], int | None]) -> Levantamento:
    marcos = (0, 500)
    faixas = [f[2] for f in planilha.FAIXAS]
    obs = tuple(Observacao(m, f, classes.get((m, f))) for m in marcos for f in faixas)
    return Levantamento("x.xlsx", data, None, "SP-021", marcos, obs)


def test_60_marcos_e_limites_dos_dois_ultimos():
    assert len(segmentos.MARCOS) == 60
    assert segmentos.limites_km(0) == (0.0, 0.5)
    assert segmentos.limites_km(28_500) == (28.5, 29.0)
    assert segmentos.limites_km(29_000) == (29.0, 29.15)
    assert segmentos.limites_km(29_300) == (29.15, 29.3)


def test_pares_transicoes_e_matriz():
    d1 = _lev(date(2026, 3, 13), {(0, "cant_lateral_externa"): 1, (0, "cant_central_interna"): 3,
                                  (500, "cant_lateral_externa"): 2, (500, "marginal_externa"): None})
    d2 = _lev(date(2026, 3, 20), {(0, "cant_lateral_externa"): 2, (0, "cant_central_interna"): 1,
                                  (500, "cant_lateral_externa"): 2, (500, "marginal_externa"): 1})
    pares = segmentos.montar_pares(d1, d2)
    assert {(p.km_m, p.faixa, p.transicao) for p in pares} == {
        (0, "cant_lateral_externa", "cresceu"), (0, "cant_central_interna", "rocado"),
        (500, "cant_lateral_externa", "estavel")}
    assert segmentos.matriz_transicao(pares) == {(1, 2): 1, (3, 1): 1, (2, 2): 1}


def test_medicao_derivada_pega_a_pior_faixa_em_escopo():
    lev = _lev(date(2026, 3, 13), {(0, "cant_lateral_externa"): 1, (0, "cant_central_interna"): 3,
                                   (0, "cant_dispositivo_ext"): 3,   # fora de escopo: ignorada
                                   (500, "cant_dispositivo_ext"): 2})  # so faixa fora de escopo
    assert segmentos.medicao_derivada(lev) == {0: (3, "cant_central_interna")}


def test_execucoes_inferidas_so_onde_alguma_faixa_caiu():
    d1 = _lev(date(2026, 3, 13), {(0, "cant_lateral_externa"): 3, (0, "cant_central_interna"): 2,
                                  (500, "cant_lateral_externa"): 1})
    d2 = _lev(date(2026, 3, 20), {(0, "cant_lateral_externa"): 1, (0, "cant_central_interna"): 2,
                                  (500, "cant_lateral_externa"): 2})
    ex = segmentos.execucoes_inferidas(d1, d2)
    assert len(ex) == 1
    assert ex[0]["km_marco_m"] == 0
    assert ex[0]["data_execucao"] == date(2026, 3, 16)   # meio de [13, 20) arredondado para baixo
    assert ex[0]["altura_antes_cm"] == 40.0 and ex[0]["altura_depois_cm"] == 5.0
    assert "cant_lateral_externa" in ex[0]["observacao"]
```

`pesquisa/tests/test_consolidacao.py` (aceitação, usa os brutos):

```python
from collections import Counter

from pesquisa.rodoanel import ARQ_LEV_1, ARQ_LEV_2, ARQ_MARCOS, ARQ_POLIGONOS, marcos, planilha, poligonos, segmentos


def test_matriz_de_transicao_medida_em_13_09_2026():
    pares = segmentos.montar_pares(planilha.ler(ARQ_LEV_1), planilha.ler(ARQ_LEV_2))
    assert len(pares) == 248
    assert segmentos.matriz_transicao(pares) == {
        (1, 1): 130, (1, 2): 30, (1, 3): 3, (2, 1): 27, (2, 2): 22, (3, 1): 22, (3, 2): 4, (3, 3): 10}
    assert Counter(p.transicao for p in pares) == {"estavel": 162, "cresceu": 33, "rocado": 53}
    assert sum(1 for p in pares if p.faixa in planilha.CODIGOS_EM_ESCOPO) == 209


def test_60_segmentos_dentro_da_bbox_com_metodo_e_area():
    eixo = marcos.carregar(ARQ_MARCOS)
    pols = poligonos.ler_poligonos(ARQ_POLIGONOS)
    segs = segmentos.montar_segmentos(eixo, poligonos.resumo_por_marco(pols, poligonos.atribuir(pols, eixo)))
    assert len(segs) == 60
    lat_min, lat_max, lon_min, lon_max = segmentos.BBOX
    assert all(lat_min <= s.latitude <= lat_max and lon_min <= s.longitude <= lon_max for s in segs)
    assert abs(sum(s.area_rocada_m2 for s in segs) - 981_817) < 1.0
    assert sum(1 for s in segs if s.metodo_rocada is None) <= 5   # marcos sem poligono (o KML pula alguns km)
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/bin/python -m pytest pesquisa/tests/test_segmentos.py pesquisa/tests/test_consolidacao.py`
Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Implementar `segmentos.py`**

```python
"""Segmentos de 500 m, pares de observacao, matriz de transicao, medicao derivada
e execucoes inferidas. Definicoes na spec 7.1."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import date, timedelta

from . import planilha
from .marcos import Eixo
from .planilha import CODIGOS_EM_ESCOPO, ORDEM_POR_CODIGO, PONTO_MEDIO_CM, Levantamento

MARCOS: tuple[int, ...] = tuple(range(0, 29_001, 500)) + (29_300,)
BBOX = (-23.64, -23.40, -46.84, -46.72)   # lat_min, lat_max, lon_min, lon_max


def limites_km(m: int) -> tuple[float, float]:
    if m == 29_000:
        return (29.0, 29.15)
    if m == 29_300:
        return (29.15, 29.3)
    return (m / 1000.0, (m + 500) / 1000.0)


@dataclass(frozen=True)
class Segmento:
    km_marco_m: int
    km_inicio: float
    km_fim: float
    latitude: float
    longitude: float
    metodo_rocada: str | None
    area_rocada_m2: float
    areas_por_metodo: dict[str, float] = field(default_factory=dict)

    @property
    def extensao_km(self) -> float:
        return round(self.km_fim - self.km_inicio, 3)


def montar_segmentos(eixo: Eixo, resumo_por_marco: dict[int, dict]) -> list[Segmento]:
    saida = []
    for m in MARCOS:
        lat, lon = eixo.posicao(m)
        ini, fim = limites_km(m)
        r = resumo_por_marco.get(m)
        saida.append(Segmento(
            km_marco_m=m, km_inicio=ini, km_fim=fim,
            latitude=round(lat, 6), longitude=round(lon, 6),
            metodo_rocada=r["metodo_dominante"] if r else None,
            area_rocada_m2=r["area_total_m2"] if r else 0.0,
            areas_por_metodo=dict(r["areas"]) if r else {},
        ))
    return saida


@dataclass(frozen=True)
class Par:
    km_m: int
    faixa: str
    classe_d1: int
    classe_d2: int

    @property
    def transicao(self) -> str:
        if self.classe_d2 > self.classe_d1:
            return "cresceu"
        if self.classe_d2 < self.classe_d1:
            return "rocado"
        return "estavel"


def montar_pares(lev1: Levantamento, lev2: Levantamento) -> list[Par]:
    if lev1.data >= lev2.data:
        raise ValueError("lev1 precisa ser anterior a lev2")
    if lev1.marcos != lev2.marcos:
        raise ValueError("os dois levantamentos precisam ter os mesmos marcos")
    c2 = {(o.km_m, o.faixa): o.classe for o in lev2.observacoes}
    pares = []
    for o in lev1.observacoes:
        depois = c2.get((o.km_m, o.faixa))
        if o.classe is not None and depois is not None:
            pares.append(Par(o.km_m, o.faixa, o.classe, depois))
    return pares


def matriz_transicao(pares: list[Par]) -> dict[tuple[int, int], int]:
    return dict(Counter((p.classe_d1, p.classe_d2) for p in pares))


def medicao_derivada(lev: Levantamento) -> dict[int, tuple[int, str]]:
    """marco -> (pior classe entre as faixas EM ESCOPO com classe, faixa que a deu)."""
    saida: dict[int, tuple[int, str]] = {}
    for o in lev.observacoes:
        if o.classe is None or o.faixa not in CODIGOS_EM_ESCOPO:
            continue
        atual = saida.get(o.km_m)
        if atual is None or o.classe > atual[0] or (
            o.classe == atual[0] and ORDEM_POR_CODIGO[o.faixa] < ORDEM_POR_CODIGO[atual[1]]
        ):
            saida[o.km_m] = (o.classe, o.faixa)
    return saida


def execucoes_inferidas(lev1: Levantamento, lev2: Levantamento) -> list[dict]:
    """Uma execucao por marco em que ALGUMA faixa caiu de classe entre as duas datas."""
    quedas: dict[int, list[Par]] = {}
    for p in montar_pares(lev1, lev2):
        if p.transicao == "rocado":
            quedas.setdefault(p.km_m, []).append(p)
    meio = lev1.data + timedelta(days=(lev2.data - lev1.data).days // 2)
    saida = []
    for m, lista in sorted(quedas.items()):
        pior = max(lista, key=lambda p: (p.classe_d1, -ORDEM_POR_CODIGO[p.faixa]))
        faixas = ", ".join(planilha.NOME_POR_CODIGO[p.faixa] for p in sorted(lista, key=lambda p: ORDEM_POR_CODIGO[p.faixa]))
        saida.append({
            "km_marco_m": m,
            "data_execucao": meio,
            "altura_antes_cm": PONTO_MEDIO_CM[pior.classe_d1],
            "altura_depois_cm": PONTO_MEDIO_CM[pior.classe_d2],
            "faixas": [p.faixa for p in lista],
            "observacao": (f"Inferida do levantamento: {faixas} caiu(ram) de classe entre "
                           f"{lev1.data.isoformat()} e {lev2.data.isoformat()}. Data incerta em ±3 dias."),
        })
    return saida
```

- [ ] **Step 4: Implementar `relatorio.py`**

```python
"""Markdown a partir de JSON. Nenhum numero de relatorio e digitado a mao."""
from __future__ import annotations

import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import DOCS_PESQUISA

FUSO_BR = timezone(timedelta(hours=-3))


def _commit() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return "sem-git"


def escrever(caminho: str | Path, texto: str) -> None:
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(texto, encoding="utf-8")


def diario(linha: str) -> None:
    agora = datetime.now(FUSO_BR).strftime("%Y-%m-%d %H:%M")
    with (DOCS_PESQUISA / "00-diario.md").open("a", encoding="utf-8") as f:
        f.write(f"- {agora} · {linha} · commit {_commit()}\n")


def _tabela(cabecalho: list[str], linhas: list[list]) -> str:
    fmt = lambda v: f"{v:.3f}".replace(".", ",") if isinstance(v, float) else str(v)
    out = ["| " + " | ".join(cabecalho) + " |", "|" + "---|" * len(cabecalho)]
    out += ["| " + " | ".join(fmt(v) for v in l) + " |" for l in linhas]
    return "\n".join(out)


def consolidacao(*, lev1, lev2, eixo, segmentos, pares, matriz, poligonos, atribuicao) -> str:
    from collections import Counter
    trans = Counter(p.transicao for p in pares)
    por_faixa = Counter(p.faixa for p in pares)
    dist = sorted(d for _, d in atribuicao.values())
    metodos = Counter(p.metodo for p in poligonos)
    area_por_metodo = Counter()
    for p in poligonos:
        area_por_metodo[p.metodo] += p.area_m2
    linhas_faixa = [[f, n] for f, n in sorted(por_faixa.items(), key=lambda kv: -kv[1])]
    linhas_matriz = [[f"{a} → {b}", n] for (a, b), n in sorted(matriz.items())]
    linhas_seg = [[s.km_marco_m, s.km_inicio, s.km_fim, s.latitude, s.longitude, s.metodo_rocada or "—", round(s.area_rocada_m2)] for s in segmentos]
    return f"""# 01 · Consolidação dos dados da Motiva

Gerado por `pesquisa/consolidar.py` em {datetime.now(FUSO_BR):%d/%m/%Y %H:%M} (commit {_commit()}).

## Fontes

| Arquivo | Data adotada | Data interna (BF6) | Observações |
|---|---|---|---|
| {lev1.arquivo} | {lev1.data} | {lev1.data_interna} | {len(lev1.observacoes)} |
| {lev2.arquivo} | {lev2.data} | {lev2.data_interna} | {len(lev2.observacoes)} |

A data interna é a mesma nos dois arquivos, logo não pode ser a data das duas caminhadas: é template.
Adotam-se as datas dos nomes.

## Eixo

30 marcos reordenados (`{list(eixo.pontos[0])}` … `{list(eixo.pontos[-1])}`), comprimento **{eixo.comprimento_m:,.0f} m**,
escala para o km da planilha **{eixo.escala:.4f}**.

## Pares de observação (13/03 → 20/03)

{len(pares)} pares · cresceram **{trans['cresceu']}** · roçados **{trans['rocado']}** · estáveis **{trans['estavel']}**.

{_tabela(["transição", "n"], linhas_matriz)}

{_tabela(["faixa", "pares"], linhas_faixa)}

## Polígonos de roçada

{len(poligonos)} polígonos, {sum(area_por_metodo.values())/10000:.1f} ha. Distância do centróide ao eixo: mediana {dist[len(dist)//2]:.0f} m, p90 {dist[int(len(dist)*0.9)]:.0f} m, máximo {dist[-1]:.0f} m.

{_tabela(["método", "polígonos", "ha"], [[m, metodos[m], round(area_por_metodo[m]/10000, 1)] for m in metodos])}

## Os 60 segmentos

{_tabela(["marco (m)", "km ini", "km fim", "lat", "lon", "método dominante", "área m²"], linhas_seg)}
"""
```

- [ ] **Step 5: Implementar `consolidar.py`**

`pesquisa/consolidar.py`:

```python
"""Fase 0: le os brutos, consolida, grava CSV + SQLite e escreve 01-consolidacao.md.

    .venv/bin/python -m pesquisa.consolidar
"""
from __future__ import annotations

import json

from pesquisa.rodoanel import (ARQ_LEV_1, ARQ_LEV_2, ARQ_MARCOS, ARQ_POLIGONOS, DERIVADOS, DOCS_PESQUISA,
                               banco, marcos, planilha, poligonos, relatorio, segmentos)


def main() -> None:
    lev1, lev2 = planilha.ler(ARQ_LEV_1), planilha.ler(ARQ_LEV_2)
    eixo = marcos.carregar(ARQ_MARCOS)
    pols = poligonos.ler_poligonos(ARQ_POLIGONOS)
    atrib = poligonos.atribuir(pols, eixo)
    resumo = poligonos.resumo_por_marco(pols, atrib)
    segs = segmentos.montar_segmentos(eixo, resumo)
    pares = segmentos.montar_pares(lev1, lev2)
    matriz = segmentos.matriz_transicao(pares)

    l_seg = [{"km_marco_m": s.km_marco_m, "km_inicio": s.km_inicio, "km_fim": s.km_fim, "latitude": s.latitude,
              "longitude": s.longitude, "metodo_rocada": s.metodo_rocada, "area_rocada_m2": s.area_rocada_m2,
              "areas_por_metodo": json.dumps(s.areas_por_metodo, ensure_ascii=False)} for s in segs]
    l_faixas = [{"codigo": c, "nome": n, "linha_planilha": l, "lado": lado, "em_escopo": int(e), "ordem": i + 1}
                for i, (l, n, c, lado, e) in enumerate(planilha.FAIXAS)]
    l_obs = [{"data": lev.data.isoformat(), "km_marco_m": o.km_m, "faixa": o.faixa, "classe": o.classe, "arquivo": lev.arquivo}
             for lev in (lev1, lev2) for o in lev.observacoes]
    l_pares = [{"km_marco_m": p.km_m, "faixa": p.faixa, "classe_d1": p.classe_d1, "classe_d2": p.classe_d2, "transicao": p.transicao}
               for p in pares]
    brutos = marcos.ler_marcos(ARQ_MARCOS)
    l_marcos = [{"ordem": k, "indice_original": i, "latitude": brutos[i][0], "longitude": brutos[i][1], "chainage_m": round(eixo.chainage[k], 1)}
                for k, i in enumerate(marcos.ORDEM_CORRIGIDA)]
    l_pols = [{"indice": p.indice, "metodo": p.metodo, "km_descricao": p.km_descricao, "km_marco_m": atrib[p.indice][0],
               "distancia_eixo_m": round(atrib[p.indice][1], 1), "area_m2": p.area_m2, "latitude": p.latitude, "longitude": p.longitude}
              for p in pols]

    for nome, linhas in (("segmentos", l_seg), ("faixas", l_faixas), ("observacoes", l_obs), ("pares", l_pares),
                         ("marcos_ordenados", l_marcos), ("poligonos", l_pols)):
        banco.gravar_csv(DERIVADOS / f"{nome}.csv", linhas)
    con = banco.abrir()
    for nome, linhas in (("segmentos", l_seg), ("faixas", l_faixas), ("observacoes", l_obs), ("pares", l_pares)):
        banco.substituir(con, nome, linhas)

    relatorio.escrever(DOCS_PESQUISA / "01-consolidacao.md", relatorio.consolidacao(
        lev1=lev1, lev2=lev2, eixo=eixo, segmentos=segs, pares=pares, matriz=matriz, poligonos=pols, atribuicao=atrib))
    print(f"{len(segs)} segmentos · {len(pares)} pares · matriz {dict(sorted(matriz.items()))}")
    print(f"-> {DERIVADOS} e {DOCS_PESQUISA / '01-consolidacao.md'}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Rodar tudo**

Run: `.venv/bin/python -m pytest pesquisa/tests` (descomente o `import MARCOS` em `test_poligonos.py`)
Expected: todos passam.

Run: `.venv/bin/python -m pesquisa.consolidar`
Expected: `60 segmentos · 248 pares · matriz {(1, 1): 130, (1, 2): 30, (1, 3): 3, (2, 1): 27, (2, 2): 22, (3, 1): 22, (3, 2): 4, (3, 3): 10}`. Abra `docs/pesquisa/01-consolidacao.md` e confira que a tabela dos 60 segmentos tem lat/lon plausíveis (−23,41 no km 0 até −23,63 no km 29,3).

- [ ] **Step 7: Diário e commit**

```bash
.venv/bin/python -c "from pesquisa.rodoanel import relatorio; relatorio.diario('Tarefa 6 · pesquisa.consolidar · 60 segmentos, 248 pares, matriz confere com a exploracao')"
git add pesquisa docs/pesquisa
git commit -m "feat(pesquisa): consolidacao do Rodoanel em 60 segmentos e 248 pares, com relatorio"
```


---

### Task 7: Clima ERA5 da janela, com aquecimento, em duas zonas

A série de previsão do Open-Meteo só alcança ~63 dias para trás; a janela é de março. Entra
`buscar_serie_arquivo` em `ml/clima.py` (módulo de produção, com teste lá) e um cache versionado
na pesquisa.

**Files:**
- Modify: `ml/clima.py`
- Create: `ml/tests/test_clima_arquivo.py`, `pesquisa/rodoanel/clima_janela.py`, `pesquisa/tests/test_clima_janela.py`
- Create (gerados): `pesquisa/dados/derivados/clima_norte_2025-11-13_2026-03-20.json`, `clima_sul_2025-11-13_2026-03-20.json`

**Interfaces:**
- Produces: `clima.buscar_serie_arquivo(lat, lon, inicio: date, fim: date, aquecimento=120) -> Serie` (todos os dias com `fonte="observado"`, `aquecimento` = dias antes de `inicio`, `fim` exclusivo na cobertura exigida); `clima_janela.ZONAS = {"norte": 7300, "sul": 22000}`, `clima_janela.zona_de(km_m) -> "norte"|"sul"`, `clima_janela.JANELA_DE = date(2026,3,13)`, `clima_janela.JANELA_ATE = date(2026,3,20)`, `clima_janela.carregar_todas(eixo, buscar=None) -> dict[str, Serie]`, `clima_janela.serie_para_json(serie) -> dict`, `clima_janela.serie_de_json(d) -> Serie`.

- [ ] **Step 1: Teste do módulo de produção**

`ml/tests/test_clima_arquivo.py`:

```python
from datetime import date, timedelta

import pytest

import clima


def _corpo(de: date, dias: int, pular: set[date] = frozenset()):
    tempos, col = [], {k: [] for k in ("temperature_2m_mean", "temperature_2m_min", "temperature_2m_max",
                                        "relative_humidity_2m_mean", "precipitation_sum",
                                        "shortwave_radiation_sum", "et0_fao_evapotranspiration")}
    for i in range(dias):
        d = de + timedelta(days=i)
        tempos.append(d.isoformat())
        nulo = d in pular
        for k in col:
            col[k].append(None if nulo else 20.0 + i)
    return {"daily": {"time": tempos, **col}}


def test_aquecimento_e_cobertura(monkeypatch):
    pedidos = []
    monkeypatch.setattr(clima, "_pedir", lambda url, params: pedidos.append(params) or _corpo(date(2026, 1, 1), 10))
    s = clima.buscar_serie_arquivo(-23.5, -46.8, date(2026, 1, 5), date(2026, 1, 8), aquecimento=4)
    assert pedidos[0]["start_date"] == "2026-01-01" and pedidos[0]["end_date"] == "2026-01-08"
    assert s.aquecimento == 4
    assert s.dias[0].data == date(2026, 1, 1) and s.dias[-1].data == date(2026, 1, 10)
    assert {d.fonte for d in s.dias} == {"observado"}


def test_dia_faltando_na_janela_e_erro(monkeypatch):
    monkeypatch.setattr(clima, "_pedir", lambda url, params: _corpo(date(2026, 1, 1), 10, pular={date(2026, 1, 6)}))
    with pytest.raises(RuntimeError, match="2026-01-06"):
        clima.buscar_serie_arquivo(-23.5, -46.8, date(2026, 1, 5), date(2026, 1, 8), aquecimento=4)


def test_fim_antes_do_inicio_e_erro():
    with pytest.raises(ValueError):
        clima.buscar_serie_arquivo(-23.5, -46.8, date(2026, 1, 8), date(2026, 1, 5))
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/bin/python -m pytest ml/tests/test_clima_arquivo.py`
Expected: FAIL, `AttributeError: module 'clima' has no attribute 'buscar_serie_arquivo'`.

- [ ] **Step 3: Implementar em `ml/clima.py`** (logo depois de `buscar_serie`)

```python
def buscar_serie_arquivo(lat: float, lon: float, inicio: date, fim: date,
                         aquecimento: int = HORIZONTE_DIAS) -> Serie:
    """Serie DIARIA do arquivo ERA5 para uma janela no PASSADO: [inicio - aquecimento, fim].

    `buscar_serie` serve o lote, que olha de hoje para a frente e so alcanca ~63
    dias para tras pela API de previsao. A validacao contra o levantamento de
    marco/2026 precisa de uma janela de meses atras com o MESMO aquecimento de
    balde que o lote usa -- e o que isto faz, numa chamada so ao arquivo.

    Todos os dias saem com fonte "observado": ERA5 e reanalise do que aconteceu.
    A janela [inicio, fim) tem que estar INTEIRA na resposta; dia faltando e
    erro, nao silencio, porque `montar_features` encurtaria a janela sem avisar.
    """
    if fim <= inicio:
        raise ValueError("fim precisa ser depois de inicio")
    corpo = _pedir(API_ARQUIVO, {
        "latitude": lat, "longitude": lon, "daily": DIARIAS,
        "start_date": (inicio - timedelta(days=aquecimento)).isoformat(),
        "end_date": fim.isoformat(),
        "timezone": "America/Sao_Paulo",
    })
    dias = _ler(corpo, "observado")
    if not dias:
        raise RuntimeError("O arquivo do Open-Meteo voltou sem nenhum dia utilizavel.")
    presentes = {d.data for d in dias}
    faltam = [inicio + timedelta(days=i) for i in range((fim - inicio).days) if inicio + timedelta(days=i) not in presentes]
    if faltam:
        raise RuntimeError("O arquivo do Open-Meteo nao cobre a janela: faltam "
                           + ", ".join(d.isoformat() for d in faltam))
    return Serie(dias, sum(1 for d in dias if d.data < inicio), None, None, None)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv/bin/python -m pytest ml/tests/test_clima_arquivo.py`
Expected: 3 passed.

- [ ] **Step 5: Teste da pesquisa**

`pesquisa/tests/test_clima_janela.py`:

```python
from datetime import date

import clima

from pesquisa.rodoanel import clima_janela


def test_zonas():
    assert clima_janela.zona_de(0) == "norte"
    assert clima_janela.zona_de(14_500) == "norte"
    assert clima_janela.zona_de(14_650) == "sul"
    assert clima_janela.zona_de(29_300) == "sul"


def test_json_ida_e_volta():
    dia = clima.Dia(date(2026, 1, 1), 20.0, 15.0, 27.0, 70.0, 3.2, 18.5, 3.1, "observado")
    s = clima.Serie([dia], 0, None, None, None)
    d = clima_janela.serie_para_json(s)
    volta = clima_janela.serie_de_json(d)
    assert volta.dias == s.dias and volta.aquecimento == 0


def test_carregar_todas_usa_o_cache_depois_da_primeira_vez(tmp_path, monkeypatch):
    monkeypatch.setattr(clima_janela, "DERIVADOS", tmp_path)
    chamadas = []

    def falso(lat, lon, inicio, fim, aquecimento):
        chamadas.append((round(lat, 2), round(lon, 2)))
        dia = clima.Dia(inicio, 20.0, 15.0, 27.0, 70.0, 0.0, 18.5, 3.1, "observado")
        return clima.Serie([dia], 0, None, None, None)

    class EixoFalso:
        def posicao(self, km_m):
            return (-23.5, -46.8) if km_m < 14_650 else (-23.6, -46.83)

    a = clima_janela.carregar_todas(EixoFalso(), buscar=falso)
    b = clima_janela.carregar_todas(EixoFalso(), buscar=falso)
    assert set(a) == {"norte", "sul"} and len(chamadas) == 2
    assert b["sul"].dias == a["sul"].dias
```

- [ ] **Step 6: Implementar `clima_janela.py`**

```python
"""Serie ERA5 da janela do levantamento, em duas zonas, com cache JSON versionado.

Duas zonas para 29 km e o que a resolucao do ERA5 (~25 km) justifica: norte
(marco 7.300) e sul (marco 22.000), divisor em 14.650 m. O cache e versionado
porque e registro: quem reler a validacao daqui a um ano precisa do mesmo clima.
"""
from __future__ import annotations

import json
import time
from datetime import date
from pathlib import Path

import clima  # ml/

from . import DERIVADOS as _DERIVADOS

DERIVADOS: Path = _DERIVADOS
ZONAS = {"norte": 7_300, "sul": 22_000}
DIVISOR_M = 14_650
JANELA_DE = date(2026, 3, 13)
JANELA_ATE = date(2026, 3, 20)      # exclusivo: [13, 20) sao os 7 dias de crescimento
AQUECIMENTO_DIAS = 120
PAUSA_S = 6.0


def zona_de(km_m: int) -> str:
    return "norte" if km_m < DIVISOR_M else "sul"


def caminho_cache(zona: str, inicio: date, fim: date) -> Path:
    return DERIVADOS / f"clima_{zona}_{inicio.isoformat()}_{fim.isoformat()}.json"


def serie_para_json(serie: clima.Serie) -> dict:
    return {"aquecimento": serie.aquecimento, "complemento": serie.complemento,
            "ano_historico": serie.ano_historico, "aviso": serie.aviso,
            "dias": [{"data": d.data.isoformat(), "tmed": d.tmed, "tmin": d.tmin, "tmax": d.tmax,
                      "umidade": d.umidade, "chuva": d.chuva, "radiacao": d.radiacao, "et0": d.et0,
                      "fonte": d.fonte} for d in serie.dias]}


def serie_de_json(d: dict) -> clima.Serie:
    dias = [clima.Dia(date.fromisoformat(x["data"]), x["tmed"], x["tmin"], x["tmax"], x["umidade"],
                      x["chuva"], x["radiacao"], x["et0"], x["fonte"]) for x in d["dias"]]
    return clima.Serie(dias, d["aquecimento"], d.get("complemento"), d.get("ano_historico"), d.get("aviso"))


def carregar_ou_buscar(zona: str, eixo, inicio: date = JANELA_DE, fim: date = JANELA_ATE,
                       aquecimento: int = AQUECIMENTO_DIAS, buscar=None) -> clima.Serie:
    arquivo = caminho_cache(zona, inicio, fim)
    if arquivo.exists():
        return serie_de_json(json.loads(arquivo.read_text(encoding="utf-8")))
    lat, lon = eixo.posicao(ZONAS[zona])
    serie = (buscar or clima.buscar_serie_arquivo)(lat, lon, inicio, fim, aquecimento)
    arquivo.parent.mkdir(parents=True, exist_ok=True)
    arquivo.write_text(json.dumps(serie_para_json(serie), ensure_ascii=False, indent=0), encoding="utf-8")
    return serie


def carregar_todas(eixo, buscar=None) -> dict[str, clima.Serie]:
    saida = {}
    for i, zona in enumerate(ZONAS):
        if i and buscar is None and not caminho_cache(zona, JANELA_DE, JANELA_ATE).exists():
            time.sleep(PAUSA_S)      # o arquivo do Open-Meteo devolve 429 em rajada
        saida[zona] = carregar_ou_buscar(zona, eixo, buscar=buscar)
    return saida


def gravar_sqlite(con, series: dict[str, clima.Serie]) -> None:
    from .banco import substituir
    linhas = [{"zona": z, "data": d.data.isoformat(), "tmed": d.tmed, "tmin": d.tmin, "tmax": d.tmax,
               "umidade": d.umidade, "chuva": d.chuva, "radiacao": d.radiacao, "et0": d.et0}
              for z, s in series.items() for d in s.dias]
    substituir(con, "clima_dia", linhas)


if __name__ == "__main__":
    from . import ARQ_MARCOS, banco, marcos
    eixo = marcos.carregar(ARQ_MARCOS)
    series = carregar_todas(eixo)
    gravar_sqlite(banco.abrir(), series)
    for z, s in series.items():
        print(f"{z}: {len(s.dias)} dias, {s.aquecimento} de aquecimento, {s.dias[0].data} a {s.dias[-1].data}")
```

- [ ] **Step 7: Rodar os testes e depois a busca de verdade**

Run: `.venv/bin/python -m pytest pesquisa/tests/test_clima_janela.py ml/tests/test_clima_arquivo.py`
Expected: 6 passed.

Run: `.venv/bin/python -m pesquisa.rodoanel.clima_janela`
Expected: duas linhas, cada uma com ~128 dias (120 de aquecimento + 7 da janela + o dia 20), de 2025-11-13 a 2026-03-20. Se vier `429`, espere 60 s e rode de novo: o cache guarda o que já veio.

- [ ] **Step 8: Commit**

```bash
git add ml/clima.py ml/tests pesquisa/rodoanel/clima_janela.py pesquisa/tests/test_clima_janela.py pesquisa/dados/derivados/clima_*.json
git commit -m "feat(clima): serie ERA5 do arquivo com aquecimento, e o cache da janela de marco no Rodoanel"
```

---

### Task 8: Solo por marco (SoilGrids)

**Files:**
- Create: `pesquisa/rodoanel/solo_km.py`, `pesquisa/tests/test_solo_km.py`
- Create (gerado): `pesquisa/dados/derivados/solo_por_marco.json`

**Interfaces:**
- Consumes: `solo.buscar(lat, lon) -> Solo(fertilidade, capacidade_mm, fonte, nitrogenio_g_kg, distancia_km, regime)` de `ml/solo.py`.
- Produces: `solo_km.carregar_ou_buscar(eixo, marcos=MARCOS, buscar=None, pausa=1.0) -> dict[int, dict]` com chaves `fertilidade, capacidade_mm, fonte, nitrogenio_g_kg, distancia_km, latitude, longitude`.

- [ ] **Step 1: Teste**

`pesquisa/tests/test_solo_km.py`:

```python
import solo

from pesquisa.rodoanel import solo_km


class EixoFalso:
    def posicao(self, km_m):
        return (-23.5 - km_m / 1e6, -46.8)


def test_busca_uma_vez_por_marco_e_reaproveita_o_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(solo_km, "CACHE", tmp_path / "solo.json")
    chamadas = []

    def falso(lat, lon):
        chamadas.append(lat)
        return solo.Solo(0.4, 60.0, "soilgrids", 1.7, 0.0)

    a = solo_km.carregar_ou_buscar(EixoFalso(), marcos=(0, 500), buscar=falso, pausa=0)
    b = solo_km.carregar_ou_buscar(EixoFalso(), marcos=(0, 500), buscar=falso, pausa=0)
    assert set(a) == {0, 500} and len(chamadas) == 2
    assert b[500]["fertilidade"] == 0.4 and b[500]["fonte"] == "soilgrids"
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/bin/python -m pytest pesquisa/tests/test_solo_km.py`
Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Implementar**

`pesquisa/rodoanel/solo_km.py`:

```python
"""SoilGrids em cada um dos 60 marcos, com cache JSON versionado.

Um marco = uma chamada; `solo.buscar` ja sonda a vizinhanca e cai na premissa,
marcando `fonte`. A pausa e pelo 429 do ISRIC. Quem cair na premissa e gravado
assim mesmo: `solo_fonte = 'premissa'` vai para o trecho e para a tela.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import solo  # ml/

from . import DERIVADOS
from .segmentos import MARCOS

CACHE: Path = DERIVADOS / "solo_por_marco.json"
PAUSA_S = 1.0


def carregar_ou_buscar(eixo, marcos=MARCOS, buscar=None, pausa: float = PAUSA_S) -> dict[int, dict]:
    buscar = buscar or solo.buscar
    dados = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    for m in marcos:
        if str(m) in dados:
            continue
        lat, lon = eixo.posicao(m)
        s = buscar(lat, lon)
        dados[str(m)] = {"fertilidade": s.fertilidade, "capacidade_mm": s.capacidade_mm, "fonte": s.fonte,
                         "nitrogenio_g_kg": s.nitrogenio_g_kg, "distancia_km": s.distancia_km,
                         "latitude": round(lat, 6), "longitude": round(lon, 6)}
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")
        if pausa:
            time.sleep(pausa)
    return {int(k): v for k, v in dados.items()}


if __name__ == "__main__":
    from . import ARQ_MARCOS, banco, marcos
    from .banco import substituir
    eixo = marcos.carregar(ARQ_MARCOS)
    dados = carregar_ou_buscar(eixo)
    substituir(banco.abrir(), "solo_marco", [{"km_marco_m": m, **{k: v[k] for k in ("fertilidade", "capacidade_mm", "fonte", "nitrogenio_g_kg", "distancia_km")}} for m, v in sorted(dados.items())])
    fontes = {}
    for v in dados.values():
        fontes[v["fonte"]] = fontes.get(v["fonte"], 0) + 1
    print(f"{len(dados)} marcos · fontes {fontes} · fertilidade {min(v['fertilidade'] for v in dados.values()):.2f}"
          f"–{max(v['fertilidade'] for v in dados.values()):.2f} · capacidade {min(v['capacidade_mm'] for v in dados.values()):.0f}"
          f"–{max(v['capacidade_mm'] for v in dados.values()):.0f} mm")
```

- [ ] **Step 4: Rodar teste e busca real**

Run: `.venv/bin/python -m pytest pesquisa/tests/test_solo_km.py`
Expected: 1 passed.

Run: `SOLO_VERBOSO=1 .venv/bin/python -m pesquisa.rodoanel.solo_km`
Expected: `60 marcos · fontes {...}` em ~2 min. Anote no diário quantos caíram em `premissa` (região metropolitana: espere alguns).

- [ ] **Step 5: Commit**

```bash
git add pesquisa/rodoanel/solo_km.py pesquisa/tests/test_solo_km.py pesquisa/dados/derivados/solo_por_marco.json
git commit -m "feat(pesquisa): solo do SoilGrids por marco do Rodoanel, com cache"
```

---

### Task 9: Validação do modelo contra os 195 pares, calibração e relatório (Fase 1)

**Este é o resultado central.** Ele produz, pela primeira vez, um número de erro real.

**Files:**
- Create: `pesquisa/rodoanel/validacao.py`, `pesquisa/validar.py`, `pesquisa/tests/test_validacao.py`
- Modify: `pesquisa/rodoanel/relatorio.py` (função `validacao`)
- Create (gerados): `pesquisa/dados/derivados/validacao.json`, `docs/pesquisa/02-validacao.md`

**Interfaces:**
- Consumes: `clima.balanco_solo`, `clima.montar_features`, `modelo.prever` (ml/); `segmentos.Par`, `Segmento`; `clima_janela.zona_de`, `carregar_todas`; `solo_km.carregar_ou_buscar`.
- Produces: `validacao.classe_de(altura_cm) -> int`; `validacao.Parametros(especie, ponto_medio_c3_cm, dias_desde_rocada, dias_periodo)` com `.ponto_medio(classe)` e `.rotulo()`; `validacao.Linha(km_m, faixa, classe_inicial, classe_final, altura_inicial_cm, features)`; `validacao.montar_linhas(pares, segmentos_por_marco, series_por_zona, zona_de, solo_por_marco, p, inicio) -> list[Linha]`; `validacao.prever(linhas, preditor) -> ndarray (n,3)`; `validacao.preditor_modelo()`; `validacao.avaliar(linhas, Q, fator=1.0) -> dict`; `validacao.calibrar(linhas, Q, mascara=None) -> (fator, J)`; `validacao.km_par(linha) -> bool`; `validacao.rodar(linhas, Q) -> dict` com chaves `sem_calibracao, ajuste_km_pares, teste_km_impares, calibracao_todos, final, fator_vigente, linha_de_base`; `validacao.fila_retrospectiva(linhas, Q, fator) -> dict`; `relatorio.validacao(saida: dict) -> str`.
- O JSON `validacao.json` tem: `gerado_em, commit, parametros, resultado, sensibilidade: list, fila_retrospectiva, pares: list` — é o que a Tarefa 13 grava em `ia.validacoes`/`ia.validacao_pares`.

- [ ] **Step 1: Teste**

`pesquisa/tests/test_validacao.py`:

```python
import numpy as np
import pytest

from pesquisa.rodoanel import validacao
from pesquisa.rodoanel.validacao import Linha, Parametros


def _linha(km, c1, c2, h0=None):
    h0 = {1: 5.0, 2: 20.0, 3: 40.0}[c1] if h0 is None else h0
    return Linha(km, "cant_lateral_externa", c1, c2, h0, {})


def test_classe_de():
    assert [validacao.classe_de(h) for h in (0, 9.99, 10, 30, 30.01, 80)] == [1, 1, 2, 2, 3, 3]


def test_parametros_ponto_medio():
    assert Parametros().ponto_medio(3) == 40.0
    assert Parametros(ponto_medio_c3_cm=50).ponto_medio(3) == 50.0
    assert Parametros().ponto_medio(1) == 5.0


def test_avaliar_caso_construido():
    linhas = [_linha(0, 1, 2), _linha(500, 1, 1), _linha(1000, 2, 2), _linha(1500, 2, 3)]
    Q = np.array([[3.0, 6.0, 9.0], [1.0, 2.0, 3.0], [2.0, 4.0, 6.0], [4.0, 8.0, 12.0]])
    r = validacao.avaliar(linhas, Q)
    # 5+6=11 -> 2 (acerto); 5+2=7 -> 1 (acerto); 20+4=24 -> 2 (acerto); 20+8=28 -> 2 (erro: observado 3)
    assert r["acuracia"] == 0.75 and r["mae_ordinal"] == 0.25
    assert r["transicoes_total"] == 2 and r["transicoes_detectadas"] == 1
    assert r["estaveis_total"] == 2 and r["alarmes_falsos"] == 0
    assert r["J"] == pytest.approx(0.5)
    assert r["matriz"]["3"]["2"] == 1 and r["matriz"]["2"]["2"] == 1
    assert r["cobertura_banda"] == pytest.approx(1.0)    # a banda 24..32 do ultimo intersecta a classe 3
    assert len(r["por_par"]) == 4 and r["por_par"][3]["classe_final_prevista"] == 2


def test_com_fator_2_o_ultimo_par_e_detectado():
    linhas = [_linha(0, 1, 2), _linha(500, 1, 1), _linha(1000, 2, 2), _linha(1500, 2, 3)]
    Q = np.array([[3.0, 6.0, 9.0], [1.0, 2.0, 3.0], [2.0, 4.0, 6.0], [4.0, 8.0, 12.0]])
    r = validacao.avaliar(linhas, Q, fator=2.0)
    # 5+12=17 -> 2 (detectada); 5+4=9 -> 1 (sem alarme); 20+8=28 -> 2 (sem alarme); 20+16=36 -> 3 (detectada)
    assert r["transicoes_detectadas"] == 2 and r["alarmes_falsos"] == 0


def test_linha_de_base_nada_muda():
    linhas = [_linha(0, 1, 2), _linha(500, 1, 1), _linha(1000, 2, 2)]
    r = validacao.avaliar(linhas, np.zeros((3, 3)))
    assert r["acuracia"] == pytest.approx(2 / 3) and r["J"] == 0.0 and r["alarmes_falsos"] == 0


def test_calibrar_acha_a_escala_certa():
    # verdade: crescimento real = 2 x q50. Metade dos pares cresce, metade nao.
    linhas = [_linha(0, 1, 2), _linha(500, 1, 1), _linha(1000, 1, 2), _linha(1500, 1, 1),
              _linha(2000, 2, 3), _linha(2500, 2, 2)]
    Q = np.array([[2, 3.0, 4], [0.5, 1.0, 1.5], [2, 3.5, 5], [0.5, 1.5, 2.5], [4, 6.0, 8], [1, 2.0, 3]])
    k, J = validacao.calibrar(linhas, Q)
    assert 1.7 <= k <= 2.6 and J == pytest.approx(1.0)


def test_km_par():
    assert validacao.km_par(_linha(0, 1, 1)) and not validacao.km_par(_linha(500, 1, 1))
    assert validacao.km_par(_linha(29_000, 1, 1)) and not validacao.km_par(_linha(29_300, 1, 1))


def test_rodar_devolve_as_pecas_e_nao_promove_fator_que_nao_melhora():
    linhas = [_linha(k * 500, 1, 1) for k in range(8)]
    Q = np.tile([[0.5, 1.0, 1.5]], (8, 1))
    r = validacao.rodar(linhas, Q)
    assert set(r) >= {"sem_calibracao", "ajuste_km_pares", "teste_km_impares", "calibracao_todos", "final", "fator_vigente", "linha_de_base"}
    assert r["fator_vigente"] == 1.0 and r["linha_de_base"]["acuracia"] == 1.0
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/bin/python -m pytest pesquisa/tests/test_validacao.py`
Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Implementar `validacao.py`**

```python
"""Confronto do modelo com os pares do levantamento: metricas, calibracao, fila retrospectiva.

Definicoes na spec 7.3. Nada aqui chama rede: clima e solo chegam prontos, e o
preditor e injetado (o `.pkl` de producao em `preditor_modelo()`, um dublê nos
testes).
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date

import numpy as np

import clima  # ml/

from .planilha import PONTO_MEDIO_CM
from .segmentos import Par, Segmento

LIMITE_1_2 = 10.0
LIMITE_2_3 = 30.0
FAIXA_CLASSE = {1: (0.0, 10.0), 2: (10.0, 30.0), 3: (30.0, 300.0)}
GRADE_FATOR = tuple(round(0.25 + 0.05 * i, 2) for i in range(76))    # 0,25 .. 4,00


def classe_de(altura_cm: float) -> int:
    if altura_cm < LIMITE_1_2:
        return 1
    if altura_cm <= LIMITE_2_3:
        return 2
    return 3


@dataclass(frozen=True)
class Parametros:
    especie: str = "braquiaria"
    ponto_medio_c3_cm: float = 40.0
    dias_desde_rocada: float = 200.0
    dias_periodo: int = 7

    def ponto_medio(self, classe: int) -> float:
        return float(self.ponto_medio_c3_cm) if classe == 3 else PONTO_MEDIO_CM[classe]

    def rotulo(self) -> str:
        return f"{self.especie} · c3={self.ponto_medio_c3_cm:g} cm · roçada há {self.dias_desde_rocada:g} d"


@dataclass(frozen=True)
class Linha:
    km_m: int
    faixa: str
    classe_inicial: int
    classe_final: int
    altura_inicial_cm: float
    features: dict


def montar_linhas(pares: list[Par], segmentos_por_marco: dict[int, Segmento], series_por_zona: dict,
                  zona_de, solo_por_marco: dict[int, dict], p: Parametros, inicio: date) -> list[Linha]:
    linhas = []
    for par in pares:
        if par.transicao == "rocado":
            continue
        seg = segmentos_por_marco[par.km_m]
        serie = series_por_zona[zona_de(par.km_m)]
        terra = solo_por_marco[par.km_m]
        h0 = p.ponto_medio(par.classe_d1)
        fr, en = clima.balanco_solo(serie.dias, terra["capacidade_mm"], h0)
        feats = clima.montar_features(
            especie=p.especie, altura_cm=h0, dias_desde_rocada=p.dias_desde_rocada, latitude=seg.latitude,
            serie=serie, inicio=inicio, dias_periodo=p.dias_periodo,
            fertilidade=terra["fertilidade"], capacidade_mm=terra["capacidade_mm"], fracoes=fr, encharcado=en)
        linhas.append(Linha(par.km_m, par.faixa, par.classe_d1, par.classe_d2, h0, feats))
    return linhas


def preditor_modelo():
    import modelo  # ml/: carrega o .pkl na importacao
    return lambda feats: modelo.prever(feats)


def prever(linhas: list[Linha], preditor) -> np.ndarray:
    if not linhas:
        return np.empty((0, 3))
    return np.asarray(preditor([l.features for l in linhas]), dtype=float).reshape(len(linhas), 3)


def avaliar(linhas: list[Linha], Q: np.ndarray, fator: float = 1.0) -> dict:
    n = len(linhas)
    ini = np.array([l.altura_inicial_cm for l in linhas], dtype=float)
    c1 = np.array([l.classe_inicial for l in linhas])
    c2 = np.array([l.classe_final for l in linhas])
    lo, med, hi = (ini + Q[:, i] * fator for i in range(3))
    cp = np.array([classe_de(h) for h in med])
    banda = np.array([FAIXA_CLASSE[c][0] <= h_hi and h_lo <= FAIXA_CLASSE[c][1] for c, h_lo, h_hi in zip(c2, lo, hi)])
    cresceu, estavel = c2 > c1, c2 == c1
    detectadas = int((cp[cresceu] > c1[cresceu]).sum())
    alarmes = int((cp[estavel] > c1[estavel]).sum())
    J = detectadas / max(int(cresceu.sum()), 1) - alarmes / max(int(estavel.sum()), 1)
    matriz = {str(a): {str(b): int(((c2 == a) & (cp == b)).sum()) for b in (1, 2, 3)} for a in (1, 2, 3)}
    por_par = [{"km_marco_m": l.km_m, "faixa": l.faixa, "classe_inicial": l.classe_inicial,
                "classe_final_observada": l.classe_final, "classe_final_prevista": int(cp[i]),
                "altura_inicial_cm": l.altura_inicial_cm,
                "q10_cm": round(float(Q[i, 0]), 3), "q50_cm": round(float(Q[i, 1]), 3), "q90_cm": round(float(Q[i, 2]), 3)}
               for i, l in enumerate(linhas)]
    return {"n": n, "fator": float(fator), "acuracia": float((cp == c2).mean()) if n else None,
            "mae_ordinal": float(np.abs(cp - c2).mean()) if n else None, "matriz": matriz,
            "transicoes_total": int(cresceu.sum()), "transicoes_detectadas": detectadas,
            "estaveis_total": int(estavel.sum()), "alarmes_falsos": alarmes, "J": float(J),
            "cobertura_banda": float(banda.mean()) if n else None, "por_par": por_par}


def km_par(l: Linha) -> bool:
    return (l.km_m // 500) % 2 == 0


def calibrar(linhas: list[Linha], Q: np.ndarray, mascara=None) -> tuple[float, float]:
    idx = np.arange(len(linhas)) if mascara is None else np.flatnonzero(np.asarray(mascara))
    sub = [linhas[i] for i in idx]
    melhor_k, melhor_J = 1.0, -np.inf
    for k in GRADE_FATOR:
        J = avaliar(sub, Q[idx], k)["J"]
        if J > melhor_J + 1e-12 or (abs(J - melhor_J) <= 1e-12 and abs(k - 1.0) < abs(melhor_k - 1.0)):
            melhor_k, melhor_J = float(k), float(J)
    return melhor_k, melhor_J


def rodar(linhas: list[Linha], Q: np.ndarray) -> dict:
    base = avaliar(linhas, Q, 1.0)
    m_par = np.array([km_par(l) for l in linhas])
    k_aj, J_aj = calibrar(linhas, Q, m_par)
    impares = [l for l, m in zip(linhas, m_par) if not m]
    Q_imp = Q[~m_par]
    k_todos, J_todos = calibrar(linhas, Q)
    final = avaliar(linhas, Q, k_todos)
    vigente = k_todos if final["J"] > base["J"] + 1e-12 else 1.0
    return {
        "sem_calibracao": base,
        "ajuste_km_pares": {"fator": k_aj, "J": J_aj, "n": int(m_par.sum())},
        "teste_km_impares": {"n": len(impares), "sem": avaliar(impares, Q_imp, 1.0), "com": avaliar(impares, Q_imp, k_aj)},
        "calibracao_todos": {"fator": k_todos, "J": J_todos},
        "final": final if vigente != 1.0 else base,
        "fator_vigente": vigente,
        "linha_de_base": {"acuracia": base["estaveis_total"] / base["n"] if base["n"] else None, "J": 0.0,
                          "descricao": "modelo que responde 'nada muda em 7 dias'"},
    }


def fila_retrospectiva(linhas: list[Linha], Q: np.ndarray, fator: float, em_escopo: frozenset[str]) -> dict:
    """Em 13/03, quais segmentos o sistema marcaria como 'cruza 30 cm em ate 7 dias', e quantos cruzaram."""
    por_seg: dict[int, dict] = {}
    for i, l in enumerate(linhas):
        if l.faixa not in em_escopo:
            continue
        s = por_seg.setdefault(l.km_m, {"ini": 0, "prev": 0, "obs": 0})
        s["ini"] = max(s["ini"], l.classe_inicial)
        s["prev"] = max(s["prev"], classe_de(l.altura_inicial_cm + Q[i, 1] * fator))
        s["obs"] = max(s["obs"], l.classe_final)
    marcados = {k for k, s in por_seg.items() if s["ini"] < 3 and s["prev"] == 3}
    cruzaram = {k for k, s in por_seg.items() if s["ini"] < 3 and s["obs"] == 3}
    return {"segmentos_avaliados": len(por_seg), "marcados": sorted(marcados), "cruzaram": sorted(cruzaram),
            "acertos": sorted(marcados & cruzaram), "n_marcados": len(marcados), "n_cruzaram": len(cruzaram),
            "n_acertos": len(marcados & cruzaram)}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv/bin/python -m pytest pesquisa/tests/test_validacao.py`
Expected: 8 passed.

- [ ] **Step 5: Acrescentar `relatorio.validacao`** ao fim de `pesquisa/rodoanel/relatorio.py`

```python
def _pct(x):
    return "—" if x is None else f"{100 * x:.1f}%".replace(".", ",")


def _metricas(r: dict, nome: str) -> list:
    return [nome, r["n"], f"{r['fator']:.2f}".replace(".", ","), _pct(r["acuracia"]),
            f"{r['transicoes_detectadas']} de {r['transicoes_total']}",
            f"{r['alarmes_falsos']} de {r['estaveis_total']}", f"{r['J']:.3f}".replace(".", ","), _pct(r["cobertura_banda"])]


def validacao(saida: dict) -> str:
    res = saida["resultado"]
    base, final = res["sem_calibracao"], res["final"]
    lb = res["linha_de_base"]
    cab = ["cenário", "n", "fator", "acurácia de classe", "transições detectadas", "alarmes falsos", "J", "cobertura da banda"]
    linhas = [["linha de base: nada muda", base["n"], "—", _pct(lb["acuracia"]), f"0 de {base['transicoes_total']}", f"0 de {base['estaveis_total']}", "0,000", "—"],
              _metricas(base, "modelo sem calibração"),
              _metricas(final, f"modelo calibrado (fator vigente {res['fator_vigente']:.2f})".replace(".", ","))]
    tk = res["teste_km_impares"]
    matriz = final["matriz"]
    m_linhas = [[f"observada {a}", matriz[str(a)]["1"], matriz[str(a)]["2"], matriz[str(a)]["3"]] for a in (1, 2, 3)]
    sens = [[s["rotulo"], s["n"], _pct(s["acuracia"]), f"{s['transicoes_detectadas']} de {s['transicoes_total']}",
             f"{s['alarmes_falsos']} de {s['estaveis_total']}", f"{s['J']:.3f}".replace(".", ",")] for s in saida["sensibilidade"]]
    fila = saida["fila_retrospectiva"]
    p = saida["parametros"]
    return f"""# 02 · Validação do modelo contra o levantamento da Motiva

Gerado por `pesquisa/validar.py` em {saida['gerado_em']} (commit {saida['commit']}).

Janela **13 → 20/03/2026** (7 dias). Pares usados: **{base['n']}** dos 248 (os 53 com queda de classe são roçada e ficam fora).
Premissas do cenário vigente: espécie **{p['especie']}**, classe 3 = **{p['ponto_medio_c3_cm']:g} cm**, dias desde a roçada = **{p['dias_desde_rocada']:g}**.

## O número

{_tabela(cab, linhas)}

`J` = fração das transições detectadas − fração de alarmes falsos. A linha de base acerta {_pct(lb['acuracia'])} sem prever nada: **acurácia total não é o critério**; transições detectadas e alarmes falsos são.

## Calibração honesta: ajuste nos km pares, teste nos km ímpares

- Ajuste (n = {res['ajuste_km_pares']['n']}): fator **{res['ajuste_km_pares']['fator']:.2f}**, J = {res['ajuste_km_pares']['J']:.3f}
- Teste (n = {tk['n']}): J sem calibração = {tk['sem']['J']:.3f} → com o fator do ajuste = {tk['com']['J']:.3f}
- Reajuste em todos: fator {res['calibracao_todos']['fator']:.2f}, J = {res['calibracao_todos']['J']:.3f}. Vigente: **{res['fator_vigente']:.2f}**{" (a calibração não melhorou o critério; fica 1,00)" if res['fator_vigente'] == 1.0 else ""}.

## Matriz de confusão do cenário vigente (linhas = observado em 20/03, colunas = previsto)

{_tabela(["", "prevista 1", "prevista 2", "prevista 3"], m_linhas)}

## Sensibilidade às premissas (sem calibração)

{_tabela(["cenário", "n", "acurácia", "transições detectadas", "alarmes falsos", "J"], sens)}

## Fila retrospectiva

Em 13/03, com o fator vigente, o sistema marcaria **{fila['n_marcados']}** segmento(s) como "cruza 30 cm em até 7 dias" entre os {fila['segmentos_avaliados']} com faixa em escopo; **{fila['n_cruzaram']}** de fato chegaram à classe 3 em 20/03; acertos: **{fila['n_acertos']}**.

## Limitações

- Duas datas, ambas em março: vale para o fim da estação chuvosa em São Paulo.
- Classes ordinais, não altura; o ponto médio é aproximação (ver sensibilidade).
- Dias desde a roçada desconhecidos: premissa de {p['dias_desde_rocada']:g} dias, testada em 30 e 60.
- 33 transições é amostra pequena; o fator é local ao Rodoanel.
"""
```

- [ ] **Step 6: Implementar `pesquisa/validar.py`**

```python
"""Fase 1: confronta o modelo com os pares sem rocada, calibra e escreve 02-validacao.md.

    .venv/bin/python -m pesquisa.validar
"""
from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime

from pesquisa.rodoanel import (ARQ_MARCOS, DERIVADOS, DOCS_PESQUISA, banco, clima_janela, marcos, relatorio,
                               solo_km, validacao)
from pesquisa.rodoanel.planilha import CODIGOS_EM_ESCOPO
from pesquisa.rodoanel.segmentos import Par, Segmento
from pesquisa.rodoanel.validacao import Parametros

ESPECIES = ("braquiaria", "batatais", "esmeralda")
PONTOS_C3 = (35.0, 40.0, 50.0)
DIAS_ROCADA = (30.0, 60.0, 200.0)


def _segmentos() -> dict[int, Segmento]:
    saida = {}
    for r in banco.ler_csv(DERIVADOS / "segmentos.csv"):
        saida[int(r["km_marco_m"])] = Segmento(int(r["km_marco_m"]), float(r["km_inicio"]), float(r["km_fim"]),
                                               float(r["latitude"]), float(r["longitude"]),
                                               r["metodo_rocada"] or None, float(r["area_rocada_m2"]))
    return saida


def _pares() -> list[Par]:
    return [Par(int(r["km_marco_m"]), r["faixa"], int(r["classe_d1"]), int(r["classe_d2"]))
            for r in banco.ler_csv(DERIVADOS / "pares.csv")]


def main() -> None:
    eixo = marcos.carregar(ARQ_MARCOS)
    segs, pares = _segmentos(), _pares()
    series = clima_janela.carregar_todas(eixo)
    solo = solo_km.carregar_ou_buscar(eixo)
    preditor = validacao.preditor_modelo()
    padrao = Parametros()

    def linhas_e_Q(p: Parametros):
        linhas = validacao.montar_linhas(pares, segs, series, clima_janela.zona_de, solo, p, clima_janela.JANELA_DE)
        return linhas, validacao.prever(linhas, preditor)

    linhas, Q = linhas_e_Q(padrao)
    resultado = validacao.rodar(linhas, Q)

    sensibilidade = []
    for esp in ESPECIES:
        for c3 in PONTOS_C3:
            for roc in DIAS_ROCADA:
                p = Parametros(esp, c3, roc)
                l2, Q2 = linhas_e_Q(p)
                r = validacao.avaliar(l2, Q2, 1.0)
                r.pop("por_par")
                sensibilidade.append({"rotulo": p.rotulo(), "parametros": asdict(p), **r})

    saida = {
        "gerado_em": datetime.now(relatorio.FUSO_BR).strftime("%d/%m/%Y %H:%M"),
        "commit": relatorio._commit(),
        "janela": {"de": clima_janela.JANELA_DE.isoformat(), "ate": clima_janela.JANELA_ATE.isoformat()},
        "parametros": asdict(padrao),
        "resultado": resultado,
        "sensibilidade": sensibilidade,
        "fila_retrospectiva": validacao.fila_retrospectiva(linhas, Q, resultado["fator_vigente"], CODIGOS_EM_ESCOPO),
        "pares": resultado["final"]["por_par"],
    }
    (DERIVADOS / "validacao.json").write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")
    con = banco.abrir()
    con.execute("insert or replace into validacoes (chave, json) values ('vigente', ?)", (json.dumps(saida, ensure_ascii=False),))
    con.commit()
    relatorio.escrever(DOCS_PESQUISA / "02-validacao.md", relatorio.validacao(saida))

    b, f = resultado["sem_calibracao"], resultado["final"]
    print(f"n={b['n']} · base acuracia={resultado['linha_de_base']['acuracia']:.3f}")
    print(f"sem calibracao: acuracia={b['acuracia']:.3f} transicoes={b['transicoes_detectadas']}/{b['transicoes_total']} "
          f"alarmes={b['alarmes_falsos']}/{b['estaveis_total']} J={b['J']:.3f}")
    print(f"vigente fator={resultado['fator_vigente']:.2f}: acuracia={f['acuracia']:.3f} transicoes={f['transicoes_detectadas']}/{f['transicoes_total']} "
          f"alarmes={f['alarmes_falsos']}/{f['estaveis_total']} J={f['J']:.3f}")
    print(f"-> {DERIVADOS / 'validacao.json'} e {DOCS_PESQUISA / '02-validacao.md'}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 7: Rodar**

Run: `.venv/bin/python -m pesquisa.validar`
Expected: quatro linhas de resumo e os dois arquivos. Leia `docs/pesquisa/02-validacao.md` inteiro. Confira: `n = 195`; `transicoes_total = 33`; `estaveis_total = 162`; a linha de base com 83,1%. **Qualquer número de acurácia é aceitável.** O que não é aceitável é o script falhar em silêncio ou um `n` diferente de 195.

- [ ] **Step 8: Diário e commit**

```bash
.venv/bin/python -c "
import json; from pesquisa.rodoanel import relatorio, DERIVADOS
s=json.load(open(DERIVADOS/'validacao.json')); r=s['resultado']; b=r['sem_calibracao']; f=r['final']
relatorio.diario(f\"Tarefa 9 · pesquisa.validar · n={b['n']} sem calib J={b['J']:.3f} acc={b['acuracia']:.3f}; vigente fator={r['fator_vigente']:.2f} J={f['J']:.3f} acc={f['acuracia']:.3f}\")"
git add pesquisa docs/pesquisa
git commit -m "feat(pesquisa): validacao do modelo contra 195 pares reais do Rodoanel, calibracao e relatorio"
```


---

### Task 10: O lote não prevê sobre medição vencida e só olha trecho ativo

Vai para o `main` **antes** da Tarefa 13. O lote das 06:00 de amanhã encontra 60 trechos com medição de março; sem esta regra ele inventaria previsão para eles.

**Files:**
- Modify: `ml/analise.py`, `ml/analisar_lote.py`
- Create: `ml/tests/test_analise.py`, `ml/tests/apoio.py`

**Interfaces:**
- Produces: `analise.VALIDADE_MEDICAO_DIAS = 120`; `analise.analisar_trecho` levanta `LookupError("medicao vencida (N d, limite 120)")` quando a base tem mais de 120 dias; `apoio.FakeSb(medicoes: list[dict], execucoes: list[dict])` e `apoio.serie_sintetica(hoje, antes=190, depois=20) -> clima.Serie` para os testes de `ml/`.

- [ ] **Step 1: Apoio de teste e o teste**

`ml/tests/apoio.py`:

```python
"""Dubles para testar analise.py sem Supabase e sem rede."""
from datetime import date, timedelta

import clima


class _Resposta:
    def __init__(self, dados):
        self.data = dados


class _Consulta:
    def __init__(self, dados):
        self._dados = dados

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def in_(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        return _Resposta(self._dados)


class FakeSb:
    """So o que `analisar_trecho` le: medicoes e execucoes do trecho."""

    def __init__(self, medicoes=(), execucoes=()):
        self._tabelas = {"medicoes": list(medicoes), "execucoes": list(execucoes)}

    def table(self, nome):
        return _Consulta(self._tabelas.get(nome, []))


def serie_sintetica(hoje: date, antes: int = 190, depois: int = 20) -> clima.Serie:
    dias = []
    for i in range(-antes, depois):
        d = hoje + timedelta(days=i)
        onda = (i % 11) / 11.0
        dias.append(clima.Dia(d, 22.0 + 4 * onda, 15.0 + 3 * onda, 29.0 + 5 * onda, 70.0, 6.0 if i % 4 == 0 else 0.0,
                              18.0, 3.4, "observado" if i < 0 else "previsao"))
    return clima.Serie(dias, antes, None, None, None)


def trecho(**extra) -> dict:
    base = {"id": 1, "rodovia": "SP-021 Rodoanel Oeste", "km_inicio": 0.0, "km_fim": 0.5, "uf": "SP",
            "latitude": -23.416, "longitude": -46.737, "especie": "braquiaria", "altura_limite_cm": 30,
            "tipo_pista": "faixa de dominio", "observacoes": "teste"}
    base.update(extra)
    return base
```

`ml/tests/test_analise.py`:

```python
from datetime import date, timedelta

import pytest

import analise
import solo
from apoio import FakeSb, serie_sintetica, trecho

HOJE = date(2026, 9, 14)
TERRA = solo.Solo(0.4, 60.0, "soilgrids")


def test_medicao_com_mais_de_120_dias_e_vencida():
    sb = FakeSb(medicoes=[{"data": (HOJE - timedelta(days=121)).isoformat(), "altura_cm": 20.0}])
    with pytest.raises(LookupError, match="vencida"):
        analise.analisar_trecho(sb, trecho(), serie_sintetica(HOJE), TERRA, HOJE)


def test_medicao_de_120_dias_ainda_vale():
    sb = FakeSb(medicoes=[{"data": (HOJE - timedelta(days=120)).isoformat(), "altura_cm": 20.0}])
    r = analise.analisar_trecho(sb, trecho(), serie_sintetica(HOJE), TERRA, HOJE)
    assert r["decorridos"] == 120 and r["altura_hoje"] > 0


def test_rocada_recente_reabre_o_prazo():
    sb = FakeSb(
        medicoes=[{"data": (HOJE - timedelta(days=200)).isoformat(), "altura_cm": 35.0}],
        execucoes=[{"data_execucao": (HOJE - timedelta(days=10)).isoformat(), "altura_depois_cm": 6.0}],
    )
    r = analise.analisar_trecho(sb, trecho(), serie_sintetica(HOJE), TERRA, HOJE)
    assert r["partiu_da_rocada"] is True and r["decorridos"] == 10


def test_sem_medicao_continua_sendo_lookup_error():
    with pytest.raises(LookupError, match="sem medicao"):
        analise.analisar_trecho(FakeSb(), trecho(), serie_sintetica(HOJE), TERRA, HOJE)
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/bin/python -m pytest ml/tests/test_analise.py`
Expected: o primeiro teste FALHA (nenhum `LookupError`); os outros passam.

- [ ] **Step 3: A regra em `ml/analise.py`**

Logo abaixo dos `import`, acrescente:

```python
#: Medicao (ou rocada) mais antiga que isto nao vira previsao. E o horizonte do
#: modelo: alem de 120 dias `dias_periodo` satura no ultimo bin, e a janela
#: [medicao, hoje) seria montada com menos dias do que passaram, em silencio.
#: O trecho aparece como LACUNA no painel, nunca com numero inventado.
VALIDADE_MEDICAO_DIAS = 120
```

Em `analisar_trecho`, logo depois de `decorridos = (hoje - data_base).days`:

```python
    if decorridos > VALIDADE_MEDICAO_DIAS:
        raise LookupError(f"medicao vencida ({decorridos} d, limite {VALIDADE_MEDICAO_DIAS})")
```

- [ ] **Step 4: O lote só olha trecho ativo e conta "vencida" à parte**

Em `ml/analisar_lote.py`, em `main()`:

`consulta = sb.table("trechos").select("*").order("id")` vira
`consulta = sb.table("trechos").select("*").eq("ativo", True).order("id")`.

`motivos = {"sem_dados": 0, "folgado": 0, "na_banda": 0, "ja_aprovado": 0}` vira
`motivos = {"sem_dados": 0, "vencida": 0, "folgado": 0, "na_banda": 0, "ja_aprovado": 0}`.

O bloco `except LookupError as e:` que hoje faz `motivos["sem_dados"] += 1` vira:

```python
            except LookupError as e:
                print(f"  [{e}]  {nome}")
                motivos["vencida" if "vencida" in str(e) else "sem_dados"] += 1
                continue
```

E no resumo do fim, depois do `if motivos["sem_dados"]:`, acrescente:

```python
    if motivos["vencida"]:
        print(f"ATENCAO: {motivos['vencida']} trecho(s) com MEDICAO VENCIDA (> {analise.VALIDADE_MEDICAO_DIAS} d) - "
              f"sem previsao de proposito; o painel os lista como lacuna. Precisam de levantamento novo.")
```

- [ ] **Step 5: Rodar e ver passar**

Run: `.venv/bin/python -m pytest ml/tests`
Expected: todos passam (os 4 de `test_analise` e os 3 de `test_clima_arquivo`).

- [ ] **Step 6: Commit (sem push ainda: o `.eq("ativo")` precisa da migração 1)**

```bash
git add ml/analise.py ml/analisar_lote.py ml/tests
git commit -m "feat(lote): medicao com mais de 120 dias nao vira previsao, e o lote so analisa trecho ativo"
```

---

### Task 11: Backup, migração 1 (estrutura) e fumaça

**Files:**
- Create: `supabase/migrations/20260913100000_rodoanel_base_real.sql`
- Modify: `web/scripts/fumaca.mjs`

- [ ] **Step 1: Backup, se ainda não existir**

```bash
ls -la ~/motiva-backups/ 2>/dev/null
```

Se não houver `*esquema*.sql` e `*dados*.sql` de hoje, e o `.env` da raiz tiver `SUPABASE_DB_URL` (lista manual A2), gere:

```bash
set -a; source .env; set +a
mkdir -p ~/motiva-backups
/usr/local/opt/libpq/bin/pg_dump "$SUPABASE_DB_URL" --schema=ia --schema=public --no-owner --no-privileges -s -f ~/motiva-backups/$(date +%F)-esquema.sql
/usr/local/opt/libpq/bin/pg_dump "$SUPABASE_DB_URL" --schema=ia --schema=public --no-owner --no-privileges -a -f ~/motiva-backups/$(date +%F)-dados.sql
ls -la ~/motiva-backups/
```

Expected: dois arquivos, o de dados com alguns MB. Sem `SUPABASE_DB_URL`, pare e peça ao humano (item A2 da lista). **Não aplique migração sem backup.**

- [ ] **Step 2: Escrever a migração**

Crie `supabase/migrations/20260913100000_rodoanel_base_real.sql` com o bloco **§6.1 da spec, integralmente e sem alteração**. Se editar algo, edite a spec junto.

- [ ] **Step 3: Aplicar**

Caminho A (MCP do Supabase apontado para o projeto `mbkcygsqfcxxcmvkuqyt`): `apply_migration(name="rodoanel_base_real", query=<conteudo do arquivo>)`.

Caminho B (psql da libpq, com `SUPABASE_DB_URL` no `.env`):

```bash
set -a; source .env; set +a
/usr/local/opt/libpq/bin/psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20260913100000_rodoanel_base_real.sql
```

Expected: sem erro. Se falhar em `add constraint ux_trechos_rodovia_marco`, é porque já existe: a migração foi aplicada duas vezes; confira com a consulta abaixo e não repita.

- [ ] **Step 4: Conferir**

```sql
select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'ia' and c.relkind = 'r'
  and c.relname in ('faixas','levantamentos','validacoes','validacao_pares','calibracoes','ndvi_observacoes','ndvi_analises');
select count(*) as faixas, count(*) filter (where em_escopo) as em_escopo from ia.faixas;
select column_name from information_schema.columns where table_schema = 'ia' and table_name = 'trechos'
  and column_name in ('ativo','fonte_cadastro','km_marco_m','metodo_rocada','area_rocada_m2','fertilidade_solo','capacidade_agua_solo_mm','solo_fonte');
select origem, count(*) from ia.medicoes group by 1;
```

Expected: 7 tabelas com `relrowsecurity = true`; `12 | 4`; 8 colunas; todas as medições em `demonstracao`.

- [ ] **Step 5: Fumaça cobre as tabelas novas**

Em `web/scripts/fumaca.mjs`, localize a lista das 15 tabelas de `ia` que a chave publishável não pode ler (`grep -n "perfis" web/scripts/fumaca.mjs` acha a linha) e acrescente, na mesma lista: `"faixas", "levantamentos", "validacoes", "validacao_pares", "calibracoes", "ndvi_observacoes", "ndvi_analises"`. Ajuste o texto da verificação de "15" para "22" tabelas se ele estiver escrito.

```bash
cd web && npm run fumaca; cd ..
```

Expected: verde, com as 22 tabelas listadas na saída.

- [ ] **Step 6: Commit e push (leva a Tarefa 10 junto)**

```bash
git add supabase/migrations/20260913100000_rodoanel_base_real.sql web/scripts/fumaca.mjs
git commit -m "feat(banco): estrutura dos dados reais do Rodoanel: faixas, levantamentos, validacoes, calibracoes, ndvi"
git push origin main
.venv/bin/python -c "from pesquisa.rodoanel import relatorio; relatorio.diario('Tarefa 11 · backup em ~/motiva-backups e migracao 20260913100000 aplicada · 7 tabelas com RLS, 12 faixas')"
```

---

### Task 12: Seed limpo e migração 2 (higiene e view)

**Files:**
- Create: `supabase/migrations/20260913101000_rodoanel_higiene_e_view.sql`

- [ ] **Step 1: Limpar o seed de demonstração**

```bash
cd web && npm run semear:demonstracao -- --limpar; cd ..
```

Expected: "Limpeza concluída." Precisa de `web/.env.local` com `SEED_SENHA` de pelo menos 10 caracteres (o script exige mesmo para limpar).

- [ ] **Step 2: Guardar o que a migração vai descartar, para o rollback**

```bash
set -a; source .env; set +a
/usr/local/opt/libpq/bin/psql "$SUPABASE_DB_URL" -c "copy (select id, status, equipe_id from ia.agendamentos where status in ('sugerido','aprovado') and trecho_id in (select id from ia.trechos where fonte_cadastro = 'demonstracao') order by id) to stdout csv header" > ~/motiva-backups/$(date +%F)-agendamentos-abertos-demo.csv
wc -l ~/motiva-backups/*agendamentos-abertos-demo.csv
```

- [ ] **Step 3: Escrever e aplicar a migração**

Crie `supabase/migrations/20260913101000_rodoanel_higiene_e_view.sql` com o bloco **§6.2 da spec, integralmente**. Aplique pelo mesmo caminho da Tarefa 11 (`apply_migration(name="rodoanel_higiene_e_view", ...)` ou `psql --single-transaction`).

- [ ] **Step 4: Conferir**

```sql
select nome, mobilizacao_dias from ia.concessionarias where nome = 'RodoAnel';
select rodovia, km_inicio, km_fim from ia.zonas_clima where rodovia like 'SP-021%';
select nome, ativo from ia.equipes order by ativo desc, nome;
select count(*) filter (where ativo) as ativos, count(*) filter (where not ativo) as ocultos from ia.trechos;
select count(*) from ia.agendamentos a join ia.trechos t on t.id = a.trecho_id where not t.ativo and a.status in ('sugerido','aprovado');
select count(*) from ia.vw_trecho_status;
select column_name from information_schema.columns where table_schema='ia' and table_name='vw_trecho_status' and column_name in ('fonte_cadastro','classe_medida','fator_calibracao');
```

Expected: `RodoAnel | 7`; a zona 0–29,3; só `Equipe Roçada RodoAnel 01` ativa; `0 | 50` (ou o total que houver de fictícios); `0`; `0` (ainda sem Rodoanel); 3 colunas.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260913101000_rodoanel_higiene_e_view.sql
git commit -m "feat(banco): malha ficticia oculta, RodoAnel como concessionaria e view so com trecho ativo"
.venv/bin/python -c "from pesquisa.rodoanel import relatorio; relatorio.diario('Tarefa 12 · seed limpo e migracao 20260913101000 aplicada · 50 trechos ocultos, 0 agendamentos abertos em trecho inativo')"
```

---

### Task 13: Gravar o Rodoanel no Supabase pelo caminho do importador

**Files:**
- Create: `pesquisa/rodoanel/supabase_io.py`, `pesquisa/importar_levantamento.py`, `pesquisa/publicar_rodoanel.py`, `pesquisa/tests/test_importador.py`

**Interfaces:**
- Consumes: `planilha.ler`, `segmentos.medicao_derivada`, `segmentos.execucoes_inferidas`, `segmentos.limites_km`, `validacao.json`.
- Produces: `supabase_io.cliente()`; `supabase_io.concessionaria_id(sb, nome) -> int`; `supabase_io.linha_trecho(seg, solo: dict|None, conc_id) -> dict`; `supabase_io.upsert_trechos(sb, segmentos, solo_por_marco, conc_id) -> dict[int,int]`; `supabase_io.ids_por_marco(sb) -> dict[int,int]`; `supabase_io.linhas_levantamento(lev, ids) -> list[dict]`; `supabase_io.linhas_medicoes(lev, ids) -> list[dict]`; `supabase_io.linhas_execucoes(lev1, lev2, ids, extensao_por_marco) -> list[dict]`; `supabase_io.upsert_levantamentos(sb, linhas)`; `supabase_io.regravar_medicoes(sb, data, ids, linhas)`; `supabase_io.regravar_execucoes(sb, data, ids, linhas)`; `supabase_io.gravar_validacao(sb, saida, ids, pares_rocados, vigente=True) -> int`; `supabase_io.ativar_calibracao(sb, validacao_id, fator, especie)`; `supabase_io.upsert_ndvi(sb, linhas)`; `supabase_io.inserir_ndvi_analise(sb, linha)`.

- [ ] **Step 1: Teste (sem rede: só a montagem das linhas)**

`pesquisa/tests/test_importador.py`:

```python
from datetime import date

from pesquisa.rodoanel import ARQ_LEV_1, ARQ_LEV_2, planilha, supabase_io
from pesquisa.rodoanel.segmentos import MARCOS, Segmento, limites_km

IDS = {m: 1000 + i for i, m in enumerate(MARCOS)}          # ids falsos, um por marco


def test_linhas_de_levantamento_sao_720_por_arquivo_e_unicas():
    lev = planilha.ler(ARQ_LEV_1)
    linhas = supabase_io.linhas_levantamento(lev, IDS)
    assert len(linhas) == 720
    assert len({(l["trecho_id"], l["faixa_codigo"], l["data"]) for l in linhas}) == 720
    assert {l["data"] for l in linhas} == {"2026-03-13"}
    assert all(l["data_no_arquivo"] == "2025-03-28" for l in linhas)
    com_classe = [l for l in linhas if l["classe"] is not None]
    assert all(l["altura_estimada_cm"] == {1: 5.0, 2: 20.0, 3: 40.0}[l["classe"]] for l in com_classe)


def test_medicoes_derivadas_uma_por_marco_com_faixa_em_escopo():
    lev = planilha.ler(ARQ_LEV_1)
    linhas = supabase_io.linhas_medicoes(lev, IDS)
    assert 50 <= len(linhas) <= 60
    assert all(l["origem"] == "levantamento_classe" and l["classe"] in (1, 2, 3) for l in linhas)
    assert all(l["faixa_codigo"] in planilha.CODIGOS_EM_ESCOPO for l in linhas)


def test_execucoes_inferidas_no_par_real():
    lev1, lev2 = planilha.ler(ARQ_LEV_1), planilha.ler(ARQ_LEV_2)
    ext = {m: limites_km(m)[1] - limites_km(m)[0] for m in MARCOS}
    linhas = supabase_io.linhas_execucoes(lev1, lev2, IDS, ext)
    assert 1 <= len(linhas) <= 53
    assert all(l["origem"] == "inferida_levantamento" and l["data_execucao"] == "2026-03-16" for l in linhas)
    assert all(l["altura_antes_cm"] > l["altura_depois_cm"] for l in linhas)


def test_linha_trecho():
    seg = Segmento(15_000, 15.0, 15.5, -23.515647, -46.817408, "Apenas manual", 1234.5, {"Apenas manual": 1234.5})
    t = supabase_io.linha_trecho(seg, {"fertilidade": 0.4, "capacidade_mm": 60.0, "fonte": "soilgrids"}, 7)
    assert t["rodovia"] == "SP-021 Rodoanel Oeste" and t["km_marco_m"] == 15_000
    assert t["altura_limite_cm"] == 30 and t["especie"] == "braquiaria" and t["fonte_cadastro"] == "levantamento_motiva"
    assert t["ativo"] is True and t["concessionaria_id"] == 7 and t["solo_fonte"] == "soilgrids"
    assert "Apenas manual" in t["observacoes"] and "premissa" in t["observacoes"]
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/bin/python -m pytest pesquisa/tests/test_importador.py`
Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Implementar `supabase_io.py`**

```python
"""Gravacao idempotente no Supabase (schema ia) com a chave secreta do .env da raiz.

Chaves de idempotencia (spec 6.3): trechos por (rodovia, km_marco_m); levantamentos
por (trecho_id, faixa_codigo, data); medicoes e execucoes derivadas sao apagadas e
regravadas por (trecho, data, origem). Rodar duas vezes deixa o banco igual.
"""
from __future__ import annotations

import os
from datetime import date

from dotenv import load_dotenv
from supabase import create_client

try:
    from supabase import ClientOptions
except ImportError:                                  # versoes mais antigas
    from supabase.lib.client_options import ClientOptions

from . import ALTURA_LIMITE_CM, CONCESSIONARIA, ESPECIE_PREMISSA, RAIZ, RODOVIA, UF
from .planilha import CODIGOS_EM_ESCOPO, NOME_POR_CODIGO, PONTO_MEDIO_CM, Levantamento
from .segmentos import Segmento, execucoes_inferidas, medicao_derivada

LOTE = 500


def cliente():
    load_dotenv(RAIZ / ".env")
    return create_client(os.environ["SUPABASE_URL"].strip(), os.environ["SUPABASE_SERVICE_KEY"].strip(),
                         options=ClientOptions(schema=os.getenv("DB_SCHEMA", "ia")))


def _lotes(linhas: list[dict]):
    for i in range(0, len(linhas), LOTE):
        yield linhas[i:i + LOTE]


def concessionaria_id(sb, nome: str = CONCESSIONARIA) -> int:
    d = sb.table("concessionarias").select("id").eq("nome", nome).execute().data
    if not d:
        raise LookupError(f"concessionaria {nome!r} nao existe: a migracao 20260913101000 nao foi aplicada")
    return int(d[0]["id"])


def linha_trecho(seg: Segmento, solo: dict | None, conc_id: int) -> dict:
    metodo = seg.metodo_rocada or "sem poligono de rocada no KML"
    obs = (f"Segmento do levantamento unifilar da Motiva (RA-ROC-LIMP), marco {seg.km_marco_m} m. "
           f"Metodo de rocada predominante: {metodo} ({seg.area_rocada_m2:.0f} m2 rocaveis). "
           f"Especie assumida: braquiaria (premissa, nao medida). "
           f"Limite contratual Artesp Anexo 06 b.1.1: 30 cm.")
    return {
        "rodovia": RODOVIA, "km_inicio": seg.km_inicio, "km_fim": seg.km_fim, "sentido": None, "uf": UF,
        "latitude": seg.latitude, "longitude": seg.longitude, "especie": ESPECIE_PREMISSA,
        "altura_limite_cm": ALTURA_LIMITE_CM, "tipo_pista": "faixa de dominio", "observacoes": obs,
        "concessionaria_id": conc_id, "ativo": True, "fonte_cadastro": "levantamento_motiva",
        "km_marco_m": seg.km_marco_m, "metodo_rocada": seg.metodo_rocada, "area_rocada_m2": seg.area_rocada_m2,
        "fertilidade_solo": solo["fertilidade"] if solo else None,
        "capacidade_agua_solo_mm": solo["capacidade_mm"] if solo else None,
        "solo_fonte": solo["fonte"] if solo else None,
    }


def ids_por_marco(sb) -> dict[int, int]:
    d = (sb.table("trechos").select("id,km_marco_m").eq("rodovia", RODOVIA)
         .not_.is_("km_marco_m", "null").execute().data)
    return {int(r["km_marco_m"]): int(r["id"]) for r in d}


def upsert_trechos(sb, segmentos: list[Segmento], solo_por_marco: dict[int, dict], conc_id: int) -> dict[int, int]:
    linhas = [linha_trecho(s, solo_por_marco.get(s.km_marco_m), conc_id) for s in segmentos]
    sb.table("trechos").upsert(linhas, on_conflict="rodovia,km_marco_m").execute()
    return ids_por_marco(sb)


def linhas_levantamento(lev: Levantamento, ids: dict[int, int]) -> list[dict]:
    return [{"trecho_id": ids[o.km_m], "faixa_codigo": o.faixa, "data": lev.data.isoformat(), "classe": o.classe,
             "altura_estimada_cm": PONTO_MEDIO_CM[o.classe] if o.classe else None, "arquivo_origem": lev.arquivo,
             "data_no_arquivo": lev.data_interna.isoformat() if lev.data_interna else None}
            for o in lev.observacoes]


def upsert_levantamentos(sb, linhas: list[dict]) -> None:
    for lote in _lotes(linhas):
        sb.table("levantamentos").upsert(lote, on_conflict="trecho_id,faixa_codigo,data").execute()


def linhas_medicoes(lev: Levantamento, ids: dict[int, int]) -> list[dict]:
    return [{"trecho_id": ids[m], "data": lev.data.isoformat(), "altura_cm": PONTO_MEDIO_CM[classe],
             "origem": "levantamento_classe", "classe": classe, "faixa_codigo": faixa}
            for m, (classe, faixa) in sorted(medicao_derivada(lev).items())]


def regravar_medicoes(sb, data: date, ids: dict[int, int], linhas: list[dict]) -> None:
    (sb.table("medicoes").delete().eq("origem", "levantamento_classe").eq("data", data.isoformat())
     .in_("trecho_id", list(ids.values())).execute())
    for lote in _lotes(linhas):
        sb.table("medicoes").insert(lote).execute()


def linhas_execucoes(lev1: Levantamento, lev2: Levantamento, ids: dict[int, int], extensao_por_marco: dict[int, float]) -> list[dict]:
    return [{"trecho_id": ids[e["km_marco_m"]], "data_execucao": e["data_execucao"].isoformat(),
             "km_rocados": round(extensao_por_marco[e["km_marco_m"]], 3),
             "altura_antes_cm": e["altura_antes_cm"], "altura_depois_cm": e["altura_depois_cm"],
             "origem": "inferida_levantamento", "observacao": e["observacao"]}
            for e in execucoes_inferidas(lev1, lev2)]


def regravar_execucoes(sb, data: date, ids: dict[int, int], linhas: list[dict]) -> None:
    (sb.table("execucoes").delete().eq("origem", "inferida_levantamento").eq("data_execucao", data.isoformat())
     .in_("trecho_id", list(ids.values())).execute())
    for lote in _lotes(linhas):
        sb.table("execucoes").insert(lote).execute()


def _linha_validacao(saida: dict, r: dict, p: dict, fator: float, vigente: bool, observacoes: str | None, n_rocados: int) -> dict:
    return {
        "rodovia": RODOVIA, "janela_de": saida["janela"]["de"], "janela_ate": saida["janela"]["ate"],
        "especie": p["especie"], "ponto_medio_classe3_cm": p["ponto_medio_c3_cm"],
        "dias_desde_rocada_premissa": p["dias_desde_rocada"], "fator_calibracao": fator,
        "n_pares_total": r["n"] + n_rocados, "n_pares_usados": r["n"], "n_rocados_excluidos": n_rocados,
        "acuracia_classe": r["acuracia"], "mae_ordinal": r["mae_ordinal"],
        "transicoes_total": r["transicoes_total"], "transicoes_detectadas": r["transicoes_detectadas"],
        "estaveis_total": r["estaveis_total"], "alarmes_falsos": r["alarmes_falsos"],
        "cobertura_banda": r["cobertura_banda"], "matriz_confusao": r["matriz"],
        "parametros": {"parametros": p, "linha_de_base": saida["resultado"]["linha_de_base"],
                       "ajuste_km_pares": saida["resultado"]["ajuste_km_pares"],
                       "teste_km_impares": {k: v for k, v in saida["resultado"]["teste_km_impares"].items() if k == "n"}
                       | {"J_sem": saida["resultado"]["teste_km_impares"]["sem"]["J"],
                          "J_com": saida["resultado"]["teste_km_impares"]["com"]["J"]},
                       "fila_retrospectiva": saida["fila_retrospectiva"]},
        "commit_git": saida["commit"], "observacoes": observacoes, "vigente": vigente,
    }


def gravar_validacao(sb, saida: dict, ids: dict[int, int], pares_rocados: list[dict], vigente: bool = True) -> int:
    """Grava a validacao vigente (com pares) e as de sensibilidade (sem pares). Devolve o id da vigente."""
    res, p = saida["resultado"], saida["parametros"]
    if vigente:
        sb.table("validacoes").update({"vigente": False}).eq("rodovia", RODOVIA).eq("vigente", True).execute()
    obs = None if res["fator_vigente"] != 1.0 else "calibracao nao melhorou o criterio J; fator 1,0 mantido"
    principal = sb.table("validacoes").insert(_linha_validacao(saida, res["final"], p, res["fator_vigente"], vigente, obs, len(pares_rocados))).execute().data[0]
    vid = int(principal["id"])
    pares = [{"validacao_id": vid, "trecho_id": ids[x["km_marco_m"]], "faixa_codigo": x["faixa"],
              "classe_inicial": x["classe_inicial"], "classe_final_observada": x["classe_final_observada"],
              "classe_final_prevista": x["classe_final_prevista"], "altura_inicial_cm": x["altura_inicial_cm"],
              "q10_cm": x["q10_cm"], "q50_cm": x["q50_cm"], "q90_cm": x["q90_cm"], "incluido": True, "motivo_exclusao": None}
             for x in saida["pares"]]
    pares += [{"validacao_id": vid, "trecho_id": ids[int(x["km_marco_m"])], "faixa_codigo": x["faixa"],
               "classe_inicial": int(x["classe_d1"]), "classe_final_observada": int(x["classe_d2"]),
               "classe_final_prevista": None, "altura_inicial_cm": None, "q10_cm": None, "q50_cm": None, "q90_cm": None,
               "incluido": False, "motivo_exclusao": "rocada_inferida"} for x in pares_rocados]
    for lote in _lotes(pares):
        sb.table("validacao_pares").insert(lote).execute()
    # As linhas de sensibilidade sao regravadas a cada publicacao; as principais antigas ficam
    # (vigente = false) porque ia.calibracoes aponta para elas e e historico.
    sb.table("validacoes").delete().eq("rodovia", RODOVIA).eq("observacoes", "sensibilidade").execute()
    for s in saida["sensibilidade"]:
        sb.table("validacoes").insert(_linha_validacao(saida, s, s["parametros"], 1.0, False, "sensibilidade", len(pares_rocados))).execute()
    return vid


def ativar_calibracao(sb, validacao_id: int, fator: float, especie: str = ESPECIE_PREMISSA) -> None:
    sb.table("calibracoes").update({"ativo": False}).eq("rodovia", RODOVIA).eq("especie", especie).eq("ativo", True).execute()
    sb.table("calibracoes").insert({"validacao_id": validacao_id, "rodovia": RODOVIA, "especie": especie,
                                    "fator": fator, "ativo": True}).execute()


def upsert_ndvi(sb, linhas: list[dict]) -> None:
    for lote in _lotes(linhas):
        sb.table("ndvi_observacoes").upsert(lote, on_conflict="trecho_id,data_imagem,mascara").execute()


def inserir_ndvi_analise(sb, linha: dict) -> int:
    return int(sb.table("ndvi_analises").insert(linha).execute().data[0]["id"])
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv/bin/python -m pytest pesquisa/tests/test_importador.py`
Expected: 4 passed.

- [ ] **Step 5: O importador (CLI)**

`pesquisa/importar_levantamento.py`:

```python
"""Importa um levantamento RA-RET (unifilar) para o Supabase. E o portao dos dados semanais da Motiva.

    .venv/bin/python -m pesquisa.importar_levantamento --xlsx caminho.xlsx                  # ensaio: so conta
    .venv/bin/python -m pesquisa.importar_levantamento --xlsx caminho.xlsx --anterior a.xlsx --gravar

Sem --gravar nada e escrito. A data vem do nome do arquivo (--data sobrepoe).
--anterior habilita as execucoes inferidas (queda de classe entre os dois).
Idempotente: rodar duas vezes deixa o banco igual.
"""
from __future__ import annotations

import argparse
from datetime import date

from pesquisa.rodoanel import planilha, supabase_io
from pesquisa.rodoanel.segmentos import MARCOS, limites_km


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--xlsx", required=True)
    ap.add_argument("--data", type=date.fromisoformat, default=None)
    ap.add_argument("--anterior", default=None, help="xlsx do levantamento anterior, para inferir rocadas")
    ap.add_argument("--gravar", action="store_true")
    a = ap.parse_args(argv)

    lev = planilha.ler(a.xlsx, a.data)
    anterior = planilha.ler(a.anterior) if a.anterior else None
    if a.gravar:
        sb = supabase_io.cliente()
        ids = supabase_io.ids_por_marco(sb)
        faltam = [m for m in lev.marcos if m not in ids]
        if faltam:
            raise SystemExit(f"marcos sem trecho no banco: {faltam}. Rode publicar_rodoanel.py antes.")
    else:
        ids = {m: -1 for m in MARCOS}
    ext = {m: limites_km(m)[1] - limites_km(m)[0] for m in MARCOS}

    l_lev = supabase_io.linhas_levantamento(lev, ids)
    l_med = supabase_io.linhas_medicoes(lev, ids)
    l_exec = supabase_io.linhas_execucoes(anterior, lev, ids, ext) if anterior else []
    print(f"{lev.arquivo}: data {lev.data} (interna {lev.data_interna}) · {len(l_lev)} levantamentos · "
          f"{len(l_med)} medicoes derivadas · {len(l_exec)} execucoes inferidas"
          + ("" if anterior else " (sem --anterior)"))
    if not a.gravar:
        print("ensaio: nada gravado. Repita com --gravar.")
        return 0
    supabase_io.upsert_levantamentos(sb, l_lev)
    supabase_io.regravar_medicoes(sb, lev.data, ids, l_med)
    if anterior:
        supabase_io.regravar_execucoes(sb, date.fromisoformat(l_exec[0]["data_execucao"]) if l_exec else lev.data, ids, l_exec)
    print("gravado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 6: O publicador**

`pesquisa/publicar_rodoanel.py`:

```python
"""Poe o Rodoanel no Supabase: trechos, os dois levantamentos, medicoes, execucoes inferidas,
solo por trecho, a validacao vigente (com pares) e a calibracao.

    .venv/bin/python -m pesquisa.publicar_rodoanel

Pre-condicoes: migracoes 20260913100000 e 20260913101000 aplicadas; consolidar, validar
e solo_km ja rodados (derivados presentes). Idempotente.
"""
from __future__ import annotations

import json
from datetime import date

from pesquisa.rodoanel import ARQ_LEV_1, ARQ_LEV_2, ARQ_MARCOS, DERIVADOS, banco, marcos, planilha, relatorio, solo_km, supabase_io
from pesquisa.rodoanel.segmentos import MARCOS, Segmento, limites_km


def _segmentos() -> list[Segmento]:
    return [Segmento(int(r["km_marco_m"]), float(r["km_inicio"]), float(r["km_fim"]), float(r["latitude"]),
                     float(r["longitude"]), r["metodo_rocada"] or None, float(r["area_rocada_m2"]),
                     json.loads(r["areas_por_metodo"] or "{}"))
            for r in banco.ler_csv(DERIVADOS / "segmentos.csv")]


def main() -> None:
    sb = supabase_io.cliente()
    conc = supabase_io.concessionaria_id(sb)
    eixo = marcos.carregar(ARQ_MARCOS)
    solo = solo_km.carregar_ou_buscar(eixo)
    ids = supabase_io.upsert_trechos(sb, _segmentos(), solo, conc)
    print(f"trechos: {len(ids)} (ids {min(ids.values())}..{max(ids.values())})")

    lev1, lev2 = planilha.ler(ARQ_LEV_1), planilha.ler(ARQ_LEV_2)
    ext = {m: limites_km(m)[1] - limites_km(m)[0] for m in MARCOS}
    for lev, anterior in ((lev1, None), (lev2, lev1)):
        supabase_io.upsert_levantamentos(sb, supabase_io.linhas_levantamento(lev, ids))
        med = supabase_io.linhas_medicoes(lev, ids)
        supabase_io.regravar_medicoes(sb, lev.data, ids, med)
        n_exec = 0
        if anterior:
            ex = supabase_io.linhas_execucoes(anterior, lev, ids, ext)
            if ex:
                supabase_io.regravar_execucoes(sb, date.fromisoformat(ex[0]["data_execucao"]), ids, ex)
            n_exec = len(ex)
        print(f"{lev.data}: 720 levantamentos · {len(med)} medicoes · {n_exec} execucoes inferidas")

    saida = json.loads((DERIVADOS / "validacao.json").read_text(encoding="utf-8"))
    rocados = [r for r in banco.ler_csv(DERIVADOS / "pares.csv") if r["transicao"] == "rocado"]
    vid = supabase_io.gravar_validacao(sb, saida, ids, rocados, vigente=True)
    fator = float(saida["resultado"]["fator_vigente"])
    supabase_io.ativar_calibracao(sb, vid, fator)
    print(f"validacao {vid} vigente · fator {fator:.2f} · {len(saida['pares'])} pares incluidos + {len(rocados)} excluidos · "
          f"{len(saida['sensibilidade'])} linhas de sensibilidade")
    relatorio.diario(f"Tarefa 13 · pesquisa.publicar_rodoanel · {len(ids)} trechos, validacao {vid}, fator {fator:.2f}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 7: Ensaio, gravação e conferência**

```bash
.venv/bin/python -m pesquisa.importar_levantamento --xlsx pesquisa/dados/brutos/RA-RET-ROÇ-LIMP-2026-03-20.xlsx --anterior pesquisa/dados/brutos/RA-RET-ROÇ-LIMP-2026-03-13.xlsx
.venv/bin/python -m pesquisa.publicar_rodoanel
.venv/bin/python -m pesquisa.publicar_rodoanel      # segunda vez: mesmos numeros, nada duplica
```

Confira no banco:

```sql
select count(*) from ia.vw_trecho_status;                                             -- 60
select count(*), count(distinct data) from ia.levantamentos;                          -- 1440 | 2
select data, count(*) from ia.medicoes where origem = 'levantamento_classe' group by 1; -- 2 linhas, 50..60 cada
select count(*) from ia.execucoes where origem = 'inferida_levantamento';             -- = "execucoes inferidas" impresso
select id, vigente, fator_calibracao, n_pares_usados, acuracia_classe from ia.validacoes where vigente;
select count(*) from ia.validacao_pares;                                              -- 248
select count(*) from ia.validacoes where rodovia like 'SP-021%';                      -- 1 + 26
select * from ia.calibracoes where ativo;
```

- [ ] **Step 8: Commit**

```bash
git add pesquisa
git commit -m "feat(pesquisa): rodoanel no supabase pelo caminho do importador semanal, com validacao e calibracao"
```


---

### Task 14 (trilha B, paralela desde o começo do dia 1): NDVI Sentinel-2 por segmento

Roda em paralelo às Tarefas 2–13 e nunca as bloqueia. Pré-condição humana: `GEE_PROJECT` no `.env` e `earthengine authenticate` feito (lista manual A4). Se faltar, faça as Tarefas 2–13 primeiro e volte.

**Files:**
- Create: `pesquisa/ndvi/__init__.py`, `pesquisa/ndvi/gee_check.py`, `pesquisa/ndvi/geometrias.py`, `pesquisa/ndvi/ndvi_datas.py`, `pesquisa/ndvi/analisar_ndvi.py`, `pesquisa/tests/test_geometrias.py`, `pesquisa/tests/test_analisar_ndvi.py`
- Modify: `pesquisa/rodoanel/relatorio.py` (função `ndvi`)
- Create (gerados): `pesquisa/dados/derivados/ndvi_datas.csv`, `ndvi_imagens.csv`, `ndvi_analise.json`, `docs/pesquisa/03-ndvi.md`

**Interfaces:**
- Consumes: `poligonos.ler_poligonos`, `poligonos.atribuir`, `marcos.carregar`, `banco.ler_csv` (observacoes.csv, pares.csv), `supabase_io.ids_por_marco`, `upsert_ndvi`, `inserir_ndvi_analise`.
- Produces: `geometrias.aneis_por_marco(poligonos, atribuicao) -> dict[int, list[list[list[float]]]]` (anéis fechados, `[lon, lat]`); `geometrias.feature_collection(aneis) -> ee.FeatureCollection` com propriedade `km_marco_m`; `ndvi_datas.DATAS_ALVO`, `ndvi_datas.iniciar()`, `ndvi_datas.mascarar(img)`, `ndvi_datas.ndvi(img)`, `ndvi_datas.estatisticas(img, fc) -> list[dict]`; `analisar_ndvi.classe_por_segmento(observacoes, data) -> dict[int,int]`, `analisar_ndvi.rocados_por_segmento(pares) -> set[int]`, `analisar_ndvi.separacao(ndvi_por_seg, classes) -> dict`, `analisar_ndvi.delta(ndvi_a, ndvi_b, rocados) -> dict`; `relatorio.ndvi(analise: dict) -> str`.

- [ ] **Step 1: Hello world do GEE**

`pesquisa/ndvi/__init__.py` vazio. `pesquisa/ndvi/gee_check.py`:

```python
"""Prova de que o Earth Engine responde: NDVI mediano de um ponto do Rodoanel em marco/2026."""
import os

import ee
from dotenv import load_dotenv

from pesquisa.rodoanel import RAIZ


def iniciar() -> None:
    load_dotenv(RAIZ / ".env")
    ee.Initialize(project=os.environ["GEE_PROJECT"])


if __name__ == "__main__":
    iniciar()
    ponto = ee.Geometry.Point([-46.817408, -23.515647]).buffer(30)
    col = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterBounds(ponto)
           .filterDate("2026-03-01", "2026-03-31"))
    print("imagens em marco/2026 sobre o km 15:", col.size().getInfo())
    img = col.sort("CLOUDY_PIXEL_PERCENTAGE").first()
    nd = img.normalizedDifference(["B8", "B4"]).reduceRegion(ee.Reducer.median(), ponto, 10).getInfo()
    print("imagem menos nublada:", img.date().format("YYYY-MM-dd").getInfo(), "| NDVI mediano:", nd)
```

Run: `.venv/bin/python -m pesquisa.ndvi.gee_check`
Expected: um número de imagens (> 5) e um NDVI entre −0,2 e 0,9. Erro de autenticação → item A4 da lista manual.

- [ ] **Step 2: Teste das geometrias**

`pesquisa/tests/test_geometrias.py`:

```python
from pesquisa.rodoanel import ARQ_MARCOS, ARQ_POLIGONOS, marcos, poligonos
from pesquisa.rodoanel.segmentos import MARCOS
from pesquisa.ndvi import geometrias


def test_aneis_fechados_um_marco_por_poligono():
    pols = poligonos.ler_poligonos(ARQ_POLIGONOS)
    atrib = poligonos.atribuir(pols, marcos.carregar(ARQ_MARCOS))
    por_marco = geometrias.aneis_por_marco(pols, atrib)
    assert set(por_marco) <= set(MARCOS)
    assert sum(len(a) for a in por_marco.values()) >= 642
    for aneis in por_marco.values():
        for anel in aneis:
            assert anel[0] == anel[-1] and len(anel) >= 4
            assert all(-47 < lon < -46 and -24 < lat < -23 for lon, lat in anel)
```

- [ ] **Step 3: Implementar `geometrias.py`**

```python
"""Geometria por segmento: a uniao dos poligonos do KML atribuidos ao marco.

E a area rocavel desenhada pela propria concessionaria, sem asfalto. Usa-la como
mascara e o que ataca o pixel misto de 10 m (docs/PLANO_MOTIVA.md 4.6) sem
inventar buffer.
"""
from __future__ import annotations

from pesquisa.rodoanel.poligonos import Poligono


def _fechar(anel):
    pts = [[lon, lat] for lon, lat in anel]
    if pts[0] != pts[-1]:
        pts.append(pts[0])
    return pts


def aneis_por_marco(poligonos: list[Poligono], atribuicao: dict[int, tuple[int, float]]) -> dict[int, list[list[list[float]]]]:
    saida: dict[int, list] = {}
    for p in poligonos:
        marco = atribuicao[p.indice][0]
        for anel in p.aneis:
            if len(anel) >= 3:
                saida.setdefault(marco, []).append(_fechar(anel))
    return saida


def feature_collection(aneis: dict[int, list[list[list[float]]]]):
    import ee
    feats = [ee.Feature(ee.Geometry.MultiPolygon(coords=[[a] for a in lista], geodesic=False), {"km_marco_m": m})
             for m, lista in sorted(aneis.items())]
    return ee.FeatureCollection(feats)
```

Run: `.venv/bin/python -m pytest pesquisa/tests/test_geometrias.py` → 1 passed.

- [ ] **Step 4: NDVI nas datas-alvo**

`pesquisa/ndvi/ndvi_datas.py`:

```python
"""NDVI Sentinel-2 por segmento nas datas dos levantamentos (e em 28/03/2025, so sanidade).

    .venv/bin/python -m pesquisa.ndvi.ndvi_datas

Colecao COPERNICUS/S2_SR_HARMONIZED. Pixel valido: SCL fora de {3,8,9,10,11} e
MSK_CLDPRB < 40. Janela +-3 dias; se nenhuma imagem tiver nuvem media < 50%
sobre os segmentos, +-7, e a defasagem fica registrada. Sem imagem utilizavel e
resultado, nao falha.
"""
from __future__ import annotations

from datetime import date, timedelta

import ee

from pesquisa.rodoanel import ARQ_MARCOS, ARQ_POLIGONOS, DERIVADOS, banco, marcos, poligonos
from pesquisa.ndvi import geometrias
from pesquisa.ndvi.gee_check import iniciar

DATAS_ALVO = (date(2026, 3, 13), date(2026, 3, 20), date(2025, 3, 28))
JANELAS = (3, 7)
NUVEM_MAXIMA = 0.5
COLECAO = "COPERNICUS/S2_SR_HARMONIZED"
SCL_INVALIDO = (3, 8, 9, 10, 11)


def mascarar(img):
    scl = img.select("SCL")
    ok = img.select("MSK_CLDPRB").lt(40)
    for classe in SCL_INVALIDO:
        ok = ok.And(scl.neq(classe))
    return img.updateMask(ok)


def ndvi(img):
    return img.normalizedDifference(["B8", "B4"]).rename("ndvi")


def estatisticas(img, fc) -> list[dict]:
    red = (ee.Reducer.mean().combine(ee.Reducer.median(), sharedInputs=True)
           .combine(ee.Reducer.percentile([10, 90]), sharedInputs=True)
           .combine(ee.Reducer.count(), sharedInputs=True))
    validos = ndvi(mascarar(img)).reduceRegions(collection=fc, reducer=red, scale=10).getInfo()["features"]
    totais = (ee.Image.constant(1).rename("total").reduceRegions(collection=fc, reducer=ee.Reducer.count(), scale=10)
              .getInfo()["features"])
    total_por_marco = {f["properties"]["km_marco_m"]: f["properties"].get("count", 0) for f in totais}
    saida = []
    for f in validos:
        pr = f["properties"]
        m = pr["km_marco_m"]
        n = pr.get("count", 0) or 0
        total = total_por_marco.get(m, 0) or 0
        saida.append({"km_marco_m": m, "ndvi_medio": pr.get("mean"), "ndvi_mediana": pr.get("median"),
                      "ndvi_p10": pr.get("p10"), "ndvi_p90": pr.get("p90"), "n_pixels": n,
                      "nuvem_pct": (None if total == 0 else round(1 - n / total, 4))})
    return saida


def imagens(fc, de: date, ate: date):
    return ee.ImageCollection(COLECAO).filterBounds(fc.geometry().bounds()).filterDate(de.isoformat(), ate.isoformat())


def main() -> None:
    iniciar()
    pols = poligonos.ler_poligonos(ARQ_POLIGONOS)
    eixo = marcos.carregar(ARQ_MARCOS)
    fc = geometrias.feature_collection(geometrias.aneis_por_marco(pols, poligonos.atribuir(pols, eixo)))

    linhas, resumo = [], []
    for alvo in DATAS_ALVO:
        escolhida = None
        for janela in JANELAS:
            col = imagens(fc, alvo - timedelta(days=janela), alvo + timedelta(days=janela + 1))
            n = col.size().getInfo()
            lista = col.toList(n)
            candidatas = []
            for i in range(n):
                img = ee.Image(lista.get(i))
                data_img = date.fromisoformat(img.date().format("YYYY-MM-dd").getInfo())
                stats = estatisticas(img, fc)
                nuvens = [s["nuvem_pct"] for s in stats if s["nuvem_pct"] is not None]
                nuvem_media = sum(nuvens) / len(nuvens) if nuvens else 1.0
                candidatas.append((nuvem_media, abs((data_img - alvo).days), data_img, stats))
                resumo.append({"data_alvo": alvo.isoformat(), "data_imagem": data_img.isoformat(), "janela_dias": janela,
                               "nuvem_media": round(nuvem_media, 4), "usada": False})
                print(f"  alvo {alvo} · imagem {data_img} · nuvem media {nuvem_media:.0%}")
            utilizaveis = [c for c in candidatas if c[0] < NUVEM_MAXIMA]
            if utilizaveis:
                escolhida = min(utilizaveis, key=lambda c: (c[0], c[1]))
                break
        if not escolhida:
            print(f"alvo {alvo}: nenhuma imagem com nuvem media < {NUVEM_MAXIMA:.0%} em +-{JANELAS[-1]} dias. Resultado registrado.")
            continue
        nuvem, defasagem, data_img, stats = escolhida
        for r in resumo:
            if r["data_alvo"] == alvo.isoformat() and r["data_imagem"] == data_img.isoformat():
                r["usada"] = True
        for s in stats:
            linhas.append({**s, "data_imagem": data_img.isoformat(), "data_alvo": alvo.isoformat(),
                           "defasagem_dias": (data_img - alvo).days})
        print(f"alvo {alvo}: usada {data_img} (defasagem {(data_img - alvo).days:+d} d, nuvem media {nuvem:.0%})")

    banco.gravar_csv(DERIVADOS / "ndvi_datas.csv", linhas)
    banco.gravar_csv(DERIVADOS / "ndvi_imagens.csv", resumo)
    con = banco.abrir()
    banco.substituir(con, "ndvi_observacoes", [{k: l.get(k) for k in ("km_marco_m", "data_imagem", "data_alvo", "defasagem_dias",
                                                "ndvi_medio", "ndvi_mediana", "ndvi_p10", "ndvi_p90", "n_pixels", "nuvem_pct")} for l in linhas])
    print(f"-> {len(linhas)} linhas em ndvi_datas.csv")


if __name__ == "__main__":
    main()
```

Run: `.venv/bin/python -m pesquisa.ndvi.ndvi_datas`
Expected: para cada alvo, a lista de imagens candidatas com nuvem média e a escolhida, ou a frase de "nenhuma imagem". Guarde a saída inteira no diário resumida em uma linha por alvo.

- [ ] **Step 5: Teste da análise**

`pesquisa/tests/test_analisar_ndvi.py`:

```python
import pytest

from pesquisa.ndvi import analisar_ndvi


def test_separacao_perfeita_da_auc_1():
    ndvi = {0: 0.2, 500: 0.25, 1000: 0.3, 1500: 0.7, 2000: 0.75, 2500: 0.8}
    classes = {0: 1, 500: 1, 1000: 1, 1500: 3, 2000: 3, 2500: 3}
    r = analisar_ndvi.separacao(ndvi, classes)
    assert r["n_classe1"] == 3 and r["n_classe3"] == 3
    assert r["auc"] == pytest.approx(1.0) and r["p_valor"] < 0.2
    assert r["ndvi_mediana_c3"] > r["ndvi_mediana_c1"]


def test_separacao_sem_classe_3_e_nula():
    r = analisar_ndvi.separacao({0: 0.5, 500: 0.6}, {0: 1, 500: 2})
    assert r["auc"] is None and r["p_valor"] is None


def test_delta_rocados_cai():
    a = {0: 0.7, 500: 0.7, 1000: 0.7, 1500: 0.7}
    b = {0: 0.3, 500: 0.35, 1000: 0.72, 1500: 0.69}
    r = analisar_ndvi.delta(a, b, rocados={0, 500})
    assert r["n_rocados"] == 2 and r["n_nao_rocados"] == 2
    assert r["delta_rocados"] < r["delta_nao_rocados"]


def test_classe_por_segmento_pega_a_pior_faixa_em_escopo():
    obs = [{"data": "2026-03-13", "km_marco_m": "0", "faixa": "cant_lateral_externa", "classe": "1"},
           {"data": "2026-03-13", "km_marco_m": "0", "faixa": "cant_central_interna", "classe": "3"},
           {"data": "2026-03-13", "km_marco_m": "0", "faixa": "cant_dispositivo_ext", "classe": "3"},
           {"data": "2026-03-13", "km_marco_m": "500", "faixa": "cant_dispositivo_ext", "classe": "2"},
           {"data": "2026-03-20", "km_marco_m": "0", "faixa": "cant_lateral_externa", "classe": "2"}]
    assert analisar_ndvi.classe_por_segmento(obs, "2026-03-13") == {0: 3}
    assert analisar_ndvi.classe_por_segmento(obs, "2026-03-20") == {0: 2}
```

- [ ] **Step 6: Implementar `analisar_ndvi.py`**

```python
"""Testes-chave do satelite contra a verdade de campo (spec 10).

    .venv/bin/python -m pesquisa.ndvi.analisar_ndvi [--gravar]

(1) Separacao: nos segmentos em classe 3, o NDVI e maior que nos em classe 1? (Mann-Whitney, AUC)
(2) Corte: o NDVI caiu mais, de 13 para 20/03, nos segmentos com rocada inferida? (Mann-Whitney)
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime
from statistics import median

from scipy.stats import mannwhitneyu

from pesquisa.rodoanel import DERIVADOS, DOCS_PESQUISA, banco, relatorio
from pesquisa.rodoanel.planilha import CODIGOS_EM_ESCOPO


def classe_por_segmento(observacoes: list[dict], data: str) -> dict[int, int]:
    saida: dict[int, int] = {}
    for o in observacoes:
        if o["data"] != data or o["faixa"] not in CODIGOS_EM_ESCOPO or o["classe"] in ("", None):
            continue
        m, c = int(o["km_marco_m"]), int(o["classe"])
        saida[m] = max(saida.get(m, 0), c)
    return saida


def rocados_por_segmento(pares: list[dict]) -> set[int]:
    return {int(p["km_marco_m"]) for p in pares if p["transicao"] == "rocado"}


def separacao(ndvi_por_seg: dict[int, float], classes: dict[int, int]) -> dict:
    c1 = [v for m, v in ndvi_por_seg.items() if classes.get(m) == 1 and v is not None]
    c3 = [v for m, v in ndvi_por_seg.items() if classes.get(m) == 3 and v is not None]
    saida = {"n_classe1": len(c1), "n_classe3": len(c3),
             "ndvi_mediana_c1": median(c1) if c1 else None, "ndvi_mediana_c3": median(c3) if c3 else None,
             "auc": None, "p_valor": None}
    if c1 and c3:
        u = mannwhitneyu(c3, c1, alternative="two-sided")
        saida["auc"] = float(u.statistic) / (len(c1) * len(c3))
        saida["p_valor"] = float(u.pvalue)
    return saida


def delta(ndvi_a: dict[int, float], ndvi_b: dict[int, float], rocados: set[int]) -> dict:
    d = {m: ndvi_b[m] - ndvi_a[m] for m in ndvi_a if m in ndvi_b and ndvi_a[m] is not None and ndvi_b[m] is not None}
    roc = [v for m, v in d.items() if m in rocados]
    nao = [v for m, v in d.items() if m not in rocados]
    saida = {"n_rocados": len(roc), "n_nao_rocados": len(nao),
             "delta_rocados": median(roc) if roc else None, "delta_nao_rocados": median(nao) if nao else None, "p_valor_delta": None}
    if roc and nao:
        saida["p_valor_delta"] = float(mannwhitneyu(roc, nao, alternative="two-sided").pvalue)
    return saida


def _ndvi_por_alvo(linhas: list[dict]) -> dict[str, dict[int, float]]:
    saida: dict[str, dict[int, float]] = {}
    for l in linhas:
        v = l["ndvi_mediana"]
        saida.setdefault(l["data_alvo"], {})[int(l["km_marco_m"])] = float(v) if v not in ("", None) else None
    return saida


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gravar", action="store_true", help="grava em ia.ndvi_observacoes e ia.ndvi_analises")
    a = ap.parse_args(argv)

    linhas = banco.ler_csv(DERIVADOS / "ndvi_datas.csv")
    obs = banco.ler_csv(DERIVADOS / "observacoes.csv")
    pares = banco.ler_csv(DERIVADOS / "pares.csv")
    por_alvo = _ndvi_por_alvo(linhas)
    meta = {l["data_alvo"]: l for l in linhas}
    rocados = rocados_por_segmento(pares)

    analises = []
    for alvo in ("2026-03-13", "2026-03-20", "2025-03-28"):
        if alvo not in por_alvo:
            analises.append({"data_alvo": alvo, "sem_imagem": True})
            continue
        classes = classe_por_segmento(obs, alvo if alvo.startswith("2026") else "2026-03-13")
        r = {"data_alvo": alvo, "data_imagem": meta[alvo]["data_imagem"], "defasagem_dias": int(meta[alvo]["defasagem_dias"]),
             "nuvem_pct_media": (lambda xs: sum(xs) / len(xs) if xs else None)(
                 [float(l["nuvem_pct"]) for l in linhas if l["data_alvo"] == alvo and l["nuvem_pct"] not in ("", None)]),
             **separacao(por_alvo[alvo], classes)}
        if alvo == "2026-03-20" and "2026-03-13" in por_alvo:
            r.update(delta(por_alvo["2026-03-13"], por_alvo["2026-03-20"], rocados))
        analises.append(r)

    saida = {"gerado_em": datetime.now(relatorio.FUSO_BR).strftime("%d/%m/%Y %H:%M"), "commit": relatorio._commit(),
             "analises": analises, "n_segmentos_rocados": len(rocados)}
    (DERIVADOS / "ndvi_analise.json").write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")
    relatorio.escrever(DOCS_PESQUISA / "03-ndvi.md", relatorio.ndvi(saida))
    for r in analises:
        print(r)

    if a.gravar:
        from pesquisa.rodoanel import supabase_io
        sb = supabase_io.cliente()
        ids = supabase_io.ids_por_marco(sb)
        supabase_io.upsert_ndvi(sb, [{"trecho_id": ids[int(l["km_marco_m"])], "data_imagem": l["data_imagem"],
                                      "data_alvo": l["data_alvo"], "defasagem_dias": int(l["defasagem_dias"]),
                                      **{k: (float(l[k]) if l[k] not in ("", None) else None) for k in ("ndvi_medio", "ndvi_mediana", "ndvi_p10", "ndvi_p90", "nuvem_pct")},
                                      "n_pixels": int(l["n_pixels"] or 0)} for l in linhas])
        for r in analises:
            if r.get("sem_imagem"):
                supabase_io.inserir_ndvi_analise(sb, {"data_alvo": r["data_alvo"], "observacoes": "sem imagem utilizavel em +-7 dias", "parametros": {}})
                continue
            supabase_io.inserir_ndvi_analise(sb, {k: r.get(k) for k in (
                "data_alvo", "data_imagem", "defasagem_dias", "nuvem_pct_media", "n_classe1", "n_classe3", "ndvi_mediana_c1",
                "ndvi_mediana_c3", "auc", "p_valor", "n_rocados", "n_nao_rocados", "delta_rocados", "delta_nao_rocados", "p_valor_delta")}
                | {"parametros": {"mascara": "poligonos_kml", "colecao": "COPERNICUS/S2_SR_HARMONIZED", "commit": saida["commit"]}})
        print("gravado em ia.ndvi_observacoes e ia.ndvi_analises")


if __name__ == "__main__":
    main()
```

- [ ] **Step 7: `relatorio.ndvi`** (acrescentar ao fim de `relatorio.py`)

```python
def ndvi(saida: dict) -> str:
    def f(v, casas=3):
        return "—" if v is None else f"{v:.{casas}f}".replace(".", ",")
    blocos = []
    for r in saida["analises"]:
        if r.get("sem_imagem"):
            blocos.append(f"### {r['data_alvo']}\n\nNenhuma imagem com nuvem média abaixo de 50% em ±7 dias. Resultado registrado: a cobertura de nuvem inviabilizou a leitura nesta data.")
            continue
        texto = (f"### {r['data_alvo']}\n\nImagem de **{r['data_imagem']}** (defasagem {r['defasagem_dias']:+d} d, nuvem média {f(r['nuvem_pct_media'], 2)}).\n\n"
                 f"| | classe 1 | classe 3 |\n|---|---|---|\n| segmentos | {r['n_classe1']} | {r['n_classe3']} |\n"
                 f"| NDVI mediano | {f(r['ndvi_mediana_c1'])} | {f(r['ndvi_mediana_c3'])} |\n\n"
                 f"AUC (classe 3 acima da 1) = **{f(r['auc'])}** · p = {f(r['p_valor'], 4)}.")
        if r.get("n_rocados") is not None:
            texto += (f"\n\nΔNDVI 13→20/03: roçados (n = {r['n_rocados']}) **{f(r['delta_rocados'])}** · "
                      f"não roçados (n = {r['n_nao_rocados']}) **{f(r['delta_nao_rocados'])}** · p = {f(r['p_valor_delta'], 4)}.")
        blocos.append(texto)
    return (f"# 03 · NDVI Sentinel-2 contra a verdade de campo\n\nGerado por `pesquisa/ndvi/analisar_ndvi.py` em {saida['gerado_em']} (commit {saida['commit']}).\n\n"
            "Máscara: polígonos de roçada do KML por segmento. Coleção `COPERNICUS/S2_SR_HARMONIZED`, pixel válido com SCL fora de {3, 8, 9, 10, 11} e probabilidade de nuvem < 40%.\n"
            "Classe do segmento = pior faixa em escopo na data. A leitura de 28/03/2025 usa as classes de 13/03/2026 e serve só como sanidade da hipótese de data.\n\n"
            + "\n\n".join(blocos)
            + f"\n\n## Leitura\n\nAUC 0,5 = o satélite não separa; 1,0 = separa perfeitamente. {saida['n_segmentos_rocados']} segmentos tiveram roçada inferida no intervalo.\n\n"
            "## Limitações\n\n- Pixel de 10 m e polígonos estreitos: segmentos com poucos pixels válidos pesam igual aos largos.\n- Uma data por levantamento, com defasagem de até 7 dias.\n- NDVI mede verdor, não altura: capim alto e seco pode ler baixo.\n")
```

- [ ] **Step 8: Rodar, gravar e commitar**

```bash
.venv/bin/python -m pytest pesquisa/tests/test_analisar_ndvi.py pesquisa/tests/test_geometrias.py
.venv/bin/python -m pesquisa.ndvi.analisar_ndvi --gravar     # --gravar so depois da Tarefa 13
.venv/bin/python -c "
import json; from pesquisa.rodoanel import relatorio, DERIVADOS
a = json.load(open(DERIVADOS/'ndvi_analise.json'))['analises']
resumo = '; '.join(f\"{x['data_alvo']}: \" + ('sem imagem' if x.get('sem_imagem') else f\"img {x['data_imagem']} AUC={x['auc']} p={x['p_valor']}\") for x in a)
relatorio.diario('Tarefa 14 · ndvi_datas + analisar_ndvi · ' + resumo)"
git add pesquisa docs/pesquisa/03-ndvi.md
git commit -m "feat(ndvi): NDVI Sentinel-2 por segmento do Rodoanel nas datas do levantamento, separacao por classe e queda por rocada"
```


---

## Dia 2

### Task 15: Calibração, solo por trecho e dia ideal no lote

**Files:**
- Create: `ml/calibracao.py`, `ml/tests/test_calibracao.py`
- Modify: `ml/analise.py`, `ml/analisar_lote.py`, `ml/tests/test_analise.py`

**Interfaces:**
- Produces: `calibracao.Calibracao(fator, origem, validacao_id, n_pares, validada_em, rodovia=None, especie=None)`; `calibracao.SEM`; `calibracao.carregar(sb) -> list[dict]`; `calibracao.escolher(linhas, rodovia, especie) -> Calibracao`; `analise.analisar_trecho(sb, t, serie, terra, hoje, calib=calibracao.SEM, mobilizacao_dias=7)` devolve também `fator`, `calibracao`, `mobilizacao_dias`, `data_ideal: date | None`; `previsoes.fator_calibracao` gravado por `linha_de_previsao`.

- [ ] **Step 1: Testes**

`ml/tests/test_calibracao.py`:

```python
import calibracao

LINHAS = [
    {"fator": "1.30", "rodovia": "SP-021 Rodoanel Oeste", "especie": "braquiaria", "validacao_id": 7,
     "validacoes": {"n_pares_usados": 195, "executada_em": "2026-09-13T20:00:00+00:00"}},
    {"fator": "1.10", "rodovia": None, "especie": "braquiaria", "validacao_id": 8, "validacoes": None},
    {"fator": "0.90", "rodovia": None, "especie": None, "validacao_id": None, "validacoes": None},
]


def test_mais_especifica_vence():
    c = calibracao.escolher(LINHAS, "SP-021 Rodoanel Oeste", "braquiaria")
    assert c.fator == 1.30 and c.origem == "medida" and c.n_pares == 195 and c.validacao_id == 7


def test_cai_para_a_da_especie_e_depois_para_a_geral():
    assert calibracao.escolher(LINHAS, "BR-116", "braquiaria").fator == 1.10
    assert calibracao.escolher(LINHAS, "BR-116", "batatais").fator == 0.90


def test_sem_nada_e_sem_calibracao():
    c = calibracao.escolher([], "SP-021 Rodoanel Oeste", "braquiaria")
    assert c is calibracao.SEM and c.fator == 1.0 and c.origem == "sem_calibracao"


def test_linha_que_nao_casa_nao_conta():
    linhas = [{"fator": "2.0", "rodovia": "SP-280", "especie": None, "validacao_id": 1, "validacoes": None}]
    assert calibracao.escolher(linhas, "SP-021 Rodoanel Oeste", "braquiaria").fator == 1.0
```

Acrescente a `ml/tests/test_analise.py`:

```python
import numpy as np

import calibracao


def test_fator_multiplica_os_quantis_e_o_crescido(monkeypatch):
    monkeypatch.setattr(analise.modelo, "curva", lambda montar, horizonte=120: np.tile([[1.0, 2.0, 3.0]], (120, 1)))
    monkeypatch.setattr(analise.modelo, "prever", lambda linhas: np.array([[0.5, 1.0, 1.5]]))
    sb = FakeSb(medicoes=[{"data": (HOJE - timedelta(days=5)).isoformat(), "altura_cm": 10.0}])
    calib = calibracao.Calibracao(2.0, "medida", 7, 195, "2026-09-13")
    r = analise.analisar_trecho(sb, trecho(), serie_sintetica(HOJE), TERRA, HOJE, calib=calib, mobilizacao_dias=7)
    assert r["crescido"] == 2.0 and r["altura_hoje"] == 12.0
    assert r["q50"] == 4.0 and r["fator"] == 2.0
    assert r["dias"] is not None and r["data_ideal"] == HOJE + timedelta(days=r["dias"] - 7)


def test_dia_ideal_nunca_antes_de_hoje(monkeypatch):
    monkeypatch.setattr(analise.modelo, "curva", lambda montar, horizonte=120: np.tile([[10.0, 20.0, 30.0]], (120, 1)))
    monkeypatch.setattr(analise.modelo, "prever", lambda linhas: np.array([[0.0, 0.0, 0.0]]))
    sb = FakeSb(medicoes=[{"data": (HOJE - timedelta(days=1)).isoformat(), "altura_cm": 25.0}])
    r = analise.analisar_trecho(sb, trecho(), serie_sintetica(HOJE), TERRA, HOJE, mobilizacao_dias=7)
    assert r["dias"] == 1 and r["data_ideal"] == HOJE


def test_linha_de_previsao_grava_o_fator():
    r = {"taxa": 0.5, "altura_hoje": 12.0, "prev30": 6.0, "dias": 30, "fator": 1.3,
         "janela": {"temperatura_media_c": 22.0, "precipitacao_total_mm": 10.0}}
    assert analise.linha_de_previsao(1, r)["fator_calibracao"] == 1.3
```

Run: `.venv/bin/python -m pytest ml/tests` → os novos FALHAM.

- [ ] **Step 2: `ml/calibracao.py`**

```python
"""O fator de calibracao vigente: medido contra o levantamento da Motiva, em ia.calibracoes.

O fator multiplica o crescimento previsto (os tres quantis) FORA do modelo. E o
ponteiro da balanca: o .pkl continua o mesmo, e o teste de paridade com o
TypeScript continua provando o que prova.
"""
from __future__ import annotations

from typing import NamedTuple


class Calibracao(NamedTuple):
    fator: float
    origem: str                      # "medida" | "sem_calibracao"
    validacao_id: int | None
    n_pares: int | None
    validada_em: str | None
    rodovia: str | None = None
    especie: str | None = None


SEM = Calibracao(1.0, "sem_calibracao", None, None, None)


def carregar(sb) -> list[dict]:
    """As calibracoes ativas, com o n e a data da validacao que as gerou. Uma consulta por rodada."""
    return (sb.table("calibracoes")
            .select("fator, rodovia, especie, validacao_id, validacoes(n_pares_usados, executada_em)")
            .eq("ativo", True).execute().data)


def _especificidade(linha: dict, rodovia: str, especie: str) -> int | None:
    if linha.get("rodovia") not in (None, rodovia) or linha.get("especie") not in (None, especie):
        return None
    return (2 if linha.get("rodovia") else 0) + (1 if linha.get("especie") else 0)


def escolher(linhas: list[dict], rodovia: str, especie: str) -> Calibracao:
    """(rodovia, especie) > (rodovia, qualquer) > (qualquer, especie) > (qualquer, qualquer) > SEM."""
    melhor = None
    for l in linhas:
        s = _especificidade(l, rodovia, especie)
        if s is not None and (melhor is None or s > melhor[0]):
            melhor = (s, l)
    if melhor is None:
        return SEM
    l = melhor[1]
    v = l.get("validacoes") or {}
    if isinstance(v, list):                  # o PostgREST devolve lista quando nao prova a unicidade
        v = v[0] if v else {}
    return Calibracao(float(l["fator"]), "medida", l.get("validacao_id"), v.get("n_pares_usados"),
                      v.get("executada_em"), l.get("rodovia"), l.get("especie"))
```

- [ ] **Step 3: `ml/analise.py`**

Acrescente `import calibracao` junto dos outros imports e `from datetime import date, timedelta`.

Assinatura: `def analisar_trecho(sb, t: dict, serie: clima.Serie, terra: solo.Solo, hoje: date, calib: calibracao.Calibracao = calibracao.SEM, mobilizacao_dias: int = 7) -> dict:`

Troque `crescido = float(modelo.prever([linha])[0, 1])` por `crescido = float(modelo.prever([linha])[0, 1]) * calib.fator`.

Troque `Q = modelo.curva(montar)` por:

```python
    # O fator de calibracao entra AQUI, nos tres quantis, e nao dentro do modelo:
    # e a distancia medida entre a simulacao e o campo do Rodoanel (ia.calibracoes).
    Q = modelo.curva(montar) * calib.fator
```

No dicionário devolvido, acrescente:

```python
        "fator": calib.fator, "calibracao": calib, "mobilizacao_dias": mobilizacao_dias,
        # Dia ideal = cruzar o limite menos o tempo de mobilizar a equipe; nunca antes de hoje.
        "data_ideal": (None if dias is None else max(hoje, hoje + timedelta(days=dias - mobilizacao_dias))),
```

Em `linha_de_previsao`, acrescente `"fator_calibracao": round(r["fator"], 4),`.

Em `contexto_para_llm`, acrescente ao dicionário:

```python
        "dia_ideal_rocada": r["data_ideal"].isoformat() if r["data_ideal"] else None,
        "tempo_mobilizacao_dias": r["mobilizacao_dias"],
        "metodo_rocada": t.get("metodo_rocada"),
        "area_rocada_m2": t.get("area_rocada_m2"),
        "origem_da_medicao": t.get("medicao_origem_texto"),
        "calibracao": {
            "fator": round(r["fator"], 2),
            "origem": ("medido contra pares reais do levantamento da concessionaria"
                       if r["calibracao"].origem == "medida" else "sem calibracao medida: modelo sintetico puro"),
            "n_pares_reais": r["calibracao"].n_pares,
            "validada_em": r["calibracao"].validada_em,
        },
```

- [ ] **Step 4: `ml/analisar_lote.py`**

Imports: acrescente `import calibracao`.

`consulta = sb.table("trechos").select("*").eq("ativo", True).order("id")` vira
`consulta = sb.table("trechos").select("*, concessionarias(mobilizacao_dias)").eq("ativo", True).order("id")`.

Depois de `zonas, ambiente = montar_zonas(trechos, hoje)`, acrescente:

```python
    calibs = calibracao.carregar(sb)
    print(f"Calibracoes ativas: {len(calibs)}" + "".join(
        f"\n  {c.get('rodovia') or 'qualquer rodovia'} / {c.get('especie') or 'qualquer especie'}: fator {float(c['fator']):.2f}" for c in calibs) + "\n")
```

Dentro do laço, troque `r = analise.analisar_trecho(sb, t, amb[0], amb[1], hoje)` por:

```python
            # Solo do proprio trecho quando existe (SoilGrids no marco, gravado pelo
            # publicador); senao o da zona, como sempre.
            terra = amb[1]
            if t.get("fertilidade_solo") is not None and t.get("capacidade_agua_solo_mm") is not None:
                terra = solo.Solo(float(t["fertilidade_solo"]), float(t["capacidade_agua_solo_mm"]),
                                  t.get("solo_fonte") or "soilgrids")
            calib = calibracao.escolher(calibs, t["rodovia"], t["especie"])
            conc = t.get("concessionarias") or {}
            mob = int(conc.get("mobilizacao_dias") or 7)
            r = analise.analisar_trecho(sb, t, amb[0], terra, hoje, calib=calib, mobilizacao_dias=mob)
```

Nas `INSTRUCOES` da LLM, acrescente antes de "Prioridade e funcao PURA":

```
O campo `dia_ideal_rocada` ja desconta o tempo de mobilizacao da equipe: `data_sugerida`
deve ser ele, salvo impedimento operacional que voce deve nomear na justificativa
(chuva prevista, curva com visibilidade, acesso). `calibracao` diz se o numero foi
medido contra observacao real da concessionaria ou e simulacao pura; mencione isso
em uma frase quando for simulacao pura.
```

- [ ] **Step 5: Rodar os testes, o lote em modo de um trecho e commitar**

Run: `.venv/bin/python -m pytest ml/tests` → todos passam.

Ensaio do lote contra o banco de verdade, num trecho só do Rodoanel (ele deve sair como medição vencida, sem gravar nada):

```bash
set -a; source .env; set +a
cd ml && TRECHO_ID=$(/usr/local/opt/libpq/bin/psql "$SUPABASE_DB_URL" -tAc "select min(id) from ia.trechos where km_marco_m is not null") ../.venv/bin/python analisar_lote.py; cd ..
```

Expected: `Calibracoes ativas: 1`, a linha `[medicao vencida (…)]`, e `ATENCAO: 1 trecho(s) com MEDICAO VENCIDA`. Nenhuma previsão nova para esse trecho (`select count(*) from ia.previsoes where trecho_id = …` igual a antes).

```bash
git add ml
git commit -m "feat(lote): fator de calibracao medido, solo por trecho e dia ideal de rocada na analise"
git push origin main
.venv/bin/python -c "from pesquisa.rodoanel import relatorio; relatorio.diario('Tarefa 15 · lote com calibracao, solo por trecho e dia ideal · ensaio em 1 trecho do Rodoanel: medicao vencida, nada gravado')"
```

---

### Task 16: Painel: tipos, vocabulário, trecho inativo fora, fator no simulador

**Files:**
- Modify: `web/src/lib/types.ts`, `web/src/lib/dominio.ts`, `web/src/lib/queries.ts`, `web/src/lib/chamados/queries.ts`, `web/src/lib/simulacao.ts`, `web/src/lib/simulacao.test.ts`
- Create: `web/src/lib/calibracao-regra.ts`, `web/src/lib/calibracao-regra.test.ts`, `web/src/lib/calibracao.ts`
- Modify: a página do simulador que chama `simular(` e o componente que mostra o resultado

**Interfaces:**
- Produces: tipos `OrigemMedicao`, `FonteCadastro`, `ClasseAltura`, `Faixa`, `Levantamento`, `Validacao`, `NdviAnalise`, `Calibracao`; `TrechoStatus` com `fonte_cadastro, km_marco_m, metodo_rocada, area_rocada_m2, fertilidade_solo, capacidade_agua_solo_mm, solo_fonte, medicao_origem, classe_medida, fator_calibracao`; `CLASSE_ALTURA`, `ORIGEM_MEDICAO`, `METODO_ROCADA` em `dominio.ts`; `escolherCalibracao(linhas, rodovia, especie): CalibracaoVigente` e `SEM_CALIBRACAO`; `fatorVigente(rodovia, especie): Promise<CalibracaoVigente>`; `simular(pedido, janela, fator = 1)` com `Simulacao.fator`.

- [ ] **Step 1: Tipos** (`web/src/lib/types.ts`, depois de `ORIGENS`)

```ts
/** De onde saiu uma medição de altura. A tela nunca mostra as quatro com a mesma cara. */
export const ORIGENS_MEDICAO = ["manual", "campo_app", "levantamento_classe", "demonstracao"] as const;
export type OrigemMedicao = (typeof ORIGENS_MEDICAO)[number];

/** Cadastro real (levantamento da Motiva) ou a malha fictícia da demonstração, hoje oculta. */
export type FonteCadastro = "demonstracao" | "levantamento_motiva";

/** As três classes do formulário unifilar da Motiva: < 10 cm, 10 a 30 cm, > 30 cm. */
export type ClasseAltura = 1 | 2 | 3;

export type Faixa = { codigo: string; nome: string; linha_planilha: number; lado: "externa" | "interna"; em_escopo: boolean; ordem: number };

export type Levantamento = {
  id: number; trecho_id: number; faixa_codigo: string; data: string; classe: ClasseAltura | null;
  altura_estimada_cm: number | null; arquivo_origem: string; data_no_arquivo: string | null; importado_em: string;
};

/** Uma rodada de confronto modelo × campo. `numeric` do Postgres chega como string: use `Number()`. */
export type Validacao = {
  id: number; executada_em: string; rodovia: string; janela_de: string; janela_ate: string; especie: string;
  ponto_medio_classe3_cm: number; dias_desde_rocada_premissa: number; fator_calibracao: number;
  n_pares_total: number; n_pares_usados: number; n_rocados_excluidos: number;
  acuracia_classe: number | null; mae_ordinal: number | null; transicoes_total: number | null; transicoes_detectadas: number | null;
  estaveis_total: number | null; alarmes_falsos: number | null; cobertura_banda: number | null;
  matriz_confusao: Record<"1" | "2" | "3", Record<"1" | "2" | "3", number>>;
  parametros: Record<string, unknown>; commit_git: string | null; observacoes: string | null; vigente: boolean;
};

export type NdviAnalise = {
  id: number; executada_em: string; data_alvo: string; data_imagem: string | null; defasagem_dias: number | null;
  nuvem_pct_media: number | null; n_classe1: number | null; n_classe3: number | null;
  ndvi_mediana_c1: number | null; ndvi_mediana_c3: number | null; auc: number | null; p_valor: number | null;
  n_rocados: number | null; n_nao_rocados: number | null; delta_rocados: number | null; delta_nao_rocados: number | null;
  p_valor_delta: number | null; observacoes: string | null;
};

export type Calibracao = { id: number; validacao_id: number | null; rodovia: string | null; especie: string | null; fator: number; valido_de: string; ativo: boolean };
```

Em `TrechoStatus`, depois de `chamado_status`, acrescente:

```ts
  /** Colunas da view desde 13/09/2026: origem do cadastro e o que a fila de OS precisa. */
  fonte_cadastro: FonteCadastro;
  km_marco_m: number | null;
  metodo_rocada: string | null;
  area_rocada_m2: number | null;
  fertilidade_solo: number | null;
  capacidade_agua_solo_mm: number | null;
  solo_fonte: "soilgrids" | "premissa" | null;
  medicao_origem: OrigemMedicao | null;
  classe_medida: ClasseAltura | null;
  fator_calibracao: number | null;
```

Em `Medicao`, acrescente `origem: OrigemMedicao; classe: ClasseAltura | null; faixa_codigo: string | null;`. Em `AgendamentoDetalhado`, o `trecho` ganha `ativo: boolean` na lista de `Pick` (acrescente `"ativo"` ao `Pick<Trecho, …>` e `ativo: boolean` em `Trecho`).

- [ ] **Step 2: Vocabulário** (`web/src/lib/dominio.ts`, depois de `ESPECIE`)

```ts
/**
 * As três classes do formulário da Motiva. A classe 3 é a fronteira contratual
 * (Artesp, Anexo 06, b.1.1: podar ao atingir 30 cm), por isso pinta de crítico.
 */
export const CLASSE_ALTURA: Record<ClasseAltura, TokenStatus> = {
  1: { rotulo: "Classe 1", cor: "var(--good)", tinta: "var(--good-ink)", fundo: "var(--good-soft)", icone: "CircleCheck", descricao: "Abaixo de 10 cm" },
  2: { rotulo: "Classe 2", cor: "var(--warning)", tinta: "var(--warning-ink)", fundo: "var(--warning-soft)", icone: "TriangleAlert", descricao: "De 10 a 30 cm" },
  3: { rotulo: "Classe 3", cor: "var(--critical)", tinta: "var(--critical-ink)", fundo: "var(--critical-soft)", icone: "OctagonAlert", descricao: "Acima de 30 cm: fora do contrato" },
};

export const ORIGEM_MEDICAO: Record<OrigemMedicao, string> = {
  manual: "Digitada no painel",
  campo_app: "App de campo, com foto",
  levantamento_classe: "Levantamento unifilar da Motiva: classe convertida em ponto médio",
  demonstracao: "Semeada para demonstração",
};

export const METODO_ROCADA: Record<string, { rotulo: string; icone: string }> = {
  "Spider, Giro-Zero ou Trator com trincheira": { rotulo: "Mecanizada (Spider, Giro-Zero ou trator com trincheira)", icone: "Tractor" },
  "Apenas manual": { rotulo: "Apenas manual", icone: "Hand" },
  "Trator com braço articulado": { rotulo: "Trator com braço articulado", icone: "Truck" },
  "Spider, com ancoragem": { rotulo: "Spider com ancoragem (declive alto)", icone: "Anchor" },
};
```

Acrescente `ClasseAltura, OrigemMedicao` ao `import type` do topo do arquivo. Confira que `Tractor`, `Hand`, `Truck` e `Anchor` existem em `lucide-react` (`grep -c "Tractor\|^export.*Hand\b" web/node_modules/lucide-react/dist/lucide-react.d.ts`); se algum não existir, use `Wrench`.

- [ ] **Step 3: Trecho inativo fora das listas que não passam pela view**

Em `web/src/lib/queries.ts`, no `SELECT_AGENDAMENTO`, o embed do trecho passa a incluir `ativo`:
`trecho:trechos!inner ( id, rodovia, km_inicio, km_fim, uf, sentido, especie, tipo_pista, altura_limite_cm, latitude, longitude, ativo ),`.
Em `listarAgendamentos`, logo depois de `const lista = data as unknown as AgendamentoDetalhado[];`:

```ts
    /* A view ja esconde trecho inativo; esta lista vem da TABELA, entao esconde aqui.
       Sem isto a agenda desenharia cartao de trecho que a malha nao mostra. */
    const visiveis = lista.filter((a) => a.trecho.ativo !== false);
```

e troque `return lista.sort(` por `return visiveis.sort(`. Faça o mesmo em `agendamentosDoTrecho` (filtre antes de devolver).

Em `web/src/lib/chamados/queries.ts`: `grep -n "trecho:trechos\|trechos(" web/src/lib/chamados/queries.ts` mostra os selects que embutem o trecho. Em cada um, acrescente `ativo` às colunas do embed e filtre `c.trecho.ativo !== false` antes de devolver a lista (na fila de decisão e na lista de chamados). O detalhe de um chamado (`obterChamado`) **não** filtra: quem tem o link vê.

- [ ] **Step 4: A regra do fator, pura e testada**

`web/src/lib/calibracao-regra.ts`:

```ts
/**
 * Qual calibração vale para (rodovia, espécie). Espelha `escolher` em `ml/calibracao.py`:
 * (rodovia, espécie) > (rodovia, qualquer) > (qualquer, espécie) > (qualquer, qualquer) > sem calibração.
 * Puro, sem `server-only`, para o vitest importar direto.
 */
export type LinhaCalibracao = {
  fator: number | string;
  rodovia: string | null;
  especie: string | null;
  validacoes?: { n_pares_usados: number; executada_em: string } | { n_pares_usados: number; executada_em: string }[] | null;
};

export type CalibracaoVigente = {
  fator: number;
  origem: "medida" | "sem_calibracao";
  nPares: number | null;
  validadaEm: string | null;
  rodovia: string | null;
  especie: string | null;
};

export const SEM_CALIBRACAO: CalibracaoVigente = { fator: 1, origem: "sem_calibracao", nPares: null, validadaEm: null, rodovia: null, especie: null };

function especificidade(l: LinhaCalibracao, rodovia: string | null, especie: string): number | null {
  if (l.rodovia != null && l.rodovia !== rodovia) return null;
  if (l.especie != null && l.especie !== especie) return null;
  return (l.rodovia ? 2 : 0) + (l.especie ? 1 : 0);
}

export function escolherCalibracao(linhas: LinhaCalibracao[], rodovia: string | null, especie: string): CalibracaoVigente {
  let melhor: { s: number; l: LinhaCalibracao } | null = null;
  for (const l of linhas) {
    const s = especificidade(l, rodovia, especie);
    if (s !== null && (melhor === null || s > melhor.s)) melhor = { s, l };
  }
  if (!melhor) return SEM_CALIBRACAO;
  const v = Array.isArray(melhor.l.validacoes) ? melhor.l.validacoes[0] : melhor.l.validacoes;
  return {
    fator: Number(melhor.l.fator),
    origem: "medida",
    nPares: v?.n_pares_usados ?? null,
    validadaEm: v?.executada_em ?? null,
    rodovia: melhor.l.rodovia,
    especie: melhor.l.especie,
  };
}
```

`web/src/lib/calibracao-regra.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { escolherCalibracao, SEM_CALIBRACAO } from "./calibracao-regra";

const LINHAS = [
  { fator: "1.30", rodovia: "SP-021 Rodoanel Oeste", especie: "braquiaria", validacoes: { n_pares_usados: 195, executada_em: "2026-09-13T20:00:00Z" } },
  { fator: "1.10", rodovia: null, especie: "braquiaria", validacoes: null },
  { fator: "0.90", rodovia: null, especie: null, validacoes: null },
];

describe("escolherCalibracao", () => {
  it("a mais específica vence e traz o n da validação", () => {
    const c = escolherCalibracao(LINHAS, "SP-021 Rodoanel Oeste", "braquiaria");
    expect(c.fator).toBe(1.3);
    expect(c.origem).toBe("medida");
    expect(c.nPares).toBe(195);
  });
  it("cai para a da espécie e depois para a geral", () => {
    expect(escolherCalibracao(LINHAS, "BR-116", "braquiaria").fator).toBe(1.1);
    expect(escolherCalibracao(LINHAS, "BR-116", "batatais").fator).toBe(0.9);
  });
  it("sem linha que case, é sem calibração", () => {
    expect(escolherCalibracao([], null, "braquiaria")).toBe(SEM_CALIBRACAO);
    expect(escolherCalibracao([{ fator: 2, rodovia: "SP-280", especie: null }], "SP-021 Rodoanel Oeste", "braquiaria").fator).toBe(1);
  });
});
```

`web/src/lib/calibracao.ts`:

```ts
import "server-only";

import { cache } from "react";

import { escolherCalibracao, type CalibracaoVigente, type LinhaCalibracao } from "./calibracao-regra";
import { db } from "./supabase";

/** O fator vigente para um ponto do mapa. Uma consulta por request, deduplicada pelo `cache()`. */
export const fatorVigente = cache(async (rodovia: string | null, especie: string): Promise<CalibracaoVigente> => {
  const { data, error } = await db
    .from("calibracoes")
    .select("fator, rodovia, especie, validacoes(n_pares_usados, executada_em)")
    .eq("ativo", true);
  if (error) throw new Error(`Falha ao ler as calibrações: ${error.message}`);
  return escolherCalibracao((data ?? []) as LinhaCalibracao[], rodovia, especie);
});
```

- [ ] **Step 5: O fator na simulação**

Em `web/src/lib/simulacao.ts`: a assinatura vira `export function simular(pedido: PedidoSimulacao, janela: Janela, fator = 1): Simulacao`; `Simulacao` ganha `/** Fator de calibração aplicado aos três quantis. 1 = sem calibração. */ fator: number;`. Acrescente antes de `simular`:

```ts
/** O fator entra aqui, fora das árvores: `arvores.test.ts` continua comparando o percurso cru com o scikit-learn. */
function escalar(i: Intervalo, fator: number): Intervalo {
  return { q10: i.q10 * fator, q50: i.q50 * fator, q90: i.q90 * fator };
}
```

Dentro do laço, `const crescimento = preverCrescimento({ ...contexto, diasPeriodo: d });` vira `const crescimento = escalar(preverCrescimento({ ...contexto, diasPeriodo: d }), fator);`. No objeto devolvido, acrescente `fator,`.

Em `web/src/lib/simulacao.test.ts`, acrescente um teste que reaproveite o `pedido` e a `janela` que os testes existentes já montam:

```ts
  it("o fator de calibração escala os três quantis e não muda o dia 0", () => {
    const um = simular(pedido, janela);
    const dois = simular(pedido, janela, 2);
    expect(dois.fator).toBe(2);
    expect(dois.pontos[0].alturaCm).toBe(um.pontos[0].alturaCm);
    expect(dois.crescimento.q50).toBeCloseTo(um.crescimento.q50 * 2, 6);
    expect(dois.crescimento.q90).toBeCloseTo(um.crescimento.q90 * 2, 6);
  });
```

- [ ] **Step 6: O simulador passa e mostra o fator**

`grep -rn "simular(" "web/src/app/(painel)/simulador"` acha a chamada (Server Component ou action). Ali, antes de chamar, resolva `const calibracao = await fatorVigente(referencia?.trecho.rodovia ?? null, pedido.especie);` (o simulador já resolve `trechoMaisProximo` como `referencia`; se a variável tiver outro nome, use-o) e passe `simular(pedido, janela, calibracao.fator)`. Entregue `calibracao` ao componente de resultado por prop, e nele mostre, junto da leitura do gestor, um `<p className="text-xs text-ink-2">`:

- se `origem === "medida"`: `Calibração: fator {fmt.d2(calibracao.fator)}, medido em {fmt.n(calibracao.nPares)} pares reais do Rodoanel em {fmt.dataMedia(calibracao.validadaEm)}.`
- senão: `Sem calibração medida para este ponto: a curva é o modelo sintético puro.`

(`fmt.d2` e `fmt.dataMedia` existem em `src/lib/format.ts`; se `d2` não existir, use `fmt.d3`.)

- [ ] **Step 7: Verificar e commitar**

```bash
cd web && npm run verificar; cd ..
git add web
git commit -m "feat(painel): tipos e vocabulario dos dados reais, trecho inativo fora das listas, fator de calibracao no simulador"
```


---

### Task 17: A página `/validacao`, o item de navegação, a permissão e a ficha do modelo

**Files:**
- Create: `web/src/lib/validacao/queries.ts`, `web/src/app/(painel)/validacao/page.tsx`, `loading.tsx`, `error.tsx`, `_componentes/resumo-validacao.tsx`, `_componentes/matriz-confusao.tsx`, `_componentes/sensibilidade.tsx`, `_componentes/ndvi-separacao.tsx`, `_componentes/limitacoes.tsx`, `_componentes/chip-classe.tsx`
- Modify: `web/src/components/shell/navegacao.ts`, `web/src/lib/auth/permissoes.ts`, `web/src/lib/auth/permissoes.test.ts`, `web/src/app/(painel)/copiloto/_componentes/ficha-modelo.tsx`, `web/src/app/(painel)/copiloto/page.tsx`

**Interfaces:**
- Produces: `validacaoVigente(): Promise<Validacao | null>`, `validacoesSensibilidade(vigente: Validacao): Promise<Validacao[]>`, `ndviAnalises(): Promise<NdviAnalise[]>`; `<ChipClasse classe={1|2|3} />`; `FichaModelo({ modeloLlm, validacao })`.

- [ ] **Step 1: Leituras** (`web/src/lib/validacao/queries.ts`)

```ts
import "server-only";

import { cache } from "react";

import { db } from "../supabase";
import type { NdviAnalise, Validacao } from "../types";

function erro(contexto: string, e: { message: string } | null): never {
  throw new Error(`Falha ao ler ${contexto}: ${e?.message ?? "erro desconhecido"}`);
}

/** A validação que alimenta a calibração. `null` enquanto nenhuma foi gravada. */
export const validacaoVigente = cache(async (): Promise<Validacao | null> => {
  const { data, error } = await db.from("validacoes").select("*").eq("vigente", true).order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) erro("a validação vigente", error);
  return (data as Validacao) ?? null;
});

/** As rodadas de sensibilidade da mesma janela e rodovia, na ordem em que foram gravadas. */
export const validacoesSensibilidade = cache(async (vigente: Validacao): Promise<Validacao[]> => {
  const { data, error } = await db
    .from("validacoes")
    .select("*")
    .eq("rodovia", vigente.rodovia)
    .eq("janela_de", vigente.janela_de)
    .eq("vigente", false)
    .eq("observacoes", "sensibilidade")
    .order("id");
  if (error) erro("a sensibilidade da validação", error);
  return data as Validacao[];
});

/** A análise NDVI mais recente de cada data-alvo. */
export const ndviAnalises = cache(async (): Promise<NdviAnalise[]> => {
  const { data, error } = await db.from("ndvi_analises").select("*").order("executada_em", { ascending: false }).order("id", { ascending: false });
  if (error) erro("as análises de NDVI", error);
  const porAlvo = new Map<string, NdviAnalise>();
  for (const a of data as NdviAnalise[]) if (!porAlvo.has(a.data_alvo)) porAlvo.set(a.data_alvo, a);
  return [...porAlvo.values()].sort((a, b) => a.data_alvo.localeCompare(b.data_alvo));
});
```

- [ ] **Step 2: O chip de classe** (`_componentes/chip-classe.tsx`)

```tsx
import { CircleCheck, OctagonAlert, TriangleAlert } from "lucide-react";

import { CLASSE_ALTURA } from "@/lib/dominio";
import type { ClasseAltura } from "@/lib/types";

const ICONE = { CircleCheck, TriangleAlert, OctagonAlert } as const;

/** Cor nunca sozinha: ícone e rótulo sempre juntos, como manda `dominio.ts`. */
export function ChipClasse({ classe, curto = false }: { classe: ClasseAltura; curto?: boolean }) {
  const t = CLASSE_ALTURA[classe];
  const Icone = ICONE[t.icone as keyof typeof ICONE] ?? TriangleAlert;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-2xs font-medium"
      style={{ color: t.tinta, background: t.fundo }}
      title={t.descricao}
    >
      <Icone aria-hidden="true" className="size-3 shrink-0" />
      {curto ? String(classe) : t.rotulo}
    </span>
  );
}
```

- [ ] **Step 3: Resumo** (`_componentes/resumo-validacao.tsx`)

```tsx
import { Scale } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo, CartaoRodape } from "@/components/ui/cartao";
import { fmt } from "@/lib/format";
import type { Validacao } from "@/lib/types";

function pct(v: number | string | null): string {
  return v == null ? "—" : `${fmt.d1(Number(v) * 100)}%`;
}

/** O número. Ao lado dele, sempre, a linha de base "nada muda": é contra ela que o modelo é julgado. */
export function ResumoValidacao({ v }: { v: Validacao }) {
  const n = Number(v.n_pares_usados);
  const estaveis = Number(v.estaveis_total ?? 0);
  const base = n ? estaveis / n : null;
  const tiles = [
    { rotulo: "Pares reais usados", valor: fmt.n(n), nota: `${fmt.n(v.n_rocados_excluidos)} roçados no intervalo ficaram fora` },
    { rotulo: "Transições detectadas", valor: `${fmt.n(v.transicoes_detectadas ?? 0)} de ${fmt.n(v.transicoes_total ?? 0)}`, nota: "pontos que subiram de classe em 7 dias e o modelo avisou" },
    { rotulo: "Alarmes falsos", valor: `${fmt.n(v.alarmes_falsos ?? 0)} de ${fmt.n(estaveis)}`, nota: "pontos que ficaram iguais e o modelo previu subida" },
    { rotulo: "Acurácia de classe", valor: pct(v.acuracia_classe), nota: `linha de base "nada muda": ${pct(base)}` },
    { rotulo: "Fator de calibração", valor: fmt.d2(Number(v.fator_calibracao)), nota: Number(v.fator_calibracao) === 1 ? "sem calibração: não melhorou o critério" : "multiplica o crescimento previsto" },
    { rotulo: "Cobertura da banda q10–q90", valor: pct(v.cobertura_banda), nota: "observação compatível com o intervalo do modelo" },
  ];
  return (
    <Cartao>
      <CartaoCabecalho
        icone={<Scale />}
        titulo="O modelo contra o campo"
        descricao={`Rodoanel Oeste, ${fmt.dataMedia(v.janela_de)} → ${fmt.dataMedia(v.janela_ate)}. Espécie assumida: ${v.especie}. Classe 3 = ${fmt.n(Number(v.ponto_medio_classe3_cm))} cm; roçada há ${fmt.n(Number(v.dias_desde_rocada_premissa))} dias.`}
      />
      <CartaoCorpo>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {tiles.map((t) => (
            <li key={t.rotulo} className="rounded-md border border-border bg-surface-2 p-3">
              <span className="block text-2xs tracking-widest text-ink-3 uppercase">{t.rotulo}</span>
              <span className="tnum mt-1.5 block font-mono text-xl leading-none font-semibold text-ink">{t.valor}</span>
              <span className="mt-1.5 block text-xs text-ink-2">{t.nota}</span>
            </li>
          ))}
        </ul>
      </CartaoCorpo>
      <CartaoRodape>
        <span className="min-w-0 break-words">
          Validado em {fmt.dataMedia(v.executada_em.slice(0, 10))}
          {v.commit_git ? <> · commit <span className="font-mono">{v.commit_git}</span></> : null}
          {v.observacoes ? <> · {v.observacoes}</> : null}
        </span>
      </CartaoRodape>
    </Cartao>
  );
}
```

Se `fmt.d1`/`fmt.d2` não existirem em `format.ts`, use `fmt.d3` ou acrescente-os lá seguindo o padrão dos que existem (via `Intl.NumberFormat("pt-BR", { maximumFractionDigits: n })`).

- [ ] **Step 4: Matriz, sensibilidade, NDVI e limitações**

`_componentes/matriz-confusao.tsx`:

```tsx
import { Grid3x3 } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";
import { Tabela, TabelaCabecalho, TabelaCelula, TabelaCorpo, TabelaLinha, TabelaTitulo } from "@/components/ui/tabela";
import { fmt } from "@/lib/format";
import type { ClasseAltura, Validacao } from "@/lib/types";

import { ChipClasse } from "./chip-classe";

const CLASSES: ClasseAltura[] = [1, 2, 3];

export function MatrizConfusao({ v }: { v: Validacao }) {
  return (
    <Cartao>
      <CartaoCabecalho icone={<Grid3x3 />} titulo="Matriz de confusão" descricao="Linhas: o que a equipe viu em 20/03. Colunas: o que o modelo previu a partir de 13/03." />
      <CartaoCorpo>
        <Tabela rotulo="Matriz de confusão observado por previsto">
          <TabelaCabecalho>
            <tr>
              <TabelaTitulo>observada ↓ · prevista →</TabelaTitulo>
              {CLASSES.map((c) => (
                <TabelaTitulo key={c}><ChipClasse classe={c} curto /></TabelaTitulo>
              ))}
            </tr>
          </TabelaCabecalho>
          <TabelaCorpo>
            {CLASSES.map((obs) => (
              <TabelaLinha key={obs}>
                <TabelaCelula><ChipClasse classe={obs} /></TabelaCelula>
                {CLASSES.map((prev) => {
                  const n = Number(v.matriz_confusao[String(obs) as "1" | "2" | "3"]?.[String(prev) as "1" | "2" | "3"] ?? 0);
                  return (
                    <TabelaCelula key={prev} className={`tnum ${obs === prev ? "font-semibold text-ink" : "text-ink-2"}`}>
                      {fmt.n(n)}
                    </TabelaCelula>
                  );
                })}
              </TabelaLinha>
            ))}
          </TabelaCorpo>
        </Tabela>
      </CartaoCorpo>
    </Cartao>
  );
}
```

`_componentes/sensibilidade.tsx`:

```tsx
import { SlidersHorizontal } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";
import { Tabela, TabelaCabecalho, TabelaCelula, TabelaCorpo, TabelaLinha, TabelaTitulo } from "@/components/ui/tabela";
import { fmt } from "@/lib/format";
import type { Validacao } from "@/lib/types";

function j(v: Validacao): number | null {
  const tt = Number(v.transicoes_total ?? 0), et = Number(v.estaveis_total ?? 0);
  if (!tt || !et) return null;
  return Number(v.transicoes_detectadas ?? 0) / tt - Number(v.alarmes_falsos ?? 0) / et;
}

/** As 26 variações das premissas, sem calibração: o quanto o resultado depende do que assumimos. */
export function Sensibilidade({ linhas }: { linhas: Validacao[] }) {
  if (linhas.length === 0) return null;
  return (
    <Cartao>
      <CartaoCabecalho icone={<SlidersHorizontal />} titulo="Sensibilidade às premissas" descricao="Espécie, altura da classe 3 e dias desde a roçada variados um a um, sem calibração." />
      <CartaoCorpo>
        <Tabela rotulo="Sensibilidade da validação às premissas">
          <TabelaCabecalho>
            <tr>
              <TabelaTitulo>espécie</TabelaTitulo><TabelaTitulo>classe 3</TabelaTitulo><TabelaTitulo>roçada há</TabelaTitulo>
              <TabelaTitulo>acurácia</TabelaTitulo><TabelaTitulo>transições</TabelaTitulo><TabelaTitulo>alarmes</TabelaTitulo><TabelaTitulo>J</TabelaTitulo>
            </tr>
          </TabelaCabecalho>
          <TabelaCorpo>
            {linhas.map((v) => (
              <TabelaLinha key={v.id}>
                <TabelaCelula>{v.especie}</TabelaCelula>
                <TabelaCelula className="tnum">{fmt.cm(Number(v.ponto_medio_classe3_cm))}</TabelaCelula>
                <TabelaCelula className="tnum">{fmt.contar(Number(v.dias_desde_rocada_premissa), "dia")}</TabelaCelula>
                <TabelaCelula className="tnum">{v.acuracia_classe == null ? "—" : `${fmt.d1(Number(v.acuracia_classe) * 100)}%`}</TabelaCelula>
                <TabelaCelula className="tnum">{fmt.n(v.transicoes_detectadas ?? 0)} de {fmt.n(v.transicoes_total ?? 0)}</TabelaCelula>
                <TabelaCelula className="tnum">{fmt.n(v.alarmes_falsos ?? 0)} de {fmt.n(v.estaveis_total ?? 0)}</TabelaCelula>
                <TabelaCelula className="tnum">{j(v) == null ? "—" : fmt.d3(j(v) as number)}</TabelaCelula>
              </TabelaLinha>
            ))}
          </TabelaCorpo>
        </Tabela>
      </CartaoCorpo>
    </Cartao>
  );
}
```

`_componentes/ndvi-separacao.tsx`:

```tsx
import { Satellite } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";
import { Tabela, TabelaCabecalho, TabelaCelula, TabelaCorpo, TabelaLinha, TabelaTitulo } from "@/components/ui/tabela";
import { fmt } from "@/lib/format";
import type { NdviAnalise } from "@/lib/types";

const d3 = (v: number | string | null) => (v == null ? "—" : fmt.d3(Number(v)));

/** O satélite contra a caminhada da equipe. AUC 0,5 = não separa; 1,0 = separa perfeitamente. */
export function NdviSeparacao({ analises }: { analises: NdviAnalise[] }) {
  return (
    <Cartao>
      <CartaoCabecalho icone={<Satellite />} titulo="Sentinel-2 contra a verdade de campo" descricao="NDVI mediano por segmento, máscara dos polígonos de roçada da Motiva. Classe 3 lê mais verde que classe 1?" />
      <CartaoCorpo className="space-y-4">
        {analises.length === 0 ? (
          <p className="text-sm text-ink-2">Nenhuma análise de NDVI gravada ainda. O bloco aparece quando a trilha do satélite fechar.</p>
        ) : (
          <Tabela rotulo="Separação de classes por NDVI">
            <TabelaCabecalho>
              <tr>
                <TabelaTitulo>data-alvo</TabelaTitulo><TabelaTitulo>imagem</TabelaTitulo><TabelaTitulo>nuvem</TabelaTitulo>
                <TabelaTitulo>NDVI classe 1</TabelaTitulo><TabelaTitulo>NDVI classe 3</TabelaTitulo><TabelaTitulo>AUC</TabelaTitulo><TabelaTitulo>p</TabelaTitulo>
                <TabelaTitulo>ΔNDVI roçados × não</TabelaTitulo>
              </tr>
            </TabelaCabecalho>
            <TabelaCorpo>
              {analises.map((a) => (
                <TabelaLinha key={a.id}>
                  <TabelaCelula>{fmt.dataMedia(a.data_alvo)}</TabelaCelula>
                  <TabelaCelula>{a.data_imagem ? `${fmt.dataMedia(a.data_imagem)} (${a.defasagem_dias! >= 0 ? "+" : ""}${a.defasagem_dias} d)` : a.observacoes ?? "sem imagem"}</TabelaCelula>
                  <TabelaCelula className="tnum">{a.nuvem_pct_media == null ? "—" : `${fmt.d1(Number(a.nuvem_pct_media) * 100)}%`}</TabelaCelula>
                  <TabelaCelula className="tnum">{d3(a.ndvi_mediana_c1)} <span className="text-ink-3">(n {a.n_classe1 ?? 0})</span></TabelaCelula>
                  <TabelaCelula className="tnum">{d3(a.ndvi_mediana_c3)} <span className="text-ink-3">(n {a.n_classe3 ?? 0})</span></TabelaCelula>
                  <TabelaCelula className="tnum font-semibold">{d3(a.auc)}</TabelaCelula>
                  <TabelaCelula className="tnum">{d3(a.p_valor)}</TabelaCelula>
                  <TabelaCelula className="tnum">{a.delta_rocados == null ? "—" : `${d3(a.delta_rocados)} × ${d3(a.delta_nao_rocados)} (p ${d3(a.p_valor_delta)})`}</TabelaCelula>
                </TabelaLinha>
              ))}
            </TabelaCorpo>
          </Tabela>
        )}
      </CartaoCorpo>
    </Cartao>
  );
}
```

`_componentes/limitacoes.tsx`:

```tsx
import { TriangleAlert } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";

/** Declaradas antes que perguntem. Espelha a spec §15. */
const LIMITACOES = [
  "Duas datas apenas, ambas em março de 2026: a calibração vale para o fim da estação chuvosa em São Paulo.",
  "Classes de altura, não centímetros. O ponto médio de cada classe é uma aproximação, e a sensibilidade acima mede o quanto ela pesa.",
  "Dias desde a última roçada eram desconhecidos em 13/03: a premissa de 200 dias foi testada contra 30 e 60.",
  "A calibração é do Rodoanel. O método transfere para outra rodovia; o número, não.",
  "Pixel de 10 m no satélite: faixas estreitas (dispositivos e marginais) ficam fora da leitura por segmento.",
  "53 roçadas inferidas em uma semana é amostra pequena para um detector automático de corte.",
  "A acurácia não é prometida: é medida a cada levantamento novo que entrar pelo importador.",
];

export function Limitacoes() {
  return (
    <Cartao>
      <CartaoCabecalho icone={<TriangleAlert />} titulo="Limitações declaradas" descricao="O que este número não diz." />
      <CartaoCorpo>
        <ol className="space-y-2">
          {LIMITACOES.map((l, i) => (
            <li key={l} className="flex gap-2.5 text-sm text-ink-2">
              <span aria-hidden="true" className="tnum shrink-0 font-mono text-2xs text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 break-words">{l}</span>
            </li>
          ))}
        </ol>
      </CartaoCorpo>
    </Cartao>
  );
}
```

- [ ] **Step 5: A página**

`web/src/app/(painel)/validacao/page.tsx`:

```tsx
import type { Metadata } from "next";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { AvisoSomenteLeitura } from "@/components/ui/aviso-somente-leitura";
import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";
import { podeEscrever } from "@/lib/auth/permissoes";
import { exigirCargo } from "@/lib/auth/sessao";
import { ndviAnalises, validacaoVigente, validacoesSensibilidade } from "@/lib/validacao/queries";

import { Limitacoes } from "./_componentes/limitacoes";
import { MatrizConfusao } from "./_componentes/matriz-confusao";
import { NdviSeparacao } from "./_componentes/ndvi-separacao";
import { ResumoValidacao } from "./_componentes/resumo-validacao";
import { Sensibilidade } from "./_componentes/sensibilidade";

export const metadata: Metadata = {
  title: "Validação",
  description: "O modelo de crescimento confrontado com o levantamento de campo da Motiva: acertos, erros, calibração e o satélite.",
};

export const dynamic = "force-dynamic";

export default async function PaginaValidacao() {
  const sessao = await exigirCargo("super_admin", "admin", "analista");
  const vigente = await validacaoVigente();
  const [sensibilidade, ndvi] = await Promise.all([
    vigente ? validacoesSensibilidade(vigente) : Promise.resolve([]),
    ndviAnalises(),
  ]);

  return (
    <>
      <CabecalhoPagina
        titulo="Validação"
        descricao="A acurácia deixou de ser alegação: é medida contra o que a equipe da Motiva viu na estrada."
      />
      {!podeEscrever(sessao.cargo) ? <AvisoSomenteLeitura /> : null}

      <div className="grid gap-4">
        {vigente ? (
          <>
            <ResumoValidacao v={vigente} />
            <div className="grid gap-4 lg:grid-cols-2">
              <MatrizConfusao v={vigente} />
              <Limitacoes />
            </div>
            <Sensibilidade linhas={sensibilidade} />
          </>
        ) : (
          <Cartao>
            <CartaoCabecalho titulo="Nenhuma validação gravada" descricao="Rode `pesquisa/validar.py` e `pesquisa/publicar_rodoanel.py`. Esta página lê `ia.validacoes`." />
            <CartaoCorpo><p className="text-sm text-ink-2">Sem validação não há calibração, e o lote roda com o modelo sintético puro. A página existe para isso nunca passar despercebido.</p></CartaoCorpo>
          </Cartao>
        )}
        <NdviSeparacao analises={ndvi} />
      </div>
    </>
  );
}
```

Copie `web/src/app/(painel)/agenda/loading.tsx` e `error.tsx` para `validacao/`, trocando os textos para "Validação". Confira as props reais de `CabecalhoPagina` e `CartaoCabecalho` nos arquivos existentes (`grep -n "export function CabecalhoPagina" -A 12 web/src/components/shell/cabecalho-pagina.tsx`) e ajuste os nomes se divergirem de `titulo`/`descricao`.

- [ ] **Step 6: Navegação e permissão**

Em `web/src/components/shell/navegacao.ts`, importe `ClipboardCheck` de `lucide-react` e acrescente, depois do item Copiloto:

```ts
  { href: "/validacao", rotulo: "Validação", icone: ClipboardCheck, descricao: "O modelo contra o campo: acertos, erros e calibração", grupo: "operacao" },
```

Em `web/src/lib/auth/permissoes.ts`: `grep -n '"/copiloto"' web/src/lib/auth/permissoes.ts` mostra onde as rotas de cada cargo estão. Acrescente `"/validacao"` exatamente onde `"/copiloto"` aparece para `super_admin`, `admin` e `analista`. Em `permissoes.test.ts`, onde houver asserção listando as rotas do analista (ou de qualquer cargo), inclua `"/validacao"`; acrescente:

```ts
  it("validação é leitura para os três cargos de painel e fechada ao roçador", () => {
    expect(podeVerRota("analista", "/validacao")).toBe(true);
    expect(podeVerRota("admin", "/validacao")).toBe(true);
    expect(podeVerRota("rocador", "/validacao")).toBe(false);
  });
```

- [ ] **Step 7: A ficha do modelo passa a mostrar a precisão medida**

Em `ficha-modelo.tsx`: a assinatura vira `export function FichaModelo({ modeloLlm, validacao }: { modeloLlm: string | null; validacao: Validacao | null })` (importe `Validacao` de `@/lib/types` e `fmt` de `@/lib/format`). Troque a segunda `LIMITACOES` por: `"Medição com mais de 120 dias não vira previsão: o trecho aparece como lacuna, com a data da última leitura, em vez de um número inventado."`. Antes da `<section className="rounded-md …">` das limitações, acrescente:

```tsx
        <section>
          <h3 className="text-2xs tracking-widest text-ink-3 uppercase">Precisão medida</h3>
          {validacao ? (
            <p className="mt-2 text-xs text-ink-2">
              Contra {fmt.n(validacao.n_pares_usados)} pares reais do levantamento da Motiva no Rodoanel
              ({fmt.dataMedia(validacao.janela_de)} → {fmt.dataMedia(validacao.janela_ate)}): {fmt.n(validacao.transicoes_detectadas ?? 0)} de{" "}
              {fmt.n(validacao.transicoes_total ?? 0)} transições detectadas, {fmt.n(validacao.alarmes_falsos ?? 0)} alarmes falsos em{" "}
              {fmt.n(validacao.estaveis_total ?? 0)} pontos estáveis, fator de calibração {fmt.d2(Number(validacao.fator_calibracao))}.{" "}
              <Link href="/validacao" className="underline underline-offset-2">Ver a validação inteira.</Link>
            </p>
          ) : (
            <p className="mt-2 text-xs text-warning-ink">Nenhuma validação contra campo gravada: o número que o painel mostra é do modelo sintético puro.</p>
          )}
        </section>
```

(importe `Link` de `next/link`). Em `copiloto/page.tsx`, acrescente `validacaoVigente()` ao `Promise.all` da página e passe `validacao={validacao}` para `<FichaModelo …>`.

- [ ] **Step 8: Verificar e commitar**

```bash
cd web && npm run verificar; cd ..
git add web
git commit -m "feat(painel): pagina /validacao com o modelo contra o campo, e a ficha do modelo com a precisao medida"
```

---

### Task 18: O cartão "Levantamento de campo" na página do trecho

**Files:**
- Create: `web/src/lib/levantamentos/queries.ts`, `web/src/app/(painel)/trechos/_componentes/levantamento-campo.tsx`
- Modify: `web/src/app/(painel)/trechos/[id]/page.tsx`

**Interfaces:**
- Produces: `levantamentosDoTrecho(trechoId): Promise<{ faixas: Faixa[]; datas: string[]; classes: Record<string, Record<string, ClasseAltura | null>> }>` (classes por `faixa_codigo` e depois por `data`).

- [ ] **Step 1: Leitura** (`web/src/lib/levantamentos/queries.ts`)

```ts
import "server-only";

import { cache } from "react";

import { db } from "../supabase";
import type { ClasseAltura, Faixa, Levantamento } from "../types";

export type LevantamentosDoTrecho = {
  faixas: Faixa[];
  datas: string[];
  classes: Record<string, Record<string, ClasseAltura | null>>;
  arquivos: Record<string, string>;
};

export const levantamentosDoTrecho = cache(async (trechoId: number): Promise<LevantamentosDoTrecho> => {
  const [{ data: faixas, error: e1 }, { data: linhas, error: e2 }] = await Promise.all([
    db.from("faixas").select("*").order("ordem"),
    db.from("levantamentos").select("*").eq("trecho_id", trechoId).order("data").order("id"),
  ]);
  if (e1) throw new Error(`Falha ao ler as faixas: ${e1.message}`);
  if (e2) throw new Error(`Falha ao ler os levantamentos do trecho ${trechoId}: ${e2.message}`);

  const classes: LevantamentosDoTrecho["classes"] = {};
  const arquivos: Record<string, string> = {};
  const datas = new Set<string>();
  for (const l of (linhas ?? []) as Levantamento[]) {
    datas.add(l.data);
    arquivos[l.data] = l.arquivo_origem;
    (classes[l.faixa_codigo] ??= {})[l.data] = l.classe;
  }
  return { faixas: (faixas ?? []) as Faixa[], datas: [...datas].sort(), classes, arquivos };
});
```

- [ ] **Step 2: O cartão**

```tsx
import { ClipboardList } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo, CartaoRodape } from "@/components/ui/cartao";
import { Tabela, TabelaCabecalho, TabelaCelula, TabelaCorpo, TabelaLinha, TabelaTitulo } from "@/components/ui/tabela";
import { METODO_ROCADA } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import type { LevantamentosDoTrecho } from "@/lib/levantamentos/queries";
import type { TrechoStatus } from "@/lib/types";

import { ChipClasse } from "../../validacao/_componentes/chip-classe";

/**
 * O que a equipe da Motiva anotou neste segmento, faixa por faixa, nas caminhadas.
 * É a origem da medição do trecho: a pior faixa em escopo vira o ponto médio em cm.
 */
export function LevantamentoCampo({ trecho, lev }: { trecho: TrechoStatus; lev: LevantamentosDoTrecho }) {
  if (lev.datas.length === 0) return null;
  const metodo = trecho.metodo_rocada ? METODO_ROCADA[trecho.metodo_rocada]?.rotulo ?? trecho.metodo_rocada : null;
  return (
    <Cartao>
      <CartaoCabecalho
        icone={<ClipboardList />}
        titulo="Levantamento de campo"
        descricao={`Formulário unifilar RA-ROÇ-LIMP da Motiva, marco ${fmt.n(trecho.km_marco_m ?? 0)} m. Faixas em escopo alimentam a medição do trecho.`}
      />
      <CartaoCorpo className="space-y-3">
        <Tabela rotulo="Classes por faixa transversal e data">
          <TabelaCabecalho>
            <tr>
              <TabelaTitulo>faixa</TabelaTitulo>
              {lev.datas.map((d) => <TabelaTitulo key={d}>{fmt.dataMedia(d)}</TabelaTitulo>)}
            </tr>
          </TabelaCabecalho>
          <TabelaCorpo>
            {lev.faixas.map((f) => (
              <TabelaLinha key={f.codigo}>
                <TabelaCelula className={f.em_escopo ? "text-ink" : "text-ink-3"}>
                  {f.nome}{f.em_escopo ? "" : " · fora do escopo"}
                </TabelaCelula>
                {lev.datas.map((d) => {
                  const c = lev.classes[f.codigo]?.[d] ?? null;
                  return <TabelaCelula key={d}>{c ? <ChipClasse classe={c} /> : <span className="text-ink-3">não se aplica</span>}</TabelaCelula>;
                })}
              </TabelaLinha>
            ))}
          </TabelaCorpo>
        </Tabela>
        <p className="text-xs text-ink-2">
          {metodo ? <>Roçada: <strong className="font-medium text-ink">{metodo}</strong>, {fmt.n(Math.round(Number(trecho.area_rocada_m2 ?? 0)))} m² roçáveis segundo o KML da Motiva. </> : null}
          Solo {trecho.solo_fonte === "soilgrids" ? "lido do SoilGrids no marco" : "por premissa (o SoilGrids não cobre este ponto)"}
          {trecho.fertilidade_solo != null ? <>: fertilidade {fmt.d2(Number(trecho.fertilidade_solo))}, {fmt.n(Math.round(Number(trecho.capacidade_agua_solo_mm ?? 0)))} mm de água disponível.</> : "."}
        </p>
      </CartaoCorpo>
      <CartaoRodape>
        <span className="min-w-0 break-words">
          Arquivos: {lev.datas.map((d) => lev.arquivos[d]).join(" · ")}. Classes: 1 abaixo de 10 cm, 2 de 10 a 30 cm, 3 acima de 30 cm (limite Artesp).
        </span>
      </CartaoRodape>
    </Cartao>
  );
}
```

- [ ] **Step 3: Encaixar na página do trecho**

Em `web/src/app/(painel)/trechos/[id]/page.tsx`: acrescente `levantamentosDoTrecho(id)` ao `Promise.all` que já carrega medições/previsões/execuções (`grep -n "Promise.all" "web/src/app/(painel)/trechos/[id]/page.tsx"`), e renderize `<LevantamentoCampo trecho={trecho} lev={lev} />` logo depois do bloco do estado atual (`grep -n "EstadoAtual" …`). O componente devolve `null` para trechos sem levantamento, então nada muda para o resto da malha.

- [ ] **Step 4: Verificar e commitar**

```bash
cd web && npm run verificar; cd ..
git add web
git commit -m "feat(trecho): cartao do levantamento de campo com as classes por faixa, metodo e solo"
```

---

### Task 19: Deploy manual e o registro de produção

**Files:**
- Create: `docs/pesquisa/04-producao.md`

- [ ] **Step 1: Tudo verde e no `main`**

```bash
cd web && npm run verificar; cd ..
.venv/bin/python -m pytest
git status --short          # limpo
git push origin main
```

- [ ] **Step 2: Deploy a partir de uma cópia limpa do commit** (procedimento de `docs/operacao/deploy.md`, adaptado ao macOS)

```bash
rm -rf /tmp/motiva-deploy && mkdir -p /tmp/motiva-deploy/.vercel
git archive HEAD | tar -x -C /tmp/motiva-deploy
cp .vercel/project.json /tmp/motiva-deploy/.vercel/
du -sh /tmp/motiva-deploy && find /tmp/motiva-deploy -type f -size +2M -exec ls -la {} \;
cd /tmp/motiva-deploy && vercel --prod --yes; cd /Users/enzomoretto/Desktop/motiva/motiva
```

Expected: só `web/src/lib/modelo/modelo.json` e `ml/modelo_gramas.pkl` acima de 2 MB; o CLI termina com o alias `motiva-highwai.vercel.app`.

- [ ] **Step 3: Confirmar em produção**

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://motiva-highwai.vercel.app/        # 307 para /entrar
```

No navegador, logado como admin: `/malha` mostra **só** o SP-021 com 60 trechos; `/validacao` mostra a validação vigente e o bloco NDVI; um trecho do Rodoanel mostra o cartão do levantamento; `/agenda` não tem cartão de trecho fictício; `/simulador` mostra a frase da calibração; o copiloto mostra "Precisão medida".

- [ ] **Step 4: O registro**

Escreva `docs/pesquisa/04-producao.md` com: data e hora do deploy, id do deployment (saída do CLI), o commit publicado, a lista dos cinco cheques acima com o resultado de cada um, e o estado do banco em uma tabela (`select count(*)` de `vw_trecho_status`, `levantamentos`, `validacoes where vigente`, `calibracoes where ativo`, `ndvi_analises`, `medicoes where origem='levantamento_classe'`, `execucoes where origem='inferida_levantamento'`). Registre também o que o lote das 06:00 imprimiu na primeira rodada depois do ingest (aba Actions do GitHub): quantos "medicao vencida", zero erro.

```bash
git add docs/pesquisa/04-producao.md
git commit -m "docs(pesquisa): registro do deploy e do estado de producao com os dados reais"
git push origin main
.venv/bin/python -c "from pesquisa.rodoanel import relatorio; relatorio.diario('Tarefa 19 · deploy em producao · 5 cheques ok · lote das 06:00 sem erro')"
```


---

## Dia 3

### Task 20 (bônus da trilha B): série NDVI 2019–2026 e o detector de corte

Só depois de as Tarefas 9, 13, 14 e 19 estarem fechadas. Se o dia 3 apertar, esta tarefa é a primeira a cair: vira "próximo passo" no relatório.

**Files:**
- Create: `pesquisa/ndvi/ndvi_serie.py`, `pesquisa/ndvi/analisar_serie.py`, `pesquisa/tests/test_analisar_serie.py`
- Modify: `docs/pesquisa/03-ndvi.md` (seção acrescentada por `analisar_serie.py`)
- Create (gerados): `pesquisa/dados/derivados/ndvi_serie.csv`, `ndvi_eventos.csv`, `ndvi_serie_analise.json`

**Interfaces:**
- Produces: `analisar_serie.detectar_cortes(serie: list[tuple[date, float]], queda=0.15, max_dias=12, minimo_antes=0.45) -> list[dict]` (cada evento: `de, ate, ndvi_antes, ndvi_depois, queda`); `analisar_serie.recall_marco_2026(eventos_por_marco, rocados, de=date(2026,3,6), ate=date(2026,3,27)) -> dict`.

- [ ] **Step 1: Teste do detector**

`pesquisa/tests/test_analisar_serie.py`:

```python
from datetime import date

from pesquisa.ndvi import analisar_serie


def test_detecta_uma_queda_e_ignora_ruido():
    serie = [(date(2026, 3, 1), 0.62), (date(2026, 3, 6), 0.60), (date(2026, 3, 16), 0.31), (date(2026, 3, 21), 0.35),
             (date(2026, 4, 5), 0.50), (date(2026, 4, 10), 0.44), (date(2026, 6, 1), 0.70), (date(2026, 7, 1), 0.52)]
    ev = analisar_serie.detectar_cortes(serie)
    assert len(ev) == 1
    assert ev[0]["de"] == date(2026, 3, 6) and ev[0]["ate"] == date(2026, 3, 16)
    assert ev[0]["queda"] > 0.15


def test_queda_com_intervalo_longo_nao_conta():
    serie = [(date(2026, 3, 1), 0.70), (date(2026, 4, 1), 0.40)]
    assert analisar_serie.detectar_cortes(serie) == []


def test_recall_contra_as_rocadas_inferidas():
    eventos = {0: [{"de": date(2026, 3, 11), "ate": date(2026, 3, 16)}], 500: [], 1000: [{"de": date(2026, 1, 1), "ate": date(2026, 1, 6)}]}
    r = analisar_serie.recall_marco_2026(eventos, rocados={0, 500})
    assert r["n_rocados"] == 2 and r["detectados"] == 1 and r["recall"] == 0.5
    assert r["falsos"] == 0          # o evento de janeiro no marco 1000 esta fora da janela
```

- [ ] **Step 2: A série**

`pesquisa/ndvi/ndvi_serie.py`:

```python
"""Serie NDVI por segmento, 2019-01-01 ate hoje, uma chamada por ano (limite de payload do getInfo).

    .venv/bin/python -m pesquisa.ndvi.ndvi_serie

So observacoes com nuvem_pct < 20% no segmento entram. Cada linha: km_marco_m, data_imagem, ndvi_mediana, n_pixels, nuvem_pct.
"""
from __future__ import annotations

from datetime import date

import ee

from pesquisa.rodoanel import ARQ_MARCOS, ARQ_POLIGONOS, DERIVADOS, banco, marcos, poligonos
from pesquisa.ndvi import geometrias
from pesquisa.ndvi.gee_check import iniciar
from pesquisa.ndvi.ndvi_datas import COLECAO, mascarar, ndvi

ANO_INICIAL = 2019
NUVEM_MAXIMA = 0.2


def _por_ano(fc, ano: int) -> list[dict]:
    col = ee.ImageCollection(COLECAO).filterBounds(fc.geometry().bounds()).filterDate(f"{ano}-01-01", f"{ano + 1}-01-01")
    total = ee.Image.constant(1).rename("total").reduceRegions(collection=fc, reducer=ee.Reducer.count(), scale=10)
    total_por_marco = {f["properties"]["km_marco_m"]: f["properties"].get("count", 0) for f in total.getInfo()["features"]}

    def por_imagem(img):
        red = ee.Reducer.median().combine(ee.Reducer.count(), sharedInputs=True)
        return (ndvi(mascarar(img)).reduceRegions(collection=fc, reducer=red, scale=10)
                .map(lambda f: f.set("data_imagem", img.date().format("YYYY-MM-dd"))))

    feats = col.map(por_imagem).flatten().getInfo()["features"]
    saida = []
    for f in feats:
        pr = f["properties"]
        m, n = pr["km_marco_m"], pr.get("count", 0) or 0
        total_m = total_por_marco.get(m, 0) or 0
        if total_m == 0 or pr.get("median") is None:
            continue
        nuvem = 1 - n / total_m
        if nuvem < NUVEM_MAXIMA:
            saida.append({"km_marco_m": m, "data_imagem": pr["data_imagem"], "ndvi_mediana": round(pr["median"], 4),
                          "n_pixels": n, "nuvem_pct": round(nuvem, 4)})
    return saida


def main() -> None:
    iniciar()
    pols = poligonos.ler_poligonos(ARQ_POLIGONOS)
    eixo = marcos.carregar(ARQ_MARCOS)
    fc = geometrias.feature_collection(geometrias.aneis_por_marco(pols, poligonos.atribuir(pols, eixo)))
    linhas = []
    for ano in range(ANO_INICIAL, date.today().year + 1):
        parte = _por_ano(fc, ano)
        print(f"{ano}: {len(parte)} observacoes limpas")
        linhas += parte
    linhas.sort(key=lambda l: (l["km_marco_m"], l["data_imagem"]))
    banco.gravar_csv(DERIVADOS / "ndvi_serie.csv", linhas)
    banco.substituir(banco.abrir(), "ndvi_serie", linhas)
    print(f"-> {len(linhas)} linhas em ndvi_serie.csv")


if __name__ == "__main__":
    main()
```

Se um ano estourar o limite do `getInfo` ("User memory limit exceeded" ou payload), divida aquele ano em semestres dentro de `_por_ano` e registre no diário.

- [ ] **Step 3: O detector e a conferência**

`pesquisa/ndvi/analisar_serie.py`:

```python
"""Detector de corte na serie NDVI, conferido contra as rocadas inferidas de marco/2026.

    .venv/bin/python -m pesquisa.ndvi.analisar_serie
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, datetime

from pesquisa.rodoanel import DERIVADOS, DOCS_PESQUISA, banco, relatorio
from pesquisa.ndvi.analisar_ndvi import rocados_por_segmento

QUEDA_MINIMA = 0.15
MAX_DIAS = 12
MINIMO_ANTES = 0.45


def detectar_cortes(serie: list[tuple[date, float]], queda: float = QUEDA_MINIMA, max_dias: int = MAX_DIAS,
                    minimo_antes: float = MINIMO_ANTES) -> list[dict]:
    eventos = []
    for (d0, v0), (d1, v1) in zip(serie, serie[1:]):
        if (d1 - d0).days <= max_dias and v0 >= minimo_antes and (v0 - v1) >= queda:
            eventos.append({"de": d0, "ate": d1, "ndvi_antes": v0, "ndvi_depois": v1, "queda": round(v0 - v1, 4)})
    return eventos


def recall_marco_2026(eventos_por_marco: dict[int, list[dict]], rocados: set[int],
                      de: date = date(2026, 3, 6), ate: date = date(2026, 3, 27)) -> dict:
    def tem_evento(m):
        return any(de <= e["ate"] <= ate for e in eventos_por_marco.get(m, []))
    detectados = sum(1 for m in rocados if tem_evento(m))
    falsos = sum(1 for m in eventos_por_marco if m not in rocados and tem_evento(m))
    return {"n_rocados": len(rocados), "detectados": detectados, "recall": detectados / len(rocados) if rocados else None,
            "falsos": falsos}


def main() -> None:
    serie = banco.ler_csv(DERIVADOS / "ndvi_serie.csv")
    por_marco: dict[int, list] = defaultdict(list)
    for l in serie:
        por_marco[int(l["km_marco_m"])].append((date.fromisoformat(l["data_imagem"]), float(l["ndvi_mediana"])))
    eventos = {m: detectar_cortes(sorted(s)) for m, s in por_marco.items()}
    rocados = rocados_por_segmento(banco.ler_csv(DERIVADOS / "pares.csv"))
    conf = recall_marco_2026(eventos, rocados)
    por_ano: dict[int, int] = defaultdict(int)
    for evs in eventos.values():
        for e in evs:
            por_ano[e["ate"].year] += 1
    n_obs = len(serie)
    saida = {"gerado_em": datetime.now(relatorio.FUSO_BR).strftime("%d/%m/%Y %H:%M"), "commit": relatorio._commit(),
             "n_observacoes": n_obs, "n_segmentos": len(por_marco),
             "observacoes_por_segmento_ano": round(n_obs / max(len(por_marco), 1) / max(len(por_ano), 1), 1),
             "eventos_total": sum(len(v) for v in eventos.values()), "eventos_por_ano": dict(sorted(por_ano.items())),
             "conferencia_marco_2026": conf,
             "parametros": {"queda_minima": QUEDA_MINIMA, "max_dias": MAX_DIAS, "minimo_antes": MINIMO_ANTES}}
    (DERIVADOS / "ndvi_serie_analise.json").write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")
    banco.gravar_csv(DERIVADOS / "ndvi_eventos.csv", [{"km_marco_m": m, **{k: (v.isoformat() if isinstance(v, date) else v) for k, v in e.items()}}
                                                      for m, evs in sorted(eventos.items()) for e in evs])
    texto = (f"\n\n## Série 2019–{date.today().year} e detector de corte\n\nGerado por `pesquisa/ndvi/analisar_serie.py` em {saida['gerado_em']} (commit {saida['commit']}).\n\n"
             f"{n_obs} observações limpas em {len(por_marco)} segmentos (~{saida['observacoes_por_segmento_ano']} por segmento por ano). "
             f"Detector: queda ≥ {QUEDA_MINIMA} em ≤ {MAX_DIAS} dias partindo de NDVI ≥ {MINIMO_ANTES}.\n\n"
             f"| ano | cortes detectados |\n|---|---|\n" + "\n".join(f"| {a} | {n} |" for a, n in sorted(por_ano.items())) +
             f"\n\nConferência contra as {conf['n_rocados']} roçadas inferidas de 13→20/03/2026: **{conf['detectados']} detectadas** "
             f"(recall {'—' if conf['recall'] is None else f'{conf['recall']:.0%}'}), {conf['falsos']} segmento(s) com queda sem roçada inferida.\n")
    with (DOCS_PESQUISA / "03-ndvi.md").open("a", encoding="utf-8") as f:
        f.write(texto)
    print(saida)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Rodar e commitar**

```bash
.venv/bin/python -m pytest pesquisa/tests/test_analisar_serie.py
.venv/bin/python -m pesquisa.ndvi.ndvi_serie
.venv/bin/python -m pesquisa.ndvi.analisar_serie
.venv/bin/python -c "
import json; from pesquisa.rodoanel import relatorio, DERIVADOS
s = json.load(open(DERIVADOS/'ndvi_serie_analise.json')); c = s['conferencia_marco_2026']
relatorio.diario(f\"Tarefa 20 · serie NDVI e detector · {s['n_observacoes']} observacoes, {s['eventos_total']} cortes, recall marco/2026 {c['detectados']}/{c['n_rocados']}\")"
git add pesquisa docs/pesquisa/03-ndvi.md
git commit -m "feat(ndvi): serie 2019-2026 por segmento e detector de corte conferido contra as rocadas inferidas"
```

---

### Task 21: Os levantamentos importados aparecem no painel, e o importador ganha manual

**Files:**
- Create: `web/src/app/(painel)/validacao/_componentes/levantamentos-importados.tsx`, `docs/operacao/importar-levantamento.md`
- Modify: `web/src/lib/levantamentos/queries.ts`, `web/src/app/(painel)/validacao/page.tsx`

**Interfaces:**
- Produces: `levantamentosImportados(): Promise<{ data: string; arquivo: string; trechos: number; importado_em: string }[]>`.

- [ ] **Step 1: Leitura** (acrescentar a `web/src/lib/levantamentos/queries.ts`)

```ts
export const levantamentosImportados = cache(async () => {
  const { data, error } = await db.from("levantamentos").select("data, arquivo_origem, trecho_id, importado_em").order("data");
  if (error) throw new Error(`Falha ao ler os levantamentos importados: ${error.message}`);
  const grupos = new Map<string, { data: string; arquivo: string; trechos: Set<number>; importado_em: string }>();
  for (const l of (data ?? []) as { data: string; arquivo_origem: string; trecho_id: number; importado_em: string }[]) {
    const g = grupos.get(l.data) ?? { data: l.data, arquivo: l.arquivo_origem, trechos: new Set<number>(), importado_em: l.importado_em };
    g.trechos.add(l.trecho_id);
    if (l.importado_em > g.importado_em) g.importado_em = l.importado_em;
    grupos.set(l.data, g);
  }
  return [...grupos.values()].map((g) => ({ data: g.data, arquivo: g.arquivo, trechos: g.trechos.size, importado_em: g.importado_em }));
});
```

- [ ] **Step 2: O cartão**

```tsx
import { FileSpreadsheet } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo, CartaoRodape } from "@/components/ui/cartao";
import { Tabela, TabelaCabecalho, TabelaCelula, TabelaCorpo, TabelaLinha, TabelaTitulo } from "@/components/ui/tabela";
import { fmt } from "@/lib/format";

type Linha = { data: string; arquivo: string; trechos: number; importado_em: string };

/** O portão dos dados semanais: cada planilha RA-RET que entrou, e como entra a próxima. */
export function LevantamentosImportados({ linhas }: { linhas: Linha[] }) {
  return (
    <Cartao>
      <CartaoCabecalho icone={<FileSpreadsheet />} titulo="Levantamentos importados" descricao="Cada caminhada da equipe da Motiva que virou dado do sistema. A próxima vira par de validação sozinha." />
      <CartaoCorpo>
        <Tabela rotulo="Levantamentos importados">
          <TabelaCabecalho>
            <tr><TabelaTitulo>data do levantamento</TabelaTitulo><TabelaTitulo>arquivo</TabelaTitulo><TabelaTitulo>trechos</TabelaTitulo><TabelaTitulo>importado em</TabelaTitulo></tr>
          </TabelaCabecalho>
          <TabelaCorpo>
            {linhas.map((l) => (
              <TabelaLinha key={l.data}>
                <TabelaCelula>{fmt.dataMedia(l.data)}</TabelaCelula>
                <TabelaCelula className="font-mono text-xs">{l.arquivo}</TabelaCelula>
                <TabelaCelula className="tnum">{fmt.n(l.trechos)}</TabelaCelula>
                <TabelaCelula>{fmt.dataMedia(l.importado_em.slice(0, 10))}</TabelaCelula>
              </TabelaLinha>
            ))}
          </TabelaCorpo>
        </Tabela>
      </CartaoCorpo>
      <CartaoRodape>
        <span className="min-w-0 break-words">
          Para importar o próximo: <span className="font-mono">python -m pesquisa.importar_levantamento --xlsx RA-RET-ROÇ-LIMP-AAAA-MM-DD.xlsx --anterior &lt;o anterior&gt; --gravar</span>. Procedimento em <span className="font-mono">docs/operacao/importar-levantamento.md</span>.
        </span>
      </CartaoRodape>
    </Cartao>
  );
}
```

Na página `/validacao`, carregue `levantamentosImportados()` no `Promise.all` e renderize `<LevantamentosImportados linhas={importados} />` depois de `<NdviSeparacao …>`.

- [ ] **Step 3: O manual** (`docs/operacao/importar-levantamento.md`)

Escreva, para quem opera e não programa: o que é o arquivo (o RA-RET semanal, aba ROÇADA, sem mexer no layout), onde deixar (`pesquisa/dados/brutos/`), a data no nome do arquivo, o comando de ensaio e o de gravação, o que conferir na saída (720 levantamentos, 50 a 60 medições, execuções inferidas), o que acontece depois (o lote das 06:00 volta a prever os trechos, a validação pode ser refeita com `python -m pesquisa.validar` apontando a nova janela), e o que fazer se o layout da planilha mudar (o parser recusa com a linha e o nome esperado; abra um chamado para o desenvolvedor).

- [ ] **Step 4: Verificar e commitar**

```bash
cd web && npm run verificar; cd ..
git add web docs/operacao/importar-levantamento.md
git commit -m "feat(validacao): levantamentos importados no painel e manual do importador semanal"
```

---

### Task 22: O relatório para a Motiva, documentação de operação, deploy final e tag

**Files:**
- Create: `docs/relatorio-motiva.md`
- Modify: `docs/operacao/deploy.md`, `docs/operacao/preparacao-dados-reais.md`, `docs/pesquisa/00-diario.md`

- [ ] **Step 1: O relatório**

`docs/relatorio-motiva.md` tem estas seções, nesta ordem, e **todo número vem colado de `01-consolidacao.md`, `02-validacao.md`, `03-ndvi.md` ou `04-producao.md`**, nunca digitado:

1. **Em uma frase.** O sistema passou a operar sobre a malha real do Rodoanel Oeste e a acurácia do modelo deixou de ser alegação: é um número medido contra 195 pares de observação da própria Motiva, reconferido a cada levantamento importado.
2. **O que a Motiva pediu e o que respondemos.** Tabela com os 5 pontos do feedback (spec §1) e a resposta de cada um, com o número correspondente.
3. **A base de dados agora.** Tabela "antes → depois" da spec-resumo: trechos reais, observações, roçadas inferidas, solo por km, área e equipamento mapeados, fontes de captura, cobertura de satélite.
4. **O número.** A tabela "O número" de `02-validacao.md`, com a linha de base, e um parágrafo dizendo o que ele significa (transições detectadas e alarmes falsos, não acurácia total).
5. **Calibração honesta.** O bloco de ajuste/teste em km pares/ímpares de `02-validacao.md`.
6. **Satélite.** A tabela por data de `03-ndvi.md` e, se a Tarefa 20 rodou, a conferência do detector.
7. **Como isso vira operação.** A fila por dia ideal (Artesp b.1.1, 30 cm, mobilização), o importador semanal, a regra de medição vencida, a página `/validacao`.
8. **Limitações declaradas.** As da spec §15.
9. **Próximos passos.** Spec §14, mais o que ficou desta lista de tarefas sem fechar.

- [ ] **Step 2: Operação**

Em `docs/operacao/deploy.md`: acrescente uma seção "No macOS" com os comandos da Tarefa 19 (`/tmp/motiva-deploy`), e troque as menções a `E:` e `C:\Users\…` por "a máquina de deploy" onde for genérico. Em `docs/operacao/preparacao-dados-reais.md`, marque os itens feitos com a data. No `00-diario.md`, a linha final: "dados reais em produção; apresentação em 16/09".

- [ ] **Step 3: Deploy final e tag**

```bash
cd web && npm run verificar; cd ..
.venv/bin/python -m pytest
git add docs
git commit -m "docs: relatorio para a Motiva, operacao no macOS e diario fechado"
git push origin main
rm -rf /tmp/motiva-deploy && mkdir -p /tmp/motiva-deploy/.vercel && git archive HEAD | tar -x -C /tmp/motiva-deploy && cp .vercel/project.json /tmp/motiva-deploy/.vercel/ && (cd /tmp/motiva-deploy && vercel --prod --yes)
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://motiva-highwai.vercel.app/
git tag dados-reais-2026-09-15 && git push origin --tags
```

---

## Cobertura da spec

| Spec | Tarefas |
|---|---|
| §3 dec. 14 (layout `ml/`), §1 (árvore suja) | 1 |
| §7.1 definições, §2 fatos, §12 aceitação da consolidação | 2, 3, 4, 5, 6 |
| §7.2 clima e solo | 7, 8 |
| §7.3 validação e calibração, §7.4 relatórios | 9 |
| §8.1 medição vencida, §3 dec. 13 e 15 | 10 |
| §6.1, §6.2, §3 dec. 2 e 16 | 11, 12 |
| §6.3, §7.5 importador | 13, 21 |
| §10 sensoriamento remoto | 14, 20 |
| §8.1 fator/solo/dia ideal, §8.2, §8.3 | 15 |
| §8.4 TypeScript, §9 filtros de `ativo`, tipos, vocabulário | 16 |
| §9 `/validacao`, navegação, permissões, ficha | 17 |
| §9 cartão do trecho | 18 |
| §11 registros, deploy | 0, 19, 22 |
| §14, §15 no relatório final | 22 |
