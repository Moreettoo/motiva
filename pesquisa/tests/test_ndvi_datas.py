"""ndvi_datas.estatisticas() nao tinha nenhum teste no brief original -- e um
simbolo do Produces sem cobertura nenhuma, e foi exatamente essa funcao que
tinha os dois bugs reais da Tarefa 14 (ver comentarios da propria funcao):

1. `total` vinha de `ee.Image.constant(1)` sem projecao fixa: reduceRegions
   contava numa grade desalinhada da grade nativa do Sentinel-2.
2. `n` vinha do `count` do reducer COMBINADO (mean+median+percentile+count):
   esse `count`, medido contra um `ee.Reducer.count()` isolado na mesma
   imagem/geometria/escala, vem inflado por um fator variavel (~1,8x a 2,8x).

Juntos, os dois bugs faziam `nuvem_pct = 1 - n/total` sair negativo (ate
-139% na media dos 54 marcos) -- e olhando so pra esse numero durante a
selecao de imagem "menos nublada" o pipeline por vezes escolhia a imagem MAIS
nublada.

Este teste substitui `ee` por um duble que nao faz rede e que expoe os dois
bugs separadamente: a cadeia de `n` devolve um `count` OBVIAMENTE inflado
(bogus) se vier do reducer combinado, e so devolve o `n` correto se vier de
uma chamada separada com `ee.Reducer.count()` puro; a cadeia de `total` so
devolve contagens "alinhadas" (consistentes com `n`) se o codigo chamar
`.reproject(...)` com a projecao da banda B4 antes do reduceRegions. Se
qualquer um dos dois fixes for revertido, o teste falha no bound [0,1] ou na
igualdade exata de n_pixels.
"""
from __future__ import annotations

import pytest

from pesquisa.ndvi import ndvi_datas

# reducer combinado (mean+median+percentile+count): count OBVIAMENTE bogus
# (inflado), para provar que o codigo nao usa esse count para n_pixels.
_VALIDOS_REDUCER_COMBINADO = [
    {"properties": {"km_marco_m": 0, "mean": 0.5, "median": 0.5, "p10": 0.3, "p90": 0.7, "count": 999}},
    {"properties": {"km_marco_m": 500, "mean": 0.4, "median": 0.4, "p10": 0.2, "p90": 0.6, "count": 888}},
]
# chamada separada com ee.Reducer.count() puro: o n real.
_CONTAGEM_CORRETA = [
    {"properties": {"km_marco_m": 0, "count": 80}},
    {"properties": {"km_marco_m": 500, "count": 45}},
]
# grade alinhada a B4 (o reproject foi aplicado): total >= n sempre, como no
# mundo real (pixel valido e um subconjunto do total de pixels do poligono).
_TOTAIS_ALINHADOS = [
    {"properties": {"km_marco_m": 0, "count": 100}},
    {"properties": {"km_marco_m": 500, "count": 90}},
]
# grade desalinhada (bug 1 de volta, sem reproject): contagens sem relacao
# com a area real, inclusive abaixo de n -- so aparece se reproject() sumir.
_TOTAIS_DESALINHADOS = [
    {"properties": {"km_marco_m": 0, "count": 70}},
    {"properties": {"km_marco_m": 500, "count": 200}},
]


class _ReducerFalso:
    """`combinado` marca se este reducer passou por `.combine(...)` -- e o
    que diferencia `red` (mean+median+percentile+count) de um
    `ee.Reducer.count()` usado sozinho, mesmo que os dois acabem sendo usados
    na mesma imagem (`ndvi_img`)."""
    def __init__(self, combinado=False):
        self.combinado = combinado

    def combine(self, _outro, sharedInputs=True):
        return _ReducerFalso(combinado=True)


class _FeatureCollectionFalsa:
    def __init__(self, features):
        self._features = features

    def getInfo(self):
        return {"features": self._features}


class _ImageFalsa:
    """`kind="img"` e a imagem NDVI mascarada (usada tanto para o reducer
    combinado quanto para o count() isolado); `kind="total"` e a cadeia de
    `ee.Image.constant(1)`. `alinhada` so vira True depois de um
    `.reproject()` bem-sucedido na cadeia do total."""
    def __init__(self, kind, banda=None, alinhada=False):
        self.kind, self.banda, self.alinhada = kind, banda, alinhada

    def select(self, banda):
        return _ImageFalsa(self.kind, banda, self.alinhada)

    def projection(self):
        assert self.banda == "B4", "estatisticas tem que pedir a projecao da banda B4, nao de outra banda"
        return "projecao-b4-10m"

    def reproject(self, projecao):
        assert projecao == "projecao-b4-10m"
        return _ImageFalsa(self.kind, self.banda, alinhada=True)

    def lt(self, _v):
        return self

    def And(self, _o):
        return self

    def neq(self, _v):
        return self

    def updateMask(self, _m):
        return self

    def normalizedDifference(self, _bandas):
        return self

    def rename(self, _nome):
        return self

    def reduceRegions(self, collection, reducer, scale=None):
        if self.kind == "img":
            return _FeatureCollectionFalsa(_VALIDOS_REDUCER_COMBINADO if reducer.combinado else _CONTAGEM_CORRETA)
        return _FeatureCollectionFalsa(_TOTAIS_ALINHADOS if self.alinhada else _TOTAIS_DESALINHADOS)


class _EeFalso:
    class Image:
        @staticmethod
        def constant(_v):
            return _ImageFalsa("total")

    class Reducer:
        @staticmethod
        def mean():
            return _ReducerFalso()

        @staticmethod
        def median():
            return _ReducerFalso()

        @staticmethod
        def percentile(_ps):
            return _ReducerFalso()

        @staticmethod
        def count():
            return _ReducerFalso()


def test_estatisticas_ignora_o_count_inflado_do_reducer_combinado_e_usa_a_projecao_da_b4_no_total(monkeypatch):
    monkeypatch.setattr(ndvi_datas, "ee", _EeFalso)
    saida = ndvi_datas.estatisticas(_ImageFalsa("img"), fc=object())

    assert len(saida) == 2
    por_marco = {s["km_marco_m"]: s for s in saida}
    # n_pixels tem que vir do count() isolado (80/45), nunca do count bogus
    # do reducer combinado (999/888) -- e nuvem_pct exato, nao so "no
    # intervalo", para pegar tambem um erro de sinal ou reducer trocado.
    assert por_marco[0]["n_pixels"] == 80 and por_marco[0]["nuvem_pct"] == pytest.approx(0.2)
    assert por_marco[500]["n_pixels"] == 45 and por_marco[500]["nuvem_pct"] == pytest.approx(0.5)
    # mean/median/p10/p90 continuam vindo do reducer combinado normalmente.
    assert por_marco[0]["ndvi_medio"] == pytest.approx(0.5) and por_marco[0]["ndvi_mediana"] == pytest.approx(0.5)
    for s in saida:
        assert 0.0 <= s["nuvem_pct"] <= 1.0
        assert s["n_pixels"] <= (100 if s["km_marco_m"] == 0 else 90)   # n nunca passa do total


def test_estatisticas_total_zero_vira_nuvem_pct_none_em_vez_de_dividir_por_zero(monkeypatch):
    """Ramo de guarda ja existente (`total == 0`) que o brief cobria so por
    inspecao: sem teste, um reducer que devolvesse `total=0` faria
    `1 - n/total` estourar ZeroDivisionError em producao.
    """
    validos_com_zero = [{"properties": {"km_marco_m": 9999, "mean": 0.1, "median": 0.1, "p10": 0.1, "p90": 0.1, "count": 3}}]
    contagem_zero = [{"properties": {"km_marco_m": 9999, "count": 3}}]
    totais_zero = [{"properties": {"km_marco_m": 9999, "count": 0}}]

    class _ImagemTotalZero(_ImageFalsa):
        def reduceRegions(self, collection, reducer, scale=None):
            if self.kind == "img":
                return _FeatureCollectionFalsa(validos_com_zero if reducer.combinado else contagem_zero)
            return _FeatureCollectionFalsa(totais_zero)

    class _EeFalsoZero(_EeFalso):
        class Image:
            @staticmethod
            def constant(_v):
                return _ImagemTotalZero("total")

    monkeypatch.setattr(ndvi_datas, "ee", _EeFalsoZero)
    saida = ndvi_datas.estatisticas(_ImagemTotalZero("img"), fc=object())
    assert saida[0]["nuvem_pct"] is None
