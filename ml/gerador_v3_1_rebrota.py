#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GERADOR v3.3 - Crescimento de gramineas em faixa de dominio rodoviaria e,
experimentalmente, em pastagem.

v3.3 (o ponto de campo que ancorou a v3.1 e a v3.2 e PASTO, nao faixa de
dominio, e a medicao dele nao e altura de dossel):
  1. DESFEITO O ITEM 4 DA v3.1. `A` da braquiaria volta de 1,90 a 1,60 cm/dia e
     o sigma do micrositio de 0,30 a 0,22. Os dois subiram para alcancar
     +7 cm/4 dias medidos em Juiz de Fora, e essa medicao nao serve de ancora
     por duas razoes independentes:
       - Ela e de PASTO. A v3.1 e a v3.2 ajustaram a fisica de um modelo de
         faixa de dominio contra um sistema diferente.
       - Ela quase certamente nao mede altura de dossel. Foi uma touceira, o
         tecido mais alto dela, com regua e trena diferentes entre as duas
         visitas e o zero de nenhuma das duas verificavel na foto. Os
         1,75 cm/dia caem exatamente no teto da TAlF (taxa de alongamento
         FOLIAR) do marandu, 12,4-17,5 mm/dia, que e o que se espera de quem
         acompanha a folha mais alta de uma touceira recem-cortada.
     E a conta nao fechava mesmo com A=1,90: rodando a fisica desta versao com
     o clima observado da janela, seriam necessarios +5,8 sigma de micrositio
     para chegar aos 7 cm com o solo do ponto, ou +3,9 sigma com a fertilidade
     no maximo que o modelo viu. Nem a rampa de fertilidade do solo.py nem a
     capacidade do balde fecham (testadas: a varredura inteira de fertilidade
     vale 2,2 cm na janela, e balde mais fundo PIORA, porque ks e fracao da
     capacidade). O que sobra e a grandeza medida, e grandeza nao se calibra.
     Os itens 1, 2 e 3 da v3.1 FICAM: rebrota por reservas, Teff da tarde e
     dormencia a 11 C se sustentam na literatura de C4 sem esse ponto.
  2. REGIME DE MANEJO. `REGIMES` separa `faixa` (o padrao, o que o painel
     serve) de `pasto` (experimental). O regime muda os EVENTOS de desfolha e
     o sorteio de sitio -- nao a fisica do crescimento e nao o vetor de
     features. Ver a nota em REGIMES para o porque de pasto nao precisar de
     feature nova, e o porque de ele ficar FORA do dataset por padrao.

v3.1 (calibracao com o ponto de campo de 12-16/ago/2026, MG, braquiaria
cortada a 10 cm -> 17 cm em 4 dias = 1,75 cm/dia, o teto da TAlF do marandu;
o item 4 foi DESFEITO na v3.3, ver acima):
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
  4. [DESFEITO NA v3.3] A braquiaria 1.60 -> 1.90 cm/dia e sigma do sitio
     0.22 -> 0.30 (micrositios de valeta umida/fertil existem na faixa e geram
     as leituras extremas reais). O argumento do micrositio continua valendo;
     o que nao vale e o numero que foi usado para dimensiona-lo.
v3.2 (cobertura das bordas, depois do caso de 12-16/ago/2026 em Juiz de
Fora): o modelo previu +3,9 cm onde o campo deu +7. Nao foi a fisica - o teto
A=1,90 ja estava aqui desde a v3.1 e o dataset o respeita (p99 diario da
braquiaria = 1,92 cm/dia). Foi AMOSTRAGEM. (A v3.3 mostrou que tambem nao era
amostragem: era a grandeza medida. As duas mudancas da v3.2 ficam de pe por
conta propria -- celula rasa e celula rasa, com ou sem aquele ponto.) Sorteando janelas uniformemente de
dentro das trajetorias, a celula "braquiaria x recem-rocada x inverno x 4-6
dias" ficou com 1.047 linhas em 1.000.000 (0,1%); em Juiz de Fora, em agosto,
com SETE. Com sete exemplos o q90 daquela folha vale o que vale: o modelo
respondeu +4,2 de teto porque o maior que ele viu ali foi +4,05.
  1. CENARIOS DE BORDA: alem dos 6 cenarios sorteados por local x especie,
     CENARIOS_BORDA deterministicos - um sitio-teto (fertil, balde fundo) e um
     sitio-chao (talude raspado, balde raso). Antes o sitio rico era cauda de
     Beta(2; 3,2) e caia por acaso em climas quentes; agora existe em TODO
     clima, inclusive no inverno mineiro.
     As bordas mexem so em fertilidade e capacidade - as duas que o modelo VE.
     O micrositio `qual` continua sorteado de proposito: ver a nota em simular.
  2. AMOSTRAGEM POR COTA: depois do lote natural, um suplemento enche as
     celulas rasas de (fase da rebrota x tamanho da janela x faixa termica x
     faixa hidrica). A cota olha SO para as condicoes (X). Nunca para o
     crescimento (y): sortear pelo y inclinaria exatamente os quantis que o
     modelo existe para estimar. O lote natural continua sendo o esqueleto,
     com a distribuicao real de condicoes; o suplemento so adensa os cantos.

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
        # v3.3: de volta a 1,60. A v3.1 subiu para 1,90 igualando A (altura de
        # DOSSEL) a TAlF maxima do marandu (~1,75 cm/dia, alongamento de UMA
        # folha). Sao grandezas diferentes: o dossel sobe menos que a folha
        # estendida porque a folha se abre e tomba. 1,60 e o teto de dossel de
        # braquiaria bem manejada em verao, que e o que esta coluna significa.
        A=1.60,
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
CENARIOS_BORDA = 2              # v3.2: 1 sitio-teto + 1 sitio-chao por local x especie
D_MIN, D_MAX = 1, 120           # janelas de medicao, em dias

#: Dispersao do micrositio nao observado, em log. v3.3: de volta a 0,22 (ver a
#: nota no sorteio de `qual`, em `simular`).
SIGMA_MICROSITIO = 0.22

# ---------------------------------------------------------------------------
# v3.3 - REGIME DE MANEJO
# ---------------------------------------------------------------------------
# O QUE O REGIME MUDA, E O QUE ELE NAO MUDA
# -----------------------------------------
# Muda: os EVENTOS de desfolha (quando, quanto sobra, se o meristema vai junto)
# e o sorteio de sitio. Nao muda: nenhum fator de crescimento, nenhuma constante
# de especie, e nenhuma coluna de feature.
#
# Isso nao e economia de esforco, e o resultado de olhar o que de fato difere.
# Pasto e faixa de dominio diferem em tres coisas, e todas as tres JA chegam ao
# modelo pelas features que existem:
#   quanto sobra depois da desfolha   -> altura_inicial_cm
#   quando foi a desfolha             -> dias_desde_rocada_inicio
#   quanta agua a raiz alcanca        -> capacidade_agua_solo_mm (via solo.py)
# `K` (o teto do sitio) NAO muda por regime de proposito: K e propriedade do
# sitio -- fertilidade e agua --, nao do manejo. Pasto fica baixo porque o
# animal RETIRA tecido, e retirada e evento, nao teto. Um piquete abandonado
# vai a florescimento igual a uma faixa nao rocada.
#
# Por isso pasto NAO precisa de feature nova: duas linhas com as mesmas features
# descrevem a mesma planta no mesmo estado, e a resposta e a mesma funcao. O que
# muda e a DENSIDADE de estados visitados -- pasto vive entre 12 e 30 cm, faixa
# passa correndo por essa faixa a caminho de 50.
#
# POR QUE PASTO FICA FORA DO DATASET POR PADRAO
# ---------------------------------------------
# Porque o objetivo declarado do experimento e saber se o motor de crescimento,
# calibrado e treinado em faixa, acerta em pasto. Treinar com linhas de pasto
# transformaria esse teste FORA DA AMOSTRA em ajuste dentro dela. Rode com
# `--regimes faixa,pasto` quando quiser o contrario: adensar 12-30 cm.
#
# PASTO SO RENDE JANELA CURTA, E ISSO NAO E DEFEITO
# -------------------------------------------------
# `treinar_modelo.py` descarta janela com desfolha no meio -- altura resetada
# nao e problema de "prever crescimento". Com ciclo de 45 dias, medido nesta
# versao (40 mil janelas sorteadas, clima sintetico de 900 dias):
#
#   janela      1-3   4-7  8-15  16-30  31-60  61-120
#   faixa      96%   91%   82%    62%    29%      6%   sobrevivem
#   pasto      89%   71%   44%    11%     1%      0%
#
# Nao ha o que consertar: piquete nao passa 60 dias intocado, e uma janela de
# 60 dias em pasto e uma janela COM pastejo dentro. A consequencia pratica e
# para o campo, nao para o codigo -- medir acumulo de pasto em horizonte longo
# exige GAIOLA DE EXCLUSAO, que e o metodo padrao da pesquisa de pastagem. Sem
# gaiola, a validacao em pasto so alcanca janelas de ate ~30 dias.
#
# AS PREMISSAS DE PASTO
# ---------------------
# Manejo por altura, que e como a extensao brasileira recomenda para tropicais:
# entra o animal quando o dossel chega ao ponto de interceptacao de ~95% de luz,
# sai deixando cerca de metade ("regra da metade"). Em vez de tabelar altura de
# entrada por especie -- numero que eu estaria inventando tres vezes --, as duas
# premissas sao FRACOES da escala que a especie ja carrega: o gatilho de pasto e
# uma fracao do gatilho de rocada, e o residuo e uma fracao do gatilho de pasto.
# Para a braquiaria isso da entrada a 30 cm e saida entre 12 e 18, que e a
# recomendacao classica do marandu (entra a 30, sai a 15).
REGIMES = {
    "faixa": dict(
        rotulo="faixa de dominio",
        #: Todas: e o dominio para o qual o painel existe.
        especies=tuple(NOMES),
        #: Gatilho e residuo saem da propria especie (`gatilho_rocada`,
        #: `residual`), que e onde os numeros de rocada de concessionaria estao.
        gatilho_frac=1.0, residuo_frac=None,
        #: Intervalo maximo entre visitas: o programa da concessionaria.
        intervalo_dias=None,
        #: Irregularidade do programa, em dias, para os dois lados.
        folga_dias=25,
        #: Rocadeira baixa decapita meristema em 35% dos eventos (v3.1).
        p_severo=0.35,
        #: Balde: talude raso a plano fundo, na raiz de 500 mm do solo.py.
        cap=(35., 120.), cap_teto=(105., 120.), cap_chao=(35., 45.),
    ),
    "pasto": dict(
        rotulo="pastagem (experimental)",
        #: Esmeralda fica fora: zoysia e grama de jardim, nao existe piquete de
        #: esmeralda. Inventar trajetoria de pastejo para ela seria encher o
        #: dataset de um sistema que nao existe.
        especies=("braquiaria", "batatais"),
        #: Entra o animal a 60% do gatilho de rocada (braquiaria: 30 de 50 cm);
        #: sai deixando 40-60% disso (12-18 cm) -- a regra da metade.
        gatilho_frac=0.60, residuo_frac=(0.40, 0.60),
        #: Piquete e revisitado dentro de ~45 dias mesmo sem atingir o gatilho.
        #: Na pratica o gatilho dispara primeiro no verao e este teto e que
        #: manda no inverno, quando o capim nao chega a 30 cm.
        intervalo_dias=45.,
        folga_dias=10,
        #: O animal arranca folha, nao raspa o solo. Sobrepastejo existe e e o
        #: que sobra destes 10%.
        p_severo=0.10,
        #: Balde na raiz de 800 mm (ver solo.py): a pedotransferencia nao devolve
        #: menos de ~55 mm nessa profundidade para as texturas desta malha.
        cap=(55., 120.), cap_teto=(105., 120.), cap_chao=(55., 70.),
    ),
}
REGIME_PADRAO = "faixa"

# ---------------------------------------------------------------------------
# v3.2 - AS CELULAS DA COTA
# ---------------------------------------------------------------------------
# O espaco de condicoes cortado em 5 x 6 x 3 x 3 = 270 celulas. Sao os quatro
# eixos que mandam no crescimento e que a amostragem natural cobre de forma
# desigual: a fase da rebrota depende de quando calhou a rocada, e a faixa
# termica depende de onde a janela caiu no ano.
#
# ALVO_POR_CELULA = 1000 nao e chute. O numero de observacoes abaixo do q10 e
# ~Binomial(n; 0,10), cujo erro relativo e 3/sqrt(n). Para estimar o decil com
# erro relativo <= 10% e preciso n >= 900. Mil arredonda para cima.
CORTES_FASE    = np.array([1, 7, 20, 45])          # 0-1, 2-7, 8-20, 21-45, 46+
CORTES_JANELA  = np.array([3, 7, 15, 30, 60])      # 1-3, 4-7, ... 61-120 dias
CORTES_TERMICA = np.array([15., 22.])              # frio, ameno, quente
CORTES_HIDRICA = np.array([25., 60.])              # seco, medio, umido
N_CELULAS = 5 * 6 * 3 * 3
ALVO_POR_CELULA = 1000
MIN_ALCANCAVEL = 25             # celula que o lote natural nunca tocou 25x e
                                # provavelmente impossivel (nao existe inverno
                                # quente em Fortaleza): nao insistir nela.


def celula(fase, dias, tmed, agua):
    """Indice da celula de condicao de cada janela. So X, nunca y."""
    a = np.searchsorted(CORTES_FASE,    fase, side="left")
    b = np.searchsorted(CORTES_JANELA,  dias, side="left")
    c = np.searchsorted(CORTES_TERMICA, tmed, side="left")
    d = np.searchsorted(CORTES_HIDRICA, agua, side="left")
    return ((a * 6 + b) * 3 + c) * 3 + d


def celula_do_df(df):
    return celula(df.dias_desde_rocada_inicio.to_numpy(),
                  df.dias_periodo.to_numpy(),
                  df.temperatura_media_c.to_numpy(),
                  df.agua_solo_media_pct.to_numpy())


def nome_da_celula(i):
    d = i % 3; i //= 3
    c = i % 3; i //= 3
    b = i % 6; a = i // 6
    return (f"{['0-1','2-7','8-20','21-45','46+'][a]:>5} d de rocada | "
            f"{['1-3','4-7','8-15','16-30','31-60','61-120'][b]:>6} d | "
            f"{['frio','ameno','quente'][c]:>6} | {['seco','medio','umido'][d]:>5}")

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
def simular(diario, rng, regimes=(REGIME_PADRAO,)):
    """Retorna dict de arrays (n_traj, n_dias) + metadados por trajetoria.

    `regimes` sao as chaves de REGIMES a simular. Cada regime rende o mesmo
    conjunto de trajetorias (CENARIOS_POR_LOCAL sorteadas + CENARIOS_BORDA) por
    local x especie, entao pedir dois regimes DOBRA a memoria dos arrays
    diarios. Especie fora de `REGIMES[r]["especies"]` nao rende trajetoria
    naquele regime.
    """
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
            for reg in regimes:
                if esp not in REGIMES[reg]["especies"]:
                    continue
                for _ in range(CENARIOS_POR_LOCAL):
                    trajs.append(dict(**meta_loc, especie=esp,
                                      regime_sitio="sorteado", regime_manejo=reg))
                # v3.2: as bordas nao podem depender da sorte. Um sitio-teto e um
                # sitio-chao por local x especie garantem que o extremo de sitio
                # exista em TODO clima - antes ele so aparecia onde a cauda da
                # Beta calhou de cair, que por acaso foi mais no calor.
                for i in range(CENARIOS_BORDA):
                    trajs.append(dict(**meta_loc, especie=esp,
                                      regime_sitio=("teto", "chao")[i % 2],
                                      regime_manejo=reg))
    T = len(trajs)
    esp_idx = np.array([NOMES.index(t["especie"]) for t in trajs])
    par = lambda k: np.array([ESPECIES[NOMES[i]][k] for i in esp_idx])
    #: Premissa de regime por trajetoria. `rpar("cap")[:,0]` e o piso do balde.
    rpar = lambda k: np.array([REGIMES[t["regime_manejo"]][k] for t in trajs])

    # --- cenario por trajetoria -----------------------------------------
    # fertilidade de beira de estrada: maioria pobre, cauda rara rica.
    # v3.3: a MESMA Beta nos dois regimes, de proposito. Nao existe distribuicao
    # medida de fertilidade de pastagem nesta malha, e trocar uma Beta por outra
    # inventada mudaria a densidade de treino sem nenhum dado atras. O que muda
    # em pasto e so o balde, que tem pedotransferencia e profundidade de raiz
    # publicadas para justificar.
    regime = np.array([t["regime_sitio"] for t in trajs])
    teto, chao = regime == "teto", regime == "chao"
    fert = np.clip(rng.beta(2.0, 3.2, T) * 1.15, 0.05, 1.0)
    cap_faixa = rpar("cap")                     # (T, 2): piso e teto do sorteio
    cap_solo = cap_faixa[:,0] + rng.random(T) * (cap_faixa[:,1] - cap_faixa[:,0])
    # v3.2: as duas bordas, com uma folga estreita para nao virar um pico
    # degenerado numa unica altura de fertilidade. 0,82-0,98 e a valeta com
    # materia organica e escoamento da pista; 0,05-0,12 e o talude raspado.
    fert = np.where(teto, rng.uniform(.82, .98, T),
           np.where(chao, rng.uniform(.05, .12, T), fert))
    # v3.3: as bordas do balde tambem saem do regime. O sitio-chao de faixa e
    # talude raspado (35-45 mm); em pasto nao existe talude raspado, e o piso e
    # o menor balde que 800 mm de raiz produzem (55-70 mm).
    cap_bteto, cap_bchao = rpar("cap_teto"), rpar("cap_chao")
    sorteio = rng.random(T)
    cap_solo = np.where(teto, cap_bteto[:,0] + sorteio*(cap_bteto[:,1]-cap_bteto[:,0]),
               np.where(chao, cap_bchao[:,0] + sorteio*(cap_bchao[:,1]-cap_bchao[:,0]),
                        cap_solo))
    f_N = 0.25 + 0.75 * fert                    # Gastal: 3-4x entre extremos
    Klo = par("K_range")[:,0] if par("K_range").ndim>1 else None
    Kr = np.array([ESPECIES[NOMES[i]]["K_range"] for i in esp_idx])
    K = Kr[:,0] + rng.random(T) * (Kr[:,1]-Kr[:,0])
    K = K * (0.75 + 0.35 * fert)                # sem N o teto tambem cai
    # v3.1: micrositio (valeta/talude). v3.2: continua sorteado ATE nas
    # trajetorias de borda, e isso e deliberado. `qual` nao vira coluna do CSV:
    # e o fator que o modelo NAO observa. Se as bordas o fixassem junto com a
    # fertilidade, fertilidade (que o modelo ve) ficaria correlacionada com
    # qualidade de sitio (que ele nao ve), e o modelo creditaria a primeira o
    # efeito da segunda. As bordas mexem so no que aparece nas features.
    #
    # v3.3: sigma de volta a 0,22. Subiu para 0,30 na v3.1 para alargar a cauda
    # ate o ponto de Juiz de Fora, e nem 0,30 chegou perto (seriam +5,8 sigma).
    # Alargar a cauda de um fator NAO OBSERVADO alarga o q10-q90 de todo trecho
    # do painel: paga incerteza em toda a malha para acomodar uma medicao que
    # nao era da grandeza prevista. Mancha de urina e de esterco em pasto sao
    # exatamente o tipo de micrositio que justificaria uma cauda direita mais
    # gorda -- e quando `validar_campo.py` tiver leituras de 5 touceiras no
    # mesmo piquete, a dispersao ENTRE elas mede esse sigma. Ate lá, 0,22.
    qual = np.exp(rng.normal(0., SIGMA_MICROSITIO, T))

    # --- desfolha: o que o regime muda ----------------------------------
    # v3.3: gatilho, residuo, intervalo maximo e severidade saem do REGIME, e
    # nao mais so da especie. Em `faixa` os quatro valem o que sempre valeram.
    gat_frac = rpar("gatilho_frac")
    gat = np.array([ESPECIES[NOMES[i]]["gatilho_rocada"] for i in esp_idx]) * gat_frac
    res_r = np.array([ESPECIES[NOMES[i]]["residual"] for i in esp_idx], dtype=float)
    res_frac = np.array([REGIMES[t["regime_manejo"]]["residuo_frac"] or (0., 0.)
                         for t in trajs], dtype=float)
    usa_frac = np.array([REGIMES[t["regime_manejo"]]["residuo_frac"] is not None
                         for t in trajs])
    # Residuo de pasto e fracao do gatilho DE PASTO (a regra da metade), nao da
    # altura de rocadeira: 40-60% de 30 cm = 12-18 cm no marandu.
    res_r = np.where(usa_frac[:,None],
                     np.column_stack([gat*res_frac[:,0], gat*res_frac[:,1]]), res_r)
    p_severo = rpar("p_severo")
    folga_dias = rpar("folga_dias").astype(np.int64)

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
    dormT = par("dorm_T")          # `gat` ja saiu do regime, acima
    # v3.2: o ciclo de rocada vira CENARIO, nao constante da especie.
    # A faixa de dominio e rocada por PROGRAMA - a concessionaria passa a
    # rocadeira de tantos em tantos meses - e nao so quando o capim chega ao
    # gatilho de 50 cm. Com o ciclo preso em rocada_max_dias, um local frio era
    # rocado uma vez por ano, e a fase de rebrota (justamente a que o painel usa
    # para agendar) ficava em 0,1% do dataset por falta de eventos de reset, nao
    # por falta de sorteio. A cota nao resolve isso: ela so pode escolher entre
    # as janelas que existem. Aqui elas passam a existir.
    # v3.3: em pasto o intervalo base e do regime (45 dias), nao da especie: 200
    # dias e o programa da concessionaria, e nenhum piquete espera isso.
    base_ciclo = np.array([REGIMES[t["regime_manejo"]]["intervalo_dias"]
                           or ESPECIES[t["especie"]]["rocada_max_dias"]
                           for t in trajs], dtype=float)
    rmax = base_ciclo * rng.choice([.35, .50, .70, 1.0, 1.3], T)
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

        # desfolha: por gatilho de altura (rocada a 50 cm na faixa, entrada do
        # animal a 30 em pasto) e por prazo maximo. A folga em cima do prazo sai
        # do regime: +-25 dias e a irregularidade de um programa de rocada, e num
        # ciclo de pasto de 45 dias ela seria mais da metade do ciclo.
        mow = (H >= gat) | (ult_rocada >= rmax + rng.integers(-folga_dias, folga_dias))
        oMow[:,d] = mow
        novo_res = res_r[:,0] + rng.random(T)*(res_r[:,1]-res_r[:,0])
        severo = rng.random(T) < p_severo        # corte baixo decapita meristema
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
    meta["ciclo_rocada_dias"] = np.round(rmax,0)
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

def _tabelas(sim, especie):
    """Somas acumuladas, montadas uma vez e reaproveitadas.

    Sao doze arrays de (trajetorias x dias) e nao dependem do sorteio: refaze-las
    a cada lote de 250 mil linhas era repetir o mesmo trabalho. A cota tambem
    precisa delas para saber, ANTES de montar a linha, em que celula a janela
    candidata cai. So a de graus-dia depende da especie (t_base e t_ot2 sao
    dela). As de TMIN/TMAX sairam: eram montadas e nunca lidas - o minimo e o
    maximo da janela vem de uma varredura, nao de uma soma acumulada.
    """
    cs = sim.get("_cs")
    if cs is None:
        cs = sim["_cs"] = dict(
            T=_cs(sim["TMED"]), C=_cs(sim["CH"]), E=_cs(sim["ET0"]),
            R=_cs(sim["RAD"]), U=_cs(sim["UM"]), S=_cs(sim["SW"]),
            V=_cs(sim["VIG"]), Mw=_cs(sim["MOW"].astype(np.int32)),
            G=_cs(sim["GEA"].astype(np.int32)), F=_cs(sim["FOG"].astype(np.int32)),
            En=_cs(sim["ENC"].astype(np.int32)), Fl=_cs(sim["FLOR"].astype(np.int32)),
            Rain=_cs((sim["CH"] > 1.0).astype(np.int32)))
    gdd = sim.setdefault("_cs_gdd", {})
    if especie not in gdd:
        e = ESPECIES[especie]
        d = np.clip(np.minimum(sim["TMED"], e["t_ot2"]) - e["t_base"], 0, None)
        gdd[especie] = _cs(d.astype(np.float32))
    return cs, gdd[especie]


def sortear_por_cota(sim, especie, falta, rng, rodadas=14, teto_pool=4_000_000):
    """v3.2: escolhe janelas ate encher a cota de cada celula rasa.

    Sorteia um pool grande de candidatas, calcula a celula de cada uma pelas
    CONDICOES e fica com as que caem em celula ainda faminta, ate a cota. Como
    o pool e sorteado do mesmo jeito que o lote natural e o corte e por celula,
    dentro de cada celula as janelas continuam sendo uma amostra aleatoria dela.

    O criterio olha so para X - fase da rebrota, tamanho da janela, temperatura
    media e agua no solo. O crescimento nao entra em lugar nenhum desta funcao.
    Nao e escrupulo teorico: escolher janela pelo y mudaria p(y|x) e inclinaria
    justamente os quantis que os tres modelos existem para estimar.

    Devolve ((tj, ini, dias), o que sobrou por encher).
    """
    cs, _ = _tabelas(sim, especie)
    tsel = np.flatnonzero(sim["esp_idx"] == NOMES.index(especie))
    nd = sim["n_dias"]
    resta = np.asarray(falta, dtype=np.int64).copy()
    saida = []
    for k in range(rodadas):
        if resta.sum() <= 0: break
        # O pool DOBRA a cada rodada. Dimensiona-lo pelo que ainda falta seria
        # ao contrario: as celulas comuns enchem primeiro, `resta` encolhe, e o
        # sorteio mingua justamente quando so sobraram as celulas raras - que
        # sao as que precisam de mais candidatas. Uma celula com frequencia
        # natural de 6 em 100 mil precisa de ~17 milhoes de sorteios para render
        # mil linhas; dimensionada pelo resto, ela nunca chegaria la.
        m = int(min(teto_pool, max(500_000, resta.sum() * 8) * (2 ** k)))
        tj = tsel[rng.integers(0, len(tsel), m)]
        # janela uniforme de 1 a 120, e nao a mistura 35/25/40 do lote natural:
        # o buraco esta espalhado por todos os tamanhos, inclusive os longos.
        dias = rng.integers(D_MIN, D_MAX + 1, m)
        ini = rng.integers(30, nd - D_MAX - 1, m)
        fim = ini + dias
        # So contam as janelas que o treinar_modelo.py vai de fato usar: ele
        # descarta janela com rocada ou fogo DENTRO, e isso e 46% do dataset.
        # Encher a cota com linha que o treino joga fora e encher no papel - foi
        # o que aconteceu na primeira versao desta funcao, e a celula do caso de
        # Juiz de Fora saiu com 1.020 linhas no CSV e 361 no treino.
        # Condicionar aqui pelo mesmo evento que o treinador condiciona mantem a
        # cota na mesma populacao do lote natural depois do filtro.
        vale = (((cs["Mw"][tj, fim] - cs["Mw"][tj, ini]) == 0) &
                ((cs["F"][tj, fim] - cs["F"][tj, ini]) == 0))
        tj, ini, dias, fim = tj[vale], ini[vale], dias[vale], fim[vale]
        m = len(tj)
        if m == 0: continue
        cel = celula(sim["TR"][tj, ini], dias,
                     (cs["T"][tj, fim] - cs["T"][tj, ini]) / dias,
                     (cs["S"][tj, fim] - cs["S"][tj, ini]) / dias * 100.)
        ordem = np.argsort(cel, kind="stable")
        c_ord = cel[ordem]
        grupo = np.flatnonzero(np.r_[True, c_ord[1:] != c_ord[:-1]])
        pos = np.arange(m) - np.repeat(grupo, np.diff(np.r_[grupo, m]))
        fica = ordem[pos < resta[c_ord]]
        if len(fica) == 0: break
        resta -= np.bincount(cel[fica], minlength=N_CELULAS)
        saida.append((tj[fica], ini[fica], dias[fica]))
    if not saida:
        return None, resta
    return tuple(np.concatenate([x[i] for x in saida]) for i in range(3)), resta


def amostrar(sim, especie, n, rng, id0, escolha=None, origem="natural"):
    ei = NOMES.index(especie)
    tsel = np.flatnonzero(sim["esp_idx"] == ei)
    nd = sim["n_dias"]
    if escolha is None:
        # mistura de duracoes: 35% em 1-7 d, 25% em 8-30, 40% em 31-120
        u = rng.random(n)
        dias = np.where(u<.35, rng.integers(1,8,n),
                np.where(u<.60, rng.integers(8,31,n), rng.integers(31,D_MAX+1,n)))
        tj = tsel[rng.integers(0, len(tsel), n)]
        ini = rng.integers(30, nd - D_MAX - 1, n)
    else:
        tj, ini, dias = escolha           # v3.2: janelas ja escolhidas pela cota
        n = len(tj)
    fim = ini + dias

    cst, csGdd = _tabelas(sim, especie)
    csT, csC, csE, csR = cst["T"], cst["C"], cst["E"], cst["R"]
    csU, csS, csV = cst["U"], cst["S"], cst["V"]
    csMw, csG, csF = cst["Mw"], cst["G"], cst["F"]
    csEn, csFl, csRain = cst["En"], cst["Fl"], cst["Rain"]

    ag = lambda x: (x[tj,fim]-x[tj,ini])
    med = lambda x: ag(x)/dias

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
        # v3.2: duas colunas de auditoria. O treinar_modelo.py le por
        # `usecols=lambda c: c in usar`, entao coluna a mais nao o incomoda -
        # e sem elas nao da para saber, depois, de onde veio cada linha.
        # v3.3: tres. `regime_manejo` e a unica que o treino tambem LE, para
        # poder filtrar -- e por isso ela esta em BLOQUEADAS lá: e rotulo do
        # gerador, nao grandeza de campo, e nunca pode virar feature.
        "regime_sitio": m.regime_sitio, "origem": origem,
        "regime_manejo": m.regime_manejo,
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
    ap.add_argument("--suplemento", type=int, default=-1,
                    help="v3.2: linhas extras por especie para encher as celulas "
                         "rasas de condicao. -1 (default) = exatamente o deficit "
                         "medido no proprio lote; 0 desliga; N>0 limita a N.")
    ap.add_argument("--alvo-celula", type=int, default=ALVO_POR_CELULA,
                    help=f"linhas por celula que a cota persegue (default "
                         f"{ALVO_POR_CELULA}: erro relativo de 10%% no q10)")
    ap.add_argument("--regimes", default=REGIME_PADRAO,
                    help="v3.3: regimes de manejo a simular, separados por "
                         f"virgula ({', '.join(REGIMES)}). Default "
                         f"'{REGIME_PADRAO}', que e o dominio do painel. "
                         "Incluir 'pasto' DOBRA a memoria dos arrays diarios e "
                         "tira a validacao de pasto de fora da amostra - leia a "
                         "nota em REGIMES antes.")
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

    regimes = [r.strip() for r in a.regimes.split(",") if r.strip()]
    desconhecidos = [r for r in regimes if r not in REGIMES]
    if desconhecidos:
        sys.exit(f"Regime desconhecido: {desconhecidos}. Use {list(REGIMES)}.")

    rng = np.random.default_rng(a.seed)
    print(f"Simulando trajetorias diarias ({diario.local.nunique()} locais x "
          f"{len(NOMES)} especies x {CENARIOS_POR_LOCAL} cenarios x "
          f"{len(regimes)} regime(s): {', '.join(regimes)})...")
    for r in regimes:
        if r != REGIME_PADRAO:
            print(f"  [experimental] regime '{r}' "
                  f"({REGIMES[r]['rotulo']}): as linhas dele entram no dataset e "
                  f"o teste de campo em {r} deixa de ser fora da amostra.")
    t0 = time.time()
    sim = simular(diario, rng, regimes)
    print(f"  {len(sim['meta'])} trajetorias x {sim['n_dias']} dias "
          f"em {time.time()-t0:.1f}s")

    if os.path.exists(a.saida): os.remove(a.saida)
    total = 0
    mil = lambda x: f"{int(x):,}".replace(",", ".")

    def escrever(df):
        df.to_csv(a.saida, mode="a", header=escrever.cabecalho, index=False,
                  date_format="%Y-%m-%d", lineterminator="\n")
        escrever.cabecalho = False
        return len(df)
    escrever.cabecalho = True

    for esp in NOMES:
        # v3.3: `--regimes pasto` sozinho nao rende trajetoria de esmeralda (nao
        # existe piquete de zoysia). Sem esta guarda `amostrar` sortearia de um
        # `tsel` vazio e morreria com um IndexError sem explicacao.
        if not (sim["esp_idx"] == NOMES.index(esp)).any():
            print(f"  {esp}: nenhum regime pedido a inclui, pulando.")
            continue
        # --- lote natural: o esqueleto, com a distribuicao real de condicoes
        feitas = 0
        conta = np.zeros(N_CELULAS, np.int64)
        while feitas < a.linhas_por_especie:
            k = min(a.lote, a.linhas_por_especie - feitas)
            df = amostrar(sim, esp, k, rng, total+1)
            # mesma razao da nota em sortear_por_cota: o deficit tem que ser
            # medido sobre as linhas que vao treinar, nao sobre as escritas
            treina = df[(df.rocadas_no_periodo == 0) &
                        (~df.fogo_no_periodo.astype(bool))]
            conta += np.bincount(celula_do_df(treina), minlength=N_CELULAS)
            total += escrever(df); feitas += k
            print(f"  {esp}: {mil(feitas)}/{mil(a.linhas_por_especie)}", flush=True)

        # --- v3.2: suplemento de cota, medido no lote que acabou de sair
        if a.suplemento == 0:
            continue
        falta = np.maximum(0, a.alvo_celula - conta)
        # celula que o lote natural nao tocou MIN_ALCANCAVEL vezes provavelmente
        # nao existe no clima destes locais (nao ha inverno quente em Fortaleza):
        # insistir nela so gastaria sorteio.
        falta = np.where(conta >= MIN_ALCANCAVEL, falta, 0)
        if a.suplemento > 0 and falta.sum() > a.suplemento:
            falta = np.floor(falta * (a.suplemento / falta.sum())).astype(np.int64)
        rasas = int((falta > 0).sum())
        if not rasas:
            print(f"  {esp}: nenhuma celula abaixo de {mil(a.alvo_celula)}.")
            continue
        print(f"  {esp}: cota de {mil(falta.sum())} linhas em {rasas} celulas rasas...",
              flush=True)
        escolha, resta = sortear_por_cota(sim, esp, falta, rng)
        if escolha is not None:
            n_sup = len(escolha[0])
            for i in range(0, n_sup, a.lote):
                fatia = tuple(x[i:i+a.lote] for x in escolha)
                total += escrever(amostrar(sim, esp, 0, rng, total+1,
                                           escolha=fatia, origem="cota"))
            print(f"  {esp}: +{mil(n_sup)} linhas de cota", flush=True)
        # nunca cortar em silencio: o que nao coube tem que aparecer
        if resta.sum() > 0:
            print(f"  {esp}: AVISO - {mil(resta.sum())} linhas nao couberam em "
                  f"{int((resta>0).sum())} celulas raras demais. As tres piores:")
            for c in np.argsort(-resta)[:3]:
                if resta[c]:
                    print(f"      faltam {mil(resta[c]):>6} em [{nome_da_celula(int(c))}]")
    mb = os.path.getsize(a.saida)/1048576
    print(f"\nOK -> {a.saida} | {total:,} linhas".replace(",",".") +
          f" | {mb:.0f} MB | {time.time()-t0:.1f}s")

if __name__ == "__main__":
    main()
