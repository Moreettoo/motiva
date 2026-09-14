import math

import pytest

from pesquisa.rodoanel import ARQ_MARCOS, marcos

# As tres coordenadas de referencia do espec de design (2026-09-13-dados-reais-rodoanel-design.md 2), planilha -> lat/lon.
REF_KM_0 = (-23.416207, -46.736768)
REF_KM_15000 = (-23.515647, -46.817408)
REF_KM_29300 = (-23.632539, -46.831841)


@pytest.fixture(scope="module")
def eixo():
    return marcos.carregar(ARQ_MARCOS)


def test_sao_30_marcos_e_a_ordem_corrigida_e_permutacao():
    assert len(marcos.ler_marcos(ARQ_MARCOS)) == 30
    assert sorted(marcos.ORDEM_CORRIGIDA) == list(range(30))


def test_ordem_corrigida_e_exatamente_a_do_espec():
    """[0..7] + [29] + [8, 9] + [28] + [10..27] -- ver PLANO_MOTIVA.md 4.3.

    Fixa os valores da permutacao, e nao so a propriedade "e uma permutacao":
    uma ordem diferente, mas ainda valida como permutacao de 0..29, passaria
    no teste acima sem passar neste.
    """
    esperado = (0, 1, 2, 3, 4, 5, 6, 7, 29, 8, 9, 28, 10, 11, 12, 13, 14, 15,
                16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27)
    assert marcos.ORDEM_CORRIGIDA == esperado


def test_reordenado_o_eixo_tem_29_km_e_nenhum_salto_absurdo(eixo):
    assert 28_975 <= eixo.comprimento_m <= 29_075          # medido: 29.025 m
    passos = [b - a for a, b in zip(eixo.chainage, eixo.chainage[1:])]
    # A unica lacuna real do arquivo mede 2.042 m: e dado real (marcos que
    # nao existem no meio do caminho), nao um erro a suavizar ou interpolar.
    # Pinada dos dois lados: nem menor (lacuna apagada), nem maior.
    assert math.isclose(max(passos), 2_042, abs_tol=5)
    assert min(passos) >= 500


def test_a_lacuna_de_2042_m_fica_entre_os_marcos_originais_22_e_23(eixo):
    """A lacuna real (ver docstring do modulo / PLANO_MOTIVA.md 4.3) tem
    localizacao fixa: entre os indices originais 22 e 23 do arquivo. Se a
    reordenacao mudar e essa lacuna se mover ou desaparecer, este teste falha
    mesmo que o tamanho maximo do passo continue por perto de 2.042 m.
    """
    passos = [b - a for a, b in zip(eixo.chainage, eixo.chainage[1:])]
    i = passos.index(max(passos))
    assert (marcos.ORDEM_CORRIGIDA[i], marcos.ORDEM_CORRIGIDA[i + 1]) == (22, 23)
    assert math.isclose(passos[i], 2_042, abs_tol=5)


def test_na_ordem_do_arquivo_o_eixo_seria_absurdo():
    brutos = marcos.ler_marcos(ARQ_MARCOS)
    total = sum(marcos.haversine_m(a, b) for a, b in zip(brutos, brutos[1:]))
    assert total > 45_000                                    # medido: 48.482 m


def test_escala_para_o_km_da_planilha(eixo):
    assert math.isclose(eixo.escala, 29_300 / 29_025, rel_tol=2e-3)


def test_posicao_bate_com_as_referencias_absolutas_do_espec(eixo):
    """Compara `posicao()` contra as coordenadas de referencia do espec, nao
    contra `eixo.pontos` -- comparar com `pontos[0]`/`pontos[-1]` seria
    verdadeiro por construcao (posicao(0) devolve pontos[0] qualquer que seja
    a permutacao usada), e nao pegaria uma ORDEM_CORRIGIDA sutilmente errada.
    Distancia em metros (haversine), nao em graus: medido 0,04-0,05 m nos tres
    pontos, entao 5 m sobra folga mas ainda pega um erro real.
    """
    d0 = marcos.haversine_m(eixo.posicao(0), REF_KM_0)
    d15000 = marcos.haversine_m(eixo.posicao(15_000), REF_KM_15000)
    d29300 = marcos.haversine_m(eixo.posicao(29_300), REF_KM_29300)
    assert d0 < 5.0
    assert d15000 < 5.0
    assert d29300 < 5.0


def test_projetar_um_marco_devolve_o_proprio_chainage(eixo):
    lat, lon = eixo.pontos[10]
    c, d = eixo.projetar(lat, lon)
    assert math.isclose(c, eixo.chainage[10], abs_tol=1.0)
    assert d < 1.0


def test_km_planilha_de_um_marco_bate_com_o_chainage_esperado(eixo):
    """km_planilha() e o metodo que a Tarefa 5 usa para os 642 centroides de
    poligono: um erro na aplicacao da escala (`c * self.escala`) tem que
    aparecer aqui. `projetar` calcula o chainage por uma metrica local plana,
    independente do haversine acumulado em `eixo.chainage` -- comparar os
    dois e um cruzamento real, nao so reler a mesma conta.
    """
    lat, lon = eixo.pontos[10]
    km_m, distancia_m = eixo.km_planilha(lat, lon)
    assert math.isclose(km_m, eixo.chainage[10] * eixo.escala, abs_tol=1.0)
    assert distancia_m < 1.0


def test_km_planilha_recupera_um_deslocamento_perpendicular_conhecido(eixo):
    """Desloca um ponto 50 m perpendicular ao eixo, no meio de um segmento
    real, e confere que km_planilha() recupera essa distancia e o km
    correspondente ao meio do segmento -- pega tanto uma escala errada
    (km_m fora do esperado) quanto uma projecao errada (distancia != 50 m).
    """
    idx = 10
    (la1, lo1), (la2, lo2) = eixo.pontos[idx], eixo.pontos[idx + 1]
    meio_lat, meio_lon = (la1 + la2) / 2, (lo1 + lo2) / 2
    kx = 111_320.0 * math.cos(math.radians(meio_lat))
    ky = 110_574.0
    seg_x, seg_y = (lo2 - lo1) * kx, (la2 - la1) * ky
    comprimento_seg = math.hypot(seg_x, seg_y)
    perp_x, perp_y = -seg_y / comprimento_seg, seg_x / comprimento_seg
    deslocamento_m = 50.0
    ponto_lat = meio_lat + (perp_y * deslocamento_m) / ky
    ponto_lon = meio_lon + (perp_x * deslocamento_m) / kx

    km_m, distancia_m = eixo.km_planilha(ponto_lat, ponto_lon)

    assert math.isclose(distancia_m, deslocamento_m, abs_tol=0.5)
    km_esperado = (eixo.chainage[idx] + comprimento_seg / 2) * eixo.escala
    assert math.isclose(km_m, km_esperado, abs_tol=5.0)
