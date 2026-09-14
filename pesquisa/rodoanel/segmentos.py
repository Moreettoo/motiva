"""Segmentos de 500 m, pares de observacao, matriz de transicao, medicao derivada
e execucoes inferidas. Definicoes na spec 7.1."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import date, timedelta

from . import planilha
from .marcos import Eixo
from .planilha import CODIGOS_EM_ESCOPO, ORDEM_POR_CODIGO, PONTO_MEDIO_CM, Levantamento

MARCOS: tuple[int, ...] = tuple(range(0, 29_001, 500)) + (29_300,)
BBOX = (-23.64, -23.40, -46.84, -46.72)   # lat_min, lat_max, lon_min, lon_max


def limites_km(m: int) -> tuple[float, float]:
    if m == 29_000:
        return (29.0, 29.15)
    if m == 29_300:
        return (29.15, 29.3)
    return (m / 1000.0, (m + 500) / 1000.0)


@dataclass(frozen=True)
class Segmento:
    km_marco_m: int
    km_inicio: float
    km_fim: float
    latitude: float
    longitude: float
    metodo_rocada: str | None
    area_rocada_m2: float
    areas_por_metodo: dict[str, float] = field(default_factory=dict)

    @property
    def extensao_km(self) -> float:
        return round(self.km_fim - self.km_inicio, 3)


def montar_segmentos(eixo: Eixo, resumo_por_marco: dict[int, dict]) -> list[Segmento]:
    saida = []
    for m in MARCOS:
        lat, lon = eixo.posicao(m)
        ini, fim = limites_km(m)
        r = resumo_por_marco.get(m)
        saida.append(Segmento(
            km_marco_m=m, km_inicio=ini, km_fim=fim,
            latitude=round(lat, 6), longitude=round(lon, 6),
            metodo_rocada=r["metodo_dominante"] if r else None,
            area_rocada_m2=r["area_total_m2"] if r else 0.0,
            areas_por_metodo=dict(r["areas"]) if r else {},
        ))
    return saida


@dataclass(frozen=True)
class Par:
    km_m: int
    faixa: str
    classe_d1: int
    classe_d2: int

    @property
    def transicao(self) -> str:
        if self.classe_d2 > self.classe_d1:
            return "cresceu"
        if self.classe_d2 < self.classe_d1:
            return "rocado"
        return "estavel"


def montar_pares(lev1: Levantamento, lev2: Levantamento) -> list[Par]:
    if lev1.data >= lev2.data:
        raise ValueError("lev1 precisa ser anterior a lev2")
    if lev1.marcos != lev2.marcos:
        raise ValueError("os dois levantamentos precisam ter os mesmos marcos")
    c2 = {(o.km_m, o.faixa): o.classe for o in lev2.observacoes}
    pares = []
    for o in lev1.observacoes:
        depois = c2.get((o.km_m, o.faixa))
        if o.classe is not None and depois is not None:
            pares.append(Par(o.km_m, o.faixa, o.classe, depois))
    return pares


def matriz_transicao(pares: list[Par]) -> dict[tuple[int, int], int]:
    return dict(Counter((p.classe_d1, p.classe_d2) for p in pares))


def medicao_derivada(lev: Levantamento) -> dict[int, tuple[int, str]]:
    """marco -> (pior classe entre as faixas EM ESCOPO com classe, faixa que a deu)."""
    saida: dict[int, tuple[int, str]] = {}
    for o in lev.observacoes:
        if o.classe is None or o.faixa not in CODIGOS_EM_ESCOPO:
            continue
        atual = saida.get(o.km_m)
        if atual is None or o.classe > atual[0] or (
            o.classe == atual[0] and ORDEM_POR_CODIGO[o.faixa] < ORDEM_POR_CODIGO[atual[1]]
        ):
            saida[o.km_m] = (o.classe, o.faixa)
    return saida


def execucoes_inferidas(lev1: Levantamento, lev2: Levantamento) -> list[dict]:
    """Uma execucao por marco em que ALGUMA faixa caiu de classe entre as duas datas."""
    quedas: dict[int, list[Par]] = {}
    for p in montar_pares(lev1, lev2):
        if p.transicao == "rocado":
            quedas.setdefault(p.km_m, []).append(p)
    meio = lev1.data + timedelta(days=(lev2.data - lev1.data).days // 2)
    saida = []
    for m, lista in sorted(quedas.items()):
        pior = max(lista, key=lambda p: (p.classe_d1, -ORDEM_POR_CODIGO[p.faixa]))
        faixas = ", ".join(planilha.NOME_POR_CODIGO[p.faixa] for p in sorted(lista, key=lambda p: ORDEM_POR_CODIGO[p.faixa]))
        saida.append({
            "km_marco_m": m,
            "data_execucao": meio,
            "altura_antes_cm": PONTO_MEDIO_CM[pior.classe_d1],
            "altura_depois_cm": PONTO_MEDIO_CM[pior.classe_d2],
            "faixas": [p.faixa for p in lista],
            "observacao": (f"Inferida do levantamento: {faixas} caiu(ram) de classe entre "
                           f"{lev1.data.isoformat()} e {lev2.data.isoformat()}. Data incerta em ±3 dias."),
        })
    return saida
