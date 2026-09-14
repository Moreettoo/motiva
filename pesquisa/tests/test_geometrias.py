import math

from pesquisa.rodoanel import ARQ_MARCOS, ARQ_POLIGONOS, marcos, poligonos
from pesquisa.rodoanel.segmentos import MARCOS
from pesquisa.ndvi import geometrias


def test_aneis_fechados_um_marco_por_poligono():
    pols = poligonos.ler_poligonos(ARQ_POLIGONOS)
    atrib = poligonos.atribuir(pols, marcos.carregar(ARQ_MARCOS))
    por_marco = geometrias.aneis_por_marco(pols, atrib)
    assert set(por_marco) <= set(MARCOS)
    # Cada um dos 642 Poligono do KML vira exatamente 1 poligono na saida (o
    # brief original pedia so ">= 642"; no arquivo real e igualdade exata,
    # porque nenhum anel externo e curto demais para ser descartado).
    assert sum(len(lista) for lista in por_marco.values()) == 642
    for lista in por_marco.values():
        for poligono in lista:
            for anel in poligono:
                assert anel[0] == anel[-1] and len(anel) >= 4
                assert all(-47 < lon < -46 and -24 < lat < -23 for lon, lat in anel)


def test_buracos_ficam_dentro_do_proprio_poligono_e_nao_pooled_no_marco():
    """Desvio do brief (ver docstring de geometrias.py): os 68 aneis internos
    de 49 poligonos tem que aparecer DENTRO do poligono a que pertencem, nunca
    anexados a outro poligono do mesmo marco nem tratados como poligono
    externo a parte.

    O poligono #17 do KML (buraco confirmado em
    test_poligonos.test_aneis_internos_guarda_os_buracos_sem_infla_los_em_aneis)
    cai no marco 0, que tem 40 poligonos, 10 deles com buraco (5, 9, 17, 18,
    22, 25, 27, 29, 30, 42 -- contagem independente feita para escrever este
    teste). Localiza o poligono 17 dentro de por_marco[0] pelo primeiro ponto
    do seu proprio anel externo (lido direto de `pols[17].aneis`, conferido
    contra o arquivo antes de usar como chave de busca) e confere que ele tem
    exatamente 2 aneis -- o externo e o seu unico buraco, nesta ordem -- e
    nao, por exemplo, 1 (buraco perdido) ou mais de 2 (buraco de outro
    poligono vazando para dentro deste).

    Os totais gerais (68 aneis internos, 49 poligonos com buraco, 593 sem)
    batem exatamente com poligonos.py: uma implementacao que so contasse
    poligonos (sem olhar o conteudo de cada lista de aneis) nao pegaria um
    buraco perdido ou duplicado que preservasse a contagem de poligonos.
    """
    pols = poligonos.ler_poligonos(ARQ_POLIGONOS)
    atrib = poligonos.atribuir(pols, marcos.carregar(ARQ_MARCOS))
    por_marco = geometrias.aneis_por_marco(pols, atrib)

    marco_17 = atrib[17][0]
    assert marco_17 == 0
    assert math.isclose(pols[17].aneis[0][0][0], -46.7347079552405, abs_tol=1e-9)
    assert math.isclose(pols[17].aneis[0][0][1], -23.4078504420677, abs_tol=1e-9)
    candidatos = [p for p in por_marco[marco_17]
                  if math.isclose(p[0][0][0], -46.7347079552405, abs_tol=1e-9)
                  and math.isclose(p[0][0][1], -23.4078504420677, abs_tol=1e-9)]
    assert len(candidatos) == 1
    poligono_17 = candidatos[0]
    assert len(poligono_17) == 2
    assert math.isclose(poligono_17[1][0][0], -46.7347387146605, abs_tol=1e-9)
    assert math.isclose(poligono_17[1][0][1], -23.4081360882573, abs_tol=1e-9)

    total_aneis_internos = sum(len(p) - 1 for lista in por_marco.values() for p in lista)
    total_com_buraco = sum(1 for lista in por_marco.values() for p in lista if len(p) > 1)
    total_sem_buraco = sum(1 for lista in por_marco.values() for p in lista if len(p) == 1)
    assert total_aneis_internos == 68
    assert total_com_buraco == 49
    assert total_sem_buraco == 642 - 49


def test_feature_collection_usa_a_lista_de_poligonos_direto_como_coords(monkeypatch):
    """feature_collection nao pode reembrulhar `aneis` (por exemplo com
    `[[a] for a in lista]`, a construcao do brief original): isso perderia os
    buracos, ja que cada poligono ja chega como [externo, buraco, ...] pronto
    para ser um item de MultiPolygon. Substitui `ee` por um duble para
    inspecionar exatamente os `coords` recebidos, sem depender de rede/GEE.
    """
    import types

    chamadas = []

    class GeometriaFalsa:
        def __init__(self, coords, geodesic):
            chamadas.append((coords, geodesic))

    class FeatureFalsa:
        def __init__(self, geom, props):
            self.geom, self.props = geom, props

    class FeatureCollectionFalsa(list):
        def __init__(self, feats):
            super().__init__(feats)

    ee_falso = types.SimpleNamespace(
        Geometry=types.SimpleNamespace(MultiPolygon=GeometriaFalsa),
        Feature=FeatureFalsa,
        FeatureCollection=FeatureCollectionFalsa,
    )
    monkeypatch.setitem(__import__("sys").modules, "ee", ee_falso)

    poligono_com_buraco = [[[0.0, 0.0], [0.0, 1.0], [1.0, 1.0], [0.0, 0.0]],
                            [[0.2, 0.2], [0.2, 0.4], [0.4, 0.4], [0.2, 0.2]]]
    aneis = {500: [poligono_com_buraco]}
    fc = geometrias.feature_collection(aneis)

    assert len(chamadas) == 1
    coords, geodesic = chamadas[0]
    assert coords == [poligono_com_buraco]     # passado direto, sem reembrulhar
    assert geodesic is False
    assert len(fc) == 1 and fc[0].props == {"km_marco_m": 500}
