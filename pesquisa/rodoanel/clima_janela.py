"""Serie ERA5 da janela do levantamento, em duas zonas, com cache JSON versionado.

Duas zonas para 29 km e o que a resolucao do ERA5 (~25 km) justifica: norte
(marco 7.300) e sul (marco 22.000), divisor em 14.650 m. O cache e versionado
porque e registro: quem reler a validacao daqui a um ano precisa do mesmo clima.
"""
from __future__ import annotations

import json
import time
from datetime import date, timedelta
from pathlib import Path

import clima  # ml/

from . import DERIVADOS as _DERIVADOS

DERIVADOS: Path = _DERIVADOS
ZONAS = {"norte": 7_300, "sul": 22_000}
DIVISOR_M = 14_650
JANELA_DE = date(2026, 3, 13)
JANELA_ATE = date(2026, 3, 20)      # exclusivo: [13, 20) sao os 7 dias de crescimento
AQUECIMENTO_DIAS = 120
PAUSA_S = 6.0


def zona_de(km_m: int) -> str:
    return "norte" if km_m < DIVISOR_M else "sul"


def caminho_cache(zona: str, inicio: date, fim: date) -> Path:
    return DERIVADOS / f"clima_{zona}_{inicio.isoformat()}_{fim.isoformat()}.json"


def _caminho_janela(zona: str, inicio: date, fim: date, aquecimento: int) -> Path:
    """Caminho do cache nomeado pela cobertura REAL da serie.

    `inicio` e `fim` aqui sao a janela de OBSERVACAO (os 7 dias de marco), mas
    o arquivo em disco cobre `inicio - aquecimento` ate `fim`: e o intervalo
    que de fato esta dentro do JSON, e o nome que uma leitura futura (a
    validacao do modelo) espera encontrar -- nao o intervalo pedido, que e 120
    dias mais curto do lado do inicio.
    """
    return caminho_cache(zona, inicio - timedelta(days=aquecimento), fim)


def serie_para_json(serie: clima.Serie) -> dict:
    return {"aquecimento": serie.aquecimento, "complemento": serie.complemento,
            "ano_historico": serie.ano_historico, "aviso": serie.aviso,
            "dias": [{"data": d.data.isoformat(), "tmed": d.tmed, "tmin": d.tmin, "tmax": d.tmax,
                      "umidade": d.umidade, "chuva": d.chuva, "radiacao": d.radiacao, "et0": d.et0,
                      "fonte": d.fonte} for d in serie.dias]}


def serie_de_json(d: dict) -> clima.Serie:
    dias = [clima.Dia(date.fromisoformat(x["data"]), x["tmed"], x["tmin"], x["tmax"], x["umidade"],
                      x["chuva"], x["radiacao"], x["et0"], x["fonte"]) for x in d["dias"]]
    return clima.Serie(dias, d["aquecimento"], d.get("complemento"), d.get("ano_historico"), d.get("aviso"))


def carregar_ou_buscar(zona: str, eixo, inicio: date = JANELA_DE, fim: date = JANELA_ATE,
                       aquecimento: int = AQUECIMENTO_DIAS, buscar=None) -> clima.Serie:
    arquivo = _caminho_janela(zona, inicio, fim, aquecimento)
    if arquivo.exists():
        return serie_de_json(json.loads(arquivo.read_text(encoding="utf-8")))
    lat, lon = eixo.posicao(ZONAS[zona])
    serie = (buscar or clima.buscar_serie_arquivo)(lat, lon, inicio, fim, aquecimento)
    arquivo.parent.mkdir(parents=True, exist_ok=True)
    arquivo.write_text(json.dumps(serie_para_json(serie), ensure_ascii=False, indent=0), encoding="utf-8")
    return serie


def carregar_todas(eixo, buscar=None) -> dict[str, clima.Serie]:
    saida = {}
    for i, zona in enumerate(ZONAS):
        if i and buscar is None and not _caminho_janela(zona, JANELA_DE, JANELA_ATE, AQUECIMENTO_DIAS).exists():
            time.sleep(PAUSA_S)      # o arquivo do Open-Meteo devolve 429 em rajada
        saida[zona] = carregar_ou_buscar(zona, eixo, buscar=buscar)
    return saida


def gravar_sqlite(con, series: dict[str, clima.Serie]) -> None:
    from .banco import substituir
    linhas = [{"zona": z, "data": d.data.isoformat(), "tmed": d.tmed, "tmin": d.tmin, "tmax": d.tmax,
               "umidade": d.umidade, "chuva": d.chuva, "radiacao": d.radiacao, "et0": d.et0}
              for z, s in series.items() for d in s.dias]
    substituir(con, "clima_dia", linhas)


if __name__ == "__main__":
    from . import ARQ_MARCOS, banco, marcos
    eixo = marcos.carregar(ARQ_MARCOS)
    series = carregar_todas(eixo)
    gravar_sqlite(banco.abrir(), series)
    for z, s in series.items():
        print(f"{z}: {len(s.dias)} dias, {s.aquecimento} de aquecimento, {s.dias[0].data} a {s.dias[-1].data}")
