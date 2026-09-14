from datetime import date, datetime, timezone

from pesquisa.rodoanel import ARQ_LEV_1, ARQ_LEV_2, planilha, supabase_io
from pesquisa.rodoanel.planilha import NOME_POR_CODIGO
from pesquisa.rodoanel.segmentos import MARCOS, Segmento, execucoes_inferidas, limites_km, medicao_derivada
from pesquisa.tests.fake_supabase import FakeSupabase

IDS = {m: 1000 + i for i, m in enumerate(MARCOS)}          # ids falsos, um por marco
REV_IDS = {v: k for k, v in IDS.items()}                   # id falso -> marco, para conferir o mapeamento


def test_linhas_de_levantamento_sao_720_por_arquivo_e_unicas():
    lev = planilha.ler(ARQ_LEV_1)
    linhas = supabase_io.linhas_levantamento(lev, IDS)
    assert len(linhas) == 720
    assert len({(l["trecho_id"], l["faixa_codigo"], l["data"]) for l in linhas}) == 720
    assert {l["data"] for l in linhas} == {"2026-03-13"}
    assert all(l["data_no_arquivo"] == "2025-03-28" for l in linhas)
    com_classe = [l for l in linhas if l["classe"] is not None]
    assert all(l["altura_estimada_cm"] == {1: 5.0, 2: 20.0, 3: 40.0}[l["classe"]] for l in com_classe)
    # as 12 faixas da planilha aparecem, nao so as 4 em escopo -- linhas_levantamento e a
    # verdade bruta (ia.levantamentos), o filtro de escopo e so em linhas_medicoes.
    assert {l["faixa_codigo"] for l in linhas} == set(NOME_POR_CODIGO)
    por_marco: dict[int, set] = {}
    for l in linhas:
        por_marco.setdefault(REV_IDS[l["trecho_id"]], set()).add(l["faixa_codigo"])
    assert set(por_marco) == set(MARCOS)
    assert all(faixas == set(NOME_POR_CODIGO) for faixas in por_marco.values())   # as 12, em cada um dos 60 marcos
    # cada linha tem o trecho_id do SEU proprio marco, nao so "algum id unico" -- a checagem
    # de unicidade acima nao pegaria uma troca entre dois marcos (ainda daria 720 combinacoes
    # unicas). Confere um marco e uma faixa especificos contra a leitura direta da planilha.
    alvo = next(l for l in linhas if REV_IDS[l["trecho_id"]] == 0 and l["faixa_codigo"] == "cant_lateral_externa")
    assert alvo["classe"] == lev.classe(0, "cant_lateral_externa")
    # `importado_em` vai explicito e igual nas 720 linhas de UMA chamada (o mesmo `agora`,
    # ver docstring de linhas_levantamento) -- nunca ausente nem divergente dentro do lote.
    t = datetime(2026, 9, 14, 12, 0, 0, tzinfo=timezone.utc)
    com_agora = supabase_io.linhas_levantamento(lev, IDS, agora=t)
    assert {l["importado_em"] for l in com_agora} == {t.isoformat()}


def test_reimportar_a_mesma_data_atualiza_importado_em_sem_duplicar():
    """Defeito real corrigido em revisao (pos-Tarefa 21): sem `importado_em` explicito no
    payload, um upsert em cima da mesma chave (trecho_id, faixa_codigo, data) deixava a
    coluna intocada -- so o `now()` default do banco no INSERT original valia, para sempre.
    O manual (`docs/operacao/importar-levantamento.md`, secao 5) recomenda corrigir o
    arquivo e rodar `--gravar` de novo depois de um erro percebido; sem esta correcao, o
    cartao "Levantamentos importados" do painel continuaria mostrando a data/hora da
    PRIMEIRA tentativa mesmo depois da correcao -- o unico dado cujo proposito e dizer
    quando a importacao aconteceu mentindo sobre quando ela aconteceu.
    """
    sb = FakeSupabase()
    lev = planilha.ler(ARQ_LEV_1)
    t1 = datetime(2026, 9, 14, 10, 0, 0, tzinfo=timezone.utc)
    t2 = datetime(2026, 9, 15, 8, 30, 0, tzinfo=timezone.utc)

    supabase_io.upsert_levantamentos(sb, supabase_io.linhas_levantamento(lev, IDS, agora=t1))
    assert {l["importado_em"] for l in sb.tabelas["levantamentos"]} == {t1.isoformat()}
    assert len(sb.tabelas["levantamentos"]) == 720

    supabase_io.upsert_levantamentos(sb, supabase_io.linhas_levantamento(lev, IDS, agora=t2))
    assert {l["importado_em"] for l in sb.tabelas["levantamentos"]} == {t2.isoformat()}   # avancou, nao ficou em t1
    assert len(sb.tabelas["levantamentos"]) == 720                                       # upsert, nao duplicou


def test_medicoes_derivadas_uma_por_marco_com_faixa_em_escopo():
    lev = planilha.ler(ARQ_LEV_1)
    linhas = supabase_io.linhas_medicoes(lev, IDS)
    # numero exato (nao so uma faixa 50..60): o levantamento de 13/03 tem 55 marcos com
    # pelo menos uma faixa em escopo classificada -- ver segmentos.medicao_derivada.
    assert len(linhas) == 55
    assert all(l["origem"] == "levantamento_classe" and l["classe"] in (1, 2, 3) for l in linhas)
    assert all(l["faixa_codigo"] in planilha.CODIGOS_EM_ESCOPO for l in linhas)
    # uma linha POR marco: nao pode haver dois trecho_id iguais (duas faixas do mesmo marco)
    assert len({l["trecho_id"] for l in linhas}) == len(linhas)
    # consistencia com o calculo independente de segmentos.medicao_derivada (a wrapper nao
    # pode inventar nem perder marco, nem trocar a classe/faixa "pior" escolhida)
    esperado = medicao_derivada(lev)
    obtido = {REV_IDS[l["trecho_id"]]: (l["classe"], l["faixa_codigo"]) for l in linhas}
    assert obtido == esperado


def test_execucoes_inferidas_no_par_real():
    lev1, lev2 = planilha.ler(ARQ_LEV_1), planilha.ler(ARQ_LEV_2)
    ext = {m: limites_km(m)[1] - limites_km(m)[0] for m in MARCOS}
    linhas = supabase_io.linhas_execucoes(lev1, lev2, IDS, ext)
    # numero exato: 38 marcos tem alguma faixa que caiu de classe entre 13/03 e 20/03.
    assert len(linhas) == 38
    assert all(l["origem"] == "inferida_levantamento" and l["data_execucao"] == "2026-03-16" for l in linhas)
    assert all(l["altura_antes_cm"] > l["altura_depois_cm"] for l in linhas)
    assert len({l["trecho_id"] for l in linhas}) == len(linhas)         # uma por marco
    assert all(l["km_rocados"] == round(ext[REV_IDS[l["trecho_id"]]], 3) for l in linhas)
    # o conjunto de marcos bate com o calculo independente de segmentos.execucoes_inferidas
    esperado = {e["km_marco_m"] for e in execucoes_inferidas(lev1, lev2)}
    assert {REV_IDS[l["trecho_id"]] for l in linhas} == esperado


def test_linha_trecho():
    seg = Segmento(15_000, 15.0, 15.5, -23.515647, -46.817408, "Apenas manual", 1234.5, {"Apenas manual": 1234.5})
    t = supabase_io.linha_trecho(seg, {"fertilidade": 0.4, "capacidade_mm": 60.0, "fonte": "soilgrids"}, 7)
    assert t["rodovia"] == "SP-021 Rodoanel Oeste" and t["km_marco_m"] == 15_000
    assert t["altura_limite_cm"] == 30 and t["especie"] == "braquiaria" and t["fonte_cadastro"] == "levantamento_motiva"
    assert t["ativo"] is True and t["concessionaria_id"] == 7 and t["solo_fonte"] == "soilgrids"
    assert "Apenas manual" in t["observacoes"] and "premissa" in t["observacoes"]
    # campos que a assercao acima nao toca, mas que o Produces promete (linha_trecho(seg,solo,conc_id))
    assert t["km_inicio"] == 15.0 and t["km_fim"] == 15.5
    assert t["latitude"] == -23.515647 and t["longitude"] == -46.817408
    assert t["metodo_rocada"] == "Apenas manual" and t["area_rocada_m2"] == 1234.5
    assert t["fertilidade_solo"] == 0.4 and t["capacidade_agua_solo_mm"] == 60.0


def test_linha_trecho_sem_solo_medido_fica_com_solo_nulo():
    seg = Segmento(0, 0.0, 0.5, -23.4, -46.7, "Apenas manual", 500.0, {})
    t = supabase_io.linha_trecho(seg, None, 5)
    assert t["fertilidade_solo"] is None and t["capacidade_agua_solo_mm"] is None and t["solo_fonte"] is None


def test_linha_trecho_sem_poligono_fica_com_metodo_e_area_vazios():
    """6 dos 60 marcos (2500, 3000, 7500, 8000, 29000, 29300) nao tem poligono de rocada no
    KML da Motiva: `montar_segmentos` marca isso com `metodo_rocada=None` e
    `area_rocada_m2=0.0` (o "valor de ausencia" do dataclass). Gravar 0.0 no banco afirmaria
    uma area rocavel conhecida e igual a zero -- um numero inventado, nao a lacuna real (ver
    01-consolidacao.md e a instrucao explicita da Tarefa 13: "nunca invente um metodo ou uma
    area"). `linha_trecho` tem que tratar esse 0.0 como ausencia, nao como medida.
    """
    seg = Segmento(2_500, 2.5, 3.0, -23.43, -46.75, None, 0.0, {})
    t = supabase_io.linha_trecho(seg, {"fertilidade": 0.5, "capacidade_mm": 55.0, "fonte": "soilgrids"}, 5)
    assert t["metodo_rocada"] is None
    assert t["area_rocada_m2"] is None
    assert "sem poligono de rocada no KML" in t["observacoes"]
    assert "0 m2" not in t["observacoes"]
    # o solo (independente do poligono) continua sendo gravado normalmente
    assert t["solo_fonte"] == "soilgrids"


def test_concessionaria_id_devolve_o_id_e_reclama_se_nao_existir():
    sb = FakeSupabase()
    sb.tabelas["concessionarias"] = [{"id": 5, "nome": "RodoAnel"}, {"id": 1, "nome": "Motiva Autoban"}]
    assert supabase_io.concessionaria_id(sb, "RodoAnel") == 5
    try:
        supabase_io.concessionaria_id(sb, "Nao Existe")
        assert False, "deveria ter estourado LookupError"
    except LookupError:
        pass


def test_upsert_trechos_e_idempotente_e_ids_por_marco_bate_com_os_marcos():
    sb = FakeSupabase()
    segs = [Segmento(m, *limites_km(m), -23.5, -46.8, None, 0.0, {}) for m in MARCOS]
    solo = {}
    ids1 = supabase_io.upsert_trechos(sb, segs, solo, conc_id=5)
    assert set(ids1) == set(MARCOS)
    assert len(sb.tabelas["trechos"]) == 60
    ids2 = supabase_io.upsert_trechos(sb, segs, solo, conc_id=5)
    assert ids1 == ids2                       # mesmo trecho, mesmo id -- upsert, nao insert
    assert len(sb.tabelas["trechos"]) == 60   # rodar duas vezes nao duplica


def test_regravar_medicoes_apaga_a_mesma_data_e_origem_antes_de_inserir():
    sb = FakeSupabase()
    ids = {0: 10, 500: 11}
    # uma medicao MANUAL pre-existente no mesmo trecho/data, de outra origem: nao pode ser tocada
    sb.tabelas["medicoes"] = [{"id": 1, "trecho_id": 10, "data": "2026-03-13", "origem": "manual", "altura_cm": 12.0}]
    linhas = [{"trecho_id": 10, "data": "2026-03-13", "altura_cm": 5.0, "origem": "levantamento_classe",
               "classe": 1, "faixa_codigo": "cant_central_externa"}]
    supabase_io.regravar_medicoes(sb, date(2026, 3, 13), ids, linhas)
    supabase_io.regravar_medicoes(sb, date(2026, 3, 13), ids, linhas)   # segunda vez: nao duplica
    tabela = sb.tabelas["medicoes"]
    assert len(tabela) == 2
    manuais = [l for l in tabela if l["origem"] == "manual"]
    derivadas = [l for l in tabela if l["origem"] == "levantamento_classe"]
    assert len(manuais) == 1 and len(derivadas) == 1


def test_regravar_execucoes_apaga_a_mesma_data_e_origem_antes_de_inserir():
    sb = FakeSupabase()
    ids = {0: 10}
    sb.tabelas["execucoes"] = [{"id": 1, "trecho_id": 10, "data_execucao": "2026-03-16", "origem": "chamado"}]
    linhas = [{"trecho_id": 10, "data_execucao": "2026-03-16", "km_rocados": 0.5, "altura_antes_cm": 40.0,
               "altura_depois_cm": 5.0, "origem": "inferida_levantamento", "observacao": "x"}]
    supabase_io.regravar_execucoes(sb, date(2026, 3, 16), ids, linhas)
    supabase_io.regravar_execucoes(sb, date(2026, 3, 16), ids, linhas)
    tabela = sb.tabelas["execucoes"]
    assert len(tabela) == 2
    assert len([l for l in tabela if l["origem"] == "chamado"]) == 1
    assert len([l for l in tabela if l["origem"] == "inferida_levantamento"]) == 1


def test_ativar_calibracao_desativa_a_antiga_e_e_idempotente():
    sb = FakeSupabase()
    supabase_io.ativar_calibracao(sb, validacao_id=1, fator=1.15)
    supabase_io.ativar_calibracao(sb, validacao_id=2, fator=1.0)   # decisao humana chega depois
    tabela = sb.tabelas["calibracoes"]
    ativas = [l for l in tabela if l["ativo"]]
    assert len(ativas) == 1
    assert ativas[0]["fator"] == 1.0 and ativas[0]["validacao_id"] == 2
    assert len(tabela) == 2   # a de fator 1,15 fica, so vira ativo=False -- historico do calibracoes


def _r_minimo(n=2, acuracia=0.5):
    return {"n": n, "acuracia": acuracia, "mae_ordinal": 0.1, "transicoes_total": 1, "transicoes_detectadas": 1,
            "estaveis_total": 1, "alarmes_falsos": 0, "cobertura_banda": 1.0,
            "matriz": {"1": {"1": 1, "2": 0, "3": 0}, "2": {"1": 0, "2": 1, "3": 0}, "3": {"1": 0, "2": 0, "3": 0}}}


def _saida_minima(fator_vigente=1.0):
    final = _r_minimo()
    return {
        "janela": {"de": "2026-03-13", "ate": "2026-03-20"},
        "commit": "deadbee",
        "parametros": {"especie": "braquiaria", "ponto_medio_c3_cm": 40.0, "dias_desde_rocada": 200.0},
        "resultado": {
            "fator_vigente": fator_vigente,
            "final": final,
            "sem_calibracao": final,
            "linha_de_base": {"acuracia": 0.831, "J": 0.0},
            "ajuste_km_pares": {"fator": 1.05, "J": 0.254, "n": 1},
            "calibracao_todos": {"fator": 1.15, "J": 0.198},
            "teste_km_impares": {"n": 1, "sem": {"J": -0.119, "acuracia": 0.598}, "com": {"J": 0.033, "acuracia": 0.478}},
        },
        "fila_retrospectiva": {"n_marcados": 0, "n_cruzaram": 0, "n_acertos": 0},
        "pares": [
            {"km_marco_m": 0, "faixa": "cant_central_externa", "classe_inicial": 1, "classe_final_observada": 1,
             "classe_final_prevista": 1, "altura_inicial_cm": 5.0, "q10_cm": 1.0, "q50_cm": 2.0, "q90_cm": 3.0},
            {"km_marco_m": 500, "faixa": "cant_central_interna", "classe_inicial": 2, "classe_final_observada": 2,
             "classe_final_prevista": 2, "altura_inicial_cm": 20.0, "q10_cm": 1.0, "q50_cm": 2.0, "q90_cm": 3.0},
        ],
        "sensibilidade": [
            {"rotulo": "x", "parametros": {"especie": "braquiaria", "ponto_medio_c3_cm": 35.0, "dias_desde_rocada": 30.0}, **_r_minimo(n=1)},
        ],
    }


def test_gravar_validacao_e_idempotente_no_numero_de_linhas():
    """A propriedade mais importante da Tarefa 13: rodar `gravar_validacao` duas vezes com a
    MESMA `saida` nao pode dobrar validacoes/validacao_pares -- a linha vigente antiga (e os
    pares dela) sao apagados antes da nova entrar, nao so desmarcados (ver docstring da funcao).
    """
    sb = FakeSupabase()
    saida = _saida_minima(fator_vigente=1.0)
    rocados = [{"km_marco_m": 1000, "faixa": "cant_lateral_externa", "classe_d1": 3, "classe_d2": 1}]

    vid1 = supabase_io.gravar_validacao(sb, saida, IDS, rocados, vigente=True)
    contagens_1 = (len(sb.tabelas["validacoes"]), len(sb.tabelas["validacao_pares"]))

    vid2 = supabase_io.gravar_validacao(sb, saida, IDS, rocados, vigente=True)
    contagens_2 = (len(sb.tabelas["validacoes"]), len(sb.tabelas["validacao_pares"]))

    assert contagens_1 == contagens_2 == (2, 3)     # 1 vigente + 1 sensibilidade; 2 incluidos + 1 excluido
    assert vid1 != vid2                              # a antiga foi apagada e recriada, nao reaproveitada
    vigentes = [v for v in sb.tabelas["validacoes"] if v["vigente"]]
    assert len(vigentes) == 1 and vigentes[0]["id"] == vid2 and vigentes[0]["fator_calibracao"] == 1.0
    assert all(p["validacao_id"] == vid2 for p in sb.tabelas["validacao_pares"])   # nenhum par orfao da rodada 1
    incluidos = [p for p in sb.tabelas["validacao_pares"] if p["incluido"]]
    excluidos = [p for p in sb.tabelas["validacao_pares"] if not p["incluido"]]
    assert len(incluidos) == 2 and len(excluidos) == 1
    assert excluidos[0]["motivo_exclusao"] == "rocada_inferida"


def test_gravar_validacao_grava_a_metrica_do_r_passado_nao_recalcula():
    """Confere que `fator_calibracao`/`acuracia_classe`/`n_pares_usados` gravados vem
    literalmente de `saida["resultado"]["final"]`/`fator_vigente` -- e o que permite ao
    publicador sobrescrever esses dois campos (decisao humana do fator 1,0) sem tocar
    `gravar_validacao`.
    """
    sb = FakeSupabase()
    saida = _saida_minima(fator_vigente=1.0)
    saida["resultado"]["final"] = _r_minimo(n=195, acuracia=0.6051282051282051)
    vid = supabase_io.gravar_validacao(sb, saida, IDS, [], vigente=True)
    linha = next(v for v in sb.tabelas["validacoes"] if v["id"] == vid)
    assert linha["fator_calibracao"] == 1.0
    assert linha["n_pares_usados"] == 195
    assert abs(linha["acuracia_classe"] - 0.6051282051282051) < 1e-9


def test_upsert_ndvi_e_inserir_ndvi_analise_nao_estouram():
    sb = FakeSupabase()
    supabase_io.upsert_ndvi(sb, [{"trecho_id": 10, "data_imagem": "2026-03-15", "mascara": "poligonos_kml", "ndvi_medio": 0.4}])
    assert len(sb.tabelas["ndvi_observacoes"]) == 1
    nid = supabase_io.inserir_ndvi_analise(sb, {"data_alvo": "2026-03-15", "n_classe1": 1})
    assert isinstance(nid, int) and sb.tabelas["ndvi_analises"][0]["id"] == nid


def test_importador_em_ensaio_nao_toca_a_rede(monkeypatch, capsys):
    """--gravar ausente (o padrao): o importador nunca deve pedir um client Supabase."""
    from pesquisa import importar_levantamento

    def estoura(*a, **k):
        raise AssertionError("cliente() nao deveria ser chamado em modo ensaio")
    monkeypatch.setattr(supabase_io, "cliente", estoura)

    cod = importar_levantamento.main(["--xlsx", str(ARQ_LEV_2), "--anterior", str(ARQ_LEV_1)])
    saida = capsys.readouterr().out
    assert cod == 0
    assert "ensaio: nada gravado" in saida
    assert "720 levantamentos" in saida
