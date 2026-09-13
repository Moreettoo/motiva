"""Leitura da planilha RA-RET-ROC-LIMP (aba ROCADA), o 'unifilar' de rocada da Motiva.

Estrutura verificada por codigo em 13/09/2026 nas duas planilhas:
  - linha 9: marcos de km em METROS, colunas F..BM (60 valores: 0, 500, ..., 29000, 29300)
  - linhas 10..25: uma faixa transversal por linha; a coluna B tem o nome
  - celula BF6: data 'LEVANTAMENTO DE CAMPO', 2025-03-28 nas duas (template desatualizado)
  - valores: 1, 2, 3 (classes de altura), 'X' (nao se aplica) ou vazio (idem)

A data do levantamento vem do NOME do arquivo. A interna e guardada so para
registrar a divergencia (`data_no_arquivo` em ia.levantamentos).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

import openpyxl

LINHA_KM = 9
COLUNA_INICIO = 6     # F
COLUNA_FIM = 65       # BM, inclusive
COLUNA_NOME = 2       # B
CELULA_DATA_INTERNA = "BF6"
CELULA_RODOVIA = "B8"

#: (linha na planilha, nome exatamente como esta la, codigo, lado, em_escopo)
FAIXAS: tuple[tuple[int, str, str, str, bool], ...] = (
    (10, "CANT. DISPOSITIVO EXT.",  "cant_dispositivo_ext",  "externa", False),
    (11, "CANT. MARGINAL EXTERNA",  "cant_marginal_externa", "externa", False),
    (12, "MARGINAL EXTERNA",        "marginal_externa",      "externa", False),
    (14, "CANT. LATERAL EXTERNA",   "cant_lateral_externa",  "externa", True),
    (15, "PISTA EXTERNA",           "pista_externa",         "externa", False),
    (17, "CANT. CENTRAL EXTERNA",   "cant_central_externa",  "externa", True),
    (18, "CANT. CENTRAL INTERNA",   "cant_central_interna",  "interna", True),
    (19, "PISTA INTERNA",           "pista_interna",         "interna", False),
    (21, "CANT. LATERAL INTERNA",   "cant_lateral_interna",  "interna", True),
    (22, "MARGINAL INTERNA",        "marginal_interna",      "interna", False),
    (24, "CANT. MARGINAL INTERNA",  "cant_marginal_interna", "interna", False),
    (25, "CANT. DISPOSITIVO INT.",  "cant_dispositivo_int",  "interna", False),
)
CODIGOS_EM_ESCOPO = frozenset(f[2] for f in FAIXAS if f[4])
NOME_POR_CODIGO = {f[2]: f[1] for f in FAIXAS}
ORDEM_POR_CODIGO = {f[2]: i + 1 for i, f in enumerate(FAIXAS)}

PONTO_MEDIO_CM = {1: 5.0, 2: 20.0, 3: 40.0}
_NAO_SE_APLICA = {None, "", "X", "x"}


@dataclass(frozen=True)
class Observacao:
    km_m: int
    faixa: str
    classe: int | None


@dataclass(frozen=True)
class Levantamento:
    arquivo: str
    data: date
    data_interna: date | None
    rodovia_texto: str
    marcos: tuple[int, ...]
    observacoes: tuple[Observacao, ...]

    def por_faixa(self, faixa: str) -> dict[int, int | None]:
        return {o.km_m: o.classe for o in self.observacoes if o.faixa == faixa}

    def classe(self, km_m: int, faixa: str) -> int | None:
        for o in self.observacoes:
            if o.km_m == km_m and o.faixa == faixa:
                return o.classe
        raise KeyError((km_m, faixa))


def data_do_nome(nome: str) -> date:
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", nome)
    if not m:
        raise ValueError(f"o nome {nome!r} nao traz uma data AAAA-MM-DD")
    return date(int(m[1]), int(m[2]), int(m[3]))


def _classe(valor) -> int | None:
    if valor in _NAO_SE_APLICA:
        return None
    if isinstance(valor, str):
        valor = valor.strip()
        if valor in _NAO_SE_APLICA:
            return None
    try:
        n = int(float(valor))
    except (TypeError, ValueError):
        raise ValueError(f"valor de classe desconhecido: {valor!r}") from None
    if n not in (1, 2, 3):
        raise ValueError(f"classe fora de 1..3: {valor!r}")
    return n


def _data(valor) -> date | None:
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    return None


def ler(caminho: str | Path, data: date | None = None) -> Levantamento:
    caminho = Path(caminho)
    wb = openpyxl.load_workbook(caminho, data_only=True)
    ws = wb[wb.sheetnames[0]]

    marcos: list[int] = []
    for c in range(COLUNA_INICIO, COLUNA_FIM + 1):
        v = ws.cell(LINHA_KM, c).value
        if v is None:
            raise ValueError(f"{caminho.name}: marco vazio na coluna {c}")
        marcos.append(int(v))
    if len(marcos) != 60 or marcos != sorted(marcos):
        raise ValueError(f"{caminho.name}: esperava 60 marcos crescentes, li {len(marcos)}")

    obs: list[Observacao] = []
    for linha, nome, codigo, _lado, _escopo in FAIXAS:
        lido = str(ws.cell(linha, COLUNA_NOME).value or "").strip()
        if lido != nome:
            raise ValueError(f"{caminho.name}: linha {linha} deveria ser {nome!r}, e {lido!r}")
        for i, c in enumerate(range(COLUNA_INICIO, COLUNA_FIM + 1)):
            obs.append(Observacao(marcos[i], codigo, _classe(ws.cell(linha, c).value)))

    return Levantamento(
        arquivo=caminho.name,
        data=data or data_do_nome(caminho.name),
        data_interna=_data(ws[CELULA_DATA_INTERNA].value),
        rodovia_texto=str(ws[CELULA_RODOVIA].value or "").strip(),
        marcos=tuple(marcos),
        observacoes=tuple(obs),
    )
