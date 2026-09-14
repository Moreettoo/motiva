from datetime import date, timedelta

import pytest

import analise
import solo
from apoio import FakeSb, serie_sintetica, trecho

HOJE = date(2026, 9, 14)
TERRA = solo.Solo(0.4, 60.0, "soilgrids")


def test_medicao_com_mais_de_120_dias_e_vencida():
    """A mensagem tem que carregar os dois numeros (quantos dias passaram e o
    limite), nao so a palavra "vencida": e o numero que diz ao operador POR
    QUE nao ha previsao. `match="vencida"` sozinho passaria com qualquer
    texto que contivesse a palavra, mesmo com os numeros trocados ou ausentes
    -- por isso a mensagem inteira e pinada aqui.
    """
    sb = FakeSb(medicoes=[{"data": (HOJE - timedelta(days=121)).isoformat(), "altura_cm": 20.0}])
    with pytest.raises(LookupError) as exc:
        analise.analisar_trecho(sb, trecho(), serie_sintetica(HOJE), TERRA, HOJE)
    assert str(exc.value) == "medicao vencida (121 d, limite 120)"


def test_medicao_de_120_dias_ainda_vale():
    """120 e o limite, nao o primeiro dia vencido: a regra e `decorridos >
    120`, estrito. A chamada fora de um `pytest.raises` ja garante que nao
    levantou; as assercoes abaixo vao alem de "nao quebrou" (o que
    `altura_hoje > 0` da versao original checava, e que e verdade mesmo se o
    calculo inteiro estiver errado, porque `analisar_trecho` nunca devolve
    altura abaixo do piso de 0.5) e confirmam que a medicao de fato virou a
    base e que a janela [medicao, hoje) foi montada com os 120 dias inteiros,
    sem saturar ou truncar em silencio.
    """
    sb = FakeSb(medicoes=[{"data": (HOJE - timedelta(days=120)).isoformat(), "altura_cm": 20.0}])
    r = analise.analisar_trecho(sb, trecho(), serie_sintetica(HOJE), TERRA, HOJE)
    assert r["decorridos"] == 120
    assert r["partiu_da_rocada"] is False
    assert r["altura_base"] == 20.0
    assert r["janela_medicao"] == 120


def test_rocada_recente_reabre_o_prazo():
    """A medicao (200 d) sozinha estaria vencida; a rocada de 10 d atras vira
    a base e reabre o prazo. So olhar `decorridos == 10` deixaria passar uma
    implementacao que acertasse os dias por acidente mas usasse a altura ou a
    data errada -- por isso `altura_base` e `data_base` tambem sao conferidos.
    """
    sb = FakeSb(
        medicoes=[{"data": (HOJE - timedelta(days=200)).isoformat(), "altura_cm": 35.0}],
        execucoes=[{"data_execucao": (HOJE - timedelta(days=10)).isoformat(), "altura_depois_cm": 6.0}],
    )
    r = analise.analisar_trecho(sb, trecho(), serie_sintetica(HOJE), TERRA, HOJE)
    assert r["partiu_da_rocada"] is True
    assert r["decorridos"] == 10
    assert r["altura_base"] == 6.0
    assert r["data_base"] == HOJE - timedelta(days=10)


def test_rocada_tambem_vencida_continua_vencida():
    """A rocada e mais recente que a medicao (300 d) e por isso vira a base,
    mas ela mesma tem mais de 120 dias (121). A regra vale para a BASE
    escolhida -- medicao ou rocada -- e nao so para "sem rocada nenhuma":
    nenhum dos outros testes usa uma rocada velha, entao trocar a checagem
    para olhar sempre `data_med` em vez de `data_base` passaria despercebido
    sem este caso.
    """
    sb = FakeSb(
        medicoes=[{"data": (HOJE - timedelta(days=300)).isoformat(), "altura_cm": 35.0}],
        execucoes=[{"data_execucao": (HOJE - timedelta(days=121)).isoformat(), "altura_depois_cm": 6.0}],
    )
    with pytest.raises(LookupError) as exc:
        analise.analisar_trecho(sb, trecho(), serie_sintetica(HOJE), TERRA, HOJE)
    assert str(exc.value) == "medicao vencida (121 d, limite 120)"


def test_sem_medicao_continua_sendo_lookup_error():
    with pytest.raises(LookupError) as exc:
        analise.analisar_trecho(FakeSb(), trecho(), serie_sintetica(HOJE), TERRA, HOJE)
    assert str(exc.value) == "sem medicao"
