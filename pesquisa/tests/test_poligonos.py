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


def _area_do_anel_m2(anel):
    lat0 = anel[0][1]
    kx = 111_320.0 * math.cos(math.radians(lat0))
    ky = 110_574.0
    pontos_m = [((lon - anel[0][0]) * kx, (lat - lat0) * ky) for lon, lat in anel]
    soma = 0.0
    for (x1, y1), (x2, y2) in zip(pontos_m, pontos_m[1:] + pontos_m[:1]):
        soma += x1 * y2 - x2 * y1
    return abs(soma) / 2.0


def test_area_declarada_bate_com_a_area_geometrica_do_anel(pols):
    """area_m2 vem do SimpleData deslocado (name="Latitude"). Cruza com a area
    calculada a partir do proprio anel de coordenadas (formula do shoelace,
    projetada em metros por um plano local equiretangular), independente da
    conta de ler_poligonos, para os 5 primeiros poligonos e para o poligono
    17 (indice confirmado com buraco) -- confere que o campo realmente
    representa a area do poligono, e nao outro numero plausivel qualquer.

    Os 5 primeiros nao tem buraco (aneis_internos vazio), entao area externa
    sozinha basta. O poligono 17 tem: area declarada 170,0 m2, anel externo
    sozinho 234,5 m2, externo menos o buraco 169,6 m2 -- ou seja, comparar so
    com o anel externo (sem subtrair aneis_internos) erraria por ~38% aqui.
    Antes desta correcao o teste amostrava so pols[:5], nenhum dos quais tem
    buraco: passava por sorte de ordenacao, sem nunca exercitar o caso que
    aneis_internos existe para cobrir.
    """
    for p in [pols[0], pols[1], pols[2], pols[3], pols[4], pols[17]]:
        area_externa = sum(_area_do_anel_m2(anel) for anel in p.aneis)
        area_buracos = sum(_area_do_anel_m2(anel) for anel in p.aneis_internos)
        area_geometrica = area_externa - area_buracos
        assert math.isclose(area_geometrica, p.area_m2, rel_tol=0.05, abs_tol=1.0)


def test_aneis_internos_guarda_os_buracos_sem_infla_los_em_aneis(pols):
    """aneis_internos e um campo separado por decisao de design (ver docstring
    do modulo): a Tarefa 14 trata cada entrada de `aneis` como um poligono
    externo independente, entao anexar buracos ali os tornaria area aditiva
    em vez de subtrativa. Este teste fixa os dois lados dessa garantia contra
    o arquivo real: um poligono sem buraco tem aneis_internos vazio (e aneis
    continua so com o externo), e o poligono 17 (buraco confirmado) tem
    exatamente 1 anel interno, com os pontos certos -- nao teria pego uma
    implementacao que jogasse os buracos dentro de `aneis` por engano, ja que
    nesse caso aneis_internos ficaria vazio para todo mundo (silenciosamente).
    """
    assert pols[0].aneis_internos == ()
    assert len(pols[0].aneis) == 1

    buracos = pols[17].aneis_internos
    assert len(buracos) == 1
    assert len(pols[17].aneis) == 1        # o buraco nao foi parar em aneis
    assert len(buracos[0]) == 22
    primeiro_ponto = buracos[0][0]
    assert math.isclose(primeiro_ponto[0], -46.7347387146605, abs_tol=1e-9)   # lon
    assert math.isclose(primeiro_ponto[1], -23.4081360882573, abs_tol=1e-9)   # lat


def test_total_de_area_com_buraco_e_medido_em_13_09_2026(pols):
    """Contagem e area total dos buracos medidos no arquivo real: 49 dos 642
    placemarks tem <innerBoundaryIs>, somando ~123.000 m2 (12,5% da area
    total de 981.817 m2). Nao afeta area_m2 (ja liquido no arquivo), mas
    fixa o tamanho do problema que a geometria de `aneis` sozinha teria: uma
    mascara so com aneis externos infla a area mascarada em ~12,5%.
    """
    com_buraco = [p for p in pols if p.aneis_internos]
    area_buracos = sum(_area_do_anel_m2(a) for p in pols for a in p.aneis_internos)
    assert len(com_buraco) == 49
    assert math.isclose(area_buracos, 123_000, rel_tol=0.02)


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


def test_concordancia_continua_e_a_lacuna_do_eixo(pols, eixo):
    """A metrica acima (marco_de(km_m) // 1000, tolerancia de 1 km) e a do
    espec e bate 100% -- mas ela passa por marco_de(), que ja arredonda para
    baixo em passos de 500 m antes de comparar. Uma metrica continua (km_m
    direto, sem passar por marco_de nem por floor/round, mesma tolerancia de
    1 km) e bem mais exigente e da 572/642 (89,1%): nao e um numero pior por
    acaso, e um numero explicavel.

    Dos 70 poligonos que discordam nessa metrica continua, 54 (77%) tem
    km_descricao em {23, 25, 26} -- exatamente o trecho onde o eixo reordenado
    tem sua unica lacuna real (~2.042 m, entre os marcos originais 22 e 23,
    equivalente a km_planilha ~23,67-25,73: ver marcos.py e o comentario em
    atribuir()). Ali o eixo e uma corda reta onde a estrada de verdade faz
    curva, entao o chainage arrasta. Nao e erro de projecao: a pior distancia
    ao eixo do lote inteiro (poligono 596) fica a so 18 m, bem abaixo da
    mediana geral de 56 m -- e 30 marcos para 29,3 km e o que da para fazer.

    Este teste registra esse 572/642 como propriedade conhecida e explicada,
    nao como meta a maximizar: se ela mudar, e sinal de que o eixo, a leitura
    do <description> ou a escala mudaram, nao que a tolerancia deva ser
    ajustada para continuar batendo.
    """
    discordantes = []
    for p in pols:
        km_m_continuo, _dist = eixo.km_planilha(p.latitude, p.longitude)
        continuo = km_m_continuo / 1000.0
        if abs(continuo - p.km_descricao) > 1:
            discordantes.append(p)

    concordam_continuo = len(pols) - len(discordantes)
    assert concordam_continuo == 572

    na_lacuna = sum(1 for p in discordantes if p.km_descricao in (23, 25, 26))
    assert na_lacuna == 54
    assert na_lacuna / len(discordantes) > 0.75


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
