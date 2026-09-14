"""relatorio.py nao tinha nenhum teste no brief (nem escrever, nem diario, nem
consolidacao): as tres funcoes listadas em Produces ficavam cobertas so
indiretamente, rodando `pesquisa.consolidar` manualmente. Este arquivo cobre
as tres direto -- e, na Tarefa 9, tambem `relatorio.validacao`, que o brief
tao pouco cobria (mais um Produces sem teste nenhum).
"""
from __future__ import annotations

from dataclasses import asdict
from datetime import date

import numpy as np

from pesquisa.rodoanel import planilha, relatorio, segmentos
from pesquisa.rodoanel import validacao as validacao_mod
from pesquisa.rodoanel.marcos import Eixo
from pesquisa.rodoanel.planilha import Levantamento, Observacao
from pesquisa.rodoanel.poligonos import Poligono
from pesquisa.rodoanel.validacao import Linha, Parametros


def test_escrever_cria_diretorios_que_nao_existem_e_grava_utf8(tmp_path):
    caminho = tmp_path / "sub" / "dir" / "relatorio.md"
    relatorio.escrever(caminho, "conteudo com acento: é, ç, ã")
    assert caminho.read_text(encoding="utf-8") == "conteudo com acento: é, ç, ã"


def test_num_formata_no_padrao_br_ponto_de_milhar_virgula_decimal():
    """Pina os dois bugs de formatacao que motivaram o helper central `_num`
    (usado por `_br` e por `_tabela`): o eixo tem 29.025 m (29 mil, ponto de
    milhar), nao "29,025 m" (que um leitor BR le como vinte e nove virgula
    zero-dois-cinco); e 98,2 ha (virgula decimal), nao "98.2 ha" (ponto onde
    o BR usa virgula). Mais um caso misto (milhar E decimal juntos) para
    fechar a cobertura.
    """
    assert relatorio._num(29_025.0, 0) == "29.025"
    assert relatorio._num(98.2, 1) == "98,2"
    assert relatorio._num(1_234.5, 1) == "1.234,5"
    assert relatorio._br(29_025.0, 0) == "29.025"
    assert relatorio._br(98.2, 1) == "98,2"


def test_diario_acrescenta_uma_linha_por_chamada_no_formato_esperado(tmp_path, monkeypatch):
    """diario() escreve no DOCS_PESQUISA real do projeto -- o unico jeito de
    testar sem poluir docs/pesquisa/00-diario.md e apontar o modulo para um
    tmp_path. Confere o formato inteiro da linha (data, separador `·`, o
    texto passado e o commit), e que duas chamadas ACRESCENTAM (nao
    sobrescrevem).
    """
    monkeypatch.setattr(relatorio, "DOCS_PESQUISA", tmp_path)
    relatorio.diario("primeira linha")
    relatorio.diario("segunda linha")
    linhas = (tmp_path / "00-diario.md").read_text(encoding="utf-8").splitlines()
    assert len(linhas) == 2
    for linha, texto in zip(linhas, ["primeira linha", "segunda linha"]):
        assert linha.startswith("- 20")
        assert f" · {texto} · commit " in linha


def _eixo_toy() -> Eixo:
    return Eixo(((-23.40, -46.70), (-23.60, -46.80)), (0.0, 29_300.0))


def _lev_toy(data: date, classes: dict) -> Levantamento:
    marcos = (0, 500)
    faixas = [f[2] for f in planilha.FAIXAS]
    obs = tuple(Observacao(m, f, classes.get((m, f))) for m in marcos for f in faixas)
    return Levantamento("x.xlsx", data, date(2025, 3, 28), "SP-021", marcos, obs)


def test_consolidacao_nao_digita_numero_a_mao_bate_com_as_contagens_de_entrada():
    """Constroi um cenario minusculo e conhecido (2 pares, 1 poligono, 2
    segmentos) e confere que cada numero central do texto vem exatamente das
    estruturas passadas -- pega um f-string que troque uma contagem por
    outra (por exemplo, o total de pares pelo total de faixas), o que
    nenhum teste de aceitacao pegaria porque so roda contra os 248 pares
    reais e nunca contra um cenario onde os numeros divergem entre si.
    """
    lev1 = _lev_toy(date(2026, 3, 13), {(0, "cant_lateral_externa"): 1, (0, "cant_central_interna"): 3})
    lev2 = _lev_toy(date(2026, 3, 20), {(0, "cant_lateral_externa"): 2, (0, "cant_central_interna"): 1})
    eixo = _eixo_toy()
    pares = segmentos.montar_pares(lev1, lev2)
    matriz = segmentos.matriz_transicao(pares)
    assert len(pares) == 2   # sanidade do cenario antes de conferir o texto

    poligono = Poligono(indice=0, metodo="Apenas manual", km_descricao=0, latitude=-23.40, longitude=-46.70,
                         area_m2=1234.5, aneis=(((-46.70, -23.40), (-46.70, -23.401), (-46.701, -23.401), (-46.701, -23.40)),),
                         aneis_internos=())
    atribuicao = {0: (0, 12.3)}
    segs = segmentos.montar_segmentos(eixo, {0: {"metodo_dominante": "Apenas manual", "area_total_m2": 1234.5,
                                                  "areas": {"Apenas manual": 1234.5}, "n_poligonos": 1}})

    texto = relatorio.consolidacao(lev1=lev1, lev2=lev2, eixo=eixo, segmentos=segs, pares=pares, matriz=matriz,
                                    poligonos=[poligono], atribuicao=atribuicao)

    assert isinstance(texto, str) and texto.startswith("# 01")
    assert f"{len(pares)} pares" in texto
    assert "cresceram **1**" in texto and "roçados **1**" in texto and "estáveis **0**" in texto
    assert "1 polígonos" in texto
    assert "Apenas manual" in texto
    # a linha da tabela do segmento 0 tem que trazer a latitude/longitude
    # REAL calculada por eixo.posicao(0) para este eixo de teste (-23,400 /
    # -46,700), formatada com virgula decimal por `_tabela` -- nao qualquer
    # numero plausivel: pega um f-string que renderizasse a coluna errada.
    assert len(segs) == 60 and segs[0].km_marco_m == 0
    assert segs[0].latitude == -23.4 and segs[0].longitude == -46.7
    assert "-23,400" in texto and "-46,700" in texto

    # Neste cenario so o marco 0 tem poligono no resumo: os outros 59
    # segmentos ficam com metodo_rocada None e tem que virar UM trecho
    # continuo no bullet de limitacao (km 0,50 ate 29,30), nao 59 linhas
    # soltas nem um numero errado.
    faltando = [s for s in segs if s.metodo_rocada is None]
    assert len(faltando) == 59
    assert f"**{len(faltando)}** dos **{len(segs)}** segmentos" in texto
    assert "km 0,50–29,30" in texto
    # decimais em virgula (padrao BR), nao ponto, no proprio trecho -- ancorado
    # ao contexto ("km "/"–") para nao colidir com "29.300 m" (comprimento do
    # eixo, que E "29.300" de proposito: ponto de milhar, nao decimal errado --
    # ver a correcao central de formatacao em `_num`/`_br`).
    assert "km 0.50" not in texto and "–29.30" not in texto
    # comprimento do eixo deste cenario de teste e 29_300 m: pina o ponto de
    # milhar correto (nao a virgula que o bug original produzia).
    assert "comprimento **29.300 m**" in texto


def test_paragrafo_sem_poligono_quando_todos_os_segmentos_tem_poligono():
    """Guarda o outro lado do bullet novo: se NENHUM segmento ficar sem
    poligono, o texto nao pode tentar formatar uma lista de trechos vazia
    (e nao pode, por exemplo, imprimir "0 dos 60" como se fosse um problema).
    """
    eixo = _eixo_toy()
    segs = segmentos.montar_segmentos(eixo, {m: {"metodo_dominante": "Apenas manual", "area_total_m2": 1.0,
                                                  "areas": {"Apenas manual": 1.0}, "n_poligonos": 1}
                                              for m in segmentos.MARCOS})
    assert all(s.metodo_rocada is not None for s in segs)
    texto = relatorio._paragrafo_sem_poligono(segs, [])
    assert f"Todos os **{len(segs)}** segmentos" in texto
    assert "dos **" not in texto   # nao usa o formato "N dos M" quando N=0


def test_paragrafo_sem_poligono_agrupa_trechos_nao_adjacentes_separadamente():
    """Dois marcos sem poligono que NAO sao vizinhos (500 e 2000, com marcos
    cobertos entre eles) tem que virar DOIS trechos no texto, nao um so --
    o agrupamento por adjacencia so deve unir segmentos consecutivos na
    lista, nunca todos os que faltam poligono no lote inteiro.
    """
    eixo = _eixo_toy()
    resumo = {m: {"metodo_dominante": "Apenas manual", "area_total_m2": 1.0,
                  "areas": {"Apenas manual": 1.0}, "n_poligonos": 1}
              for m in segmentos.MARCOS if m not in (500, 2000)}
    segs = segmentos.montar_segmentos(eixo, resumo)
    texto = relatorio._paragrafo_sem_poligono(segs, [])
    assert "**2** dos **60** segmentos" in texto
    assert "km 0,50–1,00" in texto
    assert "km 2,00–2,50" in texto
    assert "km 0,50–2,50" not in texto   # nao pode fundir os dois trechos


def _linha_toy(km, c1, c2, h0=None):
    h0 = {1: 5.0, 2: 20.0, 3: 40.0}[c1] if h0 is None else h0
    return Linha(km, "cant_lateral_externa", c1, c2, h0, {})


def _saida_validacao_toy() -> dict:
    """Um `saida` minusculo e conhecido (mesmo cenario de
    `test_avaliar_caso_construido` em test_validacao.py) para conferir que
    `relatorio.validacao` so LE o dicionario -- nenhum numero do texto pode
    vir digitado a mao na propria funcao de relatorio.
    """
    linhas = [_linha_toy(0, 1, 2), _linha_toy(500, 1, 1), _linha_toy(1000, 2, 2), _linha_toy(1500, 2, 3)]
    Q = np.array([[3.0, 6.0, 9.0], [1.0, 2.0, 3.0], [2.0, 4.0, 6.0], [4.0, 8.0, 12.0]])
    resultado = validacao_mod.rodar(linhas, Q)
    p = Parametros()
    sens = validacao_mod.avaliar(linhas, Q, 1.0)
    sens.pop("por_par")
    sem_premissa = validacao_mod.avaliar(linhas[:3], Q[:3], 1.0)
    sem_premissa.pop("por_par")
    return {
        "gerado_em": "14/09/2026 00:00", "commit": "abc1234",
        "parametros": asdict(p),
        "resultado": resultado,
        "sensibilidade": [{"rotulo": p.rotulo(), "parametros": asdict(p), **sens}],
        "solo_premissa": {
            "n_marcos_premissa": 1, "n_marcos_total": 4, "n_pares_premissa": 1, "n_pares_total": 4,
            "fertilidade_premissa": [0.35], "fertilidade_medida_min": 0.5, "fertilidade_medida_max": 0.6,
            "capacidade_premissa": [60.0], "capacidade_medida_min": 58.0, "capacidade_medida_max": 62.0,
            "sem_premissa": sem_premissa,
        },
        "fila_retrospectiva": {"segmentos_avaliados": 4, "marcados": [0], "cruzaram": [0, 1500],
                               "acertos": [0], "n_marcados": 1, "n_cruzaram": 2, "n_acertos": 1},
    }


def test_validacao_nao_digita_numero_a_mao():
    saida = _saida_validacao_toy()
    texto = relatorio.validacao(saida)
    res = saida["resultado"]

    assert texto.startswith("# 02")
    assert saida["gerado_em"] in texto and saida["commit"] in texto
    # os numeros centrais (n, acuracia, transicoes, alarmes, J) tem que vir do
    # proprio `resultado`, com virgula decimal (padrao BR) -- nao hardcoded.
    assert f"**{res['sem_calibracao']['n']}**" in texto
    assert "83,1%" not in texto   # este cenario de teste NAO e o dos 195 pares reais
    assert f"{res['sem_calibracao']['transicoes_detectadas']} de {res['sem_calibracao']['transicoes_total']}" in texto
    assert f"{res['sem_calibracao']['alarmes_falsos']} de {res['sem_calibracao']['estaveis_total']}" in texto
    # o fator vigente tem que aparecer com VIRGULA decimal (o bug original do
    # brief usava `.replace` so em alguns lugares e deixava outros com ponto).
    fator_txt = f"{res['fator_vigente']:.2f}".replace(".", ",")
    assert f"fator vigente {fator_txt}" in texto and f"Vigente: **{fator_txt}**" in texto
    assert ".2f" not in texto and "0.0" not in texto   # nenhum ponto decimal escapou

    # sensibilidade ao solo assumido: os numeros vem do dict `solo_premissa`,
    # nao digitados na funcao de relatorio -- muda o dict, muda o texto.
    sp = saida["solo_premissa"]
    assert f"({sp['n_marcos_premissa']} de {sp['n_marcos_total']})" in texto
    assert f"**{sp['n_pares_premissa']}** dos **{sp['n_pares_total']}**" in texto
    assert "0,430–0,702" not in texto   # numero do Rodoanel real, nao deste cenario de teste
    assert "0,500–0,600" in texto or "0,5–0,6" in texto or f"{sp['fertilidade_medida_min']:.3f}".replace(".", ",") in texto

    # fila retrospectiva: os 3 numeros vem do dict, nao hardcoded.
    fila = saida["fila_retrospectiva"]
    assert f"**{fila['n_marcados']}**" in texto and f"**{fila['n_cruzaram']}**" in texto and f"**{fila['n_acertos']}**" in texto


def test_validacao_reflete_mudanca_no_dict_nao_e_texto_fixo():
    """O mesmo `saida`, com o fator vigente trocado, tem que produzir um
    texto DIFERENTE no lugar certo -- se `relatorio.validacao` tivesse algum
    numero fixo em vez de ler o dict, esta troca nao apareceria.
    """
    saida = _saida_validacao_toy()
    texto_original = relatorio.validacao(saida)
    saida["resultado"] = {**saida["resultado"], "fator_vigente": 2.5}
    texto_alterado = relatorio.validacao(saida)
    assert "Vigente: **2,50**" in texto_alterado
    assert "Vigente: **2,50**" not in texto_original
