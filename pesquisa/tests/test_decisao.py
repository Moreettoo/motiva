"""A decisao humana sobre a calibracao: UM ponto, lido pelo publicador e pelo renderizador.

Estes testes existem porque o contrato estava partido em tres e as tres partes
discordavam: `validar.py` gravava `fator_vigente = 1,15` (a regra circular da
spec 7.3), `relatorio.py` renderizava `02-validacao.md` desse campo -- entao o
documento dizia "Vigente: **1,15**" e chamava a matriz de 31,8% de "cenario
vigente" -- e a decisao humana (1,0) vivia so em `publicar_rodoanel.py`, indo
para o banco e nunca para o markdown. `docs/relatorio-motiva.md` citava esse
mesmo arquivo para sustentar a conclusao OPOSTA.

Nenhum teste aqui roda o modelo nem toca rede: todos leem o artefato que ja
existe (`pesquisa/dados/derivados/validacao.json`) ou dicionarios sinteticos.
"""
from __future__ import annotations

import copy
import json

import pytest

from pesquisa.rodoanel import DERIVADOS, decisao


def _artefato() -> dict:
    return json.loads((DERIVADOS / "validacao.json").read_text(encoding="utf-8"))


def test_artefato_cru_guarda_o_cenario_REJEITADO_no_topo():
    """A armadilha, pinada: quem ler `fator_vigente`/`final`/`pares` do arquivo
    cru esta lendo o 1,15 que foi REJEITADO, nao o que vale. Se algum dia o
    artefato passar a gravar o vigente no topo, este teste cai e os outros
    deste arquivo tem que ser relidos junto.
    """
    res = _artefato()["resultado"]
    assert res["fator_vigente"] == 1.15
    assert res["final"]["fator"] == 1.15
    assert res["final"]["acuracia"] == pytest.approx(0.31794871794871793)
    assert res["sem_calibracao"]["fator"] == 1.0
    assert res["sem_calibracao"]["acuracia"] == pytest.approx(0.6051282051282051)
    assert res["sem_calibracao"]["n"] == 195


def test_aplicar_poe_o_cenario_de_1_0_como_vigente():
    v = decisao.aplicar(_artefato())["resultado"]
    assert v["fator_vigente"] == 1.0
    assert v["final"]["fator"] == 1.0
    assert v["final"]["acuracia"] == pytest.approx(0.6051282051282051)
    # a matriz que o documento intitula "cenario vigente" passa a ser a do 1,0:
    # 118 acertos na diagonal (77 + 31 + 10) de 195.
    m = v["final"]["matriz"]
    assert m["1"]["1"] + m["2"]["2"] + m["3"]["3"] == 118


def test_aplicar_guarda_o_rejeitado_em_vez_de_apaga_lo():
    """O 1,15 foi medido e continua no documento -- o que nao pode e ser
    chamado de vigente. Apaga-lo seria a outra forma de mentir sobre ele.
    """
    v = decisao.aplicar(_artefato())["resultado"]
    assert v["rejeitado"]["fator"] == 1.15
    assert v["rejeitado"]["acuracia"] == pytest.approx(0.31794871794871793)
    assert v["fator_da_regra"] == 1.15


def test_aplicar_troca_os_pares_do_topo_para_os_do_cenario_vigente():
    v = decisao.aplicar(_artefato())
    assert len(v["pares"]) == 195
    assert v["pares"] is v["resultado"]["sem_calibracao"]["por_par"]
    # e sao OUTROS pares: a classe prevista muda com o fator.
    crus = _artefato()["pares"]
    assert [p["classe_final_prevista"] for p in v["pares"]] != [p["classe_final_prevista"] for p in crus]


def test_fila_retrospectiva_e_REFEITA_com_o_fator_vigente_e_nao_muda():
    """O ponto que o brief mandou conferir em vez de assumir: a fila gravada no
    artefato foi calculada com 1,15. Refeita com 1,0 da exatamente o mesmo --
    um fator MENOR nunca marca mais segmentos. Refazer (em vez de reaproveitar)
    e o que torna a frase "com o fator vigente" verdadeira por construcao.
    """
    bruto = _artefato()
    refeita = decisao.aplicar(bruto)["fila_retrospectiva"]
    assert refeita == bruto["fila_retrospectiva"]
    assert refeita["segmentos_avaliados"] == 55
    assert (refeita["n_marcados"], refeita["n_cruzaram"], refeita["n_acertos"]) == (0, 1, 0)


def test_aplicar_nao_mexe_no_dicionario_que_recebeu():
    """O publicador chama `aplicar` e depois usa `saida` cru na mesma funcao
    (`_observacoes_vigente`). Mutar a entrada faria a justificativa gravada no
    banco citar os numeros do cenario errado.
    """
    bruto = _artefato()
    antes = copy.deepcopy(bruto)
    decisao.aplicar(bruto)
    assert bruto["resultado"]["fator_vigente"] == antes["resultado"]["fator_vigente"] == 1.15
    assert bruto["pares"] == antes["pares"]


def _saida_sintetica(fator_regra: float) -> dict:
    cenario = {"n": 2, "fator": fator_regra, "acuracia": 0.5, "por_par": [
        {"km_marco_m": 0, "faixa": "cant_central_externa", "classe_inicial": 1,
         "classe_final_observada": 1, "classe_final_prevista": 1,
         "altura_inicial_cm": 5.0, "q10_cm": 1.0, "q50_cm": 2.0, "q90_cm": 3.0}]}
    base = {**cenario, "fator": 1.0}
    return {"resultado": {"fator_vigente": fator_regra, "final": cenario, "sem_calibracao": base},
            "pares": cenario["por_par"]}


def test_sem_candidato_rejeitado_quando_a_propria_regra_ja_escolheu_1_0():
    v = decisao.aplicar(_saida_sintetica(1.0))["resultado"]
    assert v["rejeitado"] is None and v["fator_vigente"] == 1.0


def test_fator_da_regra_diferente_do_decidido_LEVANTA_em_vez_de_rotular_errado():
    """A decisao registrada no modulo e sobre o 1,15 medido nesta validacao.
    Se uma validacao futura fizer a regra escolher outro fator, o texto de
    justificativa ("o teste nos km impares mostra que PIORA") deixa de valer
    para ele -- e o certo e parar e pedir uma decisao humana nova, nao carimbar
    a justificativa velha num cenario que ninguem examinou.
    """
    with pytest.raises(ValueError, match="1.30"):
        decisao.aplicar(_saida_sintetica(1.30))
