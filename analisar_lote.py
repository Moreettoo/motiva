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
from datetime import date, datetime, timedelta, timezone

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

# ... e FECHA o agendamento aberto do trecho que passou de Y dias.
#
# Por que dois numeros e nao um. Ate 2026-08-14 o limiar valia numa direcao so:
# nada nunca fechava um agendamento cujo trecho tinha deixado de precisar dele.
# O estoque que sobrou disso era metade da agenda — 53 de 106 agendamentos em
# aberto eram de trecho a mais de 45 dias do limite, um deles a 2196 dias, e 27
# dos 47 "vencidos" da tela vinham dai. A migracao
# `fechar_agendamentos_de_trecho_sem_necessidade` limpou o estoque; esta regra e
# o que impede ele de voltar.
#
# A BANDA de 10 dias entre criar e fechar e histerese, nao folga arbitraria. Com
# o mesmo numero nas duas pontas, um trecho oscilando entre 44 e 46 dias por
# causa de uma medicao nova abriria e fecharia agendamento TODO DIA, gerando uma
# linha `descartado` por dia por trecho. Na faixa 46-55 o lote nao cria e nao
# fecha: deixa quieto o que ja existe.
LIMIAR_FECHAR_DIAS = int(os.getenv("LIMIAR_FECHAR_DIAS", "55"))

# Sao Paulo e UTC-3 fixo desde o fim do horario de verao em 2019, entao um
# offset constante basta e nao depende de `tzdata` estar instalado (no Windows
# o `zoneinfo` nao acha o banco de fusos sem o pacote).
#
# `date.today()` nao serve para comparar com `data_sugerida`: o GitHub Actions
# roda em UTC, e das 21h a meia-noite de Brasilia o relogio do runner ja virou o
# dia — um agendamento aprovado para HOJE seria lido como vencido e descartado
# sem ter vencido. Mesmo cuidado que `isoHoje()` toma no painel (ver CLAUDE.md).
FUSO_BR = timezone(timedelta(hours=-3))


def hoje_brasilia() -> date:
    return datetime.now(FUSO_BR).date()

# Quando o painel enfileira a reanalise de um trecho so, o workflow passa o id
# por aqui. Vazio (o caso do agendamento diario) significa a malha inteira.
_trecho = (os.getenv("TRECHO_ID") or "").strip()
TRECHO_ID = int(_trecho) if _trecho.isdigit() else None



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
# ZONAS CLIMATICAS DECLARADAS POR FAIXA DE KM
#
# Rodovia e uma linha, entao o agrupamento e por faixa de km, nao por
# grade de coordenadas. As faixas ficam na tabela ia.zonas_clima, onde
# cada uma pode ter tamanho proprio: longa no planalto, curta na serra.
#
# Todos os trechos cujo ponto medio cai na mesma faixa compartilham UMA
# consulta ao Open-Meteo.
#
# Se um trecho nao estiver coberto por nenhuma zona, o script cria uma
# faixa automatica de KM_FALLBACK quilometros, para nunca travar.
# ----------------------------------------------------------------------
KM_FALLBACK = float(os.getenv("KM_POR_ZONA", "25"))


def carregar_zonas():
    try:
        return sb.table("zonas_clima").select("*").execute().data
    except Exception:
        print("  (tabela ia.zonas_clima nao encontrada - usando faixas "
              f"automaticas de {KM_FALLBACK:.0f} km)")
        return []


def zona_do_trecho(t, zonas):
    """Devolve (chave_da_zona, latitude, longitude, rotulo)."""
    km = (float(t["km_inicio"]) + float(t["km_fim"])) / 2

    for z in zonas:
        if (z["rodovia"] == t["rodovia"]
                and float(z["km_inicio"]) <= km < float(z["km_fim"])):
            rotulo = (f'{z["rodovia"]} km {float(z["km_inicio"]):.0f}-'
                      f'{float(z["km_fim"]):.0f}')
            if z.get("nome"):
                rotulo += f' ({z["nome"]})'
            return (("zona", z["id"]), float(z["latitude"]),
                    float(z["longitude"]), rotulo)

    # nenhuma zona cadastrada cobre este km: cai na faixa automatica
    faixa = int(km // KM_FALLBACK)
    rotulo = (f'{t["rodovia"]} km {faixa*KM_FALLBACK:.0f}-'
              f'{(faixa+1)*KM_FALLBACK:.0f} (automatica)')
    return (("auto", t["rodovia"], faixa),
            float(t["latitude"]), float(t["longitude"]), rotulo)


def montar_zonas(trechos):
    """Resolve a zona de cada trecho e busca o clima uma vez por zona."""
    zonas = carregar_zonas()

    grupos = {}
    for t in trechos:
        chave, lat, lon, rotulo = zona_do_trecho(t, zonas)
        g = grupos.setdefault(chave, {"lats": [], "lons": [], "n": 0,
                                      "rotulo": rotulo, "declarada": lat})
        g["n"] += 1
        g["lats"].append(lat)
        g["lons"].append(lon)

    clima_por_zona = {}
    declaradas = sum(1 for k in grupos if k[0] == "zona")
    print(f"Zonas climaticas: {len(grupos)} para {len(trechos)} trechos "
          f"({declaradas} declarada(s), {len(grupos)-declaradas} automatica(s))")

    for chave, g in sorted(grupos.items(), key=lambda x: x[1]["rotulo"]):
        # zona declarada usa a coordenada cadastrada;
        # zona automatica usa o centroide dos trechos
        if chave[0] == "zona":
            lat, lon = g["lats"][0], g["lons"][0]
        else:
            lat = sum(g["lats"]) / len(g["lats"])
            lon = sum(g["lons"]) / len(g["lons"])
        try:
            c = buscar_clima(lat, lon)
            clima_por_zona[chave] = c
            print(f'  {g["rotulo"]:52s} {g["n"]:>3} trecho(s)  '
                  f'{c["temperatura_media_c"]:5.1f} C  '
                  f'{c["precipitacao_total_mm"]:5.0f} mm')
        except Exception as e:
            print(f'  {g["rotulo"]:52s} ERRO no clima: {e}')
    print()
    return zonas, clima_por_zona


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
         # Brasilia, pelo mesmo motivo do resto do script: na virada de mes, das
         # 21h a meia-noite, o runner em UTC ja esta no mes seguinte e o modelo
         # receberia a sazonalidade errada.
         "mes": hoje_brasilia().month,
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
def fechar_obsoletos(trecho_id, hoje):
    """Descarta os agendamentos em aberto de um trecho que nao precisa mais.

    Fecha o que a MAQUINA criou (`sugerido`) e o que esta factualmente morto
    (`aprovado` cuja data passou sem virar execucao — aquele plano nao
    aconteceu). NAO toca em `aprovado` com data futura: alguem decidiu aquilo
    com a informacao de entao, e desfazer decisao humana em silencio nao e
    trabalho de lote. Esses ficam na agenda com o selo "nao e mais necessario"
    e um descarte de um clique, que e onde a decisao pertence.

    Devolve quantos fechou, para o resumo do fim contar a historia inteira.
    """
    abertos = (sb.table("agendamentos")
               .select("id,status,data_sugerida")
               .eq("trecho_id", trecho_id)
               .in_("status", ["sugerido", "aprovado"])
               .execute().data)

    limite = hoje.isoformat()
    ids = [a["id"] for a in abertos
           if a["status"] == "sugerido" or a["data_sugerida"] < limite]
    if not ids:
        return 0

    # `atualizado_em` explicito e em ISO: mandar a string "now()" faria o
    # PostgREST enviar texto que o Postgres nao aceita como timestamp.
    (sb.table("agendamentos")
     .update({"status": "descartado",
              "atualizado_em": datetime.now(timezone.utc).isoformat()})
     .in_("id", ids)
     .execute())
    return len(ids)


# ----------------------------------------------------------------------
def main():
    consulta = sb.table("trechos").select("*").order("id")
    if TRECHO_ID is not None:
        consulta = consulta.eq("id", TRECHO_ID)
    trechos = consulta.execute().data

    if TRECHO_ID is not None and not trechos:
        print(f"Trecho {TRECHO_ID} nao existe. Nada a fazer.")
        return

    # Um "hoje" so para a rodada inteira, e em Brasilia. Calculado uma vez para
    # nao existir a chance de duas linhas do mesmo laco cairem em dias
    # diferentes se a rodada atravessar a meia-noite.
    hoje = hoje_brasilia()

    print(f"Analisando {len(trechos)} trechos  |  schema={DB_SCHEMA}  "
          f"modelo={MODELO_LLM}  |  hoje={hoje.isoformat()}  "
          f"cria<={LIMIAR_DIAS}d fecha>{LIMIAR_FECHAR_DIAS}d\n")

    zonas, clima_por_zona = montar_zonas(trechos)

    gravados, pulados, descartados, erros = 0, 0, 0, []

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
            # `hoje` (Brasilia), nao `date.today()` (relogio do runner, que e
            # UTC no GitHub Actions): a extrapolacao da altura, a data que a LLM
            # recebe e a comparacao de vencimento em `fechar_obsoletos` precisam
            # ser o MESMO dia, ou a rodada da noite se contradiz sozinha.
            desde = (hoje - date.fromisoformat(m[0]["data"])).days

            clima = clima_por_zona.get(zona_do_trecho(t, zonas)[0])
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

            # Duas perguntas, nesta ordem: o trecho PRECISA de roçada agendada?
            # E, se nao precisa, ha agendamento aberto para fechar?
            #
            # `folgado` cobre os DOIS jeitos de nao precisar, e o segundo era um
            # cano de ruido aberto. `dias > LIMIAR_FECHAR_DIAS` e o caso obvio.
            # `dias is None` e o trecho que NAO CRESCE (`cm_dia <= 0.001`, ver o
            # calculo acima): a condicao antiga exigia `dias is not None`, entao
            # ele escapava por baixo e ganhava chamada de LLM e agendamento novo
            # todo dia — e com `dias_ate_limite` nulo a view o carimba `baixa`,
            # que e exatamente o cartao que nao deveria existir.
            folgado = dias is None or dias > LIMIAR_FECHAR_DIAS
            precisa = dias is not None and dias <= LIMIAR_DIAS

            # A regra vale para o trecho pedido no painel tambem, e isto e uma
            # REVERSAO deliberada do que estava escrito aqui ("o pedido ja e a
            # intencao de gastar a chamada, mesmo com folga de prazo"). Aquilo
            # valia quando criar era inofensivo. Agora nao e: a chamada
            # produziria um agendamento que a propria regra fecha na rodada
            # seguinte, e no meio do caminho o cartao aparece na agenda. Uma
            # reanalise de trecho folgado grava a previsao nova, fecha o que
            # sobrou e nao inventa serviço — que e a resposta certa para
            # "reanalisei e nao precisa".
            if folgado:
                fechados = fechar_obsoletos(t["id"], hoje)
                descartados += fechados
                prazo = "sem crescimento" if dias is None else f"{dias}d ate o limite"
                extra = f"  ->  {fechados} agendamento(s) fechado(s)" if fechados else ""
                print(f"  [ok, sem LLM]  {nome:44s} {cm_dia:.3f} cm/dia  "
                      f"{prazo}{extra}")
                pulados += 1
                continue

            # Banda de histerese (46-55 dias): nao cria e nao fecha. O trecho
            # esta perto o bastante para o agendamento que ja existe continuar
            # fazendo sentido, e longe o bastante para nao merecer um novo.
            if not precisa:
                print(f"  [ok, na banda] {nome:44s} {cm_dia:.3f} cm/dia  "
                      f"{dias}d ate o limite")
                pulados += 1
                continue

            # UM agendamento aberto por trecho. Antes o lote inseria uma linha
            # NOVA a cada rodada, sem nunca olhar se ja havia uma aberta: um
            # trecho que fica critico por duas semanas acumulava catorze
            # agendamentos, e a agenda desenhava TODOS — catorze cartoes
            # identicos lado a lado, que na tela se leem como defeito de
            # renderizacao, nao como dado. A migracao
            # `um_agendamento_aberto_por_trecho` limpou 42 linhas de excesso em
            # 62; e este bloco que impede a pilha de voltar.
            #
            # A fronteira e a mesma de `fechar_obsoletos`: o lote manda no que o
            # lote criou. `sugerido` e dele, entao ATUALIZA em vez de duplicar —
            # a previsao de hoje e melhor que a de ontem, e o gestor continua
            # vendo uma sugestao so, com a data mais recente. `aprovado` e de
            # quem aprovou: grava a previsao nova (ja gravada acima) e NAO mexe
            # na data. Remarcar por baixo do gestor uma roçada que ele aprovou
            # seria mudar o plano sem avisar.
            aberto = (sb.table("agendamentos")
                      .select("id,status")
                      .eq("trecho_id", t["id"])
                      .in_("status", ["sugerido", "aprovado"])
                      .order("criado_em", desc=True).order("id", desc=True)
                      .limit(1).execute().data)

            if aberto and aberto[0]["status"] == "aprovado":
                print(f"  [aprovado]     {nome:44s} {cm_dia:.3f} cm/dia  "
                      f"{dias}d ate o limite  ->  data mantida")
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
                "data_de_hoje": hoje.isoformat(),
            })

            campos = {
                "previsao_id": prev.data[0]["id"],
                "data_sugerida": dec["data_sugerida"],
                "prioridade": dec["prioridade"],
                "justificativa": dec["justificativa"],
                "fatores": dec["fatores"],
                "modelo_usado": MODELO_LLM,
            }

            if aberto:
                # `sugerido` que ja existe: atualiza no lugar. `equipe_id` fica
                # de fora de `campos` de proposito — se alguem ja tinha alocado
                # uma equipe a esta sugestao, sobrescrever seria apagar trabalho
                # humano por causa de uma previsao nova.
                (sb.table("agendamentos")
                 .update({**campos, "atualizado_em": datetime.now(timezone.utc).isoformat()})
                 .eq("id", aberto[0]["id"])
                 .execute())
                acao = "atualizado"
            else:
                sb.table("agendamentos").insert({"trecho_id": t["id"], **campos}).execute()
                acao = "roçar"

            gravados += 1
            print(f"  [{dec['prioridade'].upper():8}] {nome:44s} "
                  f"{cm_dia:.3f} cm/dia  ->  {acao} {dec['data_sugerida']}")

        except Exception as e:
            erros.append((nome, f"{type(e).__name__}: {e}"))
            print(f"  [ERRO]     {nome}: {type(e).__name__}: {e}")

    print(f"\nAgendamentos gravados: {gravados} | sem necessidade: {pulados} "
          f"| fechados por folga: {descartados} | erros: {len(erros)}")
    print(f"Consultas ao Open-Meteo: {len(clima_por_zona)} "
          f"(uma por zona, para {len(trechos)} trechos)")
    if erros:
        sys.exit(1)


if __name__ == "__main__":
    main()