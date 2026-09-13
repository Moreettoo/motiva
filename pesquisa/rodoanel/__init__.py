"""Pesquisa sobre os dados reais do Rodoanel Oeste (SP-021).

Reaproveita o pipeline de producao em `ml/` (clima, solo, modelo) e NAO o
modifica daqui: o que precisa mudar la e feito la, com teste la.
"""
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
ML = RAIZ / "ml"
PESQUISA = RAIZ / "pesquisa"
BRUTOS = PESQUISA / "dados" / "brutos"
DERIVADOS = PESQUISA / "dados" / "derivados"
CACHE = PESQUISA / "dados" / "cache"
SQLITE = PESQUISA / "rodoanel.sqlite"
DOCS_PESQUISA = RAIZ / "docs" / "pesquisa"

if str(ML) not in sys.path:
    sys.path.insert(0, str(ML))

RODOVIA = "SP-021 Rodoanel Oeste"
UF = "SP"
CONCESSIONARIA = "RodoAnel"
ESPECIE_PREMISSA = "braquiaria"
ALTURA_LIMITE_CM = 30.0

ARQ_LEV_1 = BRUTOS / "RA-RET-ROÇ-LIMP-2026-03-13.xlsx"
ARQ_LEV_2 = BRUTOS / "RA-RET-ROÇ-LIMP-2026-03-20.xlsx"
ARQ_MARCOS = BRUTOS / "Marco km_rodoanel 2.kmz"
ARQ_POLIGONOS = BRUTOS / "classificacao_rocada.kmz"
