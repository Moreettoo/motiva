"""O fator de calibracao vigente: medido contra o levantamento da Motiva, em ia.calibracoes.

O fator multiplica o crescimento previsto (os tres quantis) FORA do modelo. E o
ponteiro da balanca: o .pkl continua o mesmo, e o teste de paridade com o
TypeScript continua provando o que prova.
"""
from __future__ import annotations

from typing import NamedTuple


class Calibracao(NamedTuple):
    fator: float
    origem: str                      # "medida" | "sem_calibracao"
    validacao_id: int | None
    n_pares: int | None
    validada_em: str | None
    rodovia: str | None = None
    especie: str | None = None


SEM = Calibracao(1.0, "sem_calibracao", None, None, None)


def carregar(sb) -> list[dict]:
    """As calibracoes ativas, com o n e a data da validacao que as gerou. Uma consulta por rodada."""
    return (sb.table("calibracoes")
            .select("fator, rodovia, especie, validacao_id, validacoes(n_pares_usados, executada_em)")
            .eq("ativo", True).execute().data)


def _especificidade(linha: dict, rodovia: str, especie: str) -> int | None:
    if linha.get("rodovia") not in (None, rodovia) or linha.get("especie") not in (None, especie):
        return None
    return (2 if linha.get("rodovia") else 0) + (1 if linha.get("especie") else 0)


def escolher(linhas: list[dict], rodovia: str, especie: str) -> Calibracao:
    """(rodovia, especie) > (rodovia, qualquer) > (qualquer, especie) > (qualquer, qualquer) > SEM."""
    melhor = None
    for l in linhas:
        s = _especificidade(l, rodovia, especie)
        if s is not None and (melhor is None or s > melhor[0]):
            melhor = (s, l)
    if melhor is None:
        return SEM
    l = melhor[1]
    v = l.get("validacoes") or {}
    if isinstance(v, list):                  # o PostgREST devolve lista quando nao prova a unicidade
        v = v[0] if v else {}
    return Calibracao(float(l["fator"]), "medida", l.get("validacao_id"), v.get("n_pares_usados"),
                      v.get("executada_em"), l.get("rodovia"), l.get("especie"))
