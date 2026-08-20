#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GERADOR v3.1 - Crescimento de gramineas em faixa de dominio rodoviaria.

v3.1 (calibracao com o ponto de campo de 12-16/ago/2026, MG, braquiaria
cortada a 10 cm -> 17 cm em 4 dias = 1,75 cm/dia, o teto da TAlF do marandu):
  1. REBROTA POR RESERVAS: o lag de Brougham vale para AREA FOLIAR/biomassa,
     nao para ALTURA. Com meristema intacto e residuo folhoso, o alongamento
     recomeca no dia seguinte puxado por reservas de raiz/estolao. Agora
     f_rebrota = c_res + (1-c_res)*(1-exp(-t/tau)), onde c_res depende da
     severidade do reset (corte alto 0.50; corte raspado 0.10; geada 0.08;
     fogo 0.05). Antes o primeiro dia pos-corte crescia ~12% do potencial.
  2. TEMPERATURA EFETIVA: C4 cresce na tarde quente. Dia de inverno com
     tmed 19 e tmax 30 crescia pouco porque f_T so via a media. Agora
     f_T usa Teff = 0.65*tmed + 0.35*tmax, e a base FISIOLOGICA da
     braquiaria cai para 12 C (lit. C4: base 12-17). O t_base=15 continua
     valendo APENAS para a feature graus_dia (compatibilidade com o
     treinar_modelo.py e o preenchedor - nada muda fora daqui).
  3. Dormencia binaria da braquiaria: tmed<15 -> tmed<11 (a rampa de Teff
     ja zera o crescimento em frio de verdade; o corte seco em 15 matava
     dias de inverno que na pratica crescem a tarde).
  4. A braquiaria 1.60 -> 1.90 cm/dia e sigma do sitio 0.22 -> 0.30
     (micrositios de valeta umida/fertil existem na faixa e geram as
     leituras extremas reais).
Simulacao DIARIA com clima real (Open-Meteo/ERA5), rebrota sigmoide,
balanco de agua no solo, geada, fogo, floracao e rocadas.

ARQUITETURA
-----------
1. Baixa clima diario real (2010-2024) para ~29 cidades (ou as suas).
2. Simula, dia a dia, trajetorias de altura por (local x especie x cenario):
     dH/dia = A * f_N * f_T * f_agua * f_rebrota * f_saturacao * f_floracao * ruido
     - senescencia quando dormente/estressada
   com rocadas periodicas, geadas que matam a parte aerea, fogo raro em
   estiagem, e dormencia de inverno.
3. Sorteia janelas de medicao de 1 a 120 dias (com peso nas curtas) de dentro
   das trajetorias. Cada linha do CSV e uma janela com o estado REAL da
   planta naquele momento (dias desde a rocada, fase da curva, agua no solo).

POR QUE SIGMOIDE E NAO FORMULA FECHADA
--------------------------------------
A curva de rebrota real tem 3 fases (Brougham 1957): lag inicial (reconstrucao
de area foliar apos o corte; pior se o meristema apical foi decapitado),
fase linear rapida, e saturacao. Aqui isso emerge de:
  f_rebrota  = 1 - exp(-dias_desde_reset / tau)     [lag]
  f_saturacao = 1 - (H/K)^q                          [desaceleracao]
O "reset" acontece em rocada, geada forte e fogo - a literatura descreve os
tres como equivalentes para a planta (rebrota a partir de reservas de
rizomas/estoloes).

ALTURA FISIOLOGICA vs MEDIDA
----------------------------
altura_*_cm = o que uma pessoa com bastao graduado mede no campo. Inclui
turgor: apos chuva em planta estressada as folhas desenrolam e o dossel sobe
alguns por cento SEM crescimento celular; em seca severa, murcha. E o efeito
que gerou uma leitura de +7 cm/4 dias em MG apos chuva de agosto.
altura_*_fisiologica_cm = o tecido real. A diferenca ensina a IA a nao
confundir reidratacao com crescimento.

O QUE TEM FONTE vs O QUE E PREMISSA (honestidade obrigatoria)
-------------------------------------------------------------
COM FONTE: temperaturas cardinais C4 (base 12-17, plato 25-35); reducao de
3-4x sem N (Gastal 1992); TAlF max marandu 12,4-17,5 mm/dia; rocada aos 50 cm
(Manual de Conservacao Rodoviaria); geada mata parte aerea de tropical e
rebrota vem de rizomas; esmeralda dorme <8 C, amarela, morre com dias <0 C,
morre em estiagem longa e recupera com chuva; batatais com rizoma lenhoso,
raiz a 2 m, moderada resistencia a geada, crescimento impetuoso no verao com
inflorescencia ACIMA da folhagem; alturas 10-15 (esmeralda) e 15-30 (batatais).
PREMISSA MINHA (calibrar com campo!): tau do lag (6-18 dias), expoente q da
saturacao, magnitude do turgor (ate ~9%), prob. diaria de fogo, curvas de
resposta a agua no solo, K da braquiaria sem corte (90-160 cm), distribuicao
de fertilidade de beira de estrada.

USO
---
  pip install numpy pandas
  python gerador_v3_sigmoide.py --baixar                 # clima real, 1x
  python gerador_v3_sigmoide.py                          # 1M linhas/especie
  python gerador_v3_sigmoide.py --linhas-por-especie 200000 --uf SP,MG
  python gerador_v3_sigmoide.py --listar
AVISO: 3M linhas x ~35 colunas = arquivo de ~900 MB. Ajuste --linhas-por-especie.
"""

import argparse, json, os, sys, time, urllib.parse, urllib.request
import numpy as np
import pandas as pd

API = "https://archive-api.open-meteo.com/v1/archive"
DIARIAS = ["temperature_2m_mean", "temperature_2m_min", "temperature_2m_max",
           "relative_humidity_2m_mean", "precipitation_sum",
           "shortwave_radiation_sum", "et0_fao_evapotranspiration"]

LOCAIS_PADRAO = [
    ("Boa Vista","RR",2.82,-60.67),("Manaus","AM",-3.10,-60.02),
    ("Belem","PA",-1.46,-48.50),("Fortaleza","CE",-3.73,-38.53),
    ("Natal","RN",-5.79,-35.21),("Petrolina","PE",-9.39,-40.50),
    ("Salvador","BA",-12.97,-38.51),("Barreiras","BA",-12.15,-44.99),
    ("Palmas","TO",-10.18,-48.33),("Cuiaba","MT",-15.60,-56.10),
    ("Sinop","MT",-11.86,-55.50),("Campo Grande","MS",-20.44,-54.65),
    ("Dourados","MS",-22.22,-54.81),("Brasilia","DF",-15.78,-47.93),
    ("Goiania","GO",-16.68,-49.25),("Uberlandia","MG",-18.92,-48.28),
    ("Montes Claros","MG",-16.73,-43.86),("Juiz de Fora","MG",-21.76,-43.35),
    ("Belo Horizonte","MG",-19.92,-43.94),("Rio de Janeiro","RJ",-22.91,-43.17),
    ("Sao Paulo","SP",-23.55,-46.63),("Ribeirao Preto","SP",-21.18,-47.81),
    ("Pres Prudente","SP",-22.13,-51.39),("Londrina","PR",-23.31,-51.16),
    ("Curitiba","PR",-25.43,-49.27),("Guarapuava","PR",-25.39,-51.46),
    ("Lages","SC",-27.82,-50.33),("Porto Alegre","RS",-30.03,-51.23),
    ("Bage","RS",-31.33,-54.11),
]

# ---------------------------------------------------------------------------
# ESPECIES
# ---------------------------------------------------------------------------
ESPECIES = {
    "braquiaria": dict(
        A=1.90,                # v3.1: TAlF max marandu ~1.75 cm/dia; dossel chega perto
        t_base=15.,            # base da FEATURE graus_dia (nao mexer: compat.)
        t_fisio_base=12.,      # v3.1: base fisiologica p/ f_T (C4: 12-17)
        t_ot1=26., t_ot2=35., t_max=44.,
        K_range=(90., 160.),   # sem pastejo vai a florescimento; premissa
        tol_seca=0.55, sen_dorm=0.006,
        geada_topkill=2.0,     # Tmin <= 2 C: morte da parte aerea (tropical)
        geada_queda=0.30,      # fracao da altura que colapsa no evento
        dorm_T=11.,            # v3.1: parada real so em frio forte; rampa Teff faz o resto
        residual=(5., 12.), gatilho_rocada=50., rocada_max_dias=200,
        floracao_meses=(2,3,4), floracao_boost=1.35, floracao_hmin=30.,
        cores=["verde-escuro","verde-medio","verde-claro",
               "verde-amarelado","amarelo-palha"]),
    "esmeralda": dict(
        A=0.32, t_base=12., t_ot1=24., t_ot2=32., t_max=41.,
        K_range=(12., 18.), tol_seca=0.60, sen_dorm=0.002,
        geada_topkill=-2.0,    # tolera geada leve; dano so em frio forte
        geada_queda=0.15, dorm_T=10.,   # dorme/amarela <8-10 C
        residual=(3., 5.), gatilho_rocada=7., rocada_max_dias=150,
        floracao_meses=(), floracao_boost=1.0, floracao_hmin=99.,
        cores=["verde-esmeralda intenso","verde-esmeralda","verde-claro",
               "verde-amarelado","palha-dourado"]),
    "batatais": dict(
        A=0.60, t_base=13., t_ot1=25., t_ot2=33., t_max=43.,
        K_range=(22., 34.), tol_seca=0.85,   # raiz a 2 m: a mais rustica
        sen_dorm=0.003, geada_topkill=0.0,   # moderada resistencia a geada
        geada_queda=0.20, dorm_T=12.,
        residual=(3., 8.), gatilho_rocada=20., rocada_max_dias=160,
        # verao: "crescimento impetuoso" + inflorescencia em V ACIMA da folhagem
        floracao_meses=(11,12,1,2,3), floracao_boost=1.30, floracao_hmin=10.,
        cores=["verde-claro","verde-claro-acinzentado","verde-acinzentado",
               "verde-amarelado","amarelo-palha"]),
}
NOMES = list(ESPECIES.keys())
CENARIOS_POR_LOCAL = 6          # sorteios de fertilidade/solo/manejo
D_MIN, D_MAX = 1, 120           # janelas de medicao, em dias

# ---------------------------------------------------------------------------
# DOWNLOAD / CACHE (Open-Meteo, ERA5)
# ---------------------------------------------------------------------------
def _motivo_429(err):
    """Le o corpo do 429 para saber se o limite estourado foi por minuto,
    hora ou dia. A Open-Meteo cobra por PESO de dados, nao por URL: um
    pedido de 15 anos x 7 variaveis vale centenas de 'chamadas'."""
    try:
        corpo = json.loads(err.read().decode())
        return str(corpo.get("reason", "")).lower()
    except Exception:
        return ""


def baixar(locais, inicio, fim, cache, pausa=6.0, tentativas=4):
    os.makedirs(cache, exist_ok=True)
    for nome, uf, lat, lon in locais:
        alvo = os.path.join(cache, f"{uf}_{nome.replace(' ','_')}.csv")
        if os.path.exists(alvo):
            print(f"  [cache] {nome}/{uf}"); continue
        url = API + "?" + urllib.parse.urlencode({
            "latitude": lat, "longitude": lon, "start_date": inicio,
            "end_date": fim, "daily": ",".join(DIARIAS),
            "timezone": "America/Sao_Paulo"})
        js = None
        for t in range(tentativas):
            try:
                with urllib.request.urlopen(url, timeout=180) as r:
                    js = json.load(r)
                break
            except urllib.error.HTTPError as e:
                if e.code != 429:
                    print(f"  [FALHOU] {nome}/{uf}: {e}"); break
                motivo = _motivo_429(e)
                if "daily" in motivo:
                    print(f"  [LIMITE DIARIO] {nome}/{uf}: {motivo}")
                    print("\n  O limite diario (10.000 chamadas) acabou. O que ja")
                    print("  baixou esta no cache e nao sera refeito. Volte amanha")
                    print("  e rode o mesmo comando: ele continua de onde parou.")
                    print("  Para pesar menos: --anos 8 e/ou --uf SP,MG,PR")
                    return
                espera = pausa * (2 ** t)
                print(f"  [429] {nome}/{uf} ({motivo or 'limite de taxa'}); "
                      f"aguardando {espera:.0f}s (tentativa {t+1}/{tentativas})")
                time.sleep(espera)
            except Exception as e:
                print(f"  [FALHOU] {nome}/{uf}: {e}"); break
        if js is None:
            print(f"  [PULADO] {nome}/{uf}: rode de novo mais tarde"); continue
        if "daily" not in js:
            print(f"  [FALHOU] {nome}/{uf}: {js.get('reason', js)}"); continue
        d = pd.DataFrame(js["daily"]).rename(columns={
            "time":"data","temperature_2m_mean":"tmed","temperature_2m_min":"tmin",
            "temperature_2m_max":"tmax","relative_humidity_2m_mean":"umid",
            "precipitation_sum":"chuva","shortwave_radiation_sum":"rad",
            "et0_fao_evapotranspiration":"et0"})
        d["local"], d["uf"] = nome, uf
        d["latitude"], d["longitude"] = js.get("latitude",lat), js.get("longitude",lon)
        d.to_csv(alvo, index=False)
        print(f"  [ok] {nome}/{uf}: {len(d)} dias"); time.sleep(pausa)


def carregar(cache, ufs=None):
    arqs = sorted(f for f in os.listdir(cache) if f.endswith(".csv"))
    if not arqs:
        sys.exit(f"Cache '{cache}' vazio. Rode com --baixar primeiro.")
    d = pd.concat([pd.read_csv(os.path.join(cache,f), parse_dates=["data"])
                   for f in arqs], ignore_index=True)
    d = d.dropna(subset=["tmed","tmin","tmax","chuva","et0"])
    if ufs:
        d = d[d.uf.str.upper().isin(ufs)]
        if d.empty: sys.exit(f"Nenhum local nas UFs {ufs}.")
    return d

# ---------------------------------------------------------------------------
# FATORES DIARIOS
# ---------------------------------------------------------------------------
def f_temp(t, e):
    tb = e.get("t_fisio_base", e["t_base"])          # v3.1
    f = np.where(t < e["t_ot1"], (t - tb) / (e["t_ot1"] - tb),
        np.where(t <= e["t_ot2"], 1.0,
                 (e["t_max"] - t) / (e["t_max"] - e["t_ot2"])))
    return np.clip(f, 0.0, 1.0)

# ---------------------------------------------------------------------------
# SIMULACAO DIARIA VETORIZADA (todas as trajetorias em paralelo)
# ---------------------------------------------------------------------------
def simular(diario, rng):
    """Retorna dict de arrays (n_traj, n_dias) + metadados por trajetoria."""
    locais = sorted(diario.local.unique())
    grades = {}
    for lc in locais:
        g = diario[diario.local == lc].sort_values("data")
        full = pd.DataFrame({"data": pd.date_range(g.data.min(), g.data.max(), freq="D")})
        g = full.merge(g, on="data", how="left").ffill(limit=3)
        grades[lc] = g.dropna(subset=["tmed"]).reset_index(drop=True)
    n_dias = min(len(g) for g in grades.values())
    if n_dias < 400: sys.exit("Serie climatica curta demais (<400 dias).")

    trajs = []
    for lc in locais:
        g = grades[lc].iloc[:n_dias]
        meta_loc = dict(local=lc, uf=g.uf.iloc[0], lat=float(g.latitude.iloc[0]),
                        lon=float(g.longitude.iloc[0]))
        for esp in NOMES:
            for _ in range(CENARIOS_POR_LOCAL):
                trajs.append(dict(**meta_loc, especie=esp))
    T = len(trajs)
    esp_idx = np.array([NOMES.index(t["especie"]) for t in trajs])
    par = lambda k: np.array([ESPECIES[NOMES[i]][k] for i in esp_idx])

    # --- cenario por trajetoria -----------------------------------------
    # fertilidade de beira de estrada: maioria pobre, cauda rara rica
    fert = np.clip(rng.beta(2.0, 3.2, T) * 1.15, 0.05, 1.0)
    f_N = 0.25 + 0.75 * fert                    # Gastal: 3-4x entre extremos
    cap_solo = rng.uniform(35., 120., T)        # mm (talude raso -> plano fundo)
    Klo = par("K_range")[:,0] if par("K_range").ndim>1 else None
    Kr = np.array([ESPECIES[NOMES[i]]["K_range"] for i in esp_idx])
    K = Kr[:,0] + rng.random(T) * (Kr[:,1]-Kr[:,0])
    K = K * (0.75 + 0.35 * fert)                # sem N o teto tambem cai
    qual = np.exp(rng.normal(0., 0.30, T))      # v3.1: micrositio (valeta/talude)
    res_r = np.array([ESPECIES[NOMES[i]]["residual"] for i in esp_idx])

    # --- clima empilhado (loc -> traj) ----------------------------------
    def clima(col):
        M = np.stack([grades[lc][col].to_numpy(float)[:n_dias] for lc in locais])
        loc_i = np.array([locais.index(t["local"]) for t in trajs])
        return M[loc_i]
    TMED, TMIN, TMAX = clima("tmed"), clima("tmin"), clima("tmax")
    CHUVA, ET0, RAD, UMID = clima("chuva"), clima("et0"), clima("rad"), clima("umid")
    datas = grades[locais[0]].data.iloc[:n_dias].reset_index(drop=True)
    meses = datas.dt.month.to_numpy()

    # --- estados --------------------------------------------------------
    H = res_r[:,0] + rng.random(T)*(res_r[:,1]-res_r[:,0])
    SW = cap_solo * 0.6
    t_reset = np.full(T, 30.)                 # dias desde rocada/geada/fogo
    tau = np.full(T, 8.)
    seco_consec = np.zeros(T); ench_consec = np.zeros(T)
    ult_rocada = np.zeros(T)
    cres = np.full(T, 0.50)      # v3.1: fracao do crescimento vinda de reservas

    # --- saidas (float32 p/ memoria) ------------------------------------
    Z = lambda: np.zeros((T, n_dias), np.float32)
    oH, oHm, oSW, oVig, oTR = Z(), Z(), Z(), Z(), Z()
    oMow = np.zeros((T, n_dias), bool)
    oGeada = np.zeros((T, n_dias), bool)
    oFogo = np.zeros((T, n_dias), bool)
    oEnch = np.zeros((T, n_dias), bool)
    oFlor = np.zeros((T, n_dias), bool)

    gq = par("geada_queda"); gtk = par("geada_topkill")
    tol = par("tol_seca"); A = par("A"); sen = par("sen_dorm")
    dormT = par("dorm_T"); gat = par("gatilho_rocada")
    rmax = par("rocada_max_dias")
    fb = par("floracao_boost"); fh = par("floracao_hmin")
    fmeses = [ESPECIES[NOMES[i]]["floracao_meses"] for i in esp_idx]
    Q = 2.5                                    # expoente da saturacao (premissa)

    ftab = {e: ESPECIES[e] for e in NOMES}
    for d in range(n_dias):
        tmed, tmin, tmax = TMED[:,d], TMIN[:,d], TMAX[:,d]
        chuva, et0 = CHUVA[:,d], ET0[:,d]

        # balanco de agua no solo (balde FAO simplificado)
        SW = np.minimum(SW + chuva, cap_solo)
        ks = np.clip(SW / (0.55 * cap_solo), 0., 1.)
        eta = et0 * (0.4 + 0.6*np.clip(H/40., 0, 1)) * ks   # Kc sobe com dossel
        SW = np.clip(SW - eta, 0., cap_solo)
        frac = SW / cap_solo
        seco_consec = np.where(frac < 0.10, seco_consec+1, 0.)
        ench_consec = np.where((frac > 0.97) & (chuva > 8.), ench_consec+1, 0.)
        encharcado = ench_consec >= 3
        oEnch[:,d] = encharcado

        f_w = np.power(ks, 1.0 - 0.55*tol)
        f_w = np.where(encharcado, f_w*0.35, f_w)

        teff = 0.65*tmed + 0.35*tmax                 # v3.1: C4 cresce a tarde
        f_t = np.empty(T)
        for i,e in enumerate(NOMES):
            m = esp_idx == i
            f_t[m] = f_temp(teff[m], ftab[e])

        # geada: mata parte aerea (tropical) -> reset com lag severo
        geada = tmin <= gtk
        oGeada[:,d] = geada
        H = np.where(geada, np.maximum(H*(1-gq), res_r[:,0]), H)
        t_reset = np.where(geada, 0., t_reset)
        tau = np.where(geada, np.maximum(tau, 16.), tau)
        cres = np.where(geada, 0.08, cres)           # v3.1: parte aerea morta

        # fogo raro: estiagem longa + material seco alto + calor
        p_fogo = np.where((seco_consec>15) & (H>20) & (tmax>30), 0.0009, 0.)
        fogo = rng.random(T) < p_fogo
        oFogo[:,d] = fogo
        H = np.where(fogo, 2.5, H); t_reset = np.where(fogo, 0., tau*0+t_reset*~fogo)
        t_reset = np.where(fogo, 0., t_reset)
        tau = np.where(fogo, 20., tau)
        cres = np.where(fogo, 0.05, cres)            # v3.1

        # rocada: braquiaria por gatilho de 50 cm; todas por prazo maximo
        mow = (H >= gat) | (ult_rocada >= rmax + rng.integers(-25, 25, T))
        oMow[:,d] = mow
        novo_res = res_r[:,0] + rng.random(T)*(res_r[:,1]-res_r[:,0])
        severo = rng.random(T) < 0.35            # corte baixo decapita meristema
        H = np.where(mow, novo_res, H)
        t_reset = np.where(mow, 0., t_reset)
        tau = np.where(mow, np.where(severo, rng.uniform(13,18,T),
                                     rng.uniform(6,10,T)), tau)
        cres = np.where(mow, np.where(severo, 0.10, 0.50), cres)   # v3.1
        ult_rocada = np.where(mow, 0., ult_rocada+1)

        # floracao (colmos/inflorescencias sobem acima da folhagem)
        f_fl = np.ones(T)
        mes = meses[d]
        for i in range(T):
            if mes in fmeses[i] and H[i] > fh[i]:
                f_fl[i] = fb[i]
        oFlor[:,d] = f_fl > 1.

        f_r = cres + (1.-cres)*(1. - np.exp(-t_reset / tau))     # v3.1
        f_d = np.clip(1. - np.power(np.clip(H/K,0,1), Q), 0., 1.)
        vigor = f_t * f_w
        ruido = np.exp(rng.normal(0., 0.10, T))
        dH = A * f_N * vigor * f_r * f_d * f_fl * qual * ruido
        # dormencia/estresse: senescencia lenta do material em pe
        dormente = (tmed < dormT) | (frac < 0.06)
        dH = np.where(dormente, 0., dH)
        H = H + dH - np.where(dormente, sen*H, 0.)
        H = np.maximum(H, 1.0)

        # turgor: altura MEDIDA responde ao status hidrico do dia
        turgor = 0.09 * np.clip(ks - 0.55, -0.55, 0.45) / 0.55   # ~ -9%..+7%
        oH[:,d] = H; oHm[:,d] = H * (1.+turgor)
        oSW[:,d] = frac; oVig[:,d] = vigor; oTR[:,d] = t_reset
        t_reset += 1.

    meta = pd.DataFrame(trajs)
    meta["fertilidade"] = np.round(fert,3); meta["cap_solo_mm"] = np.round(cap_solo,0)
    meta["K_cm"] = np.round(K,1)
    return dict(H=oH, Hm=oHm, SW=oSW, VIG=oVig, TR=oTR, MOW=oMow, GEA=oGeada,
                FOG=oFogo, ENC=oEnch, FLOR=oFlor, TMED=TMED.astype(np.float32),
                TMIN=TMIN.astype(np.float32), TMAX=TMAX.astype(np.float32),
                CH=CHUVA.astype(np.float32), ET0=ET0.astype(np.float32),
                RAD=RAD.astype(np.float32), UM=UMID.astype(np.float32),
                datas=datas, meta=meta, n_dias=n_dias, esp_idx=esp_idx)

# ---------------------------------------------------------------------------
# AMOSTRAGEM DE JANELAS
# ---------------------------------------------------------------------------
def _cs(a): return np.concatenate([np.zeros((a.shape[0],1),a.dtype),
                                   np.cumsum(a,axis=1)], axis=1)

def amostrar(sim, especie, n, rng, id0):
    ei = NOMES.index(especie)
    tsel = np.flatnonzero(sim["esp_idx"] == ei)
    nd = sim["n_dias"]
    # mistura de duracoes: 35% em 1-7 d, 25% em 8-30, 40% em 31-120
    u = rng.random(n)
    dias = np.where(u<.35, rng.integers(1,8,n),
            np.where(u<.60, rng.integers(8,31,n), rng.integers(31,D_MAX+1,n)))
    tj = tsel[rng.integers(0, len(tsel), n)]
    ini = rng.integers(30, nd - D_MAX - 1, n)
    fim = ini + dias

    csT,csN,csX = _cs(sim["TMED"]),_cs(sim["TMIN"]),_cs(sim["TMAX"])
    csC,csE,csR = _cs(sim["CH"]),_cs(sim["ET0"]),_cs(sim["RAD"])
    csU,csS,csV = _cs(sim["UM"]),_cs(sim["SW"]),_cs(sim["VIG"])
    csMw = _cs(sim["MOW"].astype(np.int32)); csG=_cs(sim["GEA"].astype(np.int32))
    csF = _cs(sim["FOG"].astype(np.int32)); csEn=_cs(sim["ENC"].astype(np.int32))
    csFl = _cs(sim["FLOR"].astype(np.int32))
    csRain = _cs((sim["CH"]>1.0).astype(np.int32))
    gdd_d = np.clip(np.minimum(sim["TMED"],
             ESPECIES[especie]["t_ot2"]) - ESPECIES[especie]["t_base"], 0, None)
    csGdd = _cs(gdd_d.astype(np.float32))

    ag = lambda cs: (cs[tj,fim]-cs[tj,ini])
    med = lambda cs: ag(cs)/dias

    m = sim["meta"].iloc[tj].reset_index(drop=True)
    H0f, H1f = sim["H"][tj,ini], sim["H"][tj,fim]
    H0m, H1m = sim["Hm"][tj,ini], sim["Hm"][tj,fim]
    # ruido de leitura no campo (media de ~25 pontos, sigma ~0,45 cm)
    H0m = H0m + rng.normal(0,.45,n); H1m = H1m + rng.normal(0,.45,n)
    tr0 = sim["TR"][tj,ini]

    e = ESPECIES[especie]
    vig_fim = sim["VIG"][tj,fim]
    nivel = 4 - np.digitize(vig_fim, [0.12,0.30,0.50,0.72])
    dorm_frio = sim["TMED"][tj,fim] < e["dorm_T"]
    nivel = np.where(dorm_frio, 4, nivel)          # amarelado no frio (zoysia!)
    cor = np.array(e["cores"])[nivel]

    df = pd.DataFrame({
        "id": np.arange(id0, id0+n, dtype=np.int64),
        "especie": especie,
        "local": m.local, "uf": m.uf,
        "latitude": np.round(m.lat,4), "longitude": np.round(m.lon,4),
        "fertilidade_solo": m.fertilidade,
        "capacidade_agua_solo_mm": m.cap_solo_mm,
        "altura_teto_sitio_cm": m.K_cm,
        "data_inicio": sim["datas"].iloc[ini].values,
        "data_fim": sim["datas"].iloc[fim].values,
        "dias_periodo": dias,
        "dias_desde_rocada_inicio": np.round(tr0,0),
        "altura_inicial_cm": np.round(H0m,2),
        "altura_inicial_fisiologica_cm": np.round(H0f,2),
        "temperatura_media_c": np.round(med(csT),1),
        "temperatura_min_c": np.round(sim["TMIN"][tj].min(axis=0) if False else
                                       np.round([sim["TMIN"][t,a:b].min() for t,a,b
                                       in zip(tj,ini,fim)],1),1),
        "temperatura_max_c": np.round([sim["TMAX"][t,a:b].max() for t,a,b
                                       in zip(tj,ini,fim)],1),
        "graus_dia_acumulados": np.round(ag(csGdd),1),
        "umidade_media_pct": np.round(med(csU),1),
        "precipitacao_total_mm": np.round(ag(csC),1),
        "dias_com_chuva": ag(csRain),
        "et0_medio_mm_dia": np.round(med(csE),2),
        "radiacao_media_mj_m2": np.round(med(csR),1),
        "agua_solo_media_pct": np.round(med(csS)*100,1),
        "indice_vigor_medio": np.round(med(csV),3),
        "rocadas_no_periodo": ag(csMw),
        "geadas_no_periodo": ag(csG),
        "fogo_no_periodo": ag(csF) > 0,
        "dias_encharcado": ag(csEn),
        "dias_floracao": ag(csFl),
        "coloracao_final": cor,
        "altura_final_cm": np.round(H1m,2),
        "altura_final_fisiologica_cm": np.round(H1f,2),
    })
    df["crescimento_total_cm"] = np.round(df.altura_final_cm - df.altura_inicial_cm,2)
    df["crescimento_fisiologico_cm"] = np.round(H1f - H0f,2)
    df["crescimento_medio_diario_cm"] = np.round(df.crescimento_total_cm/df.dias_periodo,4)
    df["atingiu_limite_rocada_50cm"] = df.altura_final_cm >= 50.
    return df

# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Gerador v3 - sigmoide, simulacao diaria, Open-Meteo.")
    ap.add_argument("--baixar", action="store_true")
    ap.add_argument("--inicio", default="2010-01-01"); ap.add_argument("--fim", default="2024-12-31")
    ap.add_argument("--cache", default="clima_openmeteo")
    ap.add_argument("--anos", type=int, default=None,
                    help="baixar apenas os N ultimos anos (pedido mais leve; "
                         "8 ja cobre seca/cheia e reduz o peso pela metade)")
    ap.add_argument("--pausa", type=float, default=6.0,
                    help="segundos entre pedidos (default 6; aumente se der 429)")
    ap.add_argument("--locais", default=None, help="CSV nome,uf,lat,lon")
    ap.add_argument("--linhas-por-especie", type=int, default=1_000_000)
    ap.add_argument("--saida", default="dataset_gramas_v3.csv")
    ap.add_argument("--uf", default=None); ap.add_argument("--listar", action="store_true")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--lote", type=int, default=250_000)
    a = ap.parse_args()

    if a.baixar:
        locais = (list(pd.read_csv(a.locais).itertuples(index=False,name=None))
                  if a.locais else LOCAIS_PADRAO)
        # CORRIGIDO: --uf agora filtra o DOWNLOAD tambem. Antes so filtrava na
        # hora de carregar, entao voce baixava 29 cidades para usar 9.
        if a.uf:
            alvo = {u.strip().upper() for u in a.uf.split(",")}
            locais = [L for L in locais if L[1].upper() in alvo]
            if not locais: sys.exit(f"Nenhum local padrao nas UFs {alvo}.")
        inicio = a.inicio
        if a.anos:
            ini_ano = int(a.fim[:4]) - a.anos + 1
            inicio = f"{ini_ano}-01-01"
        print(f"Baixando {len(locais)} locais ({inicio} a {a.fim})...")
        print(f"  peso estimado: ~{len(locais)} pedidos de "
              f"{(int(a.fim[:4])-int(inicio[:4])+1)} anos x 7 variaveis")
        baixar(locais, inicio, a.fim, a.cache, pausa=a.pausa)
        print("Cache pronto.")
        if a.linhas_por_especie <= 0: return

    ufs = ({u.strip().upper() for u in a.uf.split(",")} if a.uf else None)
    diario = carregar(a.cache, ufs)
    if a.listar:
        inv = diario.groupby(["local","uf"]).agg(dias=("data","size"),
              de=("data","min"), ate=("data","max"),
              tmed=("tmed","mean"), chuva_ano=("chuva","sum")).reset_index()
        inv["chuva_ano"]=(inv.chuva_ano/(inv.dias/365.25)).round(0)
        inv["tmed"]=inv.tmed.round(1)
        pd.set_option("display.max_rows",None,"display.width",160)
        print(inv.to_string(index=False)); return

    rng = np.random.default_rng(a.seed)
    print(f"Simulando trajetorias diarias ({diario.local.nunique()} locais x "
          f"{len(NOMES)} especies x {CENARIOS_POR_LOCAL} cenarios)...")
    t0 = time.time()
    sim = simular(diario, rng)
    print(f"  {len(sim['meta'])} trajetorias x {sim['n_dias']} dias "
          f"em {time.time()-t0:.1f}s")

    if os.path.exists(a.saida): os.remove(a.saida)
    total, header = 0, True
    for esp in NOMES:
        feitas = 0
        while feitas < a.linhas_por_especie:
            k = min(a.lote, a.linhas_por_especie - feitas)
            df = amostrar(sim, esp, k, rng, total+1)
            df.to_csv(a.saida, mode="a", header=header, index=False,
                      date_format="%Y-%m-%d", lineterminator="\n")
            header = False; feitas += k; total += k
            print(f"  {esp}: {feitas:,}/{a.linhas_por_especie:,}".replace(",","."), flush=True)
    mb = os.path.getsize(a.saida)/1048576
    print(f"\nOK -> {a.saida} | {total:,} linhas".replace(",",".") +
          f" | {mb:.0f} MB | {time.time()-t0:.1f}s")

if __name__ == "__main__":
    main()
