import math
from collections import Counter, defaultdict

import pytest

from pesquisa.rodoanel import ARQ_MARCOS, ARQ_POLIGONOS, marcos, poligonos

# A Tarefa 6 ainda nao existe: `from pesquisa.rodoanel.segmentos import MARCOS` falharia.
# Ate la, o substituto literal indicado no brief (mesmo conjunto de marcos: 0, 500, ..., 29000, 29300).
MARCOS = set(range(0, 29_001, 500)) | {29_300}


@pytest.fixture(scope="module")
def pols():
    return poligonos.ler_poligonos(ARQ_POLIGONOS)


@pytest.fixture(scope="module")
def eixo():
    return marcos.carregar(ARQ_MARCOS)


def test_642_poligonos_nas_4_classes(pols):
    assert len(pols) == 642
    assert Counter(p.metodo for p in pols) == {
        "Apenas manual": 342,
        "Spider, Giro-Zero ou Trator com trincheira": 180,
        "Trator com braço articulado": 106,
        "Spider, com ancoragem": 14,
    }


def test_metodos_e_exatamente_as_4_classes_da_planilha():
    """poligonos.METODOS e o simbolo publico que ler_poligonos() usa para validar
    o <name> de cada placemark. Testa-lo direto (e nao so via Counter acima)
    pega uma METODOS com uma classe a mais, faltando, ou com grafia diferente
    da que o arquivo real usa -- ler_poligonos so rejeitaria isso se o arquivo
    tivesse uma classe fora do conjunto, o que nao e o caso aqui.
    """
    assert set(poligonos.METODOS) == {
        "Apenas manual",
        "Spider, Giro-Zero ou Trator com trincheira",
        "Trator com braço articulado",
        "Spider, com ancoragem",
    }
    assert len(poligonos.METODOS) == 4


def test_area_total_medida(pols):
    assert abs(sum(p.area_m2 for p in pols) - 981_817) < 1.0


def test_areas_por_metodo_medidas_em_13_09_2026(pols):
    """A soma total (teste acima) passaria mesmo com area trocada entre metodos
    (duas classes com erro oposto que se cancela na soma geral). A quebra por
    metodo, medida no espec (3.5.1), pega esse caso.
    """
    areas = defaultdict(float)
    for p in pols:
        areas[p.metodo] += p.area_m2
    assert abs(areas["Apenas manual"] - 274_000) < 500
    assert abs(areas["Spider, Giro-Zero ou Trator com trincheira"] - 664_000) < 500
    assert abs(areas["Trator com braço articulado"] - 41_000) < 500
    assert abs(areas["Spider, com ancoragem"] - 2_000) < 500


def test_esquema_deslocado_le_lat_lon_area_certos(pols):
    p = pols[0]
    assert -23.7 < p.latitude < -23.3
    assert -46.9 < p.longitude < -46.6
    assert p.area_m2 > 0
    assert len(p.aneis) >= 1 and len(p.aneis[0]) >= 4


def test_esquema_deslocado_bate_com_o_primeiro_placemark_do_arquivo_real(pols):
    """O teste acima usa faixas largas o bastante para passar mesmo com uma
    remapeacao diferente da descrita no brief (por exemplo lat/lon trocados
    entre si, ja que ambos caem em faixas plausiveis para o Rodoanel). Este
    confere os valores exatos lidos manualmente do primeiro <Placemark> do
    arquivo (SimpleData name="classe"/"KM"/"Latitude" deslocados), incluindo
    a ordem (lon, lat) dentro do primeiro anel -- pega uma inversao lon/lat
    dentro do anel, que o teste de "len(aneis[0]) >= 4" nao pegaria.
    """
    p = pols[0]
    assert math.isclose(p.latitude, -23.41766405782872, abs_tol=1e-9)
    assert math.isclose(p.longitude, -46.732540934292, abs_tol=1e-9)
    assert math.isclose(p.area_m2, 33.3059936967473, abs_tol=1e-9)
    assert p.metodo == "Spider, Giro-Zero ou Trator com trincheira"
    assert p.km_descricao == 0
    primeiro_ponto = p.aneis[0][0]
    assert math.isclose(primeiro_ponto[0], -46.7325523775956, abs_tol=1e-9)   # lon
    assert math.isclose(primeiro_ponto[1], -23.4176621760433, abs_tol=1e-9)   # lat


def test_area_declarada_bate_com_a_area_geometrica_do_anel(pols):
    """area_m2 vem do SimpleData deslocado (name="Latitude"). Cruza com a area
    calculada a partir do proprio anel de coordenadas (formula do shoelace,
    projetada em metros por um plano local equiretangular) para os 5 primeiros
    poligonos -- confere que o campo realmente representa a area do poligono,
    e nao outro numero plausivel qualquer.
    """
    for p in pols[:5]:
        anel = p.aneis[0]
        lat0 = anel[0][1]
        kx = 111_320.0 * math.cos(math.radians(lat0))
        ky = 110_574.0
        pontos_m = [((lon - anel[0][0]) * kx, (lat - lat0) * ky) for lon, lat in anel]
        soma = 0.0
        for (x1, y1), (x2, y2) in zip(pontos_m, pontos_m[1:] + pontos_m[:1]):
            soma += x1 * y2 - x2 * y1
        area_geometrica = abs(soma) / 2.0
        assert math.isclose(area_geometrica, p.area_m2, rel_tol=0.05, abs_tol=1.0)


def test_marco_de():
    assert poligonos.marco_de(0) == 0
    assert poligonos.marco_de(499) == 0
    assert poligonos.marco_de(500) == 500
    assert poligonos.marco_de(29_149) == 29_000
    assert poligonos.marco_de(29_150) == 29_300
    assert poligonos.marco_de(31_000) == 29_300
    assert poligonos.marco_de(-40) == 0


def test_atribuicao_concorda_com_a_descricao(pols, eixo):
    atrib = poligonos.atribuir(pols, eixo)
    assert set(atrib) == {p.indice for p in pols}
    assert all(m in MARCOS for m, _ in atrib.values())
    concordam = sum(1 for p in pols if abs(atrib[p.indice][0] // 1000 - p.km_descricao) <= 1)
    # Medido no espec (12): 642 de 642 (100%). O espec aceita >= 95%, mas para
    # este arquivo especifico o numero real e 100% -- um resultado abaixo disso
    # e sinal de erro, nao motivo para relaxar o teste ate ele passar.
    assert concordam == len(pols)


def test_distancia_ao_eixo_bate_com_a_mediana_p90_e_maximo_medidos(pols, eixo):
    """O espec (12) mediu mediana 56 m, p90 204 m e maximo 930 m de distancia do
    centroide ao eixo. Nenhum teste do brief original cobria essas distancias:
    atribuir() poderia devolver a distancia errada (por exemplo sempre 0, ou a
    distancia ao longo do eixo em vez de perpendicular) sem que nenhum teste
    percebesse, contanto que o marco escolhido continuasse coerente.
    """
    atrib = poligonos.atribuir(pols, eixo)
    distancias = sorted(d for _, d in atrib.values())
    n = len(distancias)

    def percentil(q):
        idx = q * (n - 1)
        i = int(idx)
        j = min(i + 1, n - 1)
        return distancias[i] + (distancias[j] - distancias[i]) * (idx - i)

    mediana = percentil(0.5)
    p90 = percentil(0.9)
    maximo = distancias[-1]
    assert math.isclose(mediana, 56, abs_tol=3)
    assert math.isclose(p90, 204, abs_tol=5)
    assert math.isclose(maximo, 930, abs_tol=3)


def test_resumo_por_marco(pols, eixo):
    atrib = poligonos.atribuir(pols, eixo)
    resumo = poligonos.resumo_por_marco(pols, atrib)
    assert abs(sum(r["area_total_m2"] for r in resumo.values()) - 981_817) < 1.0
    assert all(r["metodo_dominante"] in poligonos.METODOS for r in resumo.values())
    assert set(resumo) <= MARCOS
    # n_poligonos por marco tem que bater com uma contagem independente feita
    # aqui a partir de atrib, e a soma tem que cobrir os 642 poligonos: pega um
    # resumo_por_marco que perca ou duplique poligonos ao agrupar.
    contagem_independente = Counter(marco for marco, _ in atrib.values())
    assert {marco: r["n_poligonos"] for marco, r in resumo.items()} == dict(contagem_independente)
    assert sum(r["n_poligonos"] for r in resumo.values()) == len(pols)
