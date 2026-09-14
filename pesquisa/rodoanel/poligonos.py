"""Os 642 poligonos de classificacao_rocada.kmz: metodo de rocada e area, nao especie.

Duas armadilhas medidas (docs/PLANO_MOTIVA.md 4.1 e 4.2):
  - o arquivo tem extensao .kmz mas e XML puro: abre-se com ElementTree, nao com zipfile;
  - o <Schema> declara classe, KM, Latitude, Longitude, Area_m2, mas os SimpleData
    gravados estao deslocados: name="classe" traz a LATITUDE, name="KM" traz a
    LONGITUDE e name="Latitude" traz a AREA em m2. A classe verdadeira esta em
    <name> e o km inteiro em <description>.

Buracos (aneis internos): 49 dos 642 placemarks tem <innerBoundaryIs>, somando
~123.000 m2 (12,5% da area total) que precisam ser DESCONTADOS da area do anel
externo. O campo area_m2 (Latitude deslocado) ja vem liquido -- ja desconta os
buracos no proprio arquivo (conferido no placemark 17: area declarada 170,0 m2,
anel externo sozinho 234,5 m2, externo menos interno 169,6 m2) -- entao
area_rocada_m2 em producao nao muda com isso.

O que muda e a GEOMETRIA. `aneis` guarda so os aneis externos, de proposito:
a Tarefa 14 monta `ee.Geometry.MultiPolygon(coords=[[a] for a in lista])`, que
trata cada anel da lista como um poligono externo independente. Se os buracos
fossem simplesmente anexados em `aneis`, virariam area ADITIVA (pior que
ignora-los: infla a mascara em vez de furar). Por isso os buracos ficam num
campo separado, `aneis_internos`, para quem for montar a geometria descontar
explicitamente -- nao para serem somados.
"""
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
import xml.etree.ElementTree as ET

from .marcos import Eixo

NS = {"k": "http://www.opengis.net/kml/2.2"}
METODOS = (
    "Spider, Giro-Zero ou Trator com trincheira",
    "Apenas manual",
    "Trator com braço articulado",
    "Spider, com ancoragem",
)


@dataclass(frozen=True)
class Poligono:
    indice: int
    metodo: str
    km_descricao: int
    latitude: float
    longitude: float
    area_m2: float
    aneis: tuple[tuple[tuple[float, float], ...], ...]   # SO externos: ((lon, lat), ...) cada anel
    aneis_internos: tuple[tuple[tuple[float, float], ...], ...]   # buracos a subtrair; ver docstring do modulo


def _anel(texto: str) -> tuple[tuple[float, float], ...]:
    pontos = []
    for trio in texto.strip().split():
        lon, lat, *_ = (float(x) for x in trio.split(","))
        pontos.append((lon, lat))
    return tuple(pontos)


def ler_poligonos(caminho: str | Path) -> list[Poligono]:
    raiz = ET.parse(caminho).getroot()
    saida: list[Poligono] = []
    for i, pm in enumerate(raiz.findall(".//k:Placemark", NS)):
        metodo = (pm.findtext("k:name", default="", namespaces=NS) or "").strip()
        if metodo not in METODOS:
            raise ValueError(f"placemark {i}: metodo desconhecido {metodo!r}")
        km = int((pm.findtext("k:description", default="0", namespaces=NS) or "0").strip())
        dados = {s.get("name"): s.text for s in pm.findall(".//k:SimpleData", NS)}
        aneis = tuple(_anel(c.text) for c in pm.findall(".//k:outerBoundaryIs//k:coordinates", NS))
        if not aneis:
            raise ValueError(f"placemark {i}: sem anel externo")
        # Buracos (49 dos 642 placemarks): guardados a parte, nunca anexados a
        # `aneis` -- ver a nota do docstring do modulo sobre por que isso e
        # deliberado (area_rocada_m2 no arquivo ja e liquida; a geometria e
        # que precisa da subtracao explicita, feita por quem consumir este campo).
        aneis_internos = tuple(_anel(c.text) for c in pm.findall(".//k:innerBoundaryIs//k:coordinates", NS))
        saida.append(Poligono(
            indice=i, metodo=metodo, km_descricao=km,
            latitude=float(dados["classe"]),      # deslocado: e a latitude
            longitude=float(dados["KM"]),         # deslocado: e a longitude
            area_m2=float(dados["Latitude"]),     # deslocado: e a area
            aneis=aneis,
            aneis_internos=aneis_internos,
        ))
    return saida


def marco_de(km_m: float) -> int:
    """Marco da planilha (0, 500, ..., 29000, 29300) que cobre o km dado em metros.

    Os dois ultimos marcos dividem os 300 m finais: 29000 cobre [29000, 29150) e
    29300 cobre [29150, 29300]. Ver a spec 3, decisao 7.
    """
    if km_m >= 29_150:
        return 29_300
    return int(max(0.0, min(29_000.0, math.floor(km_m / 500.0) * 500.0)))


def atribuir(poligonos: list[Poligono], eixo: Eixo) -> dict[int, tuple[int, float]]:
    """indice -> (marco, distancia do centroide ao eixo em m).

    Atencao entre os km 23 e 26: a Motiva nao tem marco nesse trecho (a maior
    lacuna do eixo reordenado, ~2.042 m, fica entre os marcos originais 22 e
    23 -- ver marcos.py), entao o eixo vira uma corda reta onde a rodovia de
    verdade faz curva. A corda e mais curta que a estrada, o chainage arrasta
    e a atribuicao de metodo/area por marco fica menos confiavel exatamente
    nesse trecho (54 dos 70 poligonos que discordam da descricao continua do
    km estao ali -- ver test_concordancia_continua_e_a_lacuna_do_eixo). Nao e
    defeito de projecao (a pior distancia ao eixo do lote, poligono 596, fica
    a so 18 m -- bem abaixo da mediana de 56 m); e limitacao de dado: 30
    marcos nao da pra cobrir 29,3 km sem aproximar em algum trecho.
    """
    saida = {}
    for p in poligonos:
        km_m, dist = eixo.km_planilha(p.latitude, p.longitude)
        saida[p.indice] = (marco_de(km_m), dist)
    return saida


def resumo_por_marco(poligonos: list[Poligono], atribuicao: dict[int, tuple[int, float]]) -> dict[int, dict]:
    areas: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    n: dict[int, int] = defaultdict(int)
    for p in poligonos:
        marco = atribuicao[p.indice][0]
        areas[marco][p.metodo] += p.area_m2
        n[marco] += 1
    saida = {}
    for marco, por_metodo in areas.items():
        dominante = max(por_metodo.items(), key=lambda kv: kv[1])[0]
        saida[marco] = {
            "metodo_dominante": dominante,
            "area_total_m2": round(sum(por_metodo.values()), 1),
            "areas": {k: round(v, 1) for k, v in sorted(por_metodo.items())},
            "n_poligonos": n[marco],
        }
    return saida
