"""relatorio.py nao tinha nenhum teste no brief (nem escrever, nem diario, nem
consolidacao): as tres funcoes listadas em Produces ficavam cobertas so
indiretamente, rodando `pesquisa.consolidar` manualmente. Este arquivo cobre
as tres direto.
"""
from __future__ import annotations

from datetime import date

from pesquisa.rodoanel import planilha, relatorio, segmentos
from pesquisa.rodoanel.marcos import Eixo
from pesquisa.rodoanel.planilha import Levantamento, Observacao
from pesquisa.rodoanel.poligonos import Poligono


def test_escrever_cria_diretorios_que_nao_existem_e_grava_utf8(tmp_path):
    caminho = tmp_path / "sub" / "dir" / "relatorio.md"
    relatorio.escrever(caminho, "conteudo com acento: é, ç, ã")
    assert caminho.read_text(encoding="utf-8") == "conteudo com acento: é, ç, ã"


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
