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

# O modelo, o clima e o solo vem dos modulos compartilhados com o lote diario.
# Ate o modelo v3.1 esta API tinha copia propria de `buscar_clima` e
# `prever_crescimento`, o que era sustentavel enquanto a conta era "media de
# sete variaveis, multiplica por dias". Nao e mais: agora ha balanco de agua no
# solo com aquecimento, busca de solo no SoilGrids e varredura de 120
# horizontes. Duas copias disso divergem, e divergir aqui significa a API de
# desenvolvimento responder diferente do lote que grava em producao.
#
# `modelo.py` promove o InconsistentVersionWarning do sklearn a ERRO na carga,
# pelo mesmo motivo de sempre: o modo de falha que importa nao e o pkl que nao
# carrega, e o que carrega e preve torto em silencio.
import analise
import clima as clima_mod
import modelo as modelo_mod

METRICAS = modelo_mod.METRICAS

app = FastAPI(title="Motiva - Gestao de Vegetacao", version="1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"],
    allow_methods=["*"], allow_headers=["*"],
)


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


def decidir(contexto: dict) -> dict:
    """O contexto vem de `analise.contexto_para_llm`, o mesmo do lote diario."""
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
        "modelo_previsao": {
            "arquivo": modelo_mod.CAMINHO,
            "treinado_em": modelo_mod.TREINADO_EM,
            "alvo": modelo_mod.ALVO,
            "quantis": modelo_mod.QUANTIS,
            "r2_locais_novos": METRICAS["r2_locais_novos"],
            "mae_cm_locais_novos": METRICAS["mae_locais_novos"],
            "cobertura_q10_q90": METRICAS["cobertura_q10_q90"],
            "aviso": modelo_mod.AVISO,
        },
        "modelo_llm": MODELO_LLM,
        "schema_do_banco": DB_SCHEMA,
    }


@app.post("/analisar")
async def analisar(p: PedidoAnalise):
    """Analisa um trecho pelo MESMO caminho do lote diario.

    O que era feito aqui a mao -- buscar clima, montar features, multiplicar
    cm/dia por dias -- virou `analise.analisar_trecho`. A diferenca em relacao
    ao lote e so o que fica de fora: esta rota nao tem limiar de LLM, nao fecha
    agendamento obsoleto e nao respeita "um agendamento aberto por trecho".
    Ela existe para desenvolvimento; quem manda em producao e `analisar_lote.py`.
    """
    r = sb.table("trechos").select("*").eq("id", p.trecho_id).execute()
    if not r.data:
        raise HTTPException(404, "Trecho nao encontrado")
    trecho = r.data[0]

    hoje = date.today()
    serie, terra = analise.resolver_ambiente(
        float(trecho["latitude"]), float(trecho["longitude"]), hoje)

    try:
        a = analise.analisar_trecho(sb, trecho, serie, terra, hoje)
    except LookupError:
        raise HTTPException(400, "Trecho sem medicao de altura")

    decisao = decidir(analise.contexto_para_llm(trecho, a, hoje))

    resultado = {
        "trecho": f'{trecho["rodovia"]} km {trecho["km_inicio"]}-{trecho["km_fim"]}',
        "previsao": {
            "crescimento_cm_dia": round(a["taxa"], 3),
            "altura_atual_cm": round(a["altura_hoje"], 1),
            "altura_limite_cm": a["limite"],
            "dias_ate_limite": a["dias"],
            # O modelo v3.1 responde em INTERVALO. Um numero sozinho aqui
            # esconderia a metade mais nova da resposta.
            "intervalo_80": {
                "horizonte_dias": a["horizonte_intervalo"],
                "q10_cm": round(a["q10"], 2),
                "q50_cm": round(a["q50"], 2),
                "q90_cm": round(a["q90"], 2),
                "cruza_entre_dias": [a["cedo"], a["tarde"]],
            },
            "dias_desde_a_rocada": int(a["dias_rocada"]),
            "solo": {"fertilidade": round(terra.fertilidade, 2),
                     "capacidade_mm": round(terra.capacidade_mm, 1),
                     "fonte": terra.fonte},
        },
        "decisao": decisao,
    }

    if not p.gravar:
        return resultado

    prev = sb.table("previsoes").insert(analise.linha_de_previsao(p.trecho_id, a)).execute()

    sb.table("agendamentos").insert({
        "trecho_id": p.trecho_id,
        "previsao_id": prev.data[0]["id"],
        "data_sugerida": decisao["data_sugerida"],
        "prioridade": decisao["prioridade"],
        "justificativa": decisao["justificativa"],
        "fatores": [analise.frase_da_banda(a)] + [f for f in decisao["fatores"] if f],
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
        "precisao_do_modelo": {"r2_locais_novos": METRICAS["r2_locais_novos"],
                               "mae_cm": METRICAS["mae_locais_novos"]},
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
    #
    # O cenario e o do ponto de campo de agosto de 2026 (MG, braquiaria cortada
    # a 10 cm), o mesmo do caderno de calibracao: se um dia esta rota comecar a
    # responder outro numero, da para comparar com o notebook e saber se o que
    # mudou foi o modelo ou o caminho ate ele.
    try:
        linha = {
            "especie": "braquiaria", "dias_periodo": 4, "altura_inicial_cm": 10.0,
            "dias_desde_rocada_inicio": 0.0, "temperatura_media_c": 22.1,
            "temperatura_min_c": 13.0, "temperatura_max_c": 32.0,
            "graus_dia_acumulados": 28.4, "umidade_media_pct": 62.0,
            "precipitacao_total_mm": 9.0, "dias_com_chuva": 1,
            "et0_medio_mm_dia": 3.2, "radiacao_media_mj_m2": 18.0,
            "agua_solo_media_pct": 55.0, "capacidade_agua_solo_mm": 70.0,
            "fertilidade_solo": 0.35, "latitude": -21.28,
            "geadas_no_periodo": 0, "dias_encharcado": 0, "dias_floracao": 0,
        }
        q10, q50, q90 = (float(x) for x in modelo_mod.prever([linha])[0])
        r["1_modelo_pkl"] = {"ok": True, "arquivo": modelo_mod.CAMINHO,
                             "treinado_em": modelo_mod.TREINADO_EM,
                             "crescimento_4_dias_cm": {"q10": round(q10, 2),
                                                       "q50": round(q50, 2),
                                                       "q90": round(q90, 2)}}
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
        serie = clima_mod.buscar_serie(-23.4180, -47.4820, date.today())
        r["3_open_meteo"] = {"ok": True, "dias": len(serie.dias),
                             "aquecimento": serie.aquecimento,
                             "complemento": serie.complemento,
                             "ano_historico": serie.ano_historico,
                             "aviso": serie.aviso}
    except Exception as e:
        r["3_open_meteo"] = {"ok": False, "erro": f"{type(e).__name__}: {e}"}

    # 3b. SoilGrids
    #
    # Peca separada porque ela falha SOZINHA e a falha e silenciosa por
    # desenho: `solo.buscar` nunca levanta, cai na premissa. Sem esta linha
    # ninguem descobriria que a malha inteira esta rodando com 0,35 fixo.
    try:
        import solo as solo_mod
        terra = solo_mod.buscar(-23.4180, -47.4820)
        r["3b_soilgrids"] = {"ok": terra.fonte == "soilgrids",
                             "fonte": terra.fonte,
                             "fertilidade": round(terra.fertilidade, 2),
                             "capacidade_mm": round(terra.capacidade_mm, 1),
                             "distancia_km": terra.distancia_km}
    except Exception as e:
        r["3b_soilgrids"] = {"ok": False, "erro": f"{type(e).__name__}: {e}"}

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