from collections import Counter

from pesquisa.rodoanel import ARQ_LEV_1, ARQ_LEV_2, ARQ_MARCOS, ARQ_POLIGONOS, marcos, planilha, poligonos, segmentos


def test_matriz_de_transicao_medida_em_13_09_2026():
    pares = segmentos.montar_pares(planilha.ler(ARQ_LEV_1), planilha.ler(ARQ_LEV_2))
    assert len(pares) == 248
    assert segmentos.matriz_transicao(pares) == {
        (1, 1): 130, (1, 2): 30, (1, 3): 3, (2, 1): 27, (2, 2): 22, (3, 1): 22, (3, 2): 4, (3, 3): 10}
    assert Counter(p.transicao for p in pares) == {"estavel": 162, "cresceu": 33, "rocado": 53}
    assert sum(1 for p in pares if p.faixa in planilha.CODIGOS_EM_ESCOPO) == 209


def test_60_segmentos_dentro_da_bbox_com_metodo_e_area():
    eixo = marcos.carregar(ARQ_MARCOS)
    pols = poligonos.ler_poligonos(ARQ_POLIGONOS)
    segs = segmentos.montar_segmentos(eixo, poligonos.resumo_por_marco(pols, poligonos.atribuir(pols, eixo)))
    assert len(segs) == 60
    lat_min, lat_max, lon_min, lon_max = segmentos.BBOX
    assert all(lat_min <= s.latitude <= lat_max and lon_min <= s.longitude <= lon_max for s in segs)
    assert abs(sum(s.area_rocada_m2 for s in segs) - 981_817) < 1.0
    # O brief original aceitava "<= 5" (marcos sem nenhum poligono atribuido).
    # Medido no arquivo real sao 6, nao <= 5: dois trechos de 1 km sem nenhum
    # poligono (km 2.500-3.000 e 7.500-8.000, ambos com vizinhos nao-vazios
    # dos dois lados -- nao e erro de agrupamento, e area sem rocada
    # cadastrada nesse levantamento) mais os dois ja esperados no fim do eixo
    # (29.000 e 29.300, faixa final de so 150-300 m). A soma de poligonos por
    # marco continua batendo 642 (nada foi perdido), entao o teto do brief e
    # que estava calibrado errado para este arquivo -- travado aqui no valor
    # exato e explicado, e nao ajustado por acaso: um resultado diferente
    # destes 6 marcos especificos e sinal de regressao em atribuir()/
    # resumo_por_marco(), nao motivo para voltar ao teto solto do espec.
    sem_poligono = [s.km_marco_m for s in segs if s.metodo_rocada is None]
    assert sem_poligono == [2_500, 3_000, 7_500, 8_000, 29_000, 29_300]


def test_montar_pares_e_montar_segmentos_sao_deterministicos():
    """Os dois medem contra o mesmo par de arquivos reais duas vezes seguidas:
    pega qualquer dependencia acidental em estado global ou ordem de
    iteracao de dict/set que fizesse o resultado variar entre chamadas
    (o que quebraria a garantia de que o CSV gerado e reproduzivel).
    """
    lev1, lev2 = planilha.ler(ARQ_LEV_1), planilha.ler(ARQ_LEV_2)
    pares_a = segmentos.montar_pares(lev1, lev2)
    pares_b = segmentos.montar_pares(planilha.ler(ARQ_LEV_1), planilha.ler(ARQ_LEV_2))
    assert [(p.km_m, p.faixa, p.classe_d1, p.classe_d2) for p in pares_a] == \
           [(p.km_m, p.faixa, p.classe_d1, p.classe_d2) for p in pares_b]

    eixo = marcos.carregar(ARQ_MARCOS)
    pols = poligonos.ler_poligonos(ARQ_POLIGONOS)
    resumo = poligonos.resumo_por_marco(pols, poligonos.atribuir(pols, eixo))
    segs_a = segmentos.montar_segmentos(eixo, resumo)
    segs_b = segmentos.montar_segmentos(eixo, resumo)
    assert segs_a == segs_b
