import json
from datetime import date

import clima

from pesquisa.rodoanel import clima_janela


class _EixoFixo:
    def posicao(self, km_m):
        return (-23.5, -46.8) if km_m < 14_650 else (-23.6, -46.83)


def test_zonas():
    assert clima_janela.zona_de(0) == "norte"
    assert clima_janela.zona_de(14_500) == "norte"
    assert clima_janela.zona_de(14_649) == "norte"
    assert clima_janela.zona_de(14_650) == "sul"
    assert clima_janela.zona_de(29_300) == "sul"


def test_json_ida_e_volta():
    dia = clima.Dia(date(2026, 1, 1), 20.0, 15.0, 27.0, 70.0, 3.2, 18.5, 3.1, "observado")
    s = clima.Serie([dia], 0, None, None, None)
    d = clima_janela.serie_para_json(s)
    volta = clima_janela.serie_de_json(d)
    assert volta.dias == s.dias and volta.aquecimento == 0


def test_json_ida_e_volta_preserva_complemento_ano_e_aviso():
    """O teste acima usa `complemento`/`ano_historico`/`aviso` todos `None`,
    entao uma troca de posicao entre eles em `serie_de_json` (por exemplo
    `ano_historico` recebendo o `aviso` do dict) nao apareceria: os dois
    ficariam `None` de qualquer jeito e o `==` passaria por acidente. Aqui os
    tres valores sao distintos, de tipos diferentes, para que uma troca de
    posicao estoure.
    """
    dia = clima.Dia(date(2026, 1, 1), 20.0, 15.0, 27.0, 70.0, 3.2, 18.5, 3.1, "historico")
    s = clima.Serie([dia], 5, "historico", 2024, "arquivo historico incompleto")
    volta = clima_janela.serie_de_json(clima_janela.serie_para_json(s))
    assert volta == s


def test_serie_para_json_sobrevive_a_um_json_dumps_de_verdade():
    """`serie_para_json` promete um `dict` pronto para cache em disco -- o que
    so vale se `json.dumps` de fato aceitar o resultado sem `TypeError` (datas
    e tipos exoticos nao serializam). Ir por texto e voltar, em vez de so
    comparar dicts em memoria, e o que pega isso.
    """
    dia = clima.Dia(date(2026, 3, 13), 22.5, 16.0, 29.0, 68.0, 0.0, 19.0, 3.4, "observado")
    s = clima.Serie([dia], 1, None, None, None)
    texto = json.dumps(clima_janela.serie_para_json(s), ensure_ascii=False)
    volta = clima_janela.serie_de_json(json.loads(texto))
    assert volta == s


def test_carregar_todas_usa_o_cache_depois_da_primeira_vez(tmp_path, monkeypatch):
    monkeypatch.setattr(clima_janela, "DERIVADOS", tmp_path)
    chamadas = []

    def falso(lat, lon, inicio, fim, aquecimento):
        chamadas.append((round(lat, 2), round(lon, 2)))
        dia = clima.Dia(inicio, 20.0, 15.0, 27.0, 70.0, 0.0, 18.5, 3.1, "observado")
        return clima.Serie([dia], 0, None, None, None)

    class EixoFalso:
        def posicao(self, km_m):
            return (-23.5, -46.8) if km_m < 14_650 else (-23.6, -46.83)

    a = clima_janela.carregar_todas(EixoFalso(), buscar=falso)
    b = clima_janela.carregar_todas(EixoFalso(), buscar=falso)
    assert set(a) == {"norte", "sul"} and len(chamadas) == 2
    assert b["sul"].dias == a["sul"].dias
    assert b["norte"].dias == a["norte"].dias


def test_carregar_todas_busca_cada_zona_na_posicao_certa_do_eixo(tmp_path, monkeypatch):
    """O teste de cache acima so confere QUANTAS vezes `buscar` foi chamado,
    nao com que coordenadas. Uma troca na tabela `ZONAS` (norte e sul
    invertidos, por exemplo) nao mudaria a contagem de chamadas e passaria
    despercebida ali. Aqui a EixoFalso devolve coordenadas diferentes para
    cada lado do divisor e o teste confere a ORDEM das chamadas (uma lista,
    nao um set): `ZONAS` sempre visita "norte" antes de "sul" em
    `enumerate`, entao um `set` das coordenadas fica identico se os dois
    valores de `ZONAS` forem trocados entre si -- so a lista na ordem certa
    pega essa troca.
    """
    monkeypatch.setattr(clima_janela, "DERIVADOS", tmp_path)
    chamadas = []

    def falso(lat, lon, inicio, fim, aquecimento):
        chamadas.append((round(lat, 2), round(lon, 2)))
        dia = clima.Dia(inicio, 20.0, 15.0, 27.0, 70.0, 0.0, 18.5, 3.1, "observado")
        return clima.Serie([dia], 0, None, None, None)

    class EixoFalso:
        def posicao(self, km_m):
            return (-23.5, -46.8) if km_m < 14_650 else (-23.6, -46.83)

    clima_janela.carregar_todas(EixoFalso(), buscar=falso)
    assert chamadas == [(-23.5, -46.8), (-23.6, -46.83)]


def test_nome_do_arquivo_de_cache_e_a_cobertura_real_e_nao_a_janela_pedida(tmp_path, monkeypatch):
    """A janela de OBSERVACAO e 2026-03-13 a 2026-03-20, mas o arquivo em disco
    cobre 120 dias a mais para tras (o aquecimento): o nome do cache tem que
    refletir isso (`clima_<zona>_2025-11-13_2026-03-20.json`), porque uma
    tarefa futura le esse nome exato de outro checkout. Se o cache fosse
    nomeado com `JANELA_DE`/`JANELA_ATE` sem ajustar pelo aquecimento (como o
    codigo faria se so passasse a janela adiante sem descontar o aquecimento),
    o arquivo sairia com outro nome e essa leitura futura nao acharia nada.
    """
    monkeypatch.setattr(clima_janela, "DERIVADOS", tmp_path)

    def falso(lat, lon, inicio, fim, aquecimento):
        dia = clima.Dia(inicio, 20.0, 15.0, 27.0, 70.0, 0.0, 18.5, 3.1, "observado")
        return clima.Serie([dia], 0, None, None, None)

    clima_janela.carregar_todas(_EixoFixo(), buscar=falso)
    esperado_norte = tmp_path / "clima_norte_2025-11-13_2026-03-20.json"
    esperado_sul = tmp_path / "clima_sul_2025-11-13_2026-03-20.json"
    assert esperado_norte.exists() and esperado_sul.exists()
    assert not (tmp_path / "clima_norte_2026-03-13_2026-03-20.json").exists()


def test_carregar_todas_pausa_entre_zonas_so_quando_vai_mesmo_buscar_ao_vivo(tmp_path, monkeypatch):
    """A pausa entre as duas zonas existe para nao apanhar 429 do Open-Meteo
    em rajada -- e so faz sentido quando as DUAS chamadas vao mesmo a rede
    (`buscar=None`, o parametro de producao). O teste de cache acima passa
    `buscar=falso` e por isso nunca exercita esse ramo; sem este teste, remover
    a pausa (ou deixar de checar o cache antes de pausar) passaria batido.
    """
    monkeypatch.setattr(clima_janela, "DERIVADOS", tmp_path)
    pausas = []
    monkeypatch.setattr(clima_janela.time, "sleep", lambda s: pausas.append(s))

    def falsa_arquivo(lat, lon, inicio, fim, aquecimento):
        dia = clima.Dia(inicio, 20.0, 15.0, 27.0, 70.0, 0.0, 18.5, 3.1, "observado")
        return clima.Serie([dia], 0, None, None, None)

    monkeypatch.setattr(clima, "buscar_serie_arquivo", falsa_arquivo)

    clima_janela.carregar_todas(_EixoFixo())  # buscar=None: usa clima.buscar_serie_arquivo
    assert pausas == [clima_janela.PAUSA_S]

    # Rodando de novo com as duas zonas ja em cache, nao ha chamada ao vivo
    # nenhuma -- e a pausa nao deveria acontecer outra vez.
    pausas.clear()
    clima_janela.carregar_todas(_EixoFixo())
    assert pausas == []
