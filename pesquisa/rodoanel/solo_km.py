"""SoilGrids em cada um dos 60 marcos, com cache JSON versionado.

Um marco = uma chamada; `solo.buscar` ja sonda a vizinhanca e cai na premissa,
marcando `fonte`. A pausa e pelo 429 do ISRIC. Quem cair na premissa e gravado
assim mesmo: `solo_fonte = 'premissa'` vai para o trecho e para a tela.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import solo  # ml/

from . import DERIVADOS
from .segmentos import MARCOS

CACHE: Path = DERIVADOS / "solo_por_marco.json"
PAUSA_S = 1.0


def carregar_ou_buscar(eixo, marcos=MARCOS, buscar=None, pausa: float = PAUSA_S) -> dict[int, dict]:
    buscar = buscar or solo.buscar
    dados = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    for m in marcos:
        if str(m) in dados:
            continue
        lat, lon = eixo.posicao(m)
        s = buscar(lat, lon)
        dados[str(m)] = {"fertilidade": s.fertilidade, "capacidade_mm": s.capacidade_mm, "fonte": s.fonte,
                         "nitrogenio_g_kg": s.nitrogenio_g_kg, "distancia_km": s.distancia_km,
                         "latitude": round(lat, 6), "longitude": round(lon, 6)}
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")
        if pausa:
            time.sleep(pausa)
    return {int(k): v for k, v in dados.items()}


if __name__ == "__main__":
    from . import ARQ_MARCOS, banco, marcos
    from .banco import substituir
    eixo = marcos.carregar(ARQ_MARCOS)
    dados = carregar_ou_buscar(eixo)
    substituir(banco.abrir(), "solo_marco", [{"km_marco_m": m, **{k: v[k] for k in ("fertilidade", "capacidade_mm", "fonte", "nitrogenio_g_kg", "distancia_km")}} for m, v in sorted(dados.items())])
    fontes = {}
    for v in dados.values():
        fontes[v["fonte"]] = fontes.get(v["fonte"], 0) + 1
    print(f"{len(dados)} marcos · fontes {fontes} · fertilidade {min(v['fertilidade'] for v in dados.values()):.2f}"
          f"–{max(v['fertilidade'] for v in dados.values()):.2f} · capacidade {min(v['capacidade_mm'] for v in dados.values()):.0f}"
          f"–{max(v['capacidade_mm'] for v in dados.values()):.0f} mm")
