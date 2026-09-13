from pesquisa.rodoanel import banco


def test_abrir_cria_as_tabelas(tmp_path):
    con = banco.abrir(tmp_path / "t.sqlite")
    nomes = {r[0] for r in con.execute("select name from sqlite_master where type='table'")}
    assert {"segmentos", "faixas", "observacoes", "pares", "solo_marco", "clima_dia",
            "validacoes", "ndvi_observacoes", "ndvi_serie"} <= nomes


def test_substituir_apaga_e_regrava(tmp_path):
    con = banco.abrir(tmp_path / "t.sqlite")
    banco.substituir(con, "faixas", [{"codigo": "a", "nome": "A", "linha_planilha": 1, "lado": "externa", "em_escopo": 1, "ordem": 1}])
    banco.substituir(con, "faixas", [{"codigo": "b", "nome": "B", "linha_planilha": 2, "lado": "interna", "em_escopo": 0, "ordem": 2}])
    assert [r[0] for r in con.execute("select codigo from faixas")] == ["b"]


def test_csv_ida_e_volta(tmp_path):
    caminho = tmp_path / "x.csv"
    banco.gravar_csv(caminho, [{"a": 1, "b": "x"}, {"a": 2, "b": "y"}])
    assert banco.ler_csv(caminho) == [{"a": "1", "b": "x"}, {"a": "2", "b": "y"}]
