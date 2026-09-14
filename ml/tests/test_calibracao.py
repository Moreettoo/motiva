import calibracao

LINHAS = [
    {"fator": "1.30", "rodovia": "SP-021 Rodoanel Oeste", "especie": "braquiaria", "validacao_id": 7,
     "validacoes": {"n_pares_usados": 195, "executada_em": "2026-09-13T20:00:00+00:00"}},
    {"fator": "1.10", "rodovia": None, "especie": "braquiaria", "validacao_id": 8, "validacoes": None},
    {"fator": "0.90", "rodovia": None, "especie": None, "validacao_id": None, "validacoes": None},
]


def test_mais_especifica_vence():
    c = calibracao.escolher(LINHAS, "SP-021 Rodoanel Oeste", "braquiaria")
    assert c.fator == 1.30 and c.origem == "medida" and c.n_pares == 195 and c.validacao_id == 7
    # As duas colunas da linha vencedora tambem tem que chegar inteiras: sem
    # isso um bug que devolvesse o fator certo mas os metadados de outra linha
    # (ou None) passaria despercebido.
    assert c.rodovia == "SP-021 Rodoanel Oeste" and c.especie == "braquiaria"
    assert c.validada_em == "2026-09-13T20:00:00+00:00"


def test_cai_para_a_da_especie_e_depois_para_a_geral():
    c_especie = calibracao.escolher(LINHAS, "BR-116", "braquiaria")
    assert c_especie.fator == 1.10 and c_especie.origem == "medida" and c_especie.validacao_id == 8
    # `rodovia` da linha (nao da consulta): None, porque a linha de 1,10 vale
    # para qualquer rodovia. Confundir "rodovia pedida" com "rodovia da linha"
    # e o erro que faria este campo mentir sobre o que foi de fato casado.
    assert c_especie.rodovia is None and c_especie.especie == "braquiaria"

    c_geral = calibracao.escolher(LINHAS, "BR-116", "batatais")
    assert c_geral.fator == 0.90 and c_geral.origem == "medida" and c_geral.validacao_id is None
    assert c_geral.rodovia is None and c_geral.especie is None


def test_rodovia_sozinha_vence_especie_sozinha():
    """Pina a ordem inteira, nao so as pontas: `(rodovia, None)` (especificidade
    2) tem que vencer `(None, especie)` (especificidade 1). As LINHAS do topo
    do arquivo nunca colocam as duas juntas, entao um bug que trocasse a soma
    dos pesos por uma comparacao lexicografica errada passaria despercebido
    sem este caso.
    """
    linhas = [
        {"fator": "1.05", "rodovia": "SP-021 Rodoanel Oeste", "especie": None,
         "validacao_id": 2, "validacoes": None},
        {"fator": "1.10", "rodovia": None, "especie": "braquiaria",
         "validacao_id": 8, "validacoes": None},
        {"fator": "0.90", "rodovia": None, "especie": None,
         "validacao_id": None, "validacoes": None},
    ]
    c = calibracao.escolher(linhas, "SP-021 Rodoanel Oeste", "braquiaria")
    assert c.fator == 1.05 and c.validacao_id == 2


def test_sem_nada_e_sem_calibracao():
    c = calibracao.escolher([], "SP-021 Rodoanel Oeste", "braquiaria")
    assert c is calibracao.SEM and c.fator == 1.0 and c.origem == "sem_calibracao"


def test_linha_que_nao_casa_nao_conta():
    linhas = [{"fator": "2.0", "rodovia": "SP-280", "especie": None, "validacao_id": 1, "validacoes": None}]
    assert calibracao.escolher(linhas, "SP-021 Rodoanel Oeste", "braquiaria").fator == 1.0


def test_linha_com_especie_diferente_tambem_nao_conta():
    """O mesmo teste acima, mas descasando pela ESPECIE em vez da rodovia: o
    original so provava metade de `_especificidade` (o `or` do lado da
    rodovia). Uma implementacao que checasse so `linha.get("rodovia")` e
    ignorasse `linha.get("especie")` passaria no teste de cima e falharia
    silenciosamente em producao, aplicando fator de braquiaria a batatais.
    """
    linhas = [{"fator": "2.0", "rodovia": None, "especie": "batatais",
              "validacao_id": 1, "validacoes": None}]
    assert calibracao.escolher(linhas, "SP-021 Rodoanel Oeste", "braquiaria").fator == 1.0


def test_validacoes_como_lista_do_postgrest():
    """O PostgREST as vezes devolve o embed `validacoes(...)` como LISTA em vez
    de objeto (quando o join nao prova unicidade). O ramo `isinstance(v, list)`
    existe so para isso e nenhum outro teste passava por ele -- sem este caso
    ele podia quebrar (`AttributeError: 'list' object has no attribute 'get'`)
    sem que a suite notasse.
    """
    linhas = [{"fator": "1.20", "rodovia": "SP-021 Rodoanel Oeste", "especie": "braquiaria",
              "validacao_id": 9, "validacoes": [{"n_pares_usados": 50, "executada_em": "2026-01-01"}]}]
    c = calibracao.escolher(linhas, "SP-021 Rodoanel Oeste", "braquiaria")
    assert c.n_pares == 50 and c.validada_em == "2026-01-01"


def test_validacoes_lista_vazia_nao_quebra():
    """A mesma forma de lista, mas vazia: `v[0] if v else {}` e o unico jeito de
    nao estourar `IndexError` aqui.
    """
    linhas = [{"fator": "1.20", "rodovia": "SP-021 Rodoanel Oeste", "especie": "braquiaria",
              "validacao_id": 9, "validacoes": []}]
    c = calibracao.escolher(linhas, "SP-021 Rodoanel Oeste", "braquiaria")
    assert c.n_pares is None and c.validada_em is None


class _ConsultaCalibracoes:
    """Duble minimo de uma query do PostgREST que FILTRA de verdade por
    `.eq(campo, valor)`, em vez de so devolver tudo que existe. E a diferenca
    entre provar que `carregar` pede `ativo=True` e so provar que ele devolve
    o que a tabela tiver -- um `FakeSb` que ignora `.eq()` deixaria passar um
    `carregar` que esquecesse o filtro e trouxesse a 1,15 rejeitada junto.
    """

    def __init__(self, linhas):
        self._linhas = linhas
        self._filtros = {}

    def select(self, *a, **k):
        return self

    def eq(self, campo, valor):
        self._filtros[campo] = valor
        return self

    def execute(self):
        dados = [l for l in self._linhas
                if all(l.get(c) == v for c, v in self._filtros.items())]
        return _Resposta(dados)


class _Resposta:
    def __init__(self, dados):
        self.data = dados


class _SbCalibracoes:
    def __init__(self, linhas):
        self._linhas = linhas

    def table(self, nome):
        assert nome == "calibracoes"
        return _ConsultaCalibracoes(self._linhas)


def test_carregar_nunca_traz_calibracao_inativa():
    """O caso mais valioso do arquivo: producao tem um fator 1,15 com
    `ativo=false`, guardado de proposito como candidato rejeitado. Se
    `carregar` esquecesse o `.eq("ativo", True)`, ele voltaria junto com o
    1,0 vigente e `escolher` aplicaria o fator errado a cada trecho da malha,
    em silencio.
    """
    linhas = [
        {"fator": "1.0", "rodovia": "SP-021 Rodoanel Oeste", "especie": "braquiaria",
         "validacao_id": 7, "validacoes": None, "ativo": True},
        {"fator": "1.15", "rodovia": "SP-021 Rodoanel Oeste", "especie": "braquiaria",
         "validacao_id": 6, "validacoes": None, "ativo": False},
    ]
    sb = _SbCalibracoes(linhas)
    ativas = calibracao.carregar(sb)
    assert len(ativas) == 1
    assert ativas[0]["fator"] == "1.0"
    assert all(l["fator"] != "1.15" for l in ativas)


class _SbQueDerruba:
    """Simula a tabela `calibracoes` fora do ar: RLS mudou, rede caiu, schema
    andou -- qualquer coisa que faca `.execute()` levantar.
    """

    def table(self, nome):
        raise RuntimeError("simulado: calibracoes indisponivel")


def test_carregar_seguro_sobrevive_a_falha_e_degrada_para_lista_vazia():
    """O achado do review: `calibracao.carregar(sb)` sem guarda, chamado FORA
    do laco por trecho em `analisar_lote.main()`, e ponto unico de falha do
    lote inteiro -- uma tabela fora do ar mata `main()` e os 60 trechos ficam
    sem previsao NENHUMA naquele dia, nao so "sem calibracao". `carregar_seguro`
    e o que `analisar_lote.py` chama agora: nunca propaga a excecao, devolve
    lista vazia, e cada trecho cai para `SEM` (fator 1,0) -- a MESMA degradacao
    que uma tabela vazia (sem excecao nenhuma) ja produzia antes desta tarefa.
    """
    assert calibracao.carregar_seguro(_SbQueDerruba()) == []
    # e a lista vazia realmente devolve SEM para qualquer trecho, no mesmo
    # caminho que uma tabela vazia (sem falha) ja usava:
    c = calibracao.escolher(calibracao.carregar_seguro(_SbQueDerruba()), "SP-021 Rodoanel Oeste", "braquiaria")
    assert c is calibracao.SEM
