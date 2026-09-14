import math

import pytest

from pesquisa.rodoanel import ARQ_MARCOS, marcos


@pytest.fixture(scope="module")
def eixo():
    return marcos.carregar(ARQ_MARCOS)


def test_sao_30_marcos_e_a_ordem_corrigida_e_permutacao():
    assert len(marcos.ler_marcos(ARQ_MARCOS)) == 30
    assert sorted(marcos.ORDEM_CORRIGIDA) == list(range(30))


def test_reordenado_o_eixo_tem_29_km_e_nenhum_salto_absurdo(eixo):
    assert 28_975 <= eixo.comprimento_m <= 29_075          # medido: 29.025 m
    passos = [b - a for a, b in zip(eixo.chainage, eixo.chainage[1:])]
    assert max(passos) <= 2_100                              # a unica lacuna real: 2.042 m
    assert min(passos) >= 500


def test_na_ordem_do_arquivo_o_eixo_seria_absurdo():
    brutos = marcos.ler_marcos(ARQ_MARCOS)
    total = sum(marcos.haversine_m(a, b) for a, b in zip(brutos, brutos[1:]))
    assert total > 45_000                                    # medido: 48.482 m


def test_escala_para_o_km_da_planilha(eixo):
    assert math.isclose(eixo.escala, 29_300 / 29_025, rel_tol=2e-3)


def test_posicao_nas_pontas(eixo):
    assert eixo.posicao(0) == eixo.pontos[0]
    lat, lon = eixo.posicao(29_300)
    assert math.isclose(lat, eixo.pontos[-1][0], abs_tol=1e-6)
    assert math.isclose(lon, eixo.pontos[-1][1], abs_tol=1e-6)


def test_posicao_do_km_15_medida(eixo):
    lat, lon = eixo.posicao(15_000)
    assert math.isclose(lat, -23.515647, abs_tol=2e-4)
    assert math.isclose(lon, -46.817408, abs_tol=2e-4)


def test_projetar_um_marco_devolve_o_proprio_chainage(eixo):
    lat, lon = eixo.pontos[10]
    c, d = eixo.projetar(lat, lon)
    assert math.isclose(c, eixo.chainage[10], abs_tol=1.0)
    assert d < 1.0
