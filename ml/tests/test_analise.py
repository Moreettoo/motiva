from datetime import date, timedelta

import numpy as np
import pytest

import analise
import calibracao
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


def test_fator_multiplica_os_quantis_e_o_crescido(monkeypatch):
    monkeypatch.setattr(analise.modelo, "curva", lambda montar, horizonte=120: np.tile([[1.0, 2.0, 3.0]], (120, 1)))
    monkeypatch.setattr(analise.modelo, "prever", lambda linhas: np.array([[0.5, 1.0, 1.5]]))
    sb = FakeSb(medicoes=[{"data": (HOJE - timedelta(days=5)).isoformat(), "altura_cm": 10.0}])
    calib = calibracao.Calibracao(2.0, "medida", 7, 195, "2026-09-13")
    r = analise.analisar_trecho(sb, trecho(), serie_sintetica(HOJE), TERRA, HOJE, calib=calib, mobilizacao_dias=7)
    assert r["crescido"] == 2.0 and r["altura_hoje"] == 12.0
    # OS TRES quantis, nao so o q50: `curva(montar) * calib.fator` multiplica a
    # matriz inteira. Checar so q50 deixaria passar uma implementacao que
    # aplicasse o fator numa fatia so (por exemplo `Q[:, 1] *= fator`) e
    # devolvesse q10/q90 crus do modelo -- o intervalo de incerteza mostrado ao
    # gestor sairia errado com o q50 batendo por coincidencia.
    assert r["q10"] == 2.0 and r["q50"] == 4.0 and r["q90"] == 6.0
    assert r["fator"] == 2.0
    assert r["dias"] is not None and r["data_ideal"] == HOJE + timedelta(days=r["dias"] - 7)


def test_mobilizacao_dias_nao_fica_fixo_em_sete(monkeypatch):
    """`mobilizacao_dias=7` e o padrao do parametro E o valor usado em todos os
    outros testes deste arquivo -- uma implementacao que ignorasse o argumento
    e sempre subtraisse 7 passaria despercebida em qualquer um deles. Aqui o
    cruzamento e fixado num dia conhecido (25, por uma rampa linear de
    crescimento) e comparado com DOIS tempos de mobilizacao diferentes, nenhum
    deles 7.
    """
    rampa = np.column_stack([np.arange(1, 121, dtype=float)] * 3)
    monkeypatch.setattr(analise.modelo, "curva", lambda montar, horizonte=120: rampa)
    # medicao de hoje: decorridos == 0, o ramo que chama modelo.prever nem roda.
    sb = FakeSb(medicoes=[{"data": HOJE.isoformat(), "altura_cm": 5.0}])
    r15 = analise.analisar_trecho(sb, trecho(), serie_sintetica(HOJE), TERRA, HOJE, mobilizacao_dias=15)
    r20 = analise.analisar_trecho(sb, trecho(), serie_sintetica(HOJE), TERRA, HOJE, mobilizacao_dias=20)
    assert r15["dias"] == 25 and r20["dias"] == 25
    assert r15["data_ideal"] == HOJE + timedelta(days=25 - 15)
    assert r20["data_ideal"] == HOJE + timedelta(days=25 - 20)
    assert r15["data_ideal"] != r20["data_ideal"]


def test_dia_ideal_nunca_antes_de_hoje(monkeypatch):
    monkeypatch.setattr(analise.modelo, "curva", lambda montar, horizonte=120: np.tile([[10.0, 20.0, 30.0]], (120, 1)))
    monkeypatch.setattr(analise.modelo, "prever", lambda linhas: np.array([[0.0, 0.0, 0.0]]))
    sb = FakeSb(medicoes=[{"data": (HOJE - timedelta(days=1)).isoformat(), "altura_cm": 25.0}])
    r = analise.analisar_trecho(sb, trecho(), serie_sintetica(HOJE), TERRA, HOJE, mobilizacao_dias=7)
    assert r["dias"] == 1 and r["data_ideal"] == HOJE


def test_linha_de_previsao_grava_o_fator():
    # 1.3 nao precisaria de nenhum arredondamento para bater com
    # `round(r["fator"], 4)` -- um `linha_de_previsao` que so repassasse
    # `r["fator"]` sem chamar `round()` passaria igual. O fator abaixo tem
    # mais de 4 casas de proposito, para provar que o arredondamento roda.
    r = {"taxa": 0.5, "altura_hoje": 12.0, "prev30": 6.0, "dias": 30, "fator": 1.23456789,
         "janela": {"temperatura_media_c": 22.0, "precipitacao_total_mm": 10.0}}
    assert analise.linha_de_previsao(1, r)["fator_calibracao"] == 1.2346


def test_solo_do_trecho_atravessa_intacto_ate_o_contexto_da_llm():
    """A "regra" do lote (preferir o solo medido do proprio trecho ao da zona)
    vive em `analisar_lote.py`, fora do que este arquivo testa; o que
    `analise.py` tem que garantir e que QUALQUER solo que chegue -- do trecho
    ou da zona -- atravessa intacto ate o resultado e ate o contexto da LLM,
    e produz numero DIFERENTE (spec 4: a origem do dado tem que viajar junto
    com ele, nunca virar so um rotulo cosmetico).

    Os dois solos usam o mesmo `capacidade_mm` (60,0) e so variam a
    fertilidade -- de proposito, porque e isso que os marcos reais fazem: a
    fertilidade varia por um fator de dois (0,350-0,702) enquanto a
    capacidade de agua varia uns 7%. Testar so com fertilidade diferente e
    testar o caso que de fato ocorre.
    """
    solo_trecho = solo.Solo(0.70, 60.0, "soilgrids")
    solo_zona = solo.Solo(0.35, 60.0, "premissa")
    sb = FakeSb(medicoes=[{"data": (HOJE - timedelta(days=30)).isoformat(), "altura_cm": 15.0}])

    r_trecho = analise.analisar_trecho(sb, trecho(), serie_sintetica(HOJE), solo_trecho, HOJE)
    r_zona = analise.analisar_trecho(sb, trecho(), serie_sintetica(HOJE), solo_zona, HOJE)

    # o objeto Solo passado e o que volta em r["solo"] -- sem copia, sem mistura.
    assert r_trecho["solo"] is solo_trecho and r_zona["solo"] is solo_zona
    # com fertilidade maior, o trecho cresce mais e cruza o limite mais cedo.
    assert r_trecho["altura_hoje"] > r_zona["altura_hoje"]
    assert r_trecho["q50"] > r_zona["q50"]
    assert r_trecho["dias"] < r_zona["dias"]

    ctx_trecho = analise.contexto_para_llm(trecho(), r_trecho, HOJE)
    ctx_zona = analise.contexto_para_llm(trecho(), r_zona, HOJE)
    assert ctx_trecho["solo"]["fertilidade_0_a_1"] == 0.7
    assert ctx_trecho["solo"]["origem"] == "estimado do mapa SoilGrids"
    assert ctx_zona["solo"]["fertilidade_0_a_1"] == 0.35
    assert ctx_zona["solo"]["origem"] == "premissa, o SoilGrids nao cobre este ponto"
