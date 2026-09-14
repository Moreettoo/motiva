from datetime import date

import pytest

from pesquisa.rodoanel import planilha, segmentos
from pesquisa.rodoanel.marcos import Eixo
from pesquisa.rodoanel.planilha import Levantamento, Observacao


def _lev(data, classes: dict[tuple[int, str], int | None]) -> Levantamento:
    marcos = (0, 500)
    faixas = [f[2] for f in planilha.FAIXAS]
    obs = tuple(Observacao(m, f, classes.get((m, f))) for m in marcos for f in faixas)
    return Levantamento("x.xlsx", data, None, "SP-021", marcos, obs)


def test_60_marcos_e_limites_dos_dois_ultimos():
    assert len(segmentos.MARCOS) == 60
    assert segmentos.limites_km(0) == (0.0, 0.5)
    assert segmentos.limites_km(28_500) == (28.5, 29.0)
    assert segmentos.limites_km(29_000) == (29.0, 29.15)
    assert segmentos.limites_km(29_300) == (29.15, 29.3)


def test_bbox_e_exatamente_a_constante_do_espec():
    """BBOX so e exercitado indiretamente pelo teste de aceitacao (contencao dos
    60 segmentos reais). Fixar os quatro numeros aqui pega uma BBOX plausivel
    mas errada (por exemplo com lat/lon trocados) que ainda contivesse os
    pontos reais por coincidencia de faixa.
    """
    assert segmentos.BBOX == (-23.64, -23.40, -46.84, -46.72)


def test_pares_transicoes_e_matriz():
    d1 = _lev(date(2026, 3, 13), {(0, "cant_lateral_externa"): 1, (0, "cant_central_interna"): 3,
                                  (500, "cant_lateral_externa"): 2, (500, "marginal_externa"): None})
    d2 = _lev(date(2026, 3, 20), {(0, "cant_lateral_externa"): 2, (0, "cant_central_interna"): 1,
                                  (500, "cant_lateral_externa"): 2, (500, "marginal_externa"): 1})
    pares = segmentos.montar_pares(d1, d2)
    assert {(p.km_m, p.faixa, p.transicao) for p in pares} == {
        (0, "cant_lateral_externa", "cresceu"), (0, "cant_central_interna", "rocado"),
        (500, "cant_lateral_externa", "estavel")}
    assert segmentos.matriz_transicao(pares) == {(1, 2): 1, (3, 1): 1, (2, 2): 1}


def test_pares_recusa_datas_fora_de_ordem_e_marcos_diferentes():
    """montar_pares exige lev1 estritamente anterior a lev2 e os mesmos marcos.
    Sem este teste, uma chamada com os levantamentos invertidos passaria
    silenciosamente e produziria uma matriz de transicao com o sinal trocado
    (rocado virando cresceu e vice-versa) em vez de levantar erro.
    """
    d1 = _lev(date(2026, 3, 13), {(0, "cant_lateral_externa"): 1})
    d2 = _lev(date(2026, 3, 20), {(0, "cant_lateral_externa"): 2})
    with pytest.raises(ValueError):
        segmentos.montar_pares(d2, d1)
    with pytest.raises(ValueError):
        segmentos.montar_pares(d1, d1)

    d2_outros_marcos = Levantamento("y.xlsx", date(2026, 3, 20), None, "SP-021", (0, 1000), d2.observacoes)
    with pytest.raises(ValueError):
        segmentos.montar_pares(d1, d2_outros_marcos)


def test_medicao_derivada_pega_a_pior_faixa_em_escopo():
    lev = _lev(date(2026, 3, 13), {(0, "cant_lateral_externa"): 1, (0, "cant_central_interna"): 3,
                                   (0, "cant_dispositivo_ext"): 3,   # fora de escopo: ignorada
                                   (500, "cant_dispositivo_ext"): 2})  # so faixa fora de escopo
    assert segmentos.medicao_derivada(lev) == {0: (3, "cant_central_interna")}


def test_medicao_derivada_empate_de_classe_fica_com_a_menor_ordem():
    """O espec (7.1) diz "empate: menor ordem". cant_lateral_externa (ordem 4)
    e cant_central_interna (ordem 7) empatam aqui em classe 2: o vencedor tem
    que ser a de menor ordem, mesmo que cant_central_interna venha depois na
    lista de observacoes (ordem crescente dentro do mesmo marco). Sem este
    teste, trocar o sinal do desempate (`<` por `>` em ORDEM_POR_CODIGO) nao
    quebraria nenhum teste do brief, porque nenhum deles usa duas faixas em
    escopo empatadas na mesma classe.
    """
    lev = _lev(date(2026, 3, 13), {(0, "cant_lateral_externa"): 2, (0, "cant_central_interna"): 2})
    assert segmentos.medicao_derivada(lev) == {0: (2, "cant_lateral_externa")}


def test_execucoes_inferidas_so_onde_alguma_faixa_caiu():
    d1 = _lev(date(2026, 3, 13), {(0, "cant_lateral_externa"): 3, (0, "cant_central_interna"): 2,
                                  (500, "cant_lateral_externa"): 1})
    d2 = _lev(date(2026, 3, 20), {(0, "cant_lateral_externa"): 1, (0, "cant_central_interna"): 2,
                                  (500, "cant_lateral_externa"): 2})
    ex = segmentos.execucoes_inferidas(d1, d2)
    assert len(ex) == 1
    assert ex[0]["km_marco_m"] == 0
    assert ex[0]["data_execucao"] == date(2026, 3, 16)   # meio de [13, 20) arredondado para baixo
    assert ex[0]["altura_antes_cm"] == 40.0 and ex[0]["altura_depois_cm"] == 5.0
    # A observacao renderiza o NOME de exibicao da faixa (NOME_POR_CODIGO),
    # nao o codigo interno: "CANT. LATERAL EXTERNA", nao "cant_lateral_externa".
    # A assercao original do brief buscava o codigo dentro do texto e falharia
    # sempre, porque o texto so contem o nome de exibicao (verificado antes de
    # implementar: a string produzida e "Inferida do levantamento: CANT.
    # LATERAL EXTERNA caiu(ram) de classe entre ..."; o codigo em snake_case
    # nunca aparece ali).
    assert "CANT. LATERAL EXTERNA" in ex[0]["observacao"]


def test_execucoes_inferidas_escolhe_a_pior_entre_duas_quedas_no_mesmo_marco():
    """Com duas faixas caindo no mesmo marco, "pior" e a de MAIOR classe_d1
    (7.1: "altura_antes_cm = ponto medio da maior classe inicial entre as
    faixas que cairam"). O teste do brief so tem uma queda por marco, entao
    nunca exercita a escolha entre duas: um bug que pegasse a PRIMEIRA queda
    da lista (ou a de maior classe_d2, ou qualquer outro criterio plausivel)
    passaria despercebido. cant_lateral_externa cai de 3 para 1 e
    cant_central_interna cai de 2 para 1 no mesmo marco: a pior tem que ser a
    de classe_d1=3, e altura_depois tem que vir DESSE par especifico (5 cm),
    nao de qualquer par que caiu.
    """
    d1 = _lev(date(2026, 3, 13), {(0, "cant_lateral_externa"): 3, (0, "cant_central_interna"): 2})
    d2 = _lev(date(2026, 3, 20), {(0, "cant_lateral_externa"): 1, (0, "cant_central_interna"): 1})
    ex = segmentos.execucoes_inferidas(d1, d2)
    assert len(ex) == 1
    assert ex[0]["altura_antes_cm"] == 40.0 and ex[0]["altura_depois_cm"] == 5.0
    assert set(ex[0]["faixas"]) == {"cant_lateral_externa", "cant_central_interna"}
    # A observacao usa o nome de exibicao (ver comentario acima), no ordem
    # crescente de ORDEM_POR_CODIGO: CANT. LATERAL EXTERNA (ordem 4) antes de
    # CANT. CENTRAL INTERNA (ordem 7).
    assert ex[0]["observacao"].index("CANT. LATERAL EXTERNA") < ex[0]["observacao"].index("CANT. CENTRAL INTERNA")


def test_execucoes_inferidas_empate_de_classe_inicial_fica_com_a_menor_ordem():
    """Duas faixas caem no mesmo marco com a MESMA classe_d1 (empate): o
    desempate segue a mesma convencao de medicao_derivada, menor ordem
    vence. cant_lateral_externa (ordem 4) e cant_central_interna (ordem 7)
    caem as duas de classe 3, mas para classes finais diferentes -- a
    altura_depois_cm registrada tem que vir da de menor ordem (classe 1 -> 5
    cm), nao da outra (classe 2 -> 20 cm).
    """
    d1 = _lev(date(2026, 3, 13), {(0, "cant_lateral_externa"): 3, (0, "cant_central_interna"): 3})
    d2 = _lev(date(2026, 3, 20), {(0, "cant_lateral_externa"): 1, (0, "cant_central_interna"): 2})
    ex = segmentos.execucoes_inferidas(d1, d2)
    assert len(ex) == 1
    assert ex[0]["altura_antes_cm"] == 40.0
    assert ex[0]["altura_depois_cm"] == 5.0


def test_montar_segmentos_usa_o_resumo_quando_existe_e_um_default_sensato_quando_falta():
    """montar_segmentos so e exercitado pelo teste de aceitacao (dados reais),
    que nao cobre o caminho `r is None` (marco sem nenhum poligono atribuido)
    isoladamente, nem confere os campos um a um contra um resumo conhecido.
    Um eixo de dois pontos e suficiente: posicao() extrapola/clampa para
    qualquer km da planilha, entao os 60 segmentos saem mesmo de um eixo
    minusculo -- o que importa aqui e o mapeamento dos campos, nao a
    geografia.
    """
    eixo = Eixo(((-23.0, -46.0), (-23.1, -46.1)), (0.0, 29_300.0))
    resumo = {0: {"metodo_dominante": "Apenas manual", "area_total_m2": 123.456,
                  "areas": {"Apenas manual": 123.456}, "n_poligonos": 2}}
    segs = segmentos.montar_segmentos(eixo, resumo)
    assert len(segs) == 60

    s0 = segs[0]
    assert s0.km_marco_m == 0 and s0.km_inicio == 0.0 and s0.km_fim == 0.5
    assert s0.metodo_rocada == "Apenas manual"
    assert s0.area_rocada_m2 == 123.456
    assert s0.areas_por_metodo == {"Apenas manual": 123.456}
    lat_esperada, lon_esperada = eixo.posicao(0)
    assert s0.latitude == round(lat_esperada, 6)
    assert s0.longitude == round(lon_esperada, 6)

    s1 = next(s for s in segs if s.km_marco_m == 500)
    assert s1.metodo_rocada is None
    assert s1.area_rocada_m2 == 0.0
    assert s1.areas_por_metodo == {}
