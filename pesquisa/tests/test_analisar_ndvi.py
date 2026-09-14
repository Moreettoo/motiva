"""O brief original tinha 4 testes para analisar_ndvi.py; a auditoria das
Tarefas 3-6 (implementacao certa, suite de teste fraca) se repetiu aqui:

- `p_valor < 0.2` na separacao perfeita e frouxo demais -- o valor exato para
  3 vs 3 sem empates e 0,1 (Mann-Whitney exato). Trocado por pytest.approx
  para pegar, por exemplo, um p calculado com o metodo assintotico errado.
- o teste "sem classe 3" so conferia auc/p None, nunca as contagens nem a
  mediana da classe que sobrou -- um bug que zerasse n_classe1 por engano
  passava do mesmo jeito.
- so havia o caso extremo AUC=1; nada testava a direcao oposta (classe 1 com
  NDVI MAIOR que a 3), que pegaria uma troca de argumentos em mannwhitneyu(c3,
  c1) por mannwhitneyu(c1, c3) -- com o caso so 1-extremo, essa troca daria
  auc=0 e o teste original (que so testava o lado 1) nao pegaria.
- `delta()` nunca era chamado com um grupo vazio (p_valor_delta tem que ficar
  None) nem com marcos so de um lado ou com valor None -- o filtro
  `if m in ndvi_b and ... is not None` do brief nunca era exercitado.
- `rocados_por_segmento` e um simbolo do Produces sem NENHUM teste direto: o
  teste de delta so passava um `set` literal, nunca chamava a funcao.
- `classe_por_segmento` nunca testava o ramo `classe in ("", None)` (linha em
  escopo mas sem classe registrada) -- so testava faixas fora de escopo.
"""
from __future__ import annotations

import pytest

from pesquisa.ndvi import analisar_ndvi


def test_separacao_perfeita_da_auc_1_e_p_valor_exato_do_mann_whitney():
    ndvi = {0: 0.2, 500: 0.25, 1000: 0.3, 1500: 0.7, 2000: 0.75, 2500: 0.8}
    classes = {0: 1, 500: 1, 1000: 1, 1500: 3, 2000: 3, 2500: 3}
    r = analisar_ndvi.separacao(ndvi, classes)
    assert r["n_classe1"] == 3 and r["n_classe3"] == 3
    # p exato do teste de Mann-Whitney exato para 3 vs 3 sem empates e
    # separacao total (nao so "< 0,2", que um p calculado errado tambem
    # passaria por baixo de).
    assert r["auc"] == pytest.approx(1.0) and r["p_valor"] == pytest.approx(0.1)
    assert r["ndvi_mediana_c1"] == pytest.approx(0.25) and r["ndvi_mediana_c3"] == pytest.approx(0.75)


def test_separacao_invertida_classe1_com_ndvi_maior_da_auc_proximo_de_0():
    """Complemento do teste acima: se `separacao` trocasse a ordem dos
    argumentos em `mannwhitneyu(c3, c1)`, o teste de AUC=1 sozinho nao
    pegaria (a troca so afeta em qual extremo cada cenario cai). Com os dois
    extremos cobertos, uma troca de argumentos falha em pelo menos um deles.
    """
    ndvi = {0: 0.7, 500: 0.75, 1000: 0.8, 1500: 0.2, 2000: 0.25, 2500: 0.3}
    classes = {0: 1, 500: 1, 1000: 1, 1500: 3, 2000: 3, 2500: 3}
    r = analisar_ndvi.separacao(ndvi, classes)
    assert r["auc"] == pytest.approx(0.0) and r["p_valor"] == pytest.approx(0.1)


def test_separacao_sem_classe_3_e_nula_mas_preserva_contagem_e_mediana_da_classe_1():
    r = analisar_ndvi.separacao({0: 0.5, 500: 0.6}, {0: 1, 500: 2})
    assert r["auc"] is None and r["p_valor"] is None
    # so o marco 0 e classe 1 (o 500 e classe 2, fora das duas classes
    # comparadas); a mediana de um unico valor e o proprio valor.
    assert r["n_classe1"] == 1 and r["n_classe3"] == 0
    assert r["ndvi_mediana_c1"] == pytest.approx(0.5) and r["ndvi_mediana_c3"] is None


def test_delta_rocados_cai_com_valores_exatos_e_p_valor_calculado():
    a = {0: 0.7, 500: 0.7, 1000: 0.7, 1500: 0.7}
    b = {0: 0.3, 500: 0.35, 1000: 0.72, 1500: 0.69}
    r = analisar_ndvi.delta(a, b, rocados={0, 500})
    assert r["n_rocados"] == 2 and r["n_nao_rocados"] == 2
    assert r["delta_rocados"] < r["delta_nao_rocados"]
    # medianas exatas (-0,4 e -0,35 -> mediana -0,375; 0,02 e -0,01 -> 0,005)
    # e o p exato do Mann-Whitney para 2 vs 2 sem empates: um teste que so
    # conferisse a desigualdade nao pegaria um calculo de mediana errado que
    # por acaso preservasse a ordem.
    assert r["delta_rocados"] == pytest.approx(-0.375)
    assert r["delta_nao_rocados"] == pytest.approx(0.005)
    assert r["p_valor_delta"] == pytest.approx(1 / 3)


def test_delta_com_um_grupo_vazio_mantem_p_valor_none():
    """O brief nunca chamava delta() com `rocados` vazio ou so-rocados: o
    guard `if roc and nao` ficava sem teste. Sem ele, `mannwhitneyu` com uma
    lista vazia levantaria ValueError em producao (por exemplo, se nenhum
    segmento foi rocado no periodo)."""
    a = {0: 0.7, 500: 0.7}
    b = {0: 0.3, 500: 0.35}
    r = analisar_ndvi.delta(a, b, rocados=set())
    assert r["n_rocados"] == 0 and r["n_nao_rocados"] == 2
    assert r["delta_rocados"] is None and r["p_valor_delta"] is None
    assert r["delta_nao_rocados"] is not None


def test_delta_ignora_marco_ausente_na_outra_data_ou_com_valor_none():
    """`d` so inclui marcos presentes E nao-None nas duas datas -- e o brief
    nunca testava isso. Sem este teste, um bug que removesse o filtro (por
    exemplo iterando so por `ndvi_a` sem checar `m in ndvi_b`) so quebraria
    em producao, com um KeyError, na primeira leitura real com falha de
    imagem num marco."""
    a = {0: 0.7, 500: 0.7, 1000: 0.7}   # 1000 nao existe em b
    b = {0: 0.3, 500: None}              # 500 e None em b
    r = analisar_ndvi.delta(a, b, rocados={0, 500, 1000})
    assert r["n_rocados"] == 1 and r["n_nao_rocados"] == 0
    assert r["delta_rocados"] == pytest.approx(-0.4)


def test_classe_por_segmento_pega_a_pior_faixa_em_escopo():
    obs = [{"data": "2026-03-13", "km_marco_m": "0", "faixa": "cant_lateral_externa", "classe": "1"},
           {"data": "2026-03-13", "km_marco_m": "0", "faixa": "cant_central_interna", "classe": "3"},
           {"data": "2026-03-13", "km_marco_m": "0", "faixa": "cant_dispositivo_ext", "classe": "3"},
           {"data": "2026-03-13", "km_marco_m": "500", "faixa": "cant_dispositivo_ext", "classe": "2"},
           {"data": "2026-03-20", "km_marco_m": "0", "faixa": "cant_lateral_externa", "classe": "2"}]
    assert analisar_ndvi.classe_por_segmento(obs, "2026-03-13") == {0: 3}
    assert analisar_ndvi.classe_por_segmento(obs, "2026-03-20") == {0: 2}


def test_classe_por_segmento_ignora_faixa_em_escopo_sem_classe_registrada():
    """`o["classe"] in ("", None)` nunca era exercitado: sem este teste, um
    codigo que trocasse esse guard por `or c == 0` (parecido, mas errado --
    classe 0 nao existe na planilha, ja "" e comum: celula em branco) passaria
    despercebido."""
    obs = [{"data": "2026-03-13", "km_marco_m": "700", "faixa": "cant_lateral_externa", "classe": ""},
           {"data": "2026-03-13", "km_marco_m": "700", "faixa": "cant_central_interna", "classe": None}]
    assert analisar_ndvi.classe_por_segmento(obs, "2026-03-13") == {}


def test_rocados_por_segmento_pega_so_transicao_rocado_e_colapsa_por_marco():
    """Produces lista `rocados_por_segmento` como simbolo publico, mas o
    brief so testava `delta()` com um `set` literal passado a mao -- a
    funcao em si nunca era chamada. Cobre a leitura de string->int do
    `km_marco_m` (como vem de banco.ler_csv) e que duas faixas rocadas no
    mesmo marco colapsam num unico elemento do set."""
    pares = [
        {"km_marco_m": "3000", "faixa": "cant_lateral_externa", "transicao": "rocado"},
        {"km_marco_m": "3000", "faixa": "cant_central_interna", "transicao": "rocado"},
        {"km_marco_m": "3500", "faixa": "cant_lateral_externa", "transicao": "cresceu"},
        {"km_marco_m": "4000", "faixa": "cant_lateral_externa", "transicao": "estavel"},
    ]
    assert analisar_ndvi.rocados_por_segmento(pares) == {3000}
