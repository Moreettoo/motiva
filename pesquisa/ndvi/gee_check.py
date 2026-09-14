"""Prova de que o Earth Engine responde: NDVI mediano de um ponto do Rodoanel em marco/2026."""
import os

import ee
from dotenv import load_dotenv

from pesquisa.rodoanel import RAIZ


def iniciar() -> None:
    load_dotenv(RAIZ / ".env")
    ee.Initialize(project=os.environ["GEE_PROJECT"])


if __name__ == "__main__":
    iniciar()
    ponto = ee.Geometry.Point([-46.817408, -23.515647]).buffer(30)
    col = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterBounds(ponto)
           .filterDate("2026-03-01", "2026-03-31"))
    print("imagens em marco/2026 sobre o km 15:", col.size().getInfo())
    img = col.sort("CLOUDY_PIXEL_PERCENTAGE").first()
    nd = img.normalizedDifference(["B8", "B4"]).reduceRegion(ee.Reducer.median(), ponto, 10).getInfo()
    print("imagem menos nublada:", img.date().format("YYYY-MM-dd").getInfo(), "| NDVI mediano:", nd)
