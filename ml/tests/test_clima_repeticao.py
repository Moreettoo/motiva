"""A repeticao de `clima._pedir`.

Escrito depois de o lote das 06:00 perder 30 trechos duas execucoes seguidas:
no IP compartilhado do GitHub Actions a SEGUNDA zona da rodada leva
estrangulamento e o handshake TLS expira. `solo._consultar` ja repetia;
`clima._pedir` nao, e a assimetria derrubava a zona inteira -- inclusive
trechos que ja tinham solo proprio no banco e so precisavam do clima.
"""
import httpx
import pytest

import clima


@pytest.fixture(autouse=True)
def _sem_espera(monkeypatch):
    """Sem dormir de verdade: o teste afirma a repeticao, nao a duracao."""
    monkeypatch.setattr(clima.time, "sleep", lambda _: None)


def _resposta(corpo: dict) -> httpx.Response:
    return httpx.Response(200, json=corpo, request=httpx.Request("GET", "http://x"))


def test_repete_e_devolve_quando_a_primeira_falha(monkeypatch):
    """Uma falha de transporte nao pode derrubar a zona: a segunda tenta."""
    chamadas = []

    def falsa(url, params=None, timeout=None):
        chamadas.append(url)
        if len(chamadas) == 1:
            raise httpx.ConnectTimeout("handshake expirou")   # o erro real do CI
        return _resposta({"daily": {"time": []}})

    monkeypatch.setattr(clima.httpx, "get", falsa)
    assert clima._pedir("http://x", {}) == {"daily": {"time": []}}
    assert len(chamadas) == 2, "deveria ter repetido exatamente uma vez"


def test_insiste_ate_o_limite_e_so_entao_levanta(monkeypatch):
    """Esgotadas as tentativas, o erro ORIGINAL sobe -- nao um generico."""
    chamadas = []

    def falsa(url, params=None, timeout=None):
        chamadas.append(url)
        raise httpx.ConnectTimeout("handshake expirou")

    monkeypatch.setattr(clima.httpx, "get", falsa)
    with pytest.raises(httpx.ConnectTimeout):
        clima._pedir("http://x", {})
    assert len(chamadas) == clima.TENTATIVAS


def test_recusa_da_api_nao_repete(monkeypatch):
    """`error` no corpo e resposta valida dizendo nao. Insistir so gasta tempo."""
    chamadas = []

    def falsa(url, params=None, timeout=None):
        chamadas.append(url)
        return _resposta({"error": True, "reason": "latitude invalida"})

    monkeypatch.setattr(clima.httpx, "get", falsa)
    with pytest.raises(RuntimeError, match="latitude invalida"):
        clima._pedir("http://x", {})
    assert len(chamadas) == 1, "recusa da API nao deve repetir"


def test_espera_dobra_entre_tentativas(monkeypatch):
    """A pausa cresce: um estrangulamento nao passa em 0,6 s."""
    esperas = []
    monkeypatch.setattr(clima.time, "sleep", esperas.append)

    def falsa(url, params=None, timeout=None):
        raise httpx.ConnectTimeout("handshake expirou")

    monkeypatch.setattr(clima.httpx, "get", falsa)
    with pytest.raises(httpx.ConnectTimeout):
        clima._pedir("http://x", {})
    assert esperas == [clima.PAUSA_S * 2, clima.PAUSA_S * 4]
