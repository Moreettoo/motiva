"""Roda `publicar_rodoanel.main(["--gravar"])` de ponta a ponta contra um Supabase falso (sem rede),
duas vezes seguidas, e confere que as contagens de linha ficam identicas. E o mesmo
ensaio que a Tarefa 13 faz contra o banco de producao (ver task-13-report.md), so que
aqui e rapido, repetivel e nao arrisca nada: prova a idempotencia ANTES de tocar o
Supabase de verdade.

So o cliente Supabase e trocado por dublê -- `marcos.carregar`, `planilha.ler`,
`solo_km.carregar_ou_buscar` (cache completo, ver pesquisa/dados/derivados/solo_por_marco.json)
e `banco.ler_csv` continuam lendo os arquivos reais do repo, sem rede nenhuma.
"""
from __future__ import annotations

from pesquisa import publicar_rodoanel
from pesquisa.rodoanel import supabase_io
from pesquisa.tests.fake_supabase import FakeSupabase


def _sb_com_concessionaria() -> FakeSupabase:
    sb = FakeSupabase()
    sb.tabelas["concessionarias"] = [{"id": 5, "nome": "RodoAnel"}]
    return sb


def test_publicar_rodoanel_e_idempotente_de_ponta_a_ponta(monkeypatch):
    sb = _sb_com_concessionaria()
    monkeypatch.setattr(supabase_io, "cliente", lambda: sb)
    monkeypatch.setattr(publicar_rodoanel.relatorio, "diario", lambda linha: None)   # nao poluir o diario real

    publicar_rodoanel.main(["--gravar"])
    contagens_1 = {nome: len(linhas) for nome, linhas in sb.tabelas.items()}

    publicar_rodoanel.main(["--gravar"])
    contagens_2 = {nome: len(linhas) for nome, linhas in sb.tabelas.items()}

    assert contagens_1 == contagens_2, f"rodar duas vezes mudou contagens: {contagens_1} != {contagens_2}"

    # os numeros do Task 13 (independentes do "roda duas vezes e igual" acima)
    assert contagens_1["trechos"] == 60
    assert contagens_1["levantamentos"] == 1440
    medicoes = [m for m in sb.tabelas["medicoes"] if m["origem"] == "levantamento_classe"]
    assert len(medicoes) == 110                       # 55 + 55, uma linha por data
    execucoes = [e for e in sb.tabelas["execucoes"] if e["origem"] == "inferida_levantamento"]
    assert len(execucoes) == 38
    assert len(sb.tabelas["validacao_pares"]) == 248  # 195 incluidos + 53 excluidos (rocada)

    vigentes = [v for v in sb.tabelas["validacoes"] if v["vigente"]]
    assert len(vigentes) == 1
    v = vigentes[0]
    assert v["fator_calibracao"] == 1.0                          # decisao humana: NUNCA 1,15
    assert v["n_pares_usados"] == 195
    assert abs(v["acuracia_classe"] - 0.6051282051282051) < 1e-9
    assert "1,0" in v["observacoes"] or "rejeitado" in v["observacoes"]

    ativas = [c for c in sb.tabelas["calibracoes"] if c["ativo"]]
    inativas = [c for c in sb.tabelas["calibracoes"] if not c["ativo"]]
    assert len(ativas) == 1 and ativas[0]["fator"] == 1.0
    assert any(abs(c["fator"] - 1.15) < 1e-9 for c in inativas)   # 1,15 registrado, mas nunca ativo


def test_publicar_rodoanel_nunca_grava_fator_1_15_como_vigente(monkeypatch):
    """Sozinha, a regra da spec 7.3 (maximizar J refitando em todos os pares) escolheria
    1,15 -- este teste existe especificamente para travar a decisao humana que a
    sobrescreve; ver a docstring de publicar_rodoanel.py.
    """
    sb = _sb_com_concessionaria()
    monkeypatch.setattr(supabase_io, "cliente", lambda: sb)
    monkeypatch.setattr(publicar_rodoanel.relatorio, "diario", lambda linha: None)

    publicar_rodoanel.main(["--gravar"])

    fatores_vigentes = {v["fator_calibracao"] for v in sb.tabelas["validacoes"] if v["vigente"]}
    fatores_ativos = {c["fator"] for c in sb.tabelas["calibracoes"] if c["ativo"]}
    assert fatores_vigentes == {1.0}
    assert fatores_ativos == {1.0}
    assert 1.15 not in fatores_vigentes and 1.15 not in fatores_ativos


def test_publicar_rodoanel_em_ensaio_nao_toca_a_rede(monkeypatch, capsys):
    """Sem --gravar (o padrao): nunca deve pedir um client Supabase, do mesmo jeito que
    `importar_levantamento.py` -- ver test_importador_em_ensaio_nao_toca_a_rede.
    """
    def estoura():
        raise AssertionError("cliente() nao deveria ser chamado em modo ensaio")
    monkeypatch.setattr(supabase_io, "cliente", estoura)

    cod = publicar_rodoanel.main([])
    saida = capsys.readouterr().out

    assert cod == 0
    assert "60 trechos" in saida
    assert "720 levantamentos" in saida
    assert "fator vigente 1,00 (fator 1,15 testado e rejeitado)".replace(",", ".") in saida.replace(",", ".")
    assert "ensaio: nada gravado" in saida
