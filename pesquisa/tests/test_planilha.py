from collections import Counter
from datetime import date

import pytest

from pesquisa.rodoanel import ARQ_LEV_1, ARQ_LEV_2, planilha


def test_data_vem_do_nome_do_arquivo():
    assert planilha.data_do_nome(ARQ_LEV_1.name) == date(2026, 3, 13)
    assert planilha.data_do_nome(ARQ_LEV_2.name) == date(2026, 3, 20)


def test_marcos_sao_60_de_0_a_29300():
    lev = planilha.ler(ARQ_LEV_1)
    assert len(lev.marcos) == 60
    assert lev.marcos[:3] == (0, 500, 1000)
    assert lev.marcos[-2:] == (29000, 29300)


def test_data_interna_e_template_nas_duas():
    lev1 = planilha.ler(ARQ_LEV_1)
    lev2 = planilha.ler(ARQ_LEV_2)
    assert lev1.data_interna == date(2025, 3, 28)
    assert lev2.data_interna == date(2025, 3, 28)
    assert lev1.data == date(2026, 3, 13)
    assert lev2.data == date(2026, 3, 20)


def test_contagens_medidas_em_13_09_2026():
    lev1 = planilha.ler(ARQ_LEV_1)
    lev2 = planilha.ler(ARQ_LEV_2)
    assert Counter(lev1.por_faixa("cant_lateral_externa").values()) == {1: 30, 2: 10, 3: 15, None: 5}
    assert Counter(lev1.por_faixa("cant_central_interna").values()) == {1: 36, 2: 5, 3: 7, None: 12}
    assert Counter(lev2.por_faixa("cant_lateral_externa").values()) == {1: 37, 2: 15, 3: 3, None: 5}
    assert Counter(lev2.por_faixa("cant_dispositivo_int").values()) == {1: 10, 3: 1, None: 49}


def test_faixas_sem_dado_vem_como_nao_se_aplica():
    lev = planilha.ler(ARQ_LEV_1)
    assert set(lev.por_faixa("marginal_externa").values()) == {None}
    assert set(lev.por_faixa("pista_interna").values()) == {None}


def test_total_de_observacoes_e_60_marcos_x_12_faixas():
    assert len(planilha.ler(ARQ_LEV_1).observacoes) == 720


def test_quatro_faixas_em_escopo():
    assert planilha.CODIGOS_EM_ESCOPO == {"cant_lateral_externa", "cant_central_externa",
                                          "cant_central_interna", "cant_lateral_interna"}


def test_valor_desconhecido_e_erro():
    with pytest.raises(ValueError):
        planilha._classe("7")


def test_classe_normaliza_ausencia_e_valores_validos():
    assert planilha._classe(None) is None
    assert planilha._classe("") is None
    assert planilha._classe("X") is None
    assert planilha._classe("x") is None
    assert planilha._classe(1) == 1
    assert planilha._classe(2) == 2
    assert planilha._classe(3) == 3


def test_classe_nao_inteira_e_erro():
    with pytest.raises(ValueError):
        planilha._classe(2.9)
    with pytest.raises(ValueError):
        planilha._classe("1.5")
