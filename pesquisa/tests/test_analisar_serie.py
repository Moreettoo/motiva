"""O brief original tinha 3 testes para `detectar_cortes`/`recall_marco_2026`, e a auditoria das
tarefas anteriores (implementacao certa, suite fraca) se repete aqui:

- Nenhum teste do brief isolava as QUATRO fronteiras que definem o detector (spec do proprio
  Task 20): uma queda limpa que qualifica, uma queda pequena demais, uma queda espalhada por dias
  demais e uma queda partindo de um NDVI abaixo do piso `minimo_antes`. O teste de "ignora ruido"
  cobria passagem por acaso (o ruido do exemplo tem quedas pequenas E um intervalo longo
  misturados), nunca isolando cada fronteira -- um detector que trocasse `>=` por `>` em
  `minimo_antes`, por exemplo, passaria pelos tres testes do brief sem ser pego.
- Nenhum teste cobria os limites EXATOS (`<=` em `max_dias`, `>=` em `queda` e em `minimo_antes`):
  sem eles, uma troca por `<`/`>` estrito passa despercebida.
- `recall_marco_2026` nunca era testado com `rocados` vazio (guarda de divisao por zero), com um
  marco rocado AUSENTE do dicionario de eventos (guarda do `.get(m, [])`), com um marco com dois
  eventos (um dentro e um fora da janela, provando a semantica de `any`) nem com bordas exatas de
  janela (`de`/`ate` inclusivos) -- e um marco nao-rocado com dois eventos na janela provando que
  `falsos` conta por SEGMENTO, nao por evento.
- Os parametros de `detectar_cortes` (queda/max_dias/minimo_antes) nunca eram exercitados com
  valores diferentes do default -- um bug que ignorasse os argumentos e sempre usasse as
  constantes do modulo passaria despercebido.
"""
from __future__ import annotations

from datetime import date

from pesquisa.ndvi import analisar_serie


# ----------------------------------------------------------------------
# detectar_cortes -- os testes do brief
# ----------------------------------------------------------------------
def test_detecta_uma_queda_e_ignora_ruido():
    serie = [(date(2026, 3, 1), 0.62), (date(2026, 3, 6), 0.60), (date(2026, 3, 16), 0.31), (date(2026, 3, 21), 0.35),
             (date(2026, 4, 5), 0.50), (date(2026, 4, 10), 0.44), (date(2026, 6, 1), 0.70), (date(2026, 7, 1), 0.52)]
    ev = analisar_serie.detectar_cortes(serie)
    assert len(ev) == 1
    assert ev[0]["de"] == date(2026, 3, 6) and ev[0]["ate"] == date(2026, 3, 16)
    assert ev[0]["queda"] > 0.15


def test_queda_com_intervalo_longo_nao_conta():
    serie = [(date(2026, 3, 1), 0.70), (date(2026, 4, 1), 0.40)]
    assert analisar_serie.detectar_cortes(serie) == []


def test_recall_contra_as_rocadas_inferidas():
    eventos = {0: [{"de": date(2026, 3, 11), "ate": date(2026, 3, 16)}], 500: [], 1000: [{"de": date(2026, 1, 1), "ate": date(2026, 1, 6)}]}
    r = analisar_serie.recall_marco_2026(eventos, rocados={0, 500})
    assert r["n_rocados"] == 2 and r["detectados"] == 1 and r["recall"] == 0.5
    assert r["falsos"] == 0          # o evento de janeiro no marco 1000 esta fora da janela


# ----------------------------------------------------------------------
# detectar_cortes -- as quatro fronteiras que DEFINEM o detector (pedido explicito da tarefa):
# uma queda limpa que qualifica, uma queda pequena demais, uma queda espalhada por dias demais e
# uma queda partindo de um NDVI abaixo do piso. Cada teste isola SO a fronteira do seu nome.
# ----------------------------------------------------------------------
def test_queda_limpa_que_qualifica():
    """Caso positivo isolado, sem ruido: um unico par de pontos, dentro do prazo, com queda grande
    o bastante e NDVI inicial acima do piso -- tem que gerar exatamente um evento com os quatro
    campos certos."""
    serie = [(date(2026, 3, 1), 0.60), (date(2026, 3, 8), 0.30)]
    ev = analisar_serie.detectar_cortes(serie)
    assert ev == [{"de": date(2026, 3, 1), "ate": date(2026, 3, 8), "ndvi_antes": 0.60, "ndvi_depois": 0.30, "queda": 0.30}]


def test_queda_pequena_demais_nao_conta():
    """Mesmo intervalo curto e NDVI inicial acima do piso da queda limpa acima, mas a queda
    (0,10) fica abaixo de QUEDA_MINIMA (0,15) -- isolada da fronteira de dias e da de piso."""
    serie = [(date(2026, 3, 1), 0.60), (date(2026, 3, 8), 0.50)]
    assert analisar_serie.detectar_cortes(serie) == []


def test_queda_espalhada_por_dias_demais_nao_conta():
    """Mesma queda grande (0,30) e mesmo NDVI inicial acima do piso da queda limpa acima, mas o
    intervalo (20 dias) passa de MAX_DIAS (12) -- isolada da fronteira de magnitude e da de piso."""
    serie = [(date(2026, 3, 1), 0.60), (date(2026, 3, 21), 0.30)]
    assert analisar_serie.detectar_cortes(serie) == []


def test_queda_a_partir_de_ndvi_abaixo_do_piso_nao_conta():
    """Mesmo intervalo curto e mesma queda grande (0,20) das outras duas fronteiras, mas o NDVI
    ANTES (0,40) fica abaixo de MINIMO_ANTES (0,45): capim ja rareado/seco antes da queda, nao o
    padrao de corte que o detector procura (grama densa que cai stepamente). Sem este teste, um
    detector que removesse o guard `v0 >= minimo_antes` passaria despercebido pelos outros tres
    testes de fronteira."""
    serie = [(date(2026, 3, 1), 0.40), (date(2026, 3, 8), 0.20)]
    assert analisar_serie.detectar_cortes(serie) == []


# ----------------------------------------------------------------------
# detectar_cortes -- limites EXATOS (>=/<= vs >/<)
# ----------------------------------------------------------------------
def test_max_dias_no_limite_exato_conta():
    """12 dias de intervalo, exatamente MAX_DIAS -- o guard e `<=`, entao tem que contar."""
    serie = [(date(2026, 3, 1), 0.60), (date(2026, 3, 13), 0.30)]
    assert len(analisar_serie.detectar_cortes(serie)) == 1


def test_max_dias_um_dia_alem_do_limite_nao_conta():
    """13 dias -- um a mais que o teste acima -- tem que ficar de fora."""
    serie = [(date(2026, 3, 1), 0.60), (date(2026, 3, 14), 0.30)]
    assert analisar_serie.detectar_cortes(serie) == []


def test_queda_no_limite_exato_conta():
    """Queda de exatamente 0,15 (QUEDA_MINIMA) -- o guard e `>=`, entao tem que contar.

    0,65 e 0,50 (em vez de 0,60/0,45, que pareceriam mais obvios) porque `0.60 - 0.45` da
    `0.14999999999999997` em ponto flutuante -- FALSO no teste de fronteira que este caso existe
    pra provar. `0.65 - 0.50` da `0.15000000000000002`, do lado certo do `>=`."""
    serie = [(date(2026, 3, 1), 0.65), (date(2026, 3, 5), 0.50)]
    assert len(analisar_serie.detectar_cortes(serie)) == 1


def test_queda_logo_abaixo_do_limite_nao_conta():
    """Queda de 0,14 -- 0,01 abaixo de QUEDA_MINIMA -- tem que ficar de fora."""
    serie = [(date(2026, 3, 1), 0.60), (date(2026, 3, 5), 0.46)]
    assert analisar_serie.detectar_cortes(serie) == []


def test_minimo_antes_no_limite_exato_conta():
    """NDVI inicial de exatamente 0,45 (MINIMO_ANTES) -- o guard e `>=`, entao tem que contar."""
    serie = [(date(2026, 3, 1), 0.45), (date(2026, 3, 5), 0.20)]
    assert len(analisar_serie.detectar_cortes(serie)) == 1


def test_minimo_antes_logo_abaixo_do_limite_nao_conta():
    """NDVI inicial de 0,44 -- 0,01 abaixo de MINIMO_ANTES -- tem que ficar de fora."""
    serie = [(date(2026, 3, 1), 0.44), (date(2026, 3, 5), 0.19)]
    assert analisar_serie.detectar_cortes(serie) == []


# ----------------------------------------------------------------------
# detectar_cortes -- multiplos eventos, parametros customizados, series degeneradas
# ----------------------------------------------------------------------
def test_multiplos_eventos_na_mesma_serie_sao_todos_devolvidos():
    """Duas quedas qualificaveis na mesma serie, separadas por uma subida no meio -- confirma que
    a funcao nao para no primeiro evento (um `return` precoce dentro do loop passaria despercebido
    por todos os testes de fronteira, que so tem uma queda cada)."""
    serie = [(date(2026, 1, 1), 0.60), (date(2026, 1, 8), 0.30),
             (date(2026, 2, 1), 0.65), (date(2026, 2, 6), 0.35)]
    ev = analisar_serie.detectar_cortes(serie)
    assert len(ev) == 2
    assert ev[0]["de"] == date(2026, 1, 1) and ev[1]["de"] == date(2026, 2, 1)


def test_parametros_customizados_sao_realmente_usados():
    """Uma queda de 0,10 em 20 dias nao qualifica com os defaults (QUEDA_MINIMA=0,15,
    MAX_DIAS=12), mas qualifica com limiares mais frouxos passados explicitamente -- prova que os
    tres parametros (nao so os defaults do modulo) sao de fato usados na comparacao."""
    serie = [(date(2026, 3, 1), 0.50), (date(2026, 3, 21), 0.40)]
    assert analisar_serie.detectar_cortes(serie) == []
    ev = analisar_serie.detectar_cortes(serie, queda=0.05, max_dias=25, minimo_antes=0.3)
    assert len(ev) == 1 and ev[0]["queda"] == 0.10


def test_serie_vazia_ou_de_um_ponto_nao_quebra():
    """zip(serie, serie[1:]) ja e vazio para 0 ou 1 ponto, mas um simbolo do Produces sem nenhum
    teste no caso degenerado e exatamente o padrao que a auditoria de tarefas anteriores pegou
    quebrando em producao (ver test_analisar_ndvi.py)."""
    assert analisar_serie.detectar_cortes([]) == []
    assert analisar_serie.detectar_cortes([(date(2026, 3, 1), 0.60)]) == []


# ----------------------------------------------------------------------
# recall_marco_2026 -- guardas e semantica de janela
# ----------------------------------------------------------------------
def test_recall_com_rocados_vazio_devolve_recall_none_sem_dividir_por_zero():
    eventos = {0: [{"de": date(2026, 3, 1), "ate": date(2026, 3, 10)}]}
    r = analisar_serie.recall_marco_2026(eventos, rocados=set())
    assert r["n_rocados"] == 0 and r["detectados"] == 0 and r["recall"] is None
    assert r["falsos"] == 1   # marco 0 nao esta em rocados e tem evento na janela default


def test_recall_marco_rocado_ausente_do_dicionario_de_eventos_nao_quebra():
    """Um marco rocado que nunca aparece como chave em `eventos_por_marco` (nenhuma observacao
    limpa o suficiente para gerar QUALQUER evento) tem que contar como nao detectado, nao lancar
    KeyError -- o `.get(m, [])` do brief cobre isso, mas nunca era exercitado."""
    r = analisar_serie.recall_marco_2026({}, rocados={0, 500})
    assert r["n_rocados"] == 2 and r["detectados"] == 0 and r["recall"] == 0.0


def test_recall_conta_marco_com_um_evento_dentro_e_outro_fora_da_janela():
    """Marco rocado com DOIS eventos, um antes da janela e outro dentro -- `any` tem que achar o
    que esta dentro; um `all` trocado por engano falharia aqui."""
    eventos = {0: [{"de": date(2026, 1, 1), "ate": date(2026, 1, 6)}, {"de": date(2026, 3, 10), "ate": date(2026, 3, 15)}]}
    r = analisar_serie.recall_marco_2026(eventos, rocados={0})
    assert r["detectados"] == 1 and r["recall"] == 1.0


def test_recall_janela_inclui_as_duas_bordas():
    """Um evento com `ate` EXATAMENTE em `de` e outro EXATAMENTE em `ate` -- a comparacao e
    `de <= e['ate'] <= ate`, ambas fechadas, entao os dois tem que contar."""
    de, ate = date(2026, 3, 6), date(2026, 3, 27)
    eventos = {0: [{"de": date(2026, 3, 1), "ate": de}], 500: [{"de": date(2026, 3, 25), "ate": ate}]}
    r = analisar_serie.recall_marco_2026(eventos, rocados={0, 500}, de=de, ate=ate)
    assert r["detectados"] == 2 and r["recall"] == 1.0


def test_recall_falsos_conta_por_segmento_nao_por_evento():
    """Um marco NAO rocado com DOIS eventos dentro da janela default so pode contribuir com 1
    para `falsos` (e um segmento so, nao dois) -- uma implementacao que somasse eventos em vez de
    marcos inflaria falsos artificialmente."""
    eventos = {1000: [{"de": date(2026, 3, 10), "ate": date(2026, 3, 15)}, {"de": date(2026, 3, 18), "ate": date(2026, 3, 22)}]}
    r = analisar_serie.recall_marco_2026(eventos, rocados=set())
    assert r["falsos"] == 1
