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
    load_dotenv(".env")
    ee.Initialize(project=os.environ["GEE_PROJECT"])
    ee.Number(1).getInfo()
except Exception as e:
    print("   ", type(e).__name__, str(e)[:120]); sys.exit(1)
PY
fi

printf '\n%d item(ns) bloqueante(s) faltando.\n' "$falhas"
[ "$falhas" -eq 0 ]
