"""Testes de `validacao.py`. Ver spec 7.3 para as definicoes das metricas.

Auditoria do brief (Tarefa 9): a versao original do teste
`test_avaliar_caso_construido` tinha um valor esperado ERRADO -- afirmava
`matriz["2"]["2"] == 1` quando o proprio cenario descrito no comentario (par 0
acerta em classe 2, par 2 acerta em classe 2) da `matriz["2"]["2"] == 2`.
Corrigido aqui e a matriz inteira passou a ser conferida, nao so duas
celulas, para que um erro assim nao passe batido de novo.

Alem disso, tres lacunas do brief (Produces sem nenhuma cobertura, ou
cobertura frouxa demais para pegar um erro real):
- `montar_linhas`, `prever` e `fila_retrospectiva` nao tinham teste nenhum.
- `test_calibrar_acha_a_escala_certa` aceitava qualquer `k` entre 1,7 e 2,6,
  mas o resultado e deterministico (1,7 exato: e o extremo do plato de J=1,0
  mais proximo de 1,0, e o desempate de `calibrar` e por proximidade a 1,0) --
  a faixa larga deixaria passar um desempate quebrado que ainda cai dentro
  dela.
- a regra de honestidade da calibracao (spec 7.3: so fica vigente o fator que
  REALMENTE melhora J, reavaliado, nunca o que `calibrar` apenas alega) so
  tinha teste do caminho de rejeicao com um cenario degenerado onde o fator
  calibrado ja dava 1,0 de qualquer jeito -- nao distinguiria uma
  implementacao que sempre promovesse o fator sem checar nada. Acrescentados:
  o caminho de ACEITACAO (`test_rodar_promove_fator_que_realmente_melhora`) e
  um teste que forca `calibrar` a "alegar" uma melhora falsa via monkeypatch,
  confirmando que `rodar` reavalia de verdade em vez de confiar no J alegado.
- o numero central do projeto (162/195 = 83,1%, J=0, contra os pares REAIS do
  Rodoanel) nao estava pinado em nenhum teste -- so verificado manualmente
  rodando o script. Acrescentado `test_linha_de_base_bate_com_os_195_pares_reais_do_rodoanel`.

Uma segunda divergencia entre codigo e teste do brief, em `test_km_par`: o
teste original pedia `not km_par(29_300)`, mas a propria formula verbatim
(`(km_m // 500) % 2 == 0`) da `km_par(29_300) == True` (mesmo grupo de
29_000, porque a divisao inteira por 500 nao enxerga que 29_300 e so 300 m
depois, nao 500). Corrigido para o valor real, com o efeito (1 marco em 60)
documentado no proprio teste em vez de escondido.
"""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pytest

from pesquisa.rodoanel import validacao
from pesquisa.rodoanel.validacao import Linha, Parametros


def _linha(km, c1, c2, h0=None):
    h0 = {1: 5.0, 2: 20.0, 3: 40.0}[c1] if h0 is None else h0
    return Linha(km, "cant_lateral_externa", c1, c2, h0, {})


def test_classe_de():
    assert [validacao.classe_de(h) for h in (0, 9.99, 10, 30, 30.01, 80)] == [1, 1, 2, 2, 3, 3]


def test_parametros_ponto_medio():
    assert Parametros().ponto_medio(3) == 40.0
    assert Parametros(ponto_medio_c3_cm=50).ponto_medio(3) == 50.0
    assert Parametros().ponto_medio(1) == 5.0
    assert Parametros().ponto_medio(2) == 20.0
    # classe 1/2 ignoram ponto_medio_c3_cm -- so a classe 3 usa a premissa
    assert Parametros(ponto_medio_c3_cm=999).ponto_medio(1) == 5.0


def test_parametros_rotulo_traz_especie_c3_e_dias_de_rocada():
    assert (Parametros(especie="esmeralda", ponto_medio_c3_cm=50, dias_desde_rocada=30).rotulo()
            == "esmeralda · c3=50 cm · roçada há 30 d")
    assert Parametros().rotulo() == "braquiaria · c3=40 cm · roçada há 200 d"


def test_avaliar_caso_construido():
    linhas = [_linha(0, 1, 2), _linha(500, 1, 1), _linha(1000, 2, 2), _linha(1500, 2, 3)]
    Q = np.array([[3.0, 6.0, 9.0], [1.0, 2.0, 3.0], [2.0, 4.0, 6.0], [4.0, 8.0, 12.0]])
    r = validacao.avaliar(linhas, Q)
    # 5+6=11 -> 2 (acerto); 5+2=7 -> 1 (acerto); 20+4=24 -> 2 (acerto); 20+8=28 -> 2 (erro: observado 3)
    assert r["acuracia"] == 0.75 and r["mae_ordinal"] == 0.25
    assert r["transicoes_total"] == 2 and r["transicoes_detectadas"] == 1
    assert r["estaveis_total"] == 2 and r["alarmes_falsos"] == 0
    assert r["J"] == pytest.approx(0.5)
    # matriz INTEIRA: os pares 0 e 2 sao observados classe 2 e previstos classe
    # 2 (dois acertos, nao um so -- o brief original pedia so 1 aqui e estava
    # errado para este mesmo cenario/Q).
    assert r["matriz"] == {"1": {"1": 1, "2": 0, "3": 0},
                           "2": {"1": 0, "2": 2, "3": 0},
                           "3": {"1": 0, "2": 1, "3": 0}}
    assert r["cobertura_banda"] == pytest.approx(1.0)    # a banda 24..32 do ultimo intersecta a classe 3
    assert len(r["por_par"]) == 4
    assert r["por_par"][3]["classe_final_prevista"] == 2
    assert r["por_par"][3]["classe_final_observada"] == 3
    assert r["por_par"][3]["km_marco_m"] == 1500
    assert r["por_par"][0]["q50_cm"] == 6.0


def test_com_fator_2_o_ultimo_par_e_detectado():
    linhas = [_linha(0, 1, 2), _linha(500, 1, 1), _linha(1000, 2, 2), _linha(1500, 2, 3)]
    Q = np.array([[3.0, 6.0, 9.0], [1.0, 2.0, 3.0], [2.0, 4.0, 6.0], [4.0, 8.0, 12.0]])
    r = validacao.avaliar(linhas, Q, fator=2.0)
    # 5+12=17 -> 2 (detectada); 5+4=9 -> 1 (sem alarme); 20+8=28 -> 2 (sem alarme); 20+16=36 -> 3 (detectada)
    assert r["transicoes_detectadas"] == 2 and r["alarmes_falsos"] == 0
    assert r["J"] == pytest.approx(1.0) and r["acuracia"] == pytest.approx(1.0)


def test_linha_de_base_nada_muda():
    linhas = [_linha(0, 1, 2), _linha(500, 1, 1), _linha(1000, 2, 2)]
    r = validacao.avaliar(linhas, np.zeros((3, 3)))
    assert r["acuracia"] == pytest.approx(2 / 3) and r["J"] == 0.0 and r["alarmes_falsos"] == 0


def test_linha_de_base_bate_com_os_195_pares_reais_do_rodoanel():
    """O numero central do projeto: contra os 195 pares REAIS (248 menos os
    53 rocados), um preditor que "nao mexe em nada" (Q=zeros) tem que
    reproduzir exatamente a linha de base da spec 7.3 -- 162/195 = 83,1% de
    acuracia e J=0. So le CSV/cache ja gravados (Tarefas 6/7/8): nenhuma
    chamada de rede, e nao depende do `modelo_gramas.pkl` (o preditor de
    producao nem entra aqui -- so a montagem das linhas e a classificacao).
    """
    from pesquisa.rodoanel import ARQ_MARCOS, DERIVADOS, banco, clima_janela, solo_km
    from pesquisa.rodoanel import marcos as marcos_mod
    from pesquisa.rodoanel.segmentos import Par, Segmento

    eixo = marcos_mod.carregar(ARQ_MARCOS)
    segs = {}
    for row in banco.ler_csv(DERIVADOS / "segmentos.csv"):
        segs[int(row["km_marco_m"])] = Segmento(
            int(row["km_marco_m"]), float(row["km_inicio"]), float(row["km_fim"]),
            float(row["latitude"]), float(row["longitude"]), row["metodo_rocada"] or None,
            float(row["area_rocada_m2"]))
    pares = [Par(int(row["km_marco_m"]), row["faixa"], int(row["classe_d1"]), int(row["classe_d2"]))
             for row in banco.ler_csv(DERIVADOS / "pares.csv")]
    assert len(pares) == 248   # sanidade do cenario antes de conferir o numero central

    series = clima_janela.carregar_todas(eixo)
    solo = solo_km.carregar_ou_buscar(eixo)
    linhas = validacao.montar_linhas(pares, segs, series, clima_janela.zona_de, solo, Parametros(),
                                     clima_janela.JANELA_DE)

    assert len(linhas) == 195
    r = validacao.avaliar(linhas, np.zeros((195, 3)), 1.0)
    assert r["n"] == 195
    assert r["transicoes_total"] == 33
    assert r["estaveis_total"] == 162
    assert r["J"] == 0.0
    assert r["acuracia"] == pytest.approx(162 / 195)
    assert r["acuracia"] == pytest.approx(0.831, abs=5e-4)


def test_calibrar_acha_a_escala_certa():
    # verdade: crescimento real = 2 x q50. Metade dos pares cresce, metade nao.
    linhas = [_linha(0, 1, 2), _linha(500, 1, 1), _linha(1000, 1, 2), _linha(1500, 1, 1),
              _linha(2000, 2, 3), _linha(2500, 2, 2)]
    Q = np.array([[2, 3.0, 4], [0.5, 1.0, 1.5], [2, 3.5, 5], [0.5, 1.5, 2.5], [4, 6.0, 8], [1, 2.0, 3]])
    k, J = validacao.calibrar(linhas, Q)
    # J=1,0 e um plato entre 1,7 e 3,3 no grid; o desempate de `calibrar` e
    # pelo fator MAIS PROXIMO de 1,0, entao o resultado e deterministico: 1,7
    # exato, nao "algo nessa faixa" (a faixa frouxa do brief original, ate
    # 2,6, deixaria passar um desempate quebrado que preferisse o k errado
    # dentro do plato).
    assert k == pytest.approx(1.7) and J == pytest.approx(1.0)


def test_calibrar_com_mascara_usa_so_o_subconjunto():
    linhas = [_linha(0, 1, 2), _linha(500, 1, 1)]
    Q = np.array([[2, 3.0, 4], [10, 10.0, 10]])
    k_com_mascara, J_com_mascara = validacao.calibrar(linhas, Q, np.array([True, False]))
    k_direto, J_direto = validacao.calibrar([linhas[0]], Q[:1])
    assert k_com_mascara == k_direto and J_com_mascara == J_direto


def test_km_par():
    assert validacao.km_par(_linha(0, 1, 1)) and not validacao.km_par(_linha(500, 1, 1))
    # 29_300 e o marco extra do fim do eixo (so 300 m depois de 29_000, nao
    # 500): a divisao inteira por 500 cai no MESMO grupo de 29_000 (29_000 //
    # 500 == 29_300 // 500 == 58), entao os dois caem do lado "par" -- e o
    # unico marco, dos 60, onde `km_par` nao alterna por posicao ordinal (o
    # brief original pedia aqui `not km_par(29_300)`, que contradiz a propria
    # formula `(km_m // 500) % 2 == 0` para este km; documentado, nao escondido).
    assert validacao.km_par(_linha(29_000, 1, 1))
    assert validacao.km_par(_linha(29_300, 1, 1))


def test_rodar_devolve_as_pecas_e_nao_promove_fator_que_nao_melhora():
    linhas = [_linha(k * 500, 1, 1) for k in range(8)]
    Q = np.tile([[0.5, 1.0, 1.5]], (8, 1))
    r = validacao.rodar(linhas, Q)
    assert set(r) >= {"sem_calibracao", "ajuste_km_pares", "teste_km_impares", "calibracao_todos", "final",
                      "fator_vigente", "linha_de_base"}
    assert r["fator_vigente"] == 1.0 and r["linha_de_base"]["acuracia"] == 1.0
    # nada aqui cresce o bastante para mudar de classe em nenhum fator do
    # grid: J fica em 0,0 em qualquer escala, e o desempate de `calibrar`
    # tem que devolver exatamente 1,0 -- nao qualquer fator que empate.
    assert r["ajuste_km_pares"] == {"fator": 1.0, "J": 0.0, "n": 4}
    assert r["teste_km_impares"]["n"] == 4
    assert r["teste_km_impares"]["sem"]["J"] == 0.0 and r["teste_km_impares"]["com"]["J"] == 0.0
    assert r["calibracao_todos"] == {"fator": 1.0, "J": 0.0}
    # quando o fator nao e promovido, "final" tem que SER a linha de base --
    # nao um resultado calculado com um fator que foi rejeitado.
    assert r["final"] == r["sem_calibracao"]


def test_rodar_promove_fator_que_realmente_melhora():
    """O outro lado da regra de honestidade: quando a calibracao em cima de
    TODOS os pares realmente melhora J (reavaliado, nao so alegado), o fator
    tem que ser promovido e "final" tem que refletir o fator calibrado, nao a
    linha de base.
    """
    linhas = [_linha(0, 1, 2), _linha(500, 1, 1), _linha(1000, 1, 2), _linha(1500, 1, 1),
              _linha(2000, 2, 3), _linha(2500, 2, 2)]
    Q = np.array([[2, 3.0, 4], [0.5, 1.0, 1.5], [2, 3.5, 5], [0.5, 1.5, 2.5], [4, 6.0, 8], [1, 2.0, 3]])
    r = validacao.rodar(linhas, Q)
    assert r["sem_calibracao"]["J"] == 0.0
    assert r["calibracao_todos"]["fator"] == pytest.approx(1.7)
    assert r["fator_vigente"] == pytest.approx(1.7)
    assert r["final"]["J"] == pytest.approx(1.0)
    assert r["final"] != r["sem_calibracao"]
    assert r["final"]["fator"] == pytest.approx(1.7)


def test_rodar_nao_confia_no_j_que_calibrar_alega_reavalia_de_verdade(monkeypatch):
    """`calibrar` poderia devolver qualquer J (inclusive um alegado por
    engano, ou por um bug futuro); `rodar` so pode promover o fator se a
    REAVALIACAO real (`avaliar`) confirmar a melhora. Aqui `calibrar` e
    substituido por um duble que alega J=999 para fator=2,0 -- um fator que,
    de fato (`avaliar` de verdade), PIORA o resultado: introduz um alarme
    falso que nao existia com fator=1,0. Se `rodar` confiasse no J alegado em
    vez de recalcular com `avaliar`, promoveria o fator; e exatamente o modo
    de falha que finge uma calibracao boa.
    """
    linhas = [_linha(0, 1, 2, h0=5.0), _linha(500, 1, 1, h0=5.0)]
    Q = np.array([[5.0, 5.0, 5.0], [3.0, 3.0, 3.0]])
    base = validacao.avaliar(linhas, Q, 1.0)
    assert base["J"] == 1.0     # fator=1 detecta a transicao, sem alarme
    pior = validacao.avaliar(linhas, Q, 2.0)
    assert pior["J"] == 0.0     # fator=2 introduz um alarme falso: de fato pior

    monkeypatch.setattr(validacao, "calibrar", lambda linhas, Q, mascara=None: (2.0, 999.0))
    r = validacao.rodar(linhas, Q)
    assert r["fator_vigente"] == 1.0
    assert r["final"] == r["sem_calibracao"]


def test_prever_empilha_o_preditor_em_array_n_por_3():
    linhas = [_linha(0, 1, 2), _linha(500, 1, 1)]
    preditor = lambda feats: [[1, 2, 3], [4, 5, 6]]
    Q = validacao.prever(linhas, preditor)
    assert Q.shape == (2, 3)
    assert Q.tolist() == [[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]]
    assert validacao.prever([], preditor).shape == (0, 3)


def test_montar_linhas_pula_rocado_e_usa_o_ponto_medio_como_altura_inicial():
    import clima  # ml/: ja no sys.path por causa de `pesquisa.rodoanel`
    from pesquisa.rodoanel.segmentos import Par, Segmento

    dias = [clima.Dia(date(2026, 3, 13) + timedelta(days=i), 22.0, 15.0, 28.0, 70.0, 2.0, 18.0, 3.2, "observado")
            for i in range(10)]
    serie = clima.Serie(dias, 0, None, None, None)
    seg = Segmento(km_marco_m=0, km_inicio=0.0, km_fim=0.5, latitude=-23.5, longitude=-46.8,
                   metodo_rocada=None, area_rocada_m2=0.0)
    # o segundo par e rocada (classe caiu de 3 para 1): tem que ficar de fora.
    pares = [Par(0, "cant_lateral_externa", 1, 2), Par(500, "cant_lateral_externa", 3, 1)]
    segmentos_por_marco = {0: seg, 500: seg}
    series_por_zona = {"norte": serie}
    solo_por_marco = {0: {"capacidade_mm": 60.0, "fertilidade": 0.5}, 500: {"capacidade_mm": 60.0, "fertilidade": 0.5}}
    p = Parametros()

    linhas = validacao.montar_linhas(pares, segmentos_por_marco, series_por_zona, lambda km: "norte",
                                     solo_por_marco, p, date(2026, 3, 13))

    assert len(linhas) == 1
    l = linhas[0]
    assert (l.km_m, l.classe_inicial, l.classe_final) == (0, 1, 2)
    assert l.altura_inicial_cm == p.ponto_medio(1) == 5.0
    assert l.features["especie"] == "braquiaria"
    assert l.features["dias_periodo"] == 7
    assert l.features["fertilidade_solo"] == 0.5
    assert l.features["capacidade_agua_solo_mm"] == 60.0
    assert l.features["latitude"] == -23.5


def test_fila_retrospectiva_marca_por_segmento_e_conta_acertos():
    em_escopo = frozenset({"cant_lateral_externa"})
    linhas = [
        _linha(0, 2, 3),        # cresce ate 3; o modelo preve e acerta
        _linha(500, 2, 2),      # fica em 2; modelo nao preve 3 (nem marcado, nem cruzou)
        _linha(1000, 2, 3),     # cresce ate 3, mas o modelo NAO preve (cruzou sem ser marcado)
    ]
    Q = np.array([[0, 15.0, 0], [0, 0.0, 0], [0, 0.0, 0]])   # so o primeiro cresce ate a classe 3 (20+15=35)
    r = validacao.fila_retrospectiva(linhas, Q, 1.0, em_escopo)
    assert r["segmentos_avaliados"] == 3
    assert r["marcados"] == [0]
    assert r["cruzaram"] == [0, 1000]
    assert r["acertos"] == [0]
    assert (r["n_marcados"], r["n_cruzaram"], r["n_acertos"]) == (1, 2, 1)


def test_fila_retrospectiva_ignora_faixa_fora_de_escopo():
    linhas = [_linha(0, 2, 3)]
    Q = np.array([[0, 15.0, 0]])
    r = validacao.fila_retrospectiva(linhas, Q, 1.0, frozenset({"pista_externa"}))
    assert r["segmentos_avaliados"] == 0 and r["marcados"] == [] and r["n_acertos"] == 0
