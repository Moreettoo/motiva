"""Geometria por segmento: a uniao dos poligonos do KML atribuidos ao marco.

E a area rocavel desenhada pela propria concessionaria, sem asfalto. Usa-la como
mascara e o que ataca o pixel misto de 10 m (docs/PLANO_MOTIVA.md 4.6) sem
inventar buffer.

Desvio do brief original (Tarefa 5 achou buracos depois que a Tarefa 14 foi
escrita): 49 dos 642 poligonos tem aneis internos (buracos), ~123.000 m2, 12,5%
da area rocavel -- ver o docstring de `poligonos.py`. `Poligono.aneis` guarda
so os externos (1 por poligono) e `Poligono.aneis_internos` guarda os buracos
em separado, de proposito: se os buracos fossem tratados como poligonos
externos independentes (a construcao `MultiPolygon(coords=[[a] for a in
lista])` do brief original), eles virariam area ADITIVA em vez de subtrativa
-- pior que ignora-los.

Por isso `aneis_por_marco` NAO devolve mais uma lista de aneis por marco; ela
devolve, por marco, uma lista de POLIGONOS (um por Poligono do KML atribuido
aquele marco), e cada poligono e uma lista de ANEIS fechados [lon, lat]: o anel
externo primeiro, seguido dos seus PROPRIOS buracos (nunca dos buracos de outro
poligono do mesmo marco). Formato exato:

    dict[marco] -> [poligono, poligono, ...]
    poligono    -> [anel_externo, buraco_1, buraco_2, ...]
    anel        -> [[lon, lat], [lon, lat], ..., [lon, lat]]   # fechado

que e literalmente o formato de coordenadas de `ee.Geometry.Polygon`/
`ee.Geometry.MultiPolygon` para um poligono com buraco: cada poligono aqui vira
um item da lista de poligonos do MultiPolygon, com o buraco subtraido pelo
proprio Earth Engine (regra do "even-odd"/anel externo menos internos).
"""
from __future__ import annotations

from pesquisa.rodoanel.poligonos import Poligono


def _fechar(anel):
    pts = [[lon, lat] for lon, lat in anel]
    if pts[0] != pts[-1]:
        pts.append(pts[0])
    return pts


def aneis_por_marco(poligonos: list[Poligono], atribuicao: dict[int, tuple[int, float]]) -> dict[int, list[list[list[list[float]]]]]:
    """marco -> lista de poligonos; poligono -> lista de aneis fechados [lon, lat]
    (anel externo primeiro, seus proprios buracos depois). Ver o docstring do
    modulo para o formato exato e por que os buracos vao dentro do proprio
    poligono, nunca pooled com os de outro poligono do mesmo marco.
    """
    saida: dict[int, list] = {}
    for p in poligonos:
        marco = atribuicao[p.indice][0]
        if not p.aneis or len(p.aneis[0]) < 3:
            continue
        poligono = [_fechar(p.aneis[0])] + [_fechar(a) for a in p.aneis_internos if len(a) >= 3]
        saida.setdefault(marco, []).append(poligono)
    return saida


def feature_collection(aneis: dict[int, list[list[list[list[float]]]]]):
    import ee
    feats = [ee.Feature(ee.Geometry.MultiPolygon(coords=lista, geodesic=False), {"km_marco_m": m})
             for m, lista in sorted(aneis.items())]
    return ee.FeatureCollection(feats)
