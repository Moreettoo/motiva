"""NDVI Sentinel-2 por segmento nas datas dos levantamentos (e em 28/03/2025, so sanidade).

    .venv/bin/python -m pesquisa.ndvi.ndvi_datas

Colecao COPERNICUS/S2_SR_HARMONIZED. Pixel valido: SCL fora de {3,8,9,10,11} e
MSK_CLDPRB < 40. Janela +-3 dias; se nenhuma imagem tiver nuvem media < 50%
sobre os segmentos, +-7, e a defasagem fica registrada. Sem imagem utilizavel e
resultado, nao falha.
"""
from __future__ import annotations

from datetime import date, timedelta

import ee

from pesquisa.rodoanel import ARQ_MARCOS, ARQ_POLIGONOS, DERIVADOS, banco, marcos, poligonos
from pesquisa.ndvi import geometrias
from pesquisa.ndvi.gee_check import iniciar

DATAS_ALVO = (date(2026, 3, 13), date(2026, 3, 20), date(2025, 3, 28))
JANELAS = (3, 7)
NUVEM_MAXIMA = 0.5
COLECAO = "COPERNICUS/S2_SR_HARMONIZED"
SCL_INVALIDO = (3, 8, 9, 10, 11)


def mascarar(img):
    scl = img.select("SCL")
    ok = img.select("MSK_CLDPRB").lt(40)
    for classe in SCL_INVALIDO:
        ok = ok.And(scl.neq(classe))
    return img.updateMask(ok)


def ndvi(img):
    return img.normalizedDifference(["B8", "B4"]).rename("ndvi")


def estatisticas(img, fc) -> list[dict]:
    red = (ee.Reducer.mean().combine(ee.Reducer.median(), sharedInputs=True)
           .combine(ee.Reducer.percentile([10, 90]), sharedInputs=True)
           .combine(ee.Reducer.count(), sharedInputs=True))
    ndvi_img = ndvi(mascarar(img))
    validos = ndvi_img.reduceRegions(collection=fc, reducer=red, scale=10).getInfo()["features"]
    # O `count` do reducer COMBINADO (mean+median+percentile+count) nao e o
    # numero de pixels validos -- e um bug separado do da projecao do `total`
    # abaixo. Medido contra um ee.Reducer.count() isolado, na mesma imagem/
    # geometria/escala: o count combinado vem inflado por um fator variavel,
    # nao um erro de arredondamento (marco 12500: 55 vs 30; marco 13000: 493
    # vs 227; marco 13500: 180 vs 65 -- ~1,8x a 2,8x). Isolando so essa
    # variavel nas 54 geometrias reais, num unico granulo: n > total acontecia
    # em 32 dos 54 marcos usando o count combinado, e em 0 dos 54 usando um
    # count() isolado. Por isso `n` (usado tanto em n_pixels quanto no
    # numerador de nuvem_pct) vem de uma chamada SEPARADA com reducer puro
    # ee.Reducer.count() -- os demais valores do reducer combinado (mean,
    # median, p10, p90) continuam corretos e sao usados normalmente. NAO
    # reaproveitar o count do reducer combinado para economizar uma chamada
    # de rede: e exatamente essa simplificacao que reintroduz o bug.
    contagem = ndvi_img.reduceRegions(collection=fc, reducer=ee.Reducer.count(), scale=10).getInfo()["features"]
    n_por_marco = {f["properties"]["km_marco_m"]: f["properties"].get("count", 0) or 0 for f in contagem}
    # `total` (pixels da grade de 10 m dentro do poligono, com ou sem nuvem)
    # NAO pode vir de ee.Image.constant(1) sem mais nada: esse constante nao
    # tem projecao fixa, entao reduceRegions o conta numa grade padrao do
    # Earth Engine desalinhada da grade nativa do Sentinel-2. Isso inflava
    # `total` em ~10% (marco 5000: esperado ~297 px pela area, contava 321
    # sem reproject e 292 com). Fixar a projecao na banda B4 da propria
    # imagem alinha a contagem a grade real de 10 m (EPSG:32723) usada pelo
    # NDVI. Nao remover o reproject.
    totais = (ee.Image.constant(1).rename("total").reproject(img.select("B4").projection())
              .reduceRegions(collection=fc, reducer=ee.Reducer.count(), scale=10)
              .getInfo()["features"])
    total_por_marco = {f["properties"]["km_marco_m"]: f["properties"].get("count", 0) or 0 for f in totais}
    saida = []
    for f in validos:
        pr = f["properties"]
        m = pr["km_marco_m"]
        n = n_por_marco.get(m, 0)
        total = total_por_marco.get(m, 0)
        saida.append({"km_marco_m": m, "ndvi_medio": pr.get("mean"), "ndvi_mediana": pr.get("median"),
                      "ndvi_p10": pr.get("p10"), "ndvi_p90": pr.get("p90"), "n_pixels": n,
                      "nuvem_pct": (None if total == 0 else round(1 - n / total, 4))})
    return saida


def imagens(fc, de: date, ate: date):
    return ee.ImageCollection(COLECAO).filterBounds(fc.geometry().bounds()).filterDate(de.isoformat(), ate.isoformat())


def main() -> None:
    iniciar()
    pols = poligonos.ler_poligonos(ARQ_POLIGONOS)
    eixo = marcos.carregar(ARQ_MARCOS)
    fc = geometrias.feature_collection(geometrias.aneis_por_marco(pols, poligonos.atribuir(pols, eixo)))

    linhas, resumo = [], []
    for alvo in DATAS_ALVO:
        escolhida = None
        for janela in JANELAS:
            col = imagens(fc, alvo - timedelta(days=janela), alvo + timedelta(days=janela + 1))
            n = col.size().getInfo()
            lista = col.toList(n)
            candidatas = []
            for i in range(n):
                img = ee.Image(lista.get(i))
                data_img = date.fromisoformat(img.date().format("YYYY-MM-dd").getInfo())
                stats = estatisticas(img, fc)
                nuvens = [s["nuvem_pct"] for s in stats if s["nuvem_pct"] is not None]
                nuvem_media = sum(nuvens) / len(nuvens) if nuvens else 1.0
                candidatas.append((nuvem_media, abs((data_img - alvo).days), data_img, stats))
                resumo.append({"data_alvo": alvo.isoformat(), "data_imagem": data_img.isoformat(), "janela_dias": janela,
                               "nuvem_media": round(nuvem_media, 4), "usada": False})
                print(f"  alvo {alvo} · imagem {data_img} · nuvem media {nuvem_media:.0%}")
            utilizaveis = [c for c in candidatas if c[0] < NUVEM_MAXIMA]
            if utilizaveis:
                escolhida = min(utilizaveis, key=lambda c: (c[0], c[1]))
                break
        if not escolhida:
            print(f"alvo {alvo}: nenhuma imagem com nuvem media < {NUVEM_MAXIMA:.0%} em +-{JANELAS[-1]} dias. Resultado registrado.")
            continue
        nuvem, defasagem, data_img, stats = escolhida
        for r in resumo:
            if r["data_alvo"] == alvo.isoformat() and r["data_imagem"] == data_img.isoformat():
                r["usada"] = True
        for s in stats:
            linhas.append({**s, "data_imagem": data_img.isoformat(), "data_alvo": alvo.isoformat(),
                           "defasagem_dias": (data_img - alvo).days})
        print(f"alvo {alvo}: usada {data_img} (defasagem {(data_img - alvo).days:+d} d, nuvem media {nuvem:.0%})")

    banco.gravar_csv(DERIVADOS / "ndvi_datas.csv", linhas)
    banco.gravar_csv(DERIVADOS / "ndvi_imagens.csv", resumo)
    con = banco.abrir()
    banco.substituir(con, "ndvi_observacoes", [{k: l.get(k) for k in ("km_marco_m", "data_imagem", "data_alvo", "defasagem_dias",
                                                "ndvi_medio", "ndvi_mediana", "ndvi_p10", "ndvi_p90", "n_pixels", "nuvem_pct")} for l in linhas])
    print(f"-> {len(linhas)} linhas em ndvi_datas.csv")


if __name__ == "__main__":
    main()
