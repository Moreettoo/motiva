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


def _analise_toy(auc, p_valor, data_alvo="2026-03-13", data_imagem="2026-03-16") -> dict:
    return {"data_alvo": data_alvo, "data_imagem": data_imagem, "defasagem_dias": 3,
            "nuvem_pct_media": 0.2, "n_classe1": 7, "n_classe3": 23,
            "ndvi_mediana_c1": 0.58, "ndvi_mediana_c3": 0.50, "auc": auc, "p_valor": p_valor}


def _saida_ndvi_toy(analises: list, n_segmentos_rocados=38) -> dict:
    return {"gerado_em": "14/09/2026 00:00", "commit": "abc1234", "analises": analises,
            "n_segmentos_rocados": n_segmentos_rocados}


def test_ndvi_bloco_normal_traz_tabela_auc_e_p():
    """`relatorio.ndvi` era a unica funcao do Produces sem teste no arquivo
    inteiro (as outras duas ja tinham sido cobertas nesta auditoria) --
    exatamente o padrao que o docstring deste arquivo descreve para as
    outras tres: um f-string que puxasse o campo errado (por exemplo
    `ndvi_mediana_c3` na coluna da classe 1) so apareceria rodando contra um
    cenario minusculo e conhecido, nunca contra os 3 alvos reais.
    """
    r = _analise_toy(auc=0.155, p_valor=0.0049)
    texto = relatorio.ndvi(_saida_ndvi_toy([r]))
    assert isinstance(texto, str) and texto.startswith("# 03")
    assert "### 2026-03-13" in texto
    assert "Imagem de **2026-03-16**" in texto
    assert "| segmentos | 7 | 23 |" in texto
    assert "AUC (classe 3 acima da 1) = **0,155**" in texto and "p = 0,0049" in texto


def test_ndvi_bloco_sem_imagem_fica_de_fora_da_leitura_agregada():
    r_sem = {"data_alvo": "2025-12-25", "sem_imagem": True}
    r_ok = _analise_toy(auc=0.6, p_valor=0.01)
    texto = relatorio.ndvi(_saida_ndvi_toy([r_sem, r_ok]))
    assert "### 2025-12-25" in texto
    assert "Nenhuma imagem com nuvem média abaixo de 50%" in texto
    # a data sem imagem nao pode contaminar a prosa interpretativa agregada
    assert "2025-12-25" not in texto.split("## Leitura")[1]


def test_ndvi_leitura_delta_nao_significativo_cita_o_numero_calculado_nao_o_53_do_espec():
    """Revisao apontou que um p nao significativo do teste de corte ficava
    so como numero na tabela, sem ninguem afirmar que o satelite nao
    detectou nada. O numero de segmentos com rocada citado tem que vir de
    `n_segmentos_rocados` (calculado), nunca do "53" ilustrativo do espec
    (secao 14), que e de outro contexto -- reaproveitar esse numero seria
    digitar um numero a mao.
    """
    r = _analise_toy(auc=0.5, p_valor=0.5, data_alvo="2026-03-20", data_imagem="2026-03-21")
    r.update(n_rocados=34, n_nao_rocados=10, delta_rocados=0.014, delta_nao_rocados=0.0145, p_valor_delta=0.6847)
    texto = relatorio.ndvi(_saida_ndvi_toy([r], n_segmentos_rocados=38))
    assert "não encontrou" in texto
    assert "38 segmentos com roçada inferida" in texto
    assert "53" not in texto
    assert "espec (seção 14" in texto
    # revisao: 38 (total com rocada inferida) e 34 (n_rocados, so quem tem
    # NDVI valido nas duas datas) sao denominadores diferentes por definicao
    # -- o texto tem que dizer isso, com os dois numeros vindos do dado.
    assert "34 dos 38 tinham NDVI válido em ambas as datas" in texto


def test_ndvi_leitura_delta_nao_repete_ponte_quando_os_dois_numeros_sao_iguais():
    """Contraprova da anterior: se `n_rocados` bater com `n_segmentos_rocados`
    (todo segmento rocado tinha NDVI valido nas duas datas), a clausula-ponte
    seria uma tautologia ("34 dos 34") e nao deve aparecer.
    """
    r = _analise_toy(auc=0.5, p_valor=0.5, data_alvo="2026-03-20", data_imagem="2026-03-21")
    r.update(n_rocados=34, n_nao_rocados=10, delta_rocados=0.014, delta_nao_rocados=0.0145, p_valor_delta=0.6847)
    texto = relatorio.ndvi(_saida_ndvi_toy([r], n_segmentos_rocados=34))
    assert "tinham NDVI válido em ambas as datas" not in texto
    assert "34 segmentos com roçada inferida" in texto


def test_ndvi_leitura_delta_significativo_troca_a_frase():
    r = _analise_toy(auc=0.5, p_valor=0.5, data_alvo="2026-03-20", data_imagem="2026-03-21")
    r.update(n_rocados=34, n_nao_rocados=10, delta_rocados=-0.05, delta_nao_rocados=0.01, p_valor_delta=0.001)
    texto = relatorio.ndvi(_saida_ndvi_toy([r]))
    assert "encontrou diferença estatisticamente significativa" in texto
    assert "não encontrou" not in texto


def test_ndvi_leitura_separacao_diz_invertida_quando_auc_abaixo_de_0_5():
    """O achado central da Tarefa 14: AUC < 0,5 significa inversao (classe 3
    lendo NDVI mais baixo que a classe 1), nao "sem separacao". A frase e a
    direcao certa tem que vir do proprio dado (`auc < 0.5`), entao os dois
    AUCs interpolados (nao redigitados) tem que aparecer no texto.
    """
    r1 = _analise_toy(auc=0.155, p_valor=0.0049, data_alvo="2026-03-13")
    r2 = _analise_toy(auc=0.188, p_valor=0.0072, data_alvo="2026-03-20", data_imagem="2026-03-21")
    texto = relatorio.ndvi(_saida_ndvi_toy([r1, r2]))
    assert "invertida em todas as datas com comparação possível" in texto
    assert "no sentido esperado em todas as datas" not in texto
    assert "0,155" in texto and "0,188" in texto
    # o negrito da frase-chave tem que ser um par limpo, sem um "**...**"
    # externo por cima (bug real: aninhar um segundo par de `**` ao redor da
    # frase inteira faz "invertida..." perder o negrito no render, porque
    # markdown consome os `**` aos pares na ordem em que aparecem).
    assert "mas **invertida em todas as datas com comparação possível**:" in texto


def test_ndvi_leitura_separacao_usa_ponto_medio_cm_do_dominio_nao_numero_digitado(monkeypatch):
    """Revisao apontou "~40 cm" e "~5 cm" como literais soltos, enquanto
    `planilha.PONTO_MEDIO_CM` ja tem esses numeros. Monkeypatcha a constante
    para um valor diferente e confere que o texto muda junto -- prova que a
    frase le a constante em vez de repetir um numero fixo escrito na string.
    """
    from pesquisa.rodoanel import planilha
    monkeypatch.setattr(planilha, "PONTO_MEDIO_CM", {1: 7.0, 2: 20.0, 3: 45.0})
    r1 = _analise_toy(auc=0.155, p_valor=0.0049, data_alvo="2026-03-13")
    r2 = _analise_toy(auc=0.188, p_valor=0.0072, data_alvo="2026-03-20", data_imagem="2026-03-21")
    texto = relatorio.ndvi(_saida_ndvi_toy([r1, r2]))
    assert "~45 cm" in texto and "~7 cm" in texto
    assert "~40 cm" not in texto and "~5 cm" not in texto


def test_ndvi_leitura_separacao_ramo_misto_e_o_que_realmente_esta_em_producao():
    """Revisao apontou que so os extremos (tudo invertido, tudo esperado)
    tinham teste -- mas o documento real (2 de 3 datas invertidas e
    significativas, 1 nao) cai exatamente no ramo misto de direcao E no
    ramo misto de significancia, os dois sem cobertura ate aqui.
    """
    r1 = _analise_toy(auc=0.2, p_valor=0.01, data_alvo="2026-03-13")
    r2 = _analise_toy(auc=0.3, p_valor=0.02, data_alvo="2026-03-20", data_imagem="2026-03-21")
    r3 = _analise_toy(auc=0.7, p_valor=0.5, data_alvo="2025-03-28", data_imagem="2025-03-31")
    texto = relatorio.ndvi(_saida_ndvi_toy([r1, r2, r3]))
    assert "invertida em 2 de 3 datas (2026-03-13, 2026-03-20) e no sentido esperado nas demais" in texto
    assert "estatisticamente significativa em 2026-03-13, 2026-03-20 (p < 0,05); não significativa nas demais" in texto


def test_ndvi_leitura_separacao_diz_sentido_esperado_quando_auc_acima_de_0_5():
    """Contraprova da anterior: se um resultado futuro vier com AUC >= 0,5,
    o texto tem que seguir o dado (sentido esperado), nunca continuar
    afirmando inversao por um texto fixo digitado a mao.
    """
    r1 = _analise_toy(auc=0.8, p_valor=0.01, data_alvo="2026-03-13")
    r2 = _analise_toy(auc=0.7, p_valor=0.02, data_alvo="2026-03-20", data_imagem="2026-03-21")
    texto = relatorio.ndvi(_saida_ndvi_toy([r1, r2]))
    assert "no sentido esperado em todas as datas" in texto
    assert "invertida em todas as datas" not in texto


def test_ndvi_leitura_sanidade_so_aparece_quando_2025_bate_com_a_direcao_de_2026():
    r_2026 = _analise_toy(auc=0.2, p_valor=0.01, data_alvo="2026-03-13")
    r_2025_mesma_direcao = _analise_toy(auc=0.3, p_valor=0.02, data_alvo="2025-03-28", data_imagem="2025-03-31")
    texto = relatorio.ndvi(_saida_ndvi_toy([r_2026, r_2025_mesma_direcao]))
    assert "leitura de sanidade de 2025-03-28" in texto
    assert "pergunta em aberto" in texto

    r_2025_direcao_oposta = _analise_toy(auc=0.9, p_valor=0.02, data_alvo="2025-03-28", data_imagem="2025-03-31")
    texto2 = relatorio.ndvi(_saida_ndvi_toy([r_2026, r_2025_direcao_oposta]))
    assert "leitura de sanidade de 2025-03-28" not in texto2
