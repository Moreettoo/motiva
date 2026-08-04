"""
Reanalise em lote - roda SEM servidor.

Faz o mesmo que POST /analisar-todos, mas como script solto:
busca os trechos, o clima, preve, decide e grava no Supabase.

Serve para:
  - rodar na mao:            python analisar_lote.py
  - rodar todo dia sozinho:  GitHub Actions (.github/workflows/reanalise.yml)

Precisa das variaveis de ambiente:
  SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY
  DB_SCHEMA (opcional, padrao "ia")
  OPENAI_MODEL (opcional, padrao "gpt-5.4-mini")
"""

import os
import sys
import json
from datetime import date

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import joblib
import httpx
from openai import OpenAI
from supabase import create_client

try:
    from supabase import ClientOptions
except ImportError:
    from supabase.lib.client_options import ClientOptions

DB_SCHEMA = os.getenv("DB_SCHEMA", "ia")
MODELO_LLM = os.getenv("OPENAI_MODEL", "gpt-5.4-mini")

# so analisa com a LLM os trechos que estao a menos de X dias do limite.
# economiza credito: trecho a 90 dias de distancia nao precisa de decisao hoje.
LIMIAR_DIAS = int(os.getenv("LIMIAR_DIAS", "45"))



def _checar_ambiente():
    """Valida as variaveis antes de tentar conectar, com mensagem clara."""
    problemas = []
    for nome in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY", "OPENAI_API_KEY"):
        v = os.getenv(nome)
        if v is None:
            problemas.append(f"  {nome}: NAO EXISTE")
        elif not v.strip():
            problemas.append(f"  {nome}: existe mas esta VAZIA "
                             f"(secret nao cadastrado no GitHub?)")
        else:
            print(f"  {nome}: ok ({len(v)} caracteres)")

    url = (os.getenv("SUPABASE_URL") or "").strip()
    if url and not url.startswith("https://"):
        problemas.append(f"  SUPABASE_URL nao comeca com https:// -> {url[:40]!r}")
    if url and not url.endswith(".supabase.co"):
        problemas.append(f"  SUPABASE_URL nao termina em .supabase.co -> {url[-30:]!r}")

    if problemas:
        print("\nERRO DE CONFIGURACAO:\n" + "\n".join(problemas))
        print("\nNo GitHub: Settings -> Secrets and variables -> Actions")
        print("            -> bloco 'Repository secrets' -> New repository secret")
        print("Local: confira o arquivo .env")
        sys.exit(1)


print("Conferindo variaveis de ambiente:")
_checar_ambiente()
print()

# .strip() remove espaco ou quebra de linha colada junto no copiar/colar
sb = create_client(os.environ["SUPABASE_URL"].strip(),
                   os.environ["SUPABASE_SERVICE_KEY"].strip(),
                   options=ClientOptions(schema=DB_SCHEMA))
openai = OpenAI()

try:
    _p = joblib.load("modelo_vegetacao.pkl")
except Exception as _e:
    import sklearn, re as _re
    _versao_pkl = None
    _m = _re.search(r"from version ([\d.]+)", str(_e))
    if _m:
        _versao_pkl = _m.group(1)
    print("\nERRO AO CARREGAR modelo_vegetacao.pkl")
    print(f"  scikit-learn instalado : {sklearn.__version__}")
    if _versao_pkl:
        print(f"  scikit-learn do modelo : {_versao_pkl}")
    print("\nAs duas versoes precisam ser IGUAIS. Escolha um caminho:")
    print("  A) editar requirements.txt para a versao do modelo, ou")
    print("  B) rodar 'python treinar_modelo.py dataset.csv' com a versao")
    print("     instalada e subir o .pkl novo.")
    print(f"\nDetalhe tecnico: {type(_e).__name__}: {_e}")
    sys.exit(1)

MODELO, FEATURES, MAPAS = _p["modelo"], _p["features"], _p["mapas"]


# ----------------------------------------------------------------------
# ----------------------------------------------------------------------
# ZONAS CLIMATICAS POR QUILOMETRO
#
# Rodovia e uma linha, entao o agrupamento correto e por faixa de km,
# nao por grade de coordenadas. Cada zona = (rodovia, faixa de KM_POR_ZONA
# quilometros). Todos os trechos dentro da mesma zona compartilham uma
# unica consulta ao Open-Meteo.
#
# Tamanho da zona: 1 C de diferenca muda a previsao em ~10%. Em planalto
# leva ~50 km para variar 1 C; em serra, ~10 km. Por isso 25 km e um
# padrao seguro. Ajuste com a variavel KM_POR_ZONA.
# ----------------------------------------------------------------------
KM_POR_ZONA = float(os.getenv("KM_POR_ZONA", "25"))


def zona_do_trecho(t):
    """(rodovia, indice da faixa) - o ponto medio do trecho define a faixa."""
    km_medio = (float(t["km_inicio"]) + float(t["km_fim"])) / 2
    return (t["rodovia"], int(km_medio // KM_POR_ZONA))


def montar_zonas(trechos):
    """Agrupa os trechos em zonas e busca o clima uma vez por zona.

    A coordenada da zona e o centroide dos trechos que ela contem, o que
    representa melhor a faixa do que a coordenada de um trecho qualquer.
    """
    grupos = {}
    for t in trechos:
        grupos.setdefault(zona_do_trecho(t), []).append(t)

    clima_por_zona = {}
    print(f"Zonas climaticas: {len(grupos)} para {len(trechos)} trechos "
          f"(faixas de {KM_POR_ZONA:.0f} km)")
    for (rodovia, faixa), membros in sorted(grupos.items()):
        lat = sum(float(m["latitude"]) for m in membros) / len(membros)
        lon = sum(float(m["longitude"]) for m in membros) / len(membros)
        km0, km1 = faixa * KM_POR_ZONA, (faixa + 1) * KM_POR_ZONA
        try:
            c = buscar_clima(lat, lon)
            clima_por_zona[(rodovia, faixa)] = c
            print(f"  {rodovia} km {km0:.0f}-{km1:.0f}  "
                  f"{len(membros)} trecho(s)  "
                  f"{c['temperatura_media_c']:.1f} C  "
                  f"{c['precipitacao_total_mm']:.0f} mm")
        except Exception as e:
            print(f"  {rodovia} km {km0:.0f}-{km1:.0f}  ERRO no clima: {e}")
    print()
    return clima_por_zona


def buscar_clima(lat, lon, dias=16):
    r = httpx.get(
        "https://api.open-meteo.com/v1/forecast",
        params={
            "latitude": lat, "longitude": lon,
            "daily": ("temperature_2m_mean,relative_humidity_2m_mean,"
                      "precipitation_sum,shortwave_radiation_sum,"
                      "et0_fao_evapotranspiration"),
            "forecast_days": min(dias, 16),
            "timezone": "America/Sao_Paulo",
        },
        timeout=30,
    )
    r.raise_for_status()
    d = r.json()["daily"]

    def media(k):
        v = [x for x in d[k] if x is not None]
        return sum(v) / len(v) if v else 0.0

    n = len(d["time"])
    chuva = sum(x for x in d["precipitation_sum"] if x is not None)
    et0 = media("et0_fao_evapotranspiration") or 0.1
    return {
        "dias_periodo": n,
        "temperatura_media_c": media("temperature_2m_mean"),
        "umidade_media_pct": media("relative_humidity_2m_mean"),
        "precipitacao_total_mm": chuva,
        "precipitacao_media_diaria_mm": chuva / n,
        "radiacao_media_mj_m2": media("shortwave_radiation_sum"),
        "et0_medio_mm_dia": et0,
        "balanco_hidrico_chuva_sobre_et0": chuva / (et0 * n),
    }


def prever(clima, especie, uf, lat, altura):
    v = {**clima, "latitude": lat, "altura_inicial_cm": altura,
         "mes": date.today().month,
         "especie_cod": MAPAS["especie"].get(especie, 0),
         "uf_cod": MAPAS["uf"].get(uf, 0)}
    return float(MODELO.predict([[float(v[f]) for f in FEATURES]])[0])


INSTRUCOES = """Voce e o assistente de planejamento de roçada da Motiva, \
concessionaria de rodovias.

Voce recebe a previsao numerica de crescimento da vegetacao, ja calculada por
um modelo estatistico. NAO recalcule: confie no numero. Sua funcao e decidir
QUANDO roçar e explicar POR QUE.

Considere alem do numero:
- Curvas e acessos exigem margem maior: antecipe em relacao a retas.
- Historico de reclamacao ou acidente aumenta a prioridade.
- Seca prolongada com vegetacao alta = risco de incendio, antecipe.
- Chuva intensa prevista impede roçada: evite agendar nesses dias.

Prioridades:
  critica - ja passou do limite, ou passa em menos de 7 dias
  alta    - passa do limite em 8 a 20 dias
  media   - passa em 21 a 45 dias
  baixa   - acima de 45 dias

Justificativa em portugues do Brasil, ate 3 frases, citando o numero previsto."""

ESQUEMA = {
    "name": "decisao_rocada",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["data_sugerida", "prioridade", "justificativa", "fatores"],
        "properties": {
            "data_sugerida": {"type": "string"},
            "prioridade": {"type": "string",
                           "enum": ["baixa", "media", "alta", "critica"]},
            "justificativa": {"type": "string"},
            "fatores": {"type": "array", "items": {"type": "string"}},
        },
    },
}


def decidir(ctx):
    r = openai.chat.completions.create(
        model=MODELO_LLM,
        messages=[{"role": "system", "content": INSTRUCOES},
                  {"role": "user", "content": json.dumps(ctx, ensure_ascii=False)}],
        response_format={"type": "json_schema", "json_schema": ESQUEMA},
    )
    return json.loads(r.choices[0].message.content)


# ----------------------------------------------------------------------
def main():
    trechos = sb.table("trechos").select("*").order("id").execute().data
    print(f"Analisando {len(trechos)} trechos  |  schema={DB_SCHEMA}  "
          f"modelo={MODELO_LLM}  limiar={LIMIAR_DIAS}d\n")

    clima_por_zona = montar_zonas(trechos)

    gravados, pulados, erros = 0, 0, []

    for t in trechos:
        nome = f'{t["rodovia"]} km {t["km_inicio"]}-{t["km_fim"]}'
        try:
            m = (sb.table("medicoes").select("*").eq("trecho_id", t["id"])
                 .order("data", desc=True).limit(1).execute().data)
            if not m:
                print(f"  [sem medicao] {nome}")
                pulados += 1
                continue

            altura_med = float(m[0]["altura_cm"])
            desde = (date.today() - date.fromisoformat(m[0]["data"])).days

            clima = clima_por_zona.get(zona_do_trecho(t))
            if clima is None:
                print(f"  [sem clima]   {nome}")
                pulados += 1
                continue
            cm_dia = prever(clima, t["especie"], t["uf"],
                            float(t["latitude"]), altura_med)

            altura_hoje = altura_med + cm_dia * desde
            limite = float(t["altura_limite_cm"])
            dias = (0 if altura_hoje >= limite
                    else (None if cm_dia <= 0.001
                          else int((limite - altura_hoje) / cm_dia)))

            prev = sb.table("previsoes").insert({
                "trecho_id": t["id"],
                "crescimento_cm_dia": round(cm_dia, 4),
                "altura_atual_cm": round(altura_hoje, 2),
                "altura_prevista_cm": round(altura_hoje + cm_dia * 30, 2),
                "dias_ate_limite": dias,
                "temperatura_media_c": round(clima["temperatura_media_c"], 2),
                "chuva_total_mm": round(clima["precipitacao_total_mm"], 2),
            }).execute()

            # Economia: so chama a LLM se o trecho estiver proximo do limite
            if dias is not None and dias > LIMIAR_DIAS:
                print(f"  [ok, sem LLM]  {nome:44s} {cm_dia:.3f} cm/dia  "
                      f"{dias}d ate o limite")
                pulados += 1
                continue

            dec = decidir({
                "rodovia": t["rodovia"],
                "km": f'{t["km_inicio"]} a {t["km_fim"]}',
                "tipo_pista": t.get("tipo_pista"),
                "especie": t["especie"],
                "altura_atual_cm": round(altura_hoje, 1),
                "altura_limite_cm": limite,
                "crescimento_previsto_cm_por_dia": round(cm_dia, 3),
                "dias_ate_atingir_limite": dias,
                "temperatura_media_prevista_c": round(clima["temperatura_media_c"], 1),
                "chuva_total_prevista_mm": round(clima["precipitacao_total_mm"], 1),
                "observacoes_do_trecho": t.get("observacoes") or "sem observacoes",
                "data_de_hoje": date.today().isoformat(),
            })

            sb.table("agendamentos").insert({
                "trecho_id": t["id"],
                "previsao_id": prev.data[0]["id"],
                "data_sugerida": dec["data_sugerida"],
                "prioridade": dec["prioridade"],
                "justificativa": dec["justificativa"],
                "fatores": dec["fatores"],
                "modelo_usado": MODELO_LLM,
            }).execute()

            gravados += 1
            print(f"  [{dec['prioridade'].upper():8}] {nome:44s} "
                  f"{cm_dia:.3f} cm/dia  ->  roçar {dec['data_sugerida']}")

        except Exception as e:
            erros.append((nome, f"{type(e).__name__}: {e}"))
            print(f"  [ERRO]     {nome}: {type(e).__name__}: {e}")

    print(f"\nAgendamentos gravados: {gravados} | sem necessidade: {pulados} "
          f"| erros: {len(erros)}")
    print(f"Consultas ao Open-Meteo: {len(clima_por_zona)} "
          f"(uma por zona, para {len(trechos)} trechos)")
    if erros:
        sys.exit(1)


if __name__ == "__main__":
    main()