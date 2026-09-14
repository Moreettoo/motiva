import solo

ZONA = solo.Solo(0.35, 60.0, "premissa")


def test_dois_campos_presentes_o_solo_do_trecho_vence_com_a_fonte():
    """O caso central da Tarefa 15: 43 dos 60 trechos do Rodoanel tem
    `fertilidade_solo`/`capacidade_agua_solo_mm` medidos pelo SoilGrids no
    proprio marco, e esse numero tem que vencer o da zona -- com `fonte`
    carregando junto (spec 4: a origem viaja com o dado, nunca vira so um
    rotulo cosmetico).
    """
    t = {"fertilidade_solo": 0.70, "capacidade_agua_solo_mm": 59.4, "solo_fonte": "soilgrids"}
    r = solo.do_trecho(t, ZONA)
    assert r.fertilidade == 0.70 and r.capacidade_mm == 59.4 and r.fonte == "soilgrids"
    assert r is not ZONA


def test_so_fertilidade_presente_cai_para_a_zona():
    """Os dois campos tem que existir JUNTOS. `capacidade_agua_solo_mm` nulo
    com `fertilidade_solo` preenchido nao pode virar um Solo de meio-termo
    (fertilidade do trecho, capacidade da zona) -- cai inteiro para a zona.
    """
    t = {"fertilidade_solo": 0.70, "capacidade_agua_solo_mm": None, "solo_fonte": "soilgrids"}
    assert solo.do_trecho(t, ZONA) is ZONA


def test_so_capacidade_presente_cai_para_a_zona():
    """O mesmo teste acima, faltando o outro campo -- flipar o `and` da
    condicao real para `or` faz UM destes dois testes passar (o campo que
    sobrou "ativa" o ramo do trecho) e o outro falhar; os dois juntos fecham
    essa porta.
    """
    t = {"fertilidade_solo": None, "capacidade_agua_solo_mm": 59.4}
    assert solo.do_trecho(t, ZONA) is ZONA


def test_nenhum_campo_cai_para_a_zona():
    assert solo.do_trecho({}, ZONA) is ZONA


def test_solo_fonte_ausente_assume_soilgrids():
    """`solo_fonte` e coluna separada e pode faltar mesmo com os dois numeros
    presentes (base antiga, preenchimento manual). O default e "soilgrids"
    porque essa e a UNICA fonte que hoje grava esses dois campos no trecho
    (ver `pesquisa.rodoanel.solo_km`) -- nao "premissa", que nunca escreve
    nesses campos.
    """
    t = {"fertilidade_solo": 0.70, "capacidade_agua_solo_mm": 59.4}
    assert solo.do_trecho(t, ZONA).fonte == "soilgrids"
