"""Duble minimo de um client supabase-py, so o suficiente para os metodos que
`pesquisa.rodoanel.supabase_io` usa (select/eq/not_.is_/in_/insert/upsert/update/delete/execute)
sobre um dict em memoria. Sem rede, sem depender do schema real -- prova a LOGICA de
idempotencia (o que e apagado antes de o que e inserido) sem tocar o Supabase de verdade.

Nao e um duble generico de postgrest: implementa so o que os callsites de supabase_io.py
realmente encadeiam. Se um metodo novo for usado la e faltar aqui, o teste quebra alto e
claro (AttributeError), nao silenciosamente.
"""
from __future__ import annotations

from itertools import count


class _Resposta:
    def __init__(self, data):
        self.data = data


class _Nao:
    def __init__(self, tabela):
        self._tabela = tabela

    def is_(self, coluna, valor):
        self._tabela._filtros.append((coluna, "not_is", valor))
        return self._tabela


class FakeTabela:
    def __init__(self, banco, nome):
        self._banco = banco
        self._nome = nome
        self._filtros: list[tuple] = []
        self._op = None

    @property
    def not_(self):
        return _Nao(self)

    def select(self, _cols="*"):
        self._op = ("select",)
        return self

    def eq(self, coluna, valor):
        self._filtros.append((coluna, "eq", valor))
        return self

    def in_(self, coluna, valores):
        self._filtros.append((coluna, "in", list(valores)))
        return self

    def insert(self, linhas):
        self._op = ("insert", [dict(l) for l in linhas] if isinstance(linhas, list) else [dict(linhas)])
        return self

    def upsert(self, linhas, on_conflict: str | None = None):
        chaves = tuple(on_conflict.split(",")) if on_conflict else None
        self._op = ("upsert", [dict(l) for l in linhas], chaves)
        return self

    def update(self, valores: dict):
        self._op = ("update", dict(valores))
        return self

    def delete(self):
        self._op = ("delete",)
        return self

    def _bate(self, linha: dict) -> bool:
        for coluna, tipo, valor in self._filtros:
            v = linha.get(coluna)
            if tipo == "eq" and v != valor:
                return False
            if tipo == "in" and v not in valor:
                return False
            if tipo == "not_is" and valor == "null" and v is None:
                return False
        return True

    def execute(self) -> _Resposta:
        linhas = self._banco.tabelas.setdefault(self._nome, [])
        tipo = self._op[0] if self._op else "select"

        if tipo == "select":
            return _Resposta([dict(l) for l in linhas if self._bate(l)])

        if tipo == "delete":
            restantes, removidas = [], []
            for l in linhas:
                (removidas if self._bate(l) else restantes).append(l)
            linhas[:] = restantes
            return _Resposta(removidas)

        if tipo == "update":
            valores = self._op[1]
            afetadas = [l for l in linhas if self._bate(l)]
            for l in afetadas:
                l.update(valores)
            return _Resposta([dict(l) for l in afetadas])

        if tipo == "insert":
            novas = self._op[1]
            for l in novas:
                if l.get("id") is None:
                    l["id"] = next(self._banco.proximo_id)
                linhas.append(l)
            return _Resposta([dict(l) for l in novas])

        if tipo == "upsert":
            novas, chaves = self._op[1], self._op[2]
            saida = []
            for l in novas:
                existente = None
                if chaves:
                    existente = next((x for x in linhas if all(x.get(c) == l.get(c) for c in chaves)), None)
                if existente is not None:
                    existente.update(l)
                    saida.append(dict(existente))
                else:
                    l = dict(l)
                    if l.get("id") is None:
                        l["id"] = next(self._banco.proximo_id)
                    linhas.append(l)
                    saida.append(dict(l))
            return _Resposta(saida)

        raise NotImplementedError(tipo)


class FakeSupabase:
    """`sb` de teste: `.tabelas` e um dict[nome, list[dict]] inspecionavel diretamente."""

    def __init__(self):
        self.tabelas: dict[str, list[dict]] = {}
        self.proximo_id = count(1)

    def table(self, nome: str) -> FakeTabela:
        return FakeTabela(self, nome)
