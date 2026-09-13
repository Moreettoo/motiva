"""SQLite local da pesquisa. Sem servidor: um arquivo, regeneravel."""
from __future__ import annotations

import csv
import sqlite3
from pathlib import Path

from . import SQLITE

ESQUEMA = """
create table if not exists segmentos (
  km_marco_m integer primary key, km_inicio real, km_fim real, latitude real, longitude real,
  metodo_rocada text, area_rocada_m2 real, areas_por_metodo text);
create table if not exists faixas (
  codigo text primary key, nome text, linha_planilha integer, lado text, em_escopo integer, ordem integer);
create table if not exists observacoes (
  data text, km_marco_m integer, faixa text, classe integer, arquivo text,
  primary key (data, km_marco_m, faixa));
create table if not exists pares (
  km_marco_m integer, faixa text, classe_d1 integer, classe_d2 integer, transicao text,
  primary key (km_marco_m, faixa));
create table if not exists solo_marco (
  km_marco_m integer primary key, fertilidade real, capacidade_mm real, fonte text,
  nitrogenio_g_kg real, distancia_km real);
create table if not exists clima_dia (
  zona text, data text, tmed real, tmin real, tmax real, umidade real, chuva real, radiacao real, et0 real,
  primary key (zona, data));
create table if not exists validacoes (chave text primary key, json text);
create table if not exists ndvi_observacoes (
  km_marco_m integer, data_imagem text, data_alvo text, defasagem_dias integer,
  ndvi_medio real, ndvi_mediana real, ndvi_p10 real, ndvi_p90 real, n_pixels integer, nuvem_pct real,
  primary key (km_marco_m, data_imagem));
create table if not exists ndvi_serie (
  km_marco_m integer, data_imagem text, ndvi_mediana real, n_pixels integer, nuvem_pct real,
  primary key (km_marco_m, data_imagem));
"""


def abrir(caminho: str | Path = SQLITE) -> sqlite3.Connection:
    con = sqlite3.connect(str(caminho))
    con.executescript(ESQUEMA)
    return con


def substituir(con: sqlite3.Connection, tabela: str, linhas: list[dict]) -> None:
    """Apaga a tabela inteira e grava `linhas`. Regravar e a forma de idempotencia aqui."""
    con.execute(f"delete from {tabela}")
    if linhas:
        colunas = list(linhas[0].keys())
        marcas = ",".join("?" for _ in colunas)
        con.executemany(
            f"insert into {tabela} ({','.join(colunas)}) values ({marcas})",
            [tuple(l[c] for c in colunas) for l in linhas],
        )
    con.commit()


def gravar_csv(caminho: str | Path, linhas: list[dict]) -> None:
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with caminho.open("w", newline="", encoding="utf-8") as f:
        if not linhas:
            return
        w = csv.DictWriter(f, fieldnames=list(linhas[0].keys()), lineterminator="\n")
        w.writeheader()
        w.writerows(linhas)


def ler_csv(caminho: str | Path) -> list[dict]:
    with Path(caminho).open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))
