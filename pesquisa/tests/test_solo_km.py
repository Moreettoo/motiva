import json

import solo

from pesquisa.rodoanel import solo_km


class EixoFalso:
    def posicao(self, km_m):
        return (-23.5 - km_m / 1e6, -46.8)


def test_busca_uma_vez_por_marco_e_reaproveita_o_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(solo_km, "CACHE", tmp_path / "solo.json")
    chamadas = []

    def falso(lat, lon):
        chamadas.append(lat)
        return solo.Solo(0.4, 60.0, "soilgrids", 1.7, 0.0)

    a = solo_km.carregar_ou_buscar(EixoFalso(), marcos=(0, 500), buscar=falso, pausa=0)
    b = solo_km.carregar_ou_buscar(EixoFalso(), marcos=(0, 500), buscar=falso, pausa=0)
    assert set(a) == {0, 500} and len(chamadas) == 2
    assert b[500]["fertilidade"] == 0.4 and b[500]["fonte"] == "soilgrids"


def test_dict_por_marco_tem_exatamente_as_chaves_do_contrato(tmp_path, monkeypatch):
    """O teste de cache acima so confere `fertilidade` e `fonte`. O contrato
    (Produces, no brief da Tarefa 8) promete sete chaves; um bug que
    esquecesse `distancia_km` ou `longitude`, ou que vazasse uma chave extra,
    passaria despercebido sem conferir o conjunto inteiro.
    """
    monkeypatch.setattr(solo_km, "CACHE", tmp_path / "solo.json")

    def falso(lat, lon):
        return solo.Solo(0.4, 60.0, "soilgrids", 1.7, 0.0)

    dados = solo_km.carregar_ou_buscar(EixoFalso(), marcos=(0,), buscar=falso, pausa=0)
    assert set(dados[0]) == {"fertilidade", "capacidade_mm", "fonte", "nitrogenio_g_kg",
                             "distancia_km", "latitude", "longitude"}


def test_cada_marco_fica_com_o_solo_e_a_coordenada_do_seu_proprio_ponto(tmp_path, monkeypatch):
    """O teste de cache acima usa um `falso` que devolve sempre o MESMO Solo
    para qualquer marco, entao uma troca de posicao entre os marcos no dict
    final (o valor do marco 0 parar sob a chave 500, por exemplo) nao mudaria
    nada no resultado e passaria despercebida. Aqui `falso` devolve um Solo
    diferente PARA CADA latitude pedida, e o teste confere que cada marco fica
    com o solo -- e a lat/lon -- do seu proprio ponto, nao do vizinho.
    """
    monkeypatch.setattr(solo_km, "CACHE", tmp_path / "solo.json")

    def falso(lat, lon):
        return solo.Solo(round(-lat, 6), 60.0, "soilgrids", 1.7, 0.0)

    eixo = EixoFalso()
    dados = solo_km.carregar_ou_buscar(eixo, marcos=(0, 500), buscar=falso, pausa=0)
    lat0, lon0 = eixo.posicao(0)
    lat500, lon500 = eixo.posicao(500)

    assert dados[0]["fertilidade"] == round(-lat0, 6)
    assert dados[500]["fertilidade"] == round(-lat500, 6)
    assert dados[0]["latitude"] == round(lat0, 6) and dados[0]["longitude"] == round(lon0, 6)
    assert dados[500]["latitude"] == round(lat500, 6) and dados[500]["longitude"] == round(lon500, 6)


def test_marco_que_cai_na_premissa_fica_marcado_como_premissa(tmp_path, monkeypatch):
    """Um marco onde o SoilGrids nao cobre o ponto tem que sair gravado com
    `fonte='premissa'`, nunca com uma fonte que pareca medicao. O teste de
    cache acima so exercita o caminho 'soilgrids' (o `falso` de la sempre
    devolve essa fonte); um bug que ignorasse `s.fonte` e gravasse
    'soilgrids' fixo passaria por ele sem ser notado.
    """
    monkeypatch.setattr(solo_km, "CACHE", tmp_path / "solo.json")

    def cai_na_premissa(lat, lon):
        return solo.premissa()

    dados = solo_km.carregar_ou_buscar(EixoFalso(), marcos=(0,), buscar=cai_na_premissa, pausa=0)
    assert dados[0]["fonte"] == "premissa"
    assert dados[0]["fertilidade"] == solo.FERTILIDADE_PREMISSA
    assert dados[0]["capacidade_mm"] == solo.CAPACIDADE_PREMISSA_MM["faixa"]
    assert dados[0]["nitrogenio_g_kg"] is None


def test_marco_ja_no_cache_nao_e_buscado_de_novo_quando_chega_um_marco_novo(tmp_path, monkeypatch):
    """O teste de cache do brief so confere o reaproveitamento com o MESMO
    conjunto de marcos nas duas chamadas. A granularidade real do cache e por
    marco: ao pedir um marco novo junto de um ja cacheado, so o novo pode
    gerar chamada de rede. Sem este teste, um bug que descartasse o cache
    inteiro ao ver qualquer marco ausente (releitura completa em vez de
    incremental) passaria batido.
    """
    monkeypatch.setattr(solo_km, "CACHE", tmp_path / "solo.json")
    chamadas = []

    def falso(lat, lon):
        chamadas.append(lat)
        return solo.Solo(0.4, 60.0, "soilgrids", 1.7, 0.0)

    solo_km.carregar_ou_buscar(EixoFalso(), marcos=(0,), buscar=falso, pausa=0)
    assert len(chamadas) == 1

    dados = solo_km.carregar_ou_buscar(EixoFalso(), marcos=(0, 500), buscar=falso, pausa=0)
    assert len(chamadas) == 2
    assert set(dados) == {0, 500}


def test_pausa_e_chamada_uma_vez_por_marco_novo_e_nunca_pelos_ja_em_cache(tmp_path, monkeypatch):
    """A pausa existe para nao apanhar 429 do SoilGrids (ver ml/solo.py) e o
    brief e explicito: nao encurtar nem remover. Os testes acima rodam com
    `pausa=0` e por isso nao exercitam esse ramo -- sem este teste, remover
    `time.sleep(pausa)` do laco, ou pausar mesmo quando o marco ja estava em
    cache, passaria batido.
    """
    monkeypatch.setattr(solo_km, "CACHE", tmp_path / "solo.json")
    pausas = []
    monkeypatch.setattr(solo_km.time, "sleep", lambda s: pausas.append(s))

    def falso(lat, lon):
        return solo.Solo(0.4, 60.0, "soilgrids", 1.7, 0.0)

    solo_km.carregar_ou_buscar(EixoFalso(), marcos=(0, 500), buscar=falso, pausa=2.5)
    assert pausas == [2.5, 2.5]

    pausas.clear()
    solo_km.carregar_ou_buscar(EixoFalso(), marcos=(0, 500), buscar=falso, pausa=2.5)
    assert pausas == []


def test_cache_em_disco_sobrevive_a_um_json_dumps_de_verdade_com_chaves_string(tmp_path, monkeypatch):
    """`carregar_ou_buscar` promete um cache JSON versionado em disco, o que so
    vale se o arquivo gravado for JSON valido (chaves de dict em JSON sao
    sempre string) e se uma segunda leitura -- simulando outro processo, sem
    nada em memoria -- devolver os MESMOS valores, com as chaves convertidas
    de volta para `int`. Ir por arquivo e voltar, e nao so comparar o dict em
    memoria, e o que pega uma serializacao que quebra ou uma chave que nao
    volta para `int`.
    """
    cache = tmp_path / "solo.json"
    monkeypatch.setattr(solo_km, "CACHE", cache)

    def falso(lat, lon):
        return solo.Solo(0.4, 60.0, "soilgrids", 1.7, 0.0)

    solo_km.carregar_ou_buscar(EixoFalso(), marcos=(0, 500), buscar=falso, pausa=0)

    bruto = json.loads(cache.read_text(encoding="utf-8"))
    assert set(bruto) == {"0", "500"}

    dados = solo_km.carregar_ou_buscar(EixoFalso(), marcos=(0, 500), buscar=None, pausa=0)
    assert set(dados) == {0, 500}
    assert all(isinstance(k, int) for k in dados)
    assert dados[500]["fertilidade"] == 0.4
