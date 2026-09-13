"""
O preenchedor: de duas chamadas ao Open-Meteo para as 17 features de clima.

O modelo antigo pedia sete agregados de uma janela de 16 dias, e `buscar_clima`
cabia em vinte linhas. O `modelo_gramas.pkl` mudou isso de figura: ele pede
`agua_solo_media_pct` e `dias_encharcado`, que sao ESTADO -- nao dao para
calcular a partir de uma media, so a partir de uma serie DIARIA rodando um
balanco de agua no solo. Este arquivo e a porta do preenchedor do notebook de
calibracao (`docs/previsao_gramas_colab.ipynb`, celula 3) para dentro do lote.

TRES PEDACOS DE SERIE, TRES ORIGENS
-----------------------------------
    [hoje-63, hoje-1]   passado real, da propria API de previsao (`past_days`)
    [hoje,  hoje+15]    previsao de verdade
    [hoje+16, hoje+120] ERA5 do ano passado, mesmos dias do calendario

O passado nao e enfeite: o balde de agua no solo precisa de AQUECIMENTO. Comecar
o balde no dia de hoje e chutar quanta agua ha no solo, e `agua_solo_media_pct`
move o q50 em mais de 100% entre 10% e 55%. O notebook usa 120 dias de
aquecimento; a API de previsao entrega ~63 (pedimos 92 e ela devolve nulo antes
disso), e 63 bastam porque o balde tem constante de tempo de semanas: com ET0 de
~3 mm/dia um balde de 60 mm se esvazia em 20 dias.

`past_days=92` numa chamada so, em vez de uma chamada ao arquivo ERA5 para o
aquecimento: e uma requisicao a menos por zona, e o arquivo e justamente o que
responde 429 quando se insiste (ver o cabecalho de `web/src/lib/open-meteo.ts`).

A CAUDA LONGA E POR CAUSA DO `dias_ate_limite`
----------------------------------------------
O alvo do modelo e `crescimento_total_cm` de um periodo, e a resposta e nao
linear no tamanho do periodo. Para saber em que dia o trecho cruza a altura
limite nao da mais para dividir por um cm/dia: e preciso perguntar ao modelo
"quanto cresce em 1 dia? em 2? em 3?" ate cruzar. Isso exige clima ate 120 dias
a frente, e previsao so vai a 16. Dai o ERA5 do ano passado nos mesmos dias do
calendario -- que erra o tempo daquela semana e acerta a ESTACAO, que e o que
importa num horizonte de tres meses. Quando ele recusa, o padrao dos 16 dias
previstos se repete ciclicamente, e a serie diz qual dos dois valeu.
"""

import time
from datetime import date, timedelta
from typing import Iterable, NamedTuple

import httpx

API_PREVISAO = "https://api.open-meteo.com/v1/forecast"
API_ARQUIVO = "https://archive-api.open-meteo.com/v1/archive"

DIARIAS = ("temperature_2m_mean,temperature_2m_min,temperature_2m_max,"
           "relative_humidity_2m_mean,precipitation_sum,"
           "shortwave_radiation_sum,et0_fao_evapotranspiration")

#: Quanto passado pedir a API de previsao. Ela aceita 92 e entrega ~63 uteis.
AQUECIMENTO_DIAS = 92
#: Teto da API de previsao.
PREVISAO_DIAS = 16
#: Horizonte da busca do cruzamento. E o teto de `dias_periodo` no treino.
HORIZONTE_DIAS = 120

TIMEOUT_S = 45.0
PAUSA_S = 0.6

# Parametros por especie que entram nas CONTAS das features (nao no modelo).
# Copiados de `gerador_v3_1_rebrota.py`. `t_base` e `t_ot2` definem os graus-dia
# e `geada` o limiar de Tmin que conta como geada -- os tres precisam bater com
# o gerador, ou a feature muda de significado entre treino e producao.
ESPECIES = {
    "braquiaria": dict(t_base=15.0, t_ot2=35.0, geada=2.0,
                       flor_meses=(2, 3, 4), flor_hmin=30.0),
    "esmeralda": dict(t_base=12.0, t_ot2=32.0, geada=-2.0,
                      flor_meses=(), flor_hmin=99.0),
    "batatais": dict(t_base=13.0, t_ot2=33.0, geada=0.0,
                     flor_meses=(11, 12, 1, 2, 3), flor_hmin=10.0),
}


class Dia(NamedTuple):
    data: date
    tmed: float
    tmin: float
    tmax: float
    umidade: float
    chuva: float
    radiacao: float
    et0: float
    #: "observado" | "previsao" | "historico" | "repeticao"
    fonte: str


class Serie(NamedTuple):
    dias: list[Dia]
    #: Quantos dias de aquecimento (anteriores a hoje) entraram.
    aquecimento: int
    #: Como a cauda alem da previsao foi preenchida. `None` = nao precisou.
    complemento: str | None
    #: Ano do ERA5 que emprestou a cauda, quando o complemento foi historico.
    ano_historico: int | None
    #: Por que caiu para a repeticao, quando caiu.
    aviso: str | None

    def indice_de(self, d: date) -> int | None:
        for i, dia in enumerate(self.dias):
            if dia.data == d:
                return i
        return None


# ----------------------------------------------------------------------
# Busca
# ----------------------------------------------------------------------
def _pedir(url: str, params: dict) -> dict:
    r = httpx.get(url, params=params, timeout=TIMEOUT_S)
    r.raise_for_status()
    corpo = r.json()
    if corpo.get("error"):
        raise RuntimeError(corpo.get("reason", "Open-Meteo recusou a consulta."))
    return corpo


def _ler(corpo: dict, fonte: str) -> list[Dia]:
    """Dia com QUALQUER variavel nula e descartado, nao zerado.

    Zero nao e "nao sei": zero de radiacao e noite polar, zero de et0 e ar
    saturado, e os dois puxariam a media para baixo fingindo medicao. E o mesmo
    criterio de `lerDiario` no painel.
    """
    d = corpo.get("daily") or {}
    tempos = d.get("time") or []
    saida: list[Dia] = []

    for i, t in enumerate(tempos):
        v = [
            (d.get("temperature_2m_mean") or [None])[i] if i < len(d.get("temperature_2m_mean") or []) else None,
            (d.get("temperature_2m_min") or [None])[i] if i < len(d.get("temperature_2m_min") or []) else None,
            (d.get("temperature_2m_max") or [None])[i] if i < len(d.get("temperature_2m_max") or []) else None,
            (d.get("relative_humidity_2m_mean") or [None])[i] if i < len(d.get("relative_humidity_2m_mean") or []) else None,
            (d.get("precipitation_sum") or [None])[i] if i < len(d.get("precipitation_sum") or []) else None,
            (d.get("shortwave_radiation_sum") or [None])[i] if i < len(d.get("shortwave_radiation_sum") or []) else None,
            (d.get("et0_fao_evapotranspiration") or [None])[i] if i < len(d.get("et0_fao_evapotranspiration") or []) else None,
        ]
        if any(x is None for x in v):
            continue
        saida.append(Dia(date.fromisoformat(t), float(v[0]), float(v[1]), float(v[2]),
                         float(v[3]), float(v[4]), float(v[5]), float(v[6]), fonte))
    return saida


def _menos_um_ano(d: date) -> date:
    try:
        return d.replace(year=d.year - 1)
    except ValueError:          # 29 de fevereiro
        return d.replace(year=d.year - 1, month=2, day=28)


def buscar_serie(lat: float, lon: float, hoje: date,
                 horizonte: int = HORIZONTE_DIAS) -> Serie:
    """Aquecimento + previsao + cauda, ja emendados e ordenados por data."""
    corpo = _pedir(API_PREVISAO, {
        "latitude": lat, "longitude": lon, "daily": DIARIAS,
        "past_days": AQUECIMENTO_DIAS, "forecast_days": PREVISAO_DIAS,
        "timezone": "America/Sao_Paulo",
    })
    bruto = _ler(corpo, "previsao")
    dias = [d._replace(fonte="observado") if d.data < hoje else d for d in bruto]
    dias = [d for d in dias if d.data <= hoje + timedelta(days=horizonte - 1)]
    if not dias:
        raise RuntimeError("A previsao do Open-Meteo voltou sem nenhum dia utilizavel.")

    aquecimento = sum(1 for d in dias if d.data < hoje)
    ultimo = max(d.data for d in dias)
    alvo = hoje + timedelta(days=horizonte - 1)

    if ultimo >= alvo:
        return Serie(dias, aquecimento, None, None, None)

    faltam_de = ultimo + timedelta(days=1)
    complemento, ano, aviso = "historico", None, None
    cauda: list[Dia] = []

    try:
        time.sleep(PAUSA_S)
        corpo = _pedir(API_ARQUIVO, {
            "latitude": lat, "longitude": lon, "daily": DIARIAS,
            # Cinco dias de sobra: ano bissexto muda o comprimento da janela em
            # um dia, e faltar um dia derrubaria a cauda inteira na repeticao.
            "start_date": _menos_um_ano(faltam_de).isoformat(),
            "end_date": _menos_um_ano(alvo + timedelta(days=5)).isoformat(),
            "timezone": "America/Sao_Paulo",
        })
        passado = _ler(corpo, "historico")
        precisa = (alvo - faltam_de).days + 1
        if len(passado) >= precisa:
            ano = passado[0].data.year
            # O historico empresta os NUMEROS, nao o calendario.
            cauda = [d._replace(data=faltam_de + timedelta(days=i))
                     for i, d in enumerate(passado[:precisa])]
        else:
            aviso = "O arquivo historico do Open-Meteo devolveu menos dias que o periodo."
    except Exception as e:
        aviso = f"O arquivo historico do Open-Meteo nao respondeu ({type(e).__name__})."

    if not cauda:
        complemento = "repeticao"
        # Ciclicamente, e nao com a media dos 16 dias em todos: uma serie
        # chapada na media tem a mesma temperatura media e nenhum dia de chuva
        # forte, e `dias_com_chuva` e o balde mudam. Repetir preserva os dois.
        futuros = [d for d in dias if d.data >= hoje] or dias[-PREVISAO_DIAS:]
        n = (alvo - faltam_de).days + 1
        cauda = [futuros[i % len(futuros)]._replace(
            data=faltam_de + timedelta(days=i), fonte="repeticao") for i in range(n)]

    return Serie(dias + cauda, aquecimento, complemento, ano, aviso)


# ----------------------------------------------------------------------
# Balanco de agua no solo
# ----------------------------------------------------------------------
def balanco_solo(dias: Iterable[Dia], capacidade_mm: float,
                 altura_cm: float) -> tuple[list[float], list[bool]]:
    """Balde FAO simplificado, dia a dia. Devolve (fracao cheia, encharcado).

    Identico ao `balanco_solo` do notebook, que por sua vez repete o do
    `gerador_v3_1_rebrota.py` com uma diferenca deliberada: o Kc fica FIXO na
    altura inicial em vez de acompanhar a altura dia a dia. No gerador a altura
    e conhecida em todo dia porque ele a simula; na inferencia ela e justamente
    o que se quer prever, entao fixar no ponto de partida e o que da para fazer
    sem circularidade.
    """
    cap = max(float(capacidade_mm), 1e-6)
    agua = cap * 0.6                      # comeco neutro, como no gerador
    kc = 0.4 + 0.6 * min(max(altura_cm, 0.0) / 40.0, 1.0)
    fracoes: list[float] = []
    encharcado: list[bool] = []
    seguidos = 0

    for d in dias:
        agua = min(agua + d.chuva, cap)
        ks = min(max(agua / (0.55 * cap), 0.0), 1.0)
        agua = min(max(agua - d.et0 * kc * ks, 0.0), cap)
        f = agua / cap
        seguidos = seguidos + 1 if (f > 0.97 and d.chuva > 8.0) else 0
        fracoes.append(f)
        encharcado.append(seguidos >= 3)

    return fracoes, encharcado


# ----------------------------------------------------------------------
# Montagem das features
# ----------------------------------------------------------------------
def montar_features(*, especie: str, altura_cm: float, dias_desde_rocada: float,
                    latitude: float, serie: Serie, inicio: date, dias_periodo: int,
                    fertilidade: float, capacidade_mm: float,
                    fracoes: list[float] | None = None,
                    encharcado: list[bool] | None = None) -> dict:
    """As 20 features, para a janela [inicio, inicio + dias_periodo).

    `fracoes`/`encharcado` sao o balanco de solo JA calculado sobre a serie
    inteira. Vem de fora porque o balanco depende da serie e da altura inicial,
    e nao do tamanho da janela: quem varre 120 horizontes calcula uma vez so.
    """
    if dias_periodo < 1:
        raise ValueError("dias_periodo precisa ser pelo menos 1.")

    e = ESPECIES[especie]
    fim = inicio + timedelta(days=dias_periodo)
    janela = [(i, d) for i, d in enumerate(serie.dias) if inicio <= d.data < fim]
    if not janela:
        raise RuntimeError(f"A serie de clima nao cobre [{inicio}, {fim}).")

    if fracoes is None or encharcado is None:
        fracoes, encharcado = balanco_solo(serie.dias, capacidade_mm, altura_cm)

    idx = [i for i, _ in janela]
    dd = [d for _, d in janela]
    n = len(dd)

    graus_dia = sum(max(min(d.tmed, e["t_ot2"]) - e["t_base"], 0.0) for d in dd)
    floracao = sum(1 for d in dd
                   if d.data.month in e["flor_meses"] and altura_cm > e["flor_hmin"])

    return {
        "especie": especie,
        "dias_periodo": n,
        "altura_inicial_cm": float(altura_cm),
        "dias_desde_rocada_inicio": float(dias_desde_rocada),
        "temperatura_media_c": round(sum(d.tmed for d in dd) / n, 1),
        "temperatura_min_c": round(min(d.tmin for d in dd), 1),
        "temperatura_max_c": round(max(d.tmax for d in dd), 1),
        "graus_dia_acumulados": round(graus_dia, 1),
        "umidade_media_pct": round(sum(d.umidade for d in dd) / n, 1),
        "precipitacao_total_mm": round(sum(d.chuva for d in dd), 1),
        "dias_com_chuva": sum(1 for d in dd if d.chuva > 1.0),
        "et0_medio_mm_dia": round(sum(d.et0 for d in dd) / n, 2),
        "radiacao_media_mj_m2": round(sum(d.radiacao for d in dd) / n, 1),
        "agua_solo_media_pct": round(sum(fracoes[i] for i in idx) / n * 100, 1),
        "capacidade_agua_solo_mm": float(capacidade_mm),
        "fertilidade_solo": float(fertilidade),
        "latitude": round(float(latitude), 4),
        "geadas_no_periodo": sum(1 for d in dd if d.tmin <= e["geada"]),
        "dias_encharcado": sum(1 for i in idx if encharcado[i]),
        "dias_floracao": floracao,
    }
