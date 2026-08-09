"""
  1. busca o trecho no Supabase
  2. pega a previsao do tempo no Open-Meteo
  3. preve o crescimento com o modelo .pkl  (IA de previsao)
  4. pede a decisao para a OpenAI            (IA de linguagem)
  5. grava o resultado no Supabase

Rodar local:  uvicorn main:app --reload
Docs prontas: http://localhost:8000/docs
"""
from dotenv import load_dotenv
load_dotenv()

import os
import json
from datetime import date, timedelta
from typing import Optional

import joblib
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from supabase import create_client

try:
    from supabase import ClientOptions
except ImportError:                              # versoes mais antigas
    from supabase.lib.client_options import ClientOptions

# ----------------------------------------------------------------------
# Configuracao (tudo vem de variaveis de ambiente - NUNCA no codigo)
# ----------------------------------------------------------------------
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
MODELO_LLM = os.getenv("OPENAI_MODEL", "gpt-5.4-mini")

# "ia"     -> usa o schema_ia.sql    (convive com o banco que voces ja tem)
# "public" -> usa o schema.sql       (banco novo, so nosso)
# O padrao e "ia" porque e onde o produto vive: o analisar_lote.py escreve la e
# o painel le de la. Com padrao "public" a API leria um schema legado e vazio.
DB_SCHEMA = os.getenv("DB_SCHEMA", "ia")

sb = create_client(SUPABASE_URL, SUPABASE_KEY,
                   options=ClientOptions(schema=DB_SCHEMA))
openai = OpenAI()  # le OPENAI_API_KEY do ambiente sozinho

# Aviso claro se a versao do scikit-learn nao bater com a do treino.
# Modelo salvo numa versao e carregado em outra pode falhar ou dar
# resultado errado sem avisar.
import warnings
warnings.filterwarnings("error", category=UserWarning, module="sklearn")
try:
    _pacote = joblib.load("modelo_vegetacao.pkl")
    warnings.resetwarnings()
except Exception as _e:
    import sklearn
    raise RuntimeError(
        f"Falha ao carregar modelo_vegetacao.pkl: {_e}\n"
        f"scikit-learn instalado aqui: {sklearn.__version__}\n"
        f"Provavel causa: o modelo foi treinado em outra versao.\n"
        f"Solucao: ajuste scikit-learn e numpy no requirements.txt para as "
        f"versoes usadas no treino, ou retreine com estas versoes."
    ) from _e
MODELO = _pacote["modelo"]
FEATURES = _pacote["features"]
MAPAS = _pacote["mapas"]
METRICAS = _pacote["metricas"]

app = FastAPI(title="Motiva - Gestao de Vegetacao", version="1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"],
    allow_methods=["*"], allow_headers=["*"],
)


# ----------------------------------------------------------------------
# 1. CLIMA - Open-Meteo (gratis, sem chave)
# ----------------------------------------------------------------------
async def buscar_clima(lat: float, lon: float, dias: int = 16) -> dict:
    """Previsao diaria agregada no formato que o modelo espera."""
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": ",".join([
            "temperature_2m_mean",
            "relative_humidity_2m_mean",
            "precipitation_sum",
            "shortwave_radiation_sum",
            "et0_fao_evapotranspiration",
        ]),
        "forecast_days": min(dias, 16),
        "timezone": "America/Sao_Paulo",
    }
    async with httpx.AsyncClient(timeout=20) as cli:
        r = await cli.get(url, params=params)
        r.raise_for_status()
        d = r.json()["daily"]

    def media(chave):
        vals = [v for v in d[chave] if v is not None]
        return sum(vals) / len(vals) if vals else 0.0

    n = len(d["time"])
    chuva_total = sum(v for v in d["precipitation_sum"] if v is not None)
    et0 = media("et0_fao_evapotranspiration") or 0.1

    return {
        "dias_periodo": n,
        "temperatura_media_c": media("temperature_2m_mean"),
        "umidade_media_pct": media("relative_humidity_2m_mean"),
        "precipitacao_total_mm": chuva_total,
        "precipitacao_media_diaria_mm": chuva_total / n,
        "radiacao_media_mj_m2": media("shortwave_radiation_sum"),
        "et0_medio_mm_dia": et0,
        # mesma formula usada no treino:
        "balanco_hidrico_chuva_sobre_et0": chuva_total / (et0 * n),
    }


# ----------------------------------------------------------------------
# 2. IA DE PREVISAO - o modelo .pkl
# ----------------------------------------------------------------------
def prever_crescimento(clima: dict, especie: str, uf: str,
                       latitude: float, altura_atual: float) -> float:
    """Devolve o crescimento estimado em cm/dia."""
    valores = {
        **clima,
        "latitude": latitude,
        "altura_inicial_cm": altura_atual,
        "mes": date.today().month,
        "especie_cod": MAPAS["especie"].get(especie, 0),
        "uf_cod": MAPAS["uf"].get(uf, 0),
    }
    faltando = [f for f in FEATURES if f not in valores]
    if faltando:
        raise HTTPException(500, f"Feature ausente: {faltando}")

    linha = [[float(valores[f]) for f in FEATURES]]
    return float(MODELO.predict(linha)[0])


def dias_ate_limite(altura_atual: float, limite: float, cm_dia: float) -> Optional[int]:
    if altura_atual >= limite:
        return 0
    if cm_dia <= 0.001:
        return None
    return int((limite - altura_atual) / cm_dia)


# ----------------------------------------------------------------------
# 3. IA DE LINGUAGEM - a OpenAI decide e explica
# ----------------------------------------------------------------------
INSTRUCOES = """Voce e o assistente de planejamento de roçada da Motiva, \
concessionaria de rodovias.

Voce recebe, para um trecho de rodovia:
- a previsao numerica de crescimento da vegetacao (ja calculada por um modelo
  estatistico treinado com 1 milhao de registros historicos)
- o limite de altura de seguranca daquele trecho
- o contexto operacional em texto livre

Sua funcao NAO e calcular crescimento - isso ja veio pronto e voce deve confiar
no numero. Sua funcao e decidir QUANDO roçar e explicar POR QUE.

Considere, alem do numero:
- Curvas e acessos exigem margem maior: antecipe em relacao a retas.
- Historico de reclamacao ou acidente aumenta a prioridade.
- Seca prolongada com vegetacao alta = risco de incendio, antecipe.
- Chuva intensa prevista impede roçada: evite agendar nesses dias.
- Trechos proximos que vencem na mesma semana devem ser agrupados para
  economizar deslocamento de equipe. Mencione isso quando fizer sentido.

Prioridades:
  critica - ja passou do limite, ou passa em menos de 7 dias
  alta    - passa do limite em 8 a 20 dias
  media   - passa em 21 a 45 dias
  baixa   - acima de 45 dias

Escreva a justificativa em portugues do Brasil, para um gestor operacional ler.
Objetiva, no maximo 3 frases, sempre citando o numero previsto."""

ESQUEMA = {
    "name": "decisao_rocada",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["data_sugerida", "prioridade", "justificativa", "fatores"],
        "properties": {
            "data_sugerida": {
                "type": "string",
                "description": "Data da roçada no formato AAAA-MM-DD",
            },
            "prioridade": {
                "type": "string",
                "enum": ["baixa", "media", "alta", "critica"],
            },
            "justificativa": {
                "type": "string",
                "description": "Ate 3 frases explicando a decisao ao gestor",
            },
            "fatores": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Fatores considerados, um por item",
            },
        },
    },
}


def decidir(trecho: dict, cm_dia: float, altura: float,
            dias: Optional[int], clima: dict) -> dict:
    contexto = {
        "rodovia": trecho["rodovia"],
        "km": f'{trecho["km_inicio"]} a {trecho["km_fim"]}',
        "sentido": trecho.get("sentido"),
        "tipo_pista": trecho.get("tipo_pista"),
        "especie": trecho["especie"],
        "altura_atual_cm": round(altura, 1),
        "altura_limite_cm": float(trecho["altura_limite_cm"]),
        "crescimento_previsto_cm_por_dia": round(cm_dia, 3),
        "dias_ate_atingir_limite": dias,
        "temperatura_media_prevista_c": round(clima["temperatura_media_c"], 1),
        "chuva_total_prevista_mm": round(clima["precipitacao_total_mm"], 1),
        "observacoes_do_trecho": trecho.get("observacoes") or "sem observacoes",
        "data_de_hoje": date.today().isoformat(),
    }

    resp = openai.chat.completions.create(
        model=MODELO_LLM,
        messages=[
            {"role": "system", "content": INSTRUCOES},
            {"role": "user", "content": json.dumps(contexto, ensure_ascii=False)},
        ],
        response_format={"type": "json_schema", "json_schema": ESQUEMA},
    )
    return json.loads(resp.choices[0].message.content)


# ----------------------------------------------------------------------
# 4. ROTAS
# ----------------------------------------------------------------------
class PedidoAnalise(BaseModel):
    trecho_id: int
    gravar: bool = True


@app.get("/")
def raiz():
    return {
        "servico": "Motiva - Gestao de Vegetacao",
        "modelo_previsao": {"r2": METRICAS["r2"], "mae_cm_dia": METRICAS["mae"]},
        "modelo_llm": MODELO_LLM,
        "schema_do_banco": DB_SCHEMA,
    }


@app.post("/analisar")
async def analisar(p: PedidoAnalise):
    # --- busca o trecho ---
    r = sb.table("trechos").select("*").eq("id", p.trecho_id).execute()
    if not r.data:
        raise HTTPException(404, "Trecho nao encontrado")
    trecho = r.data[0]

    # --- ultima medicao de altura ---
    m = (sb.table("medicoes").select("*")
         .eq("trecho_id", p.trecho_id)
         .order("data", desc=True).limit(1).execute())
    if not m.data:
        raise HTTPException(400, "Trecho sem medicao de altura")
    altura_medida = float(m.data[0]["altura_cm"])
    dias_desde = (date.today() - date.fromisoformat(m.data[0]["data"])).days

    # --- clima ---
    clima = await buscar_clima(float(trecho["latitude"]), float(trecho["longitude"]))

    # --- IA 1: previsao numerica ---
    cm_dia = prever_crescimento(
        clima, trecho["especie"], trecho["uf"],
        float(trecho["latitude"]), altura_medida,
    )
    altura_hoje = altura_medida + cm_dia * dias_desde
    limite = float(trecho["altura_limite_cm"])
    dias = dias_ate_limite(altura_hoje, limite, cm_dia)

    # --- IA 2: decisao em linguagem ---
    decisao = decidir(trecho, cm_dia, altura_hoje, dias, clima)

    resultado = {
        "trecho": f'{trecho["rodovia"]} km {trecho["km_inicio"]}-{trecho["km_fim"]}',
        "previsao": {
            "crescimento_cm_dia": round(cm_dia, 3),
            "altura_atual_cm": round(altura_hoje, 1),
            "altura_limite_cm": limite,
            "dias_ate_limite": dias,
        },
        "decisao": decisao,
    }

    if not p.gravar:
        return resultado

    # --- grava no Supabase ---
    prev = sb.table("previsoes").insert({
        "trecho_id": p.trecho_id,
        "crescimento_cm_dia": round(cm_dia, 4),
        "altura_atual_cm": round(altura_hoje, 2),
        "altura_prevista_cm": round(altura_hoje + cm_dia * 30, 2),
        "dias_ate_limite": dias,
        "temperatura_media_c": round(clima["temperatura_media_c"], 2),
        "chuva_total_mm": round(clima["precipitacao_total_mm"], 2),
    }).execute()

    sb.table("agendamentos").insert({
        "trecho_id": p.trecho_id,
        "previsao_id": prev.data[0]["id"],
        "data_sugerida": decisao["data_sugerida"],
        "prioridade": decisao["prioridade"],
        "justificativa": decisao["justificativa"],
        "fatores": decisao["fatores"],
        "modelo_usado": MODELO_LLM,
    }).execute()

    resultado["gravado"] = True
    return resultado


@app.post("/analisar-todos")
async def analisar_todos():
    """Roda a analise em todos os trechos. E o botao principal da demo."""
    trechos = sb.table("trechos").select("id").execute().data
    saida, erros = [], []
    for t in trechos:
        try:
            saida.append(await analisar(PedidoAnalise(trecho_id=t["id"])))
        except Exception as e:
            erros.append({"trecho_id": t["id"], "erro": str(e)})
    ordem = {"critica": 0, "alta": 1, "media": 2, "baixa": 3}
    saida.sort(key=lambda x: ordem[x["decisao"]["prioridade"]])
    return {"total": len(saida), "resultados": saida, "erros": erros}


class Pergunta(BaseModel):
    texto: str


@app.post("/perguntar")
def perguntar(p: Pergunta):
    """Pergunta em portugues sobre a situacao dos trechos."""
    agend = (sb.table("agendamentos")
             .select("*, trechos(rodovia, km_inicio, km_fim, uf, tipo_pista)")
             .order("criado_em", desc=True).limit(60).execute().data)
    if not agend:
        return {"resposta": "Ainda nao ha analises. Rode /analisar-todos primeiro."}

    resp = openai.chat.completions.create(
        model=MODELO_LLM,
        messages=[
            {"role": "system", "content":
             "Voce responde perguntas de gestores da Motiva sobre o planejamento "
             "de roçada. Use apenas os dados fornecidos. Seja direto, cite "
             "rodovia e km. Se o dado nao estiver na lista, diga que nao tem."},
            {"role": "user", "content":
             f"Dados:\n{json.dumps(agend, ensure_ascii=False, default=str)}\n\n"
             f"Pergunta: {p.texto}"},
        ],
    )
    return {"resposta": resp.choices[0].message.content}


# ======================================================================
# LEITURA - rotas que o front consome (nao gastam OpenAI)
# ======================================================================
ORDEM_PRIORIDADE = {"critica": 0, "alta": 1, "media": 2, "baixa": 3}


@app.get("/agendamentos")
def listar_agendamentos(prioridade: Optional[str] = None, limite: int = 100):
    """Lista o que a IA ja decidiu. E o que a tela principal mostra."""
    q = (sb.table("agendamentos")
         .select("*, trechos(rodovia, km_inicio, km_fim, sentido, uf, "
                 "especie, tipo_pista, altura_limite_cm, latitude, longitude)")
         .eq("status", "sugerido"))
    if prioridade:
        q = q.eq("prioridade", prioridade)
    dados = q.limit(limite).execute().data
    dados.sort(key=lambda x: (ORDEM_PRIORIDADE.get(x["prioridade"], 9),
                              x["data_sugerida"]))
    return {"total": len(dados), "agendamentos": dados}


@app.get("/painel")
def painel():
    """Numeros dos cards do topo do dashboard."""
    ag = (sb.table("agendamentos").select("prioridade, data_sugerida, status")
          .eq("status", "sugerido").execute().data)
    pr = (sb.table("previsoes").select("crescimento_cm_dia, dias_ate_limite")
          .order("criado_em", desc=True).limit(200).execute().data)

    hoje = date.today()
    proximos7 = sum(
        1 for a in ag
        if 0 <= (date.fromisoformat(a["data_sugerida"]) - hoje).days <= 7
    )
    cres = [float(p["crescimento_cm_dia"]) for p in pr] or [0]

    return {
        "total_pendentes": len(ag),
        "por_prioridade": {
            p: sum(1 for a in ag if a["prioridade"] == p)
            for p in ORDEM_PRIORIDADE
        },
        "rocadas_proximos_7_dias": proximos7,
        "crescimento_medio_cm_dia": round(sum(cres) / len(cres), 3),
        "crescimento_maximo_cm_dia": round(max(cres), 3),
        "precisao_do_modelo": {"r2": METRICAS["r2"], "mae": METRICAS["mae"]},
    }


@app.get("/trechos")
def listar_trechos():
    """Trechos com a ultima previsao e o agendamento mais recente."""
    trechos = sb.table("trechos").select("*").order("id").execute().data
    for t in trechos:
        p = (sb.table("previsoes").select("*").eq("trecho_id", t["id"])
             .order("criado_em", desc=True).limit(1).execute().data)
        a = (sb.table("agendamentos").select("*").eq("trecho_id", t["id"])
             .order("criado_em", desc=True).limit(1).execute().data)
        t["ultima_previsao"] = p[0] if p else None
        t["ultimo_agendamento"] = a[0] if a else None
    return {"total": len(trechos), "trechos": trechos}


class MudarStatus(BaseModel):
    status: str   # aprovado | executado | descartado


@app.patch("/agendamentos/{agendamento_id}")
def mudar_status(agendamento_id: int, body: MudarStatus):
    """Botao de aprovar/descartar na tela do gestor."""
    if body.status not in ("aprovado", "executado", "descartado", "sugerido"):
        raise HTTPException(400, "status invalido")
    r = (sb.table("agendamentos").update({"status": body.status})
         .eq("id", agendamento_id).execute())
    if not r.data:
        raise HTTPException(404, "Agendamento nao encontrado")
    return r.data[0]


import traceback
from fastapi.responses import JSONResponse
from fastapi import Request


@app.exception_handler(Exception)
async def mostrar_erro(request: Request, exc: Exception):
    """Devolve a mensagem de erro de verdade no corpo da resposta."""
    return JSONResponse(
        status_code=500,
        content={
            "erro": type(exc).__name__,
            "mensagem": str(exc),
            "onde": traceback.format_exc().strip().split("\n")[-3:],
        },
    )


@app.get("/diagnostico")
async def diagnostico():
    """Testa cada peca separadamente e diz qual esta quebrada."""
    r = {}

    # 1. Modelo .pkl
    try:
        teste = {
            "dias_periodo": 16, "temperatura_media_c": 24.0,
            "umidade_media_pct": 70.0, "precipitacao_total_mm": 100.0,
            "precipitacao_media_diaria_mm": 6.25, "radiacao_media_mj_m2": 18.0,
            "et0_medio_mm_dia": 3.5, "balanco_hidrico_chuva_sobre_et0": 1.79,
        }
        v = prever_crescimento(teste, "braquiaria", "SP", -23.4, 24.0)
        r["1_modelo_pkl"] = {"ok": True, "previsao_cm_dia": round(v, 3)}
    except Exception as e:
        r["1_modelo_pkl"] = {"ok": False, "erro": f"{type(e).__name__}: {e}"}

    # 2. Supabase
    try:
        d = sb.table("trechos").select("id,rodovia").limit(3).execute().data
        r["2_supabase"] = {"ok": True, "schema": DB_SCHEMA, "trechos": d}
    except Exception as e:
        r["2_supabase"] = {"ok": False, "erro": f"{type(e).__name__}: {e}"}

    # 3. Open-Meteo
    try:
        c = await buscar_clima(-23.4180, -47.4820)
        r["3_open_meteo"] = {"ok": True,
                             "temp_media": round(c["temperatura_media_c"], 1),
                             "chuva_mm": round(c["precipitacao_total_mm"], 1)}
    except Exception as e:
        r["3_open_meteo"] = {"ok": False, "erro": f"{type(e).__name__}: {e}"}

    # 4. OpenAI
    try:
        resp = openai.chat.completions.create(
            model=MODELO_LLM,
            messages=[{"role": "user", "content": "Responda apenas: ok"}],
        )
        r["4_openai"] = {"ok": True, "modelo": MODELO_LLM,
                         "resposta": resp.choices[0].message.content}
    except Exception as e:
        r["4_openai"] = {"ok": False, "modelo": MODELO_LLM,
                         "erro": f"{type(e).__name__}: {e}"}

    # 5. OpenAI com JSON Schema (o modo que /analisar usa)
    if r["4_openai"]["ok"]:
        try:
            resp = openai.chat.completions.create(
                model=MODELO_LLM,
                messages=[{"role": "user", "content":
                           "Sugira roçada para amanha, prioridade alta."}],
                response_format={"type": "json_schema", "json_schema": ESQUEMA},
            )
            r["5_json_schema"] = {"ok": True,
                                  "json": json.loads(resp.choices[0].message.content)}
        except Exception as e:
            r["5_json_schema"] = {"ok": False, "erro": f"{type(e).__name__}: {e}"}

    r["conclusao"] = [k for k, v in r.items()
                      if isinstance(v, dict) and not v.get("ok")] or ["tudo ok"]
    return r