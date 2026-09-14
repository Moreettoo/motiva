"""ndvi_serie.py e um novo lugar onde as DUAS armadilhas do Earth Engine documentadas em
ndvi_datas.estatisticas() (Tarefa 14 -- ver test_ndvi_datas.py) podem reaparecer, porque e uma
reducao nova, nao a mesma funcao ja corrigida, e uma TERCEIRA armadilha especifica deste modulo,
achada rodando a serie real (nao prevista a priori -- ver o docstring de ndvi_serie.py):

1. `ee.Image.constant(1)` sem `.reproject()` na projecao da banda B4 conta numa grade desalinhada
   da grade nativa de 10 m do Sentinel-2 (`_total_imagem`).
2. O `count` de um reducer COMBINADO (aqui seria median+count) nao e o numero de pixels validos --
   vem inflado por um fator variavel (`_juntar_mediana_e_contagem`, que so recebe as duas listas
   JA separadas, uma por reduceRegions distinto).
3. O corredor cruza mais de um tile/orbita do Sentinel-2: casar so por (km_marco_m, data_imagem)
   mistura a mediana de uma imagem com a contagem de OUTRA quando duas imagens cobrem o mesmo
   marco no mesmo dia (aconteceu de verdade em ~350 datas da serie 2019-2026), e reprojetar o
   total uma vez so por periodo (em vez de por imagem) dava nuvem_pct levemente negativo (ate
   -0,28%) nessas mesmas datas -- a mesma familia do bug 1, so que a granularidade errada era
   "por periodo" em vez de "por imagem".

Junto com essas tres, este arquivo tambem cobre o controle de fluxo de resiliencia da execucao
longa (ano por ano, 2019 ate hoje): particionamento em semestres quando o payload do getInfo
estoura, e a retentativa apos falha transitoria -- exigidos pela tarefa porque um rate-limit do
Earth Engine no meio de ~8 anos nao pode derrubar os anos que ja teriam funcionado numa segunda
tentativa, nem ser silenciosamente engolido.
"""
from __future__ import annotations

import pytest

from pesquisa.ndvi import ndvi_serie


# ----------------------------------------------------------------------
# _juntar_mediana_e_contagem -- funcao pura, sem `ee`
# ----------------------------------------------------------------------
def test_juntar_usa_o_count_da_lista_de_contagem_isolada_nunca_o_de_mediana():
    """Se um dia `medianas_imagem` passar a vir de um reducer combinado (median+count) e alguem
    tentar reaproveitar esse count por engano em vez de chamar `_juntar_mediana_e_contagem` com as
    duas listas de verdade, o bug de contagem inflada (Tarefa 14) reaparece aqui. A funcao pura
    tem que ignorar qualquer campo 'count' que apareca em feats_mediana (999, obviamente bogus) e
    usar so o de feats_contagem (80, da chamada isolada)."""
    feats_mediana = [{"properties": {"km_marco_m": 0, "data_imagem": "2026-01-05", "imagem_id": "img1", "median": 0.5, "count": 999}}]
    feats_contagem = [{"properties": {"km_marco_m": 0, "imagem_id": "img1", "count": 80}}]
    saida = ndvi_serie._juntar_mediana_e_contagem(feats_mediana, feats_contagem, total_por_imagem={(0, "img1"): 100})
    assert len(saida) == 1
    assert saida[0]["n_pixels"] == 80
    assert saida[0]["nuvem_pct"] == pytest.approx(0.2)
    assert 0.0 <= saida[0]["nuvem_pct"] <= 1.0


def test_juntar_casa_pela_chave_marco_e_imagem_nao_so_pelo_marco():
    """Dentro de um ano, o mesmo marco aparece em VARIAS imagens (datas diferentes) -- casar so
    por km_marco_m (ignorando a imagem) misturaria a contagem de uma data com a mediana de outra.
    Dois marcos, duas imagens cada, contagens deliberadamente diferentes por imagem para pegar
    esse erro."""
    feats_mediana = [
        {"properties": {"km_marco_m": 0, "data_imagem": "2026-01-05", "imagem_id": "imgA", "median": 0.5}},
        {"properties": {"km_marco_m": 0, "data_imagem": "2026-01-10", "imagem_id": "imgB", "median": 0.6}},
    ]
    feats_contagem = [
        {"properties": {"km_marco_m": 0, "imagem_id": "imgA", "count": 90}},
        {"properties": {"km_marco_m": 0, "imagem_id": "imgB", "count": 10}},
    ]
    total_por_imagem = {(0, "imgA"): 100, (0, "imgB"): 100}
    saida = ndvi_serie._juntar_mediana_e_contagem(feats_mediana, feats_contagem, total_por_imagem)
    por_data = {s["data_imagem"]: s for s in saida}
    assert por_data["2026-01-05"]["n_pixels"] == 90 and por_data["2026-01-05"]["nuvem_pct"] == pytest.approx(0.1)
    # 2026-01-10 tem nuvem_pct = 1 - 10/100 = 0,9 -- acima de NUVEM_MAXIMA (0,2), fica de fora.
    assert "2026-01-10" not in por_data


def test_juntar_corta_por_nuvem_maxima_e_ignora_mediana_none():
    feats_mediana = [
        {"properties": {"km_marco_m": 0, "data_imagem": "d1", "imagem_id": "i0", "median": 0.5}},   # nuvem 0,5 -> fora
        {"properties": {"km_marco_m": 500, "data_imagem": "d1", "imagem_id": "i1", "median": 0.6}},  # nuvem 0,1 -> dentro
        {"properties": {"km_marco_m": 1000, "data_imagem": "d1", "imagem_id": "i2", "median": None}},  # sem mediana valida -> fora
    ]
    feats_contagem = [
        {"properties": {"km_marco_m": 0, "imagem_id": "i0", "count": 50}},
        {"properties": {"km_marco_m": 500, "imagem_id": "i1", "count": 90}},
        {"properties": {"km_marco_m": 1000, "imagem_id": "i2", "count": 99}},
    ]
    total_por_imagem = {(0, "i0"): 100, (500, "i1"): 100, (1000, "i2"): 100}
    saida = ndvi_serie._juntar_mediana_e_contagem(feats_mediana, feats_contagem, total_por_imagem)
    assert len(saida) == 1 and saida[0]["km_marco_m"] == 500


def test_juntar_marco_sem_total_ou_sem_contagem_correspondente_nao_quebra():
    """`total_por_imagem.get((m,imagem_id), 0)` e `n_por_imagem.get((m,imagem_id), 0)` cobrem uma
    imagem ausente de um dos dois lados -- sem teste, uma imagem que aparecesse na mediana mas nao
    na contagem isolada (ou vice-versa) lancaria KeyError em producao."""
    feats_mediana = [{"properties": {"km_marco_m": 9999, "data_imagem": "d1", "imagem_id": "iX", "median": 0.5}}]
    saida = ndvi_serie._juntar_mediana_e_contagem(feats_mediana, feats_contagem=[], total_por_imagem={})
    assert saida == []   # total_m == 0 -> guard de divisao por zero, nunca ZeroDivisionError


def test_juntar_casa_por_imagem_mesmo_quando_duas_imagens_cobrem_o_mesmo_marco_no_mesmo_dia():
    """O achado real da Tarefa 20: o corredor cruza mais de um tile do Sentinel-2, entao em ~350
    datas da serie duas imagens cobrem o mesmo marco no mesmo dia. Casar so por (km_marco_m,
    data_imagem) faria `n_por_chave`/`total_por_chave` (dicts) sobrescreverem uma imagem com a
    outra e produziriam DUAS linhas de saida com a MESMA chave primaria (km_marco_m,
    data_imagem) -- exatamente o erro que a UNIQUE constraint do sqlite pegou na rodada real.
    Aqui as duas imagens tem contagens BEM diferentes (uma quase sem nuvem, outra bem nublada) de
    proposito, para que um casamento errado por data (em vez de por imagem_id) produza um
    resultado ERRADO em vez de so um resultado A MAIS."""
    feats_mediana = [
        {"properties": {"km_marco_m": 0, "data_imagem": "2020-05-01", "imagem_id": "tileA", "median": 0.40}},
        {"properties": {"km_marco_m": 0, "data_imagem": "2020-05-01", "imagem_id": "tileB", "median": 0.60}},
    ]
    feats_contagem = [
        {"properties": {"km_marco_m": 0, "imagem_id": "tileA", "count": 95}},   # nuvem 0,05 (tileA, quase limpa)
        {"properties": {"km_marco_m": 0, "imagem_id": "tileB", "count": 40}},   # nuvem 0,60 (tileB, nublada -- corta fora)
    ]
    total_por_imagem = {(0, "tileA"): 100, (0, "tileB"): 100}
    saida = ndvi_serie._juntar_mediana_e_contagem(feats_mediana, feats_contagem, total_por_imagem)
    # uma linha so para (0, "2020-05-01") -- nunca duas -- e e a da tileA (a unica dentro do corte
    # de nuvem); um casamento so por data poderia ter juntado a mediana da tileB com a contagem da
    # tileA (ou vice-versa), produzindo um nuvem_pct/ndvi_mediana que nao corresponde a NENHUMA
    # das duas imagens reais.
    assert len(saida) == 1
    assert saida[0]["ndvi_mediana"] == pytest.approx(0.40) and saida[0]["n_pixels"] == 95


def test_juntar_deduplica_pela_menor_nuvem_quando_duas_imagens_boas_cobrem_o_mesmo_dia():
    """Quando as DUAS imagens do mesmo (marco, dia) passam no corte de nuvem, so uma pode sobrar
    na saida (o schema tem uma linha por (km_marco_m, data_imagem)) -- a de MENOR nuvem_pct, a
    mais confiavel."""
    feats_mediana = [
        {"properties": {"km_marco_m": 0, "data_imagem": "2020-05-01", "imagem_id": "tileA", "median": 0.40}},
        {"properties": {"km_marco_m": 0, "data_imagem": "2020-05-01", "imagem_id": "tileB", "median": 0.55}},
    ]
    feats_contagem = [
        {"properties": {"km_marco_m": 0, "imagem_id": "tileA", "count": 90}},   # nuvem 0,10
        {"properties": {"km_marco_m": 0, "imagem_id": "tileB", "count": 95}},   # nuvem 0,05 -- vence
    ]
    total_por_imagem = {(0, "tileA"): 100, (0, "tileB"): 100}
    saida = ndvi_serie._juntar_mediana_e_contagem(feats_mediana, feats_contagem, total_por_imagem)
    assert len(saida) == 1
    assert saida[0]["ndvi_mediana"] == pytest.approx(0.55) and saida[0]["nuvem_pct"] == pytest.approx(0.05)


# ----------------------------------------------------------------------
# _total_imagem -- exige o reproject na projecao da banda B4 DESTA imagem antes do reduceRegions
# ----------------------------------------------------------------------
class _ReducerContagemFalso:
    pass


class _FeatureCollectionFalsa:
    def __init__(self, features):
        self._features = features

    def getInfo(self):
        return {"features": self._features}


class _ImagemTotalFalsa:
    def __init__(self, alinhada=False):
        self.alinhada = alinhada

    def rename(self, _nome):
        return self

    def reproject(self, projecao):
        assert projecao == "projecao-b4-desta-imagem", "total tem que ser reprojetado na projecao DESTA imagem"
        return _ImagemTotalFalsa(alinhada=True)

    def reduceRegions(self, collection, reducer, scale=None):
        assert isinstance(reducer, _ReducerContagemFalso), "total tem que usar ee.Reducer.count() puro"
        assert scale == 10
        # so devolve contagens "alinhadas" (grade nativa S2) se o reproject foi de fato chamado
        # antes -- sem ele, a chamada cai direto no ImageFalsa sem `.alinhada`, simulando a grade
        # padrao desalinhada do bug 1 (Tarefa 14).
        dados = [{"km_marco_m": 0, "count": 100}, {"km_marco_m": 500, "count": 90}] if self.alinhada \
            else [{"km_marco_m": 0, "count": 321}, {"km_marco_m": 500, "count": 8}]
        return _FeatureCollectionFalsa([{"properties": p} for p in dados])


class _ImagemFalsaComB4:
    def select(self, banda):
        assert banda == "B4"
        return self

    def projection(self):
        return "projecao-b4-desta-imagem"


class _EeFalsoTotal:
    class Image:
        @staticmethod
        def constant(_v):
            return _ImagemTotalFalsa()

    class Reducer:
        @staticmethod
        def count():
            return _ReducerContagemFalso()


def test_total_imagem_reprojeta_na_b4_desta_imagem_antes_de_contar(monkeypatch):
    monkeypatch.setattr(ndvi_serie, "ee", _EeFalsoTotal)
    resultado = ndvi_serie._total_imagem(fc=object(), img=_ImagemFalsaComB4())
    saida = {f["properties"]["km_marco_m"]: f["properties"]["count"] for f in resultado.getInfo()["features"]}
    # so sai 100/90 (a versao "alinhada") se o codigo passou pelo .reproject() antes de contar --
    # os asserts dentro do double (projecao certa, reducer isolado) tambem tem que passar.
    assert saida == {0: 100, 500: 90}


# ----------------------------------------------------------------------
# _por_ano -- particionamento em semestres quando o payload do getInfo estoura
# ----------------------------------------------------------------------
def test_por_ano_divide_em_semestres_quando_o_payload_do_ano_inteiro_estoura(monkeypatch):
    """Simula o ano inteiro lancando o erro de memoria do Earth Engine e os dois semestres
    funcionando -- confirma que o resultado e a CONCATENACAO dos dois semestres, nao so um deles,
    e que os periodos passados para cada chamada sao os semestres certos."""
    chamadas = []

    def _por_periodo_falso(fc, inicio, fim):
        chamadas.append((inicio, fim))
        if (inicio, fim) == ("2022-01-01", "2023-01-01"):
            raise ndvi_serie.ee.EEException("Computation timed out.: User memory limit exceeded.")
        return [{"km_marco_m": 0, "data_imagem": inicio, "ndvi_mediana": 0.5, "n_pixels": 10, "nuvem_pct": 0.1}]

    monkeypatch.setattr(ndvi_serie, "_por_periodo", _por_periodo_falso)
    saida = ndvi_serie._por_ano(fc=object(), ano=2022)
    assert chamadas == [("2022-01-01", "2023-01-01"), ("2022-01-01", "2022-07-01"), ("2022-07-01", "2023-01-01")]
    assert len(saida) == 2   # um resultado por semestre


def test_por_ano_divide_em_semestres_no_erro_real_de_2019_2022(monkeypatch):
    """Texto EXATO devolvido pelo Earth Engine na primeira rodada real deste modulo (2019-2022
    falharam com isso, nao com "user memory limit exceeded" -- ver ndvi_serie.py e o diario da
    Tarefa 20): "Collection query aborted after accumulating over 5000 elements." e uma familia
    de erro diferente (limite de ELEMENTOS do getInfo, nao de memoria de raster), mas tem que
    cair no mesmo particionamento em semestres, nao virar ano inteiro perdido."""
    chamadas = []

    def _por_periodo_falso(fc, inicio, fim):
        chamadas.append((inicio, fim))
        if (inicio, fim) == ("2019-01-01", "2020-01-01"):
            raise ndvi_serie.ee.EEException("Collection query aborted after accumulating over 5000 elements.")
        return [{"km_marco_m": 0, "data_imagem": inicio, "ndvi_mediana": 0.5, "n_pixels": 10, "nuvem_pct": 0.1}]

    monkeypatch.setattr(ndvi_serie, "_por_periodo", _por_periodo_falso)
    saida = ndvi_serie._por_ano(fc=object(), ano=2019)
    assert chamadas == [("2019-01-01", "2020-01-01"), ("2019-01-01", "2019-07-01"), ("2019-07-01", "2020-01-01")]
    assert len(saida) == 2


def test_por_ano_nao_engole_erro_que_nao_e_de_payload(monkeypatch):
    """Um EEException generico (rede fora, projeto sem permissao, etc.) NAO pode ser tratado como
    estouro de payload e silenciosamente virar uma tentativa de particionamento em semestres --
    tem que subir para quem chamou (a retentativa em `_por_ano_com_retentativa` e o unico lugar
    que trata falha, e ela precisa do erro real para decidir)."""
    def _por_periodo_falso(fc, inicio, fim):
        raise ndvi_serie.ee.EEException("permission denied")

    monkeypatch.setattr(ndvi_serie, "_por_periodo", _por_periodo_falso)
    with pytest.raises(ndvi_serie.ee.EEException, match="permission denied"):
        ndvi_serie._por_ano(fc=object(), ano=2022)


def test_por_ano_sem_estouro_faz_uma_chamada_so_para_o_ano_inteiro():
    def _por_periodo_falso(fc, inicio, fim):
        return [{"marcador": (inicio, fim)}]

    saida_original = ndvi_serie._por_periodo
    ndvi_serie._por_periodo = _por_periodo_falso
    try:
        saida = ndvi_serie._por_ano(fc=object(), ano=2022)
    finally:
        ndvi_serie._por_periodo = saida_original
    assert saida == [{"marcador": ("2022-01-01", "2023-01-01")}]


# ----------------------------------------------------------------------
# _por_ano_com_retentativa -- uma tentativa extra antes de desistir do ano
# ----------------------------------------------------------------------
def test_retentativa_recupera_de_uma_falha_transitoria(monkeypatch):
    chamadas = {"n": 0}

    def _por_ano_falso(fc, ano):
        chamadas["n"] += 1
        if chamadas["n"] == 1:
            raise RuntimeError("rate limit transitorio")
        return [{"ok": True}]

    monkeypatch.setattr(ndvi_serie, "_por_ano", _por_ano_falso)
    monkeypatch.setattr(ndvi_serie.time, "sleep", lambda _s: None)   # nao esperar 20s de verdade no teste
    saida = ndvi_serie._por_ano_com_retentativa(fc=object(), ano=2022)
    assert saida == [{"ok": True}] and chamadas["n"] == 2


def test_retentativa_propaga_erro_se_as_duas_tentativas_falharem():
    def _por_ano_falso(fc, ano):
        raise RuntimeError("falha persistente")

    original = ndvi_serie._por_ano
    original_sleep = ndvi_serie.time.sleep
    ndvi_serie._por_ano = _por_ano_falso
    ndvi_serie.time.sleep = lambda _s: None
    try:
        with pytest.raises(RuntimeError, match="falha persistente"):
            ndvi_serie._por_ano_com_retentativa(fc=object(), ano=2022)
    finally:
        ndvi_serie._por_ano = original
        ndvi_serie.time.sleep = original_sleep
