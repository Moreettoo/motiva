from datetime import date, timedelta

import pytest

import clima


def _corpo(de: date, dias: int, pular: set[date] = frozenset()):
    tempos, col = [], {k: [] for k in ("temperature_2m_mean", "temperature_2m_min", "temperature_2m_max",
                                        "relative_humidity_2m_mean", "precipitation_sum",
                                        "shortwave_radiation_sum", "et0_fao_evapotranspiration")}
    for i in range(dias):
        d = de + timedelta(days=i)
        tempos.append(d.isoformat())
        nulo = d in pular
        for k in col:
            col[k].append(None if nulo else 20.0 + i)
    return {"daily": {"time": tempos, **col}}


def test_aquecimento_e_cobertura(monkeypatch):
    pedidos = []
    urls = []
    monkeypatch.setattr(clima, "_pedir",
                        lambda url, params: urls.append(url) or pedidos.append(params) or _corpo(date(2026, 1, 1), 10))
    s = clima.buscar_serie_arquivo(-23.5, -46.8, date(2026, 1, 5), date(2026, 1, 8), aquecimento=4)
    # Tem que ser o arquivo (ERA5), nao a previsao: a previsao so alcanca ~63
    # dias para tras e a janela de marco fica fora do alcance dela.
    assert urls[0] == clima.API_ARQUIVO
    assert pedidos[0]["start_date"] == "2026-01-01" and pedidos[0]["end_date"] == "2026-01-08"
    assert pedidos[0]["latitude"] == -23.5 and pedidos[0]["longitude"] == -46.8
    assert s.aquecimento == 4
    assert s.dias[0].data == date(2026, 1, 1) and s.dias[-1].data == date(2026, 1, 10)
    assert {d.fonte for d in s.dias} == {"observado"}


def test_aquecimento_conta_dias_de_verdade_na_resposta_e_nao_o_parametro(monkeypatch):
    """`s.aquecimento` tem que vir da CONTAGEM de dias utilizaveis antes de
    `inicio` na resposta, nao de ecoar o parametro pedido: se o arquivo
    devolver menos dias de aquecimento do que o pedido (um deles nulo, por
    exemplo), o campo tem que refletir isso -- caso contrario um bug que so
    repetisse o parametro passaria despercebido no teste acima, onde os dois
    numeros coincidem por construcao.
    """
    monkeypatch.setattr(clima, "_pedir",
                        lambda url, params: _corpo(date(2026, 1, 1), 10, pular={date(2026, 1, 2)}))
    s = clima.buscar_serie_arquivo(-23.5, -46.8, date(2026, 1, 5), date(2026, 1, 8), aquecimento=4)
    # pedido: 4 dias de aquecimento (01, 02, 03, 04); um deles (02) veio nulo
    # e foi descartado por `_ler` -> sobram 3 dias de aquecimento de verdade.
    assert s.aquecimento == 3
    assert date(2026, 1, 2) not in {d.data for d in s.dias}


def test_dia_faltando_na_janela_e_erro(monkeypatch):
    monkeypatch.setattr(clima, "_pedir", lambda url, params: _corpo(date(2026, 1, 1), 10, pular={date(2026, 1, 6)}))
    with pytest.raises(RuntimeError, match="2026-01-06"):
        clima.buscar_serie_arquivo(-23.5, -46.8, date(2026, 1, 5), date(2026, 1, 8), aquecimento=4)


def test_dia_faltando_so_no_aquecimento_nao_e_erro(monkeypatch):
    """So a janela [inicio, fim) precisa estar inteira -- um buraco antes de
    `inicio` (no aquecimento) nao pode derrubar a busca, porque
    `montar_features` nunca olha para tras de `inicio`. Sem este teste, trocar
    o `faltam` do codigo para varrer a serie inteira (em vez de so a janela)
    ainda passaria no teste de cobertura acima, que so fura dias dentro da
    janela.
    """
    monkeypatch.setattr(clima, "_pedir", lambda url, params: _corpo(date(2026, 1, 1), 10, pular={date(2026, 1, 2)}))
    s = clima.buscar_serie_arquivo(-23.5, -46.8, date(2026, 1, 5), date(2026, 1, 8), aquecimento=4)
    assert date(2026, 1, 2) not in {d.data for d in s.dias}
    assert {d.data for d in s.dias} >= {date(2026, 1, 5), date(2026, 1, 6), date(2026, 1, 7)}


def test_dia_faltando_exatamente_no_fim_nao_e_erro(monkeypatch):
    """`fim` e exclusivo na cobertura exigida: um buraco EXATAMENTE em `fim`
    (2026-01-08), fora da janela `[inicio, fim)`, nao pode ser erro. Os dois
    testes de "dia faltando" acima so furam dias DENTRO da janela
    (2026-01-02, 2026-01-06); nenhum fura o proprio `fim`. Um mutante que
    trocasse `range((fim - inicio).days)` por
    `range((fim - inicio).days + 1)` (cobertura passando a incluir `fim`)
    passaria despercebido por todos eles e so estoura aqui.
    """
    monkeypatch.setattr(clima, "_pedir", lambda url, params: _corpo(date(2026, 1, 1), 10, pular={date(2026, 1, 8)}))
    s = clima.buscar_serie_arquivo(-23.5, -46.8, date(2026, 1, 5), date(2026, 1, 8), aquecimento=4)
    assert date(2026, 1, 8) not in {d.data for d in s.dias}


def test_fim_antes_do_inicio_e_erro():
    with pytest.raises(ValueError):
        clima.buscar_serie_arquivo(-23.5, -46.8, date(2026, 1, 8), date(2026, 1, 5))


def test_fim_igual_ao_inicio_tambem_e_erro():
    """`fim` e exclusivo na cobertura exigida -- uma janela de zero dias
    (fim == inicio) e degenerada e tem que ser rejeitada do mesmo jeito que
    fim < inicio, nao silenciosamente aceita como uma janela vazia.
    """
    with pytest.raises(ValueError):
        clima.buscar_serie_arquivo(-23.5, -46.8, date(2026, 1, 5), date(2026, 1, 5))
