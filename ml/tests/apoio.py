"""Dubles para testar analise.py sem Supabase e sem rede."""
from datetime import date, timedelta

import clima


class _Resposta:
    def __init__(self, dados):
        self.data = dados


class _Consulta:
    def __init__(self, dados):
        self._dados = dados

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def in_(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        return _Resposta(self._dados)


class FakeSb:
    """So o que `analisar_trecho` le: medicoes e execucoes do trecho."""

    def __init__(self, medicoes=(), execucoes=()):
        self._tabelas = {"medicoes": list(medicoes), "execucoes": list(execucoes)}

    def table(self, nome):
        return _Consulta(self._tabelas.get(nome, []))


def serie_sintetica(hoje: date, antes: int = 190, depois: int = 20) -> clima.Serie:
    dias = []
    for i in range(-antes, depois):
        d = hoje + timedelta(days=i)
        onda = (i % 11) / 11.0
        dias.append(clima.Dia(d, 22.0 + 4 * onda, 15.0 + 3 * onda, 29.0 + 5 * onda, 70.0, 6.0 if i % 4 == 0 else 0.0,
                              18.0, 3.4, "observado" if i < 0 else "previsao"))
    return clima.Serie(dias, antes, None, None, None)


def trecho(**extra) -> dict:
    base = {"id": 1, "rodovia": "SP-021 Rodoanel Oeste", "km_inicio": 0.0, "km_fim": 0.5, "uf": "SP",
            "latitude": -23.416, "longitude": -46.737, "especie": "braquiaria", "altura_limite_cm": 30,
            "tipo_pista": "faixa de dominio", "observacoes": "teste"}
    base.update(extra)
    return base
