"""Testes de `regras_decisao.py` -- o estudo extra da banda q10/q50/q90.

Protocolo pre-registrado (ver docstring do modulo e o pedido original em
.superpowers/sdd/2026-09-13-dados-reais-rodoanel/): seis regras fixas,
escolha SO pelos km pares, resultado retido nos km impares. Os testes abaixo
cobrem a logica de classificacao de cada regra com casos construidos onde a
resposta certa e obvia, pinam o tamanho do split par/impar nos 195 pares
REAIS (103/92, estabelecido na Tarefa 9), e conferem contra o
`classe_final_prevista` ja gravado em validacao.json (regra q50 tem que
reproduzir exatamente o que a Tarefa 9 gravou -- e o mesmo calculo).
"""
from __future__ import annotations

import pytest

from pesquisa.rodoanel import regras_decisao as rd
from pesquisa.rodoanel.regras_decisao import Par


def _par(km, c1, c2, h0, q10, q50, q90):
    return Par(km_m=km, faixa="cant_lateral_externa", classe_inicial=c1, classe_final_observada=c2,
               altura_inicial_cm=h0, q10_cm=q10, q50_cm=q50, q90_cm=q90)


def test_classe_de_fronteiras():
    assert [rd.classe_de(h) for h in (0, 9.99, 10, 30, 30.01, 80)] == [1, 1, 2, 2, 3, 3]


def test_km_par_mesma_formula_de_validacao():
    assert rd.km_par(_par(0, 1, 1, 5, 0, 0, 0))
    assert not rd.km_par(_par(500, 1, 1, 5, 0, 0, 0))
    assert rd.km_par(_par(29_000, 1, 1, 5, 0, 0, 0))
    assert rd.km_par(_par(29_300, 1, 1, 5, 0, 0, 0))   # mesmo grupo de 29_000 (ver validacao.py)


# -- cada regra, num caso construido onde a resposta certa e obvia --------

def test_regra_q50_classifica_pela_mediana():
    # 5 + 4.9 = 9.9 -> ainda classe 1 (por 1 mm)
    p = _par(0, 1, 1, 5.0, q10=3.0, q50=4.9, q90=6.0)
    assert rd.regra_q50(p) == 1
    # 5 + 5.1 = 10.1 -> classe 2
    p2 = _par(500, 1, 2, 5.0, q10=3.0, q50=5.1, q90=6.0)
    assert rd.regra_q50(p2) == 2


def test_regra_q10_classifica_pelo_extremo_conservador():
    # q50 e q90 cruzam a fronteira de 10, mas q10 nao: regra q10 fica na classe 1.
    p = _par(0, 1, 2, 5.0, q10=3.0, q50=6.0, q90=8.0)
    assert rd.regra_q10(p) == 1
    # agora ate o q10 cruza: regra q10 acompanha.
    p2 = _par(500, 1, 2, 5.0, q10=5.5, q50=6.0, q90=8.0)
    assert rd.regra_q10(p2) == 2


def test_regra_q90_classifica_pelo_extremo_otimista():
    # nenhum quantil cruza a fronteira de 10: fica em 1.
    p = _par(0, 1, 1, 5.0, q10=1.0, q50=2.0, q90=3.0)
    assert rd.regra_q90(p) == 1
    # so o q90 cruza (mediana ainda em classe 1): regra q90 ja acusa classe 2.
    p2 = _par(500, 1, 2, 5.0, q10=1.0, q50=2.0, q90=6.0)
    assert rd.regra_q90(p2) == 2


def test_regra_banda_toda_so_muda_se_a_banda_inteira_cruzou():
    # q10 nao cruza (mesmo com q50/q90 cruzando): banda_toda fica na classe inicial.
    p = _par(0, 1, 2, 5.0, q10=3.0, q50=6.0, q90=8.0)
    assert rd.regra_banda_toda(p) == 1
    # q10 tambem cruza: banda inteira acima da fronteira, banda_toda acompanha.
    p2 = _par(500, 1, 2, 5.0, q10=5.5, q50=6.0, q90=8.0)
    assert rd.regra_banda_toda(p2) == 2
    # nunca preve uma classe ABAIXO da inicial por esta via, mesmo se o q10
    # fosse (hipoteticamente) negativo o bastante para "descer" de classe.
    p3 = _par(1000, 2, 2, 20.0, q10=-15.0, q50=1.0, q90=2.0)
    assert rd.regra_banda_toda(p3) == 2


def test_regra_banda_qualquer_muda_se_qualquer_parte_da_banda_cruza():
    # so o q90 cruza: banda_qualquer ja acusa a classe do q90.
    p = _par(0, 1, 2, 5.0, q10=1.0, q50=2.0, q90=6.0)
    assert rd.regra_banda_qualquer(p) == 2
    # nada cruza: fica na inicial.
    p2 = _par(500, 1, 1, 5.0, q10=1.0, q50=2.0, q90=3.0)
    assert rd.regra_banda_qualquer(p2) == 1


def test_regra_sem_mudanca_sempre_preve_a_classe_inicial():
    for c1 in (1, 2, 3):
        p = _par(0, c1, 3, 5.0, q10=100.0, q50=100.0, q90=100.0)
        assert rd.regra_sem_mudanca(p) == c1


# -- avaliar_regra: mesmas definicoes de acuracia/J/matriz de validacao.avaliar --

def test_avaliar_regra_caso_construido():
    pares = [
        _par(0, 1, 2, 5.0, 3.0, 6.0, 9.0),      # 5+6=11 -> prevista 2, observada 2: acerto (transicao detectada)
        _par(500, 1, 1, 5.0, 1.0, 2.0, 3.0),    # 5+2=7 -> prevista 1, observada 1: acerto (estavel, sem alarme)
        _par(1000, 2, 2, 20.0, 2.0, 4.0, 6.0),  # 20+4=24 -> prevista 2, observada 2: acerto (estavel, sem alarme)
        _par(1500, 2, 3, 20.0, 4.0, 8.0, 12.0), # 20+8=28 -> prevista 2, observada 3: erro (transicao NAO detectada)
    ]
    r = rd.avaliar_regra(pares, rd.regra_q50)
    assert r["n"] == 4
    assert r["acuracia"] == pytest.approx(0.75)
    assert r["transicoes_total"] == 2 and r["transicoes_detectadas"] == 1
    assert r["estaveis_total"] == 2 and r["alarmes_falsos"] == 0
    assert r["J"] == pytest.approx(0.5)
    assert r["matriz"] == {"1": {"1": 1, "2": 0, "3": 0},
                           "2": {"1": 0, "2": 2, "3": 0},
                           "3": {"1": 0, "2": 1, "3": 0}}


def test_avaliar_regra_sem_mudanca_reproduz_a_linha_de_base():
    pares = [_par(0, 1, 2, 5.0, 0, 0, 0), _par(500, 1, 1, 5.0, 0, 0, 0), _par(1000, 2, 2, 20.0, 0, 0, 0)]
    r = rd.avaliar_regra(pares, rd.regra_sem_mudanca)
    assert r["acuracia"] == pytest.approx(2 / 3)
    assert r["J"] == 0.0
    assert r["alarmes_falsos"] == 0


def test_escolher_vencedora_desempata_pela_ordem_fixa():
    # tres regras empatadas em 0.9: a ordem fixa (NOMES_REGRAS) decide, nao
    # a ordem de insercao do dict passado.
    empatadas = {"acuracia": 0.9}
    perdedora = {"acuracia": 0.5}
    resultados = {"q50": perdedora, "q10": empatadas, "q90": perdedora,
                 "banda_toda": empatadas, "banda_qualquer": perdedora, "sem_mudanca": empatadas}
    assert rd.escolher_vencedora(resultados) == "q10"   # primeira da lista fixa entre as empatadas


# -- dados reais: 195 pares, split 103/92, e coerencia com validacao.json --

def test_carregar_pares_le_os_195_pares_reais():
    pares = rd.carregar_pares()
    assert len(pares) == 195
    assert all(isinstance(p, Par) for p in pares)


def test_split_km_par_km_impar_bate_com_a_tarefa_9():
    pares = rd.carregar_pares()
    n_par = sum(1 for p in pares if rd.km_par(p))
    n_impar = sum(1 for p in pares if not rd.km_par(p))
    assert (n_par, n_impar) == (103, 92)
    assert n_par + n_impar == 195


def test_regra_q50_reproduz_classe_final_prevista_ja_gravada_em_validacao_json():
    """Sanidade cruzada: `resultado.sem_calibracao.por_par[i].classe_final_prevista`
    ja foi calculado pela Tarefa 9 como classe_de(altura_inicial + q50). A
    regra q50 daqui tem que reproduzir, par a par, exatamente esse numero --
    senao os dois modulos estao usando definicoes diferentes de classe."""
    import json

    dados = json.loads(rd.ARQ_VALIDACAO.read_text())
    por_par = dados["resultado"]["sem_calibracao"]["por_par"]
    pares = rd.carregar_pares()
    assert len(pares) == len(por_par)
    for p, r in zip(pares, por_par):
        assert rd.regra_q50(p) == r["classe_final_prevista"]


def test_regra_sem_mudanca_reproduz_os_83_1_por_cento_da_tarefa_9():
    pares = rd.carregar_pares()
    r = rd.avaliar_regra(pares, rd.regra_sem_mudanca)
    assert r["n"] == 195
    assert r["transicoes_total"] == 33
    assert r["estaveis_total"] == 162
    assert r["J"] == 0.0
    assert r["acuracia"] == pytest.approx(162 / 195)
    assert r["acuracia"] == pytest.approx(0.831, abs=5e-4)


# -- o estudo inteiro: escolha nos km pares, resultado retido nos km impares --

def test_rodar_estudo_estrutura_e_metadados():
    r = rd.rodar_estudo()
    assert set(r) >= {"protocolo", "n_total", "tabela_km_par_km_impar", "regra_escolhida",
                      "regra_escolhida_venceu_so_por_nunca_prever_mudanca",
                      "resultado_km_impar_da_escolhida", "resultado_geral_da_escolhida",
                      "baseline_sem_mudanca_geral"}
    assert r["n_total"] == 195
    assert r["protocolo"]["km_par_n"] == 103 and r["protocolo"]["km_impar_n"] == 92
    assert set(r["tabela_km_par_km_impar"]) == set(rd.NOMES_REGRAS)
    for nome in rd.NOMES_REGRAS:
        par_impar = r["tabela_km_par_km_impar"][nome]
        assert set(par_impar) == {"km_par", "km_impar"}
        assert par_impar["km_par"]["n"] == 103 and par_impar["km_impar"]["n"] == 92


def test_rodar_estudo_escolhe_q10_nos_195_pares_reais_e_e_identica_a_sem_mudanca():
    """O resultado honesto deste estudo, pinado contra os 195 pares reais: a
    regra vencedora nos km pares (por acuracia) e `q10` -- que empata com
    `banda_toda` e `sem_mudanca` (as tres nunca prevem uma transicao nestes
    dados, porque todo q10_cm observado e positivo: ver docstring do modulo).
    O desempate pela ordem fixa (`NOMES_REGRAS`) escolhe `q10` por vir antes
    de `banda_toda` e `sem_mudanca` na lista. Nos km impares (retido, sem
    participar da escolha), a regra escolhida bate exatamente com a linha de
    base local daquela metade -- ela nunca preve mudanca nenhuma nos 195
    pares inteiros, entao "vencer" aqui e a regra 6 disfarcada."""
    r = rd.rodar_estudo()
    assert r["regra_escolhida"] == "q10"
    assert r["regra_escolhida_venceu_so_por_nunca_prever_mudanca"] is True

    impar = r["resultado_km_impar_da_escolhida"]
    assert impar["n"] == 92
    assert impar["acuracia"] == pytest.approx(78 / 92)
    assert impar["J"] == 0.0
    assert impar["transicoes_detectadas"] == 0
    assert impar["alarmes_falsos"] == 0

    geral = r["resultado_geral_da_escolhida"]
    assert geral == r["baseline_sem_mudanca_geral"]
    assert geral["acuracia"] == pytest.approx(162 / 195)
    assert geral["transicoes_total"] == 33 and geral["transicoes_detectadas"] == 0
    assert geral["estaveis_total"] == 162 and geral["alarmes_falsos"] == 0


def test_nenhuma_regra_supera_a_linha_de_base_nos_km_impares():
    """Nulidade honesta: nos 195 pares reais, nenhuma das seis regras bate a
    acuracia da propria linha de base (sem_mudanca) nos km impares -- o
    resultado esperado dado que a estrada e 83% estavel e o modelo so tem 33
    eventos de crescimento para trabalhar (ver protocolo)."""
    r = rd.rodar_estudo()
    base_impar_acc = r["tabela_km_par_km_impar"]["sem_mudanca"]["km_impar"]["acuracia"]
    for nome in rd.NOMES_REGRAS:
        acc = r["tabela_km_par_km_impar"][nome]["km_impar"]["acuracia"]
        assert acc <= base_impar_acc + 1e-12
