"""Os 30 marcos de km (Marco km_rodoanel 2.kmz) e o eixo da rodovia que eles formam.

O arquivo E um zip de verdade (doc.kml dentro), ao contrario do de poligonos.
Os placemarks so tem coordenada. Dois deles (indices 28 e 29 do arquivo) estao
fora de ordem: sao os marcos que preenchem lacunas da sequencia. Ver
docs/PLANO_MOTIVA.md 4.3. Com a ordem corrigida o eixo mede 29.025 m, coerente
com os 29,3 km da planilha; na ordem do arquivo mediria 48 km.
"""
from __future__ import annotations

import math
import zipfile
from dataclasses import dataclass
from pathlib import Path
import xml.etree.ElementTree as ET

NS = {"k": "http://www.opengis.net/kml/2.2"}
ORDEM_CORRIGIDA = tuple(range(0, 8)) + (29,) + (8, 9) + (28,) + tuple(range(10, 28))
COMPRIMENTO_PLANILHA_M = 29_300.0
RAIO_TERRA_M = 6_371_008.8


def ler_marcos(caminho: str | Path) -> list[tuple[float, float]]:
    """(lat, lon) de cada placemark, na ordem do arquivo."""
    with zipfile.ZipFile(caminho) as z:
        nome = next(n for n in z.namelist() if n.lower().endswith(".kml"))
        raiz = ET.fromstring(z.read(nome))
    pontos = []
    for pm in raiz.findall(".//k:Placemark", NS):
        lon, lat, *_ = (float(x) for x in pm.find(".//k:coordinates", NS).text.strip().split(","))
        pontos.append((lat, lon))
    return pontos


def reordenar(pontos: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if len(pontos) != len(ORDEM_CORRIGIDA):
        raise ValueError(f"esperava {len(ORDEM_CORRIGIDA)} marcos, li {len(pontos)}")
    return [pontos[i] for i in ORDEM_CORRIGIDA]


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    la1, lo1 = map(math.radians, a)
    la2, lo2 = map(math.radians, b)
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * RAIO_TERRA_M * math.asin(math.sqrt(h))


@dataclass(frozen=True)
class Eixo:
    pontos: tuple[tuple[float, float], ...]
    chainage: tuple[float, ...]

    @property
    def comprimento_m(self) -> float:
        return self.chainage[-1]

    @property
    def escala(self) -> float:
        """Multiplica o chainage do eixo para chegar ao km da planilha (29.300 m)."""
        return COMPRIMENTO_PLANILHA_M / self.comprimento_m

    def posicao(self, km_m: float) -> tuple[float, float]:
        """Ponto do eixo correspondente ao km da PLANILHA, em metros."""
        c = min(max(km_m / self.escala, 0.0), self.comprimento_m)
        for i in range(len(self.pontos) - 1):
            c0, c1 = self.chainage[i], self.chainage[i + 1]
            if c0 <= c <= c1:
                t = 0.0 if c1 == c0 else (c - c0) / (c1 - c0)
                (la1, lo1), (la2, lo2) = self.pontos[i], self.pontos[i + 1]
                return (la1 + t * (la2 - la1), lo1 + t * (lo2 - lo1))
        return self.pontos[-1]

    def projetar(self, lat: float, lon: float) -> tuple[float, float]:
        """(chainage em metros, distancia ao eixo em metros) do ponto mais proximo."""
        kx = 111_320.0 * math.cos(math.radians(lat))
        ky = 110_574.0
        melhor_d, melhor_c = math.inf, 0.0
        for i in range(len(self.pontos) - 1):
            (la1, lo1), (la2, lo2) = self.pontos[i], self.pontos[i + 1]
            ax, ay = (lo1 - lon) * kx, (la1 - lat) * ky
            bx, by = (lo2 - lon) * kx, (la2 - lat) * ky
            vx, vy = bx - ax, by - ay
            l2 = vx * vx + vy * vy
            t = 0.0 if l2 == 0 else min(1.0, max(0.0, -(ax * vx + ay * vy) / l2))
            d = math.hypot(ax + t * vx, ay + t * vy)
            if d < melhor_d:
                melhor_d = d
                melhor_c = self.chainage[i] + t * (self.chainage[i + 1] - self.chainage[i])
        return melhor_c, melhor_d

    def km_planilha(self, lat: float, lon: float) -> tuple[float, float]:
        c, d = self.projetar(lat, lon)
        return c * self.escala, d


def montar_eixo(pontos_ordenados: list[tuple[float, float]]) -> Eixo:
    chainage = [0.0]
    for a, b in zip(pontos_ordenados, pontos_ordenados[1:]):
        chainage.append(chainage[-1] + haversine_m(a, b))
    return Eixo(tuple(pontos_ordenados), tuple(chainage))


def carregar(caminho: str | Path) -> Eixo:
    return montar_eixo(reordenar(ler_marcos(caminho)))
