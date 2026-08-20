"""
O `modelo_gramas.pkl`: carga, previsao em intervalo e busca do cruzamento.

O QUE MUDOU EM RELACAO AO MODELO ANTIGO
---------------------------------------
O `modelo_vegetacao.pkl` respondia UM numero, `crescimento_medio_diario_cm`, e
tudo depois dele era multiplicacao: altura de hoje = medicao + cm/dia x dias;
dias ate o limite = (limite - altura) / cm/dia. Reta.

O `modelo_gramas.pkl` responde `crescimento_total_cm` -- os centimetros do
PERIODO inteiro -- e em TRES numeros (q10, q50, q90), porque crescimento de
grama tem variancia irredutivel e um ponto so engana. E a resposta nao e linear
no tamanho do periodo: `dias_periodo` e feature de treino, e o modelo aprendeu
que 30 dias nao rendem o dobro de 15.

Isso mata as duas divisoes acima. No lugar delas:

    altura de hoje    perguntar o crescimento da janela [ultima medicao, hoje),
                      com o clima OBSERVADO daqueles dias -- em vez de
                      extrapolar uma taxa de hoje para tras.

    dias ate o limite varrer horizontes de 1 a 120 dias e achar o primeiro em
                      que a curva cruza. `curva()` faz isso numa chamada so ao
                      sklearn, com as 120 linhas empilhadas.

QUANTIS PODEM SE CRUZAR
-----------------------
Os tres modelos sao independentes; nada garante q10 <= q50 <= q90 numa linha
qualquer. `prever` ordena linha a linha, que e a correcao que o proprio notebook
de calibracao aplica. Sem isso o "intervalo" as vezes sai invertido.

VERSAO DO SKLEARN
-----------------
Um `InconsistentVersionWarning` vira ERRO aqui. O modo de falha que importa nao
e o pkl que nao carrega: e o que carrega e preve torto em silencio.
"""

import os
import re
import sys
import warnings
from typing import Sequence

import joblib
import numpy as np

CAMINHO = os.getenv("MODELO_PKL", "modelo_gramas.pkl")

#: Horizonte da busca do cruzamento, em dias. E o teto de `dias_periodo` no
#: treino: alem disso o modelo satura no ultimo bin em vez de errar com barulho.
HORIZONTE_DIAS = 120

#: Janela de referencia de `altura_prevista_cm`. Trinta dias porque e o que a
#: coluna sempre significou, desde o schema original.
JANELA_REFERENCIA = 30


def _carregar():
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", UserWarning)
            return joblib.load(CAMINHO)
    except Exception as e:
        import sklearn
        m = re.search(r"from version ([\d.]+)", str(e))
        print(f"\nERRO AO CARREGAR {CAMINHO}")
        print(f"  scikit-learn instalado : {sklearn.__version__}")
        if m:
            print(f"  scikit-learn do modelo : {m.group(1)}")
        print("\nAs duas versoes precisam ser IGUAIS. Escolha um caminho:")
        print("  A) editar requirements.txt para a versao do modelo, ou")
        print("  B) retreinar com a versao instalada:")
        print("     python treinar_modelo.py --treinar dataset_gramas_v3.csv")
        print(f"\nDetalhe tecnico: {type(e).__name__}: {e}")
        sys.exit(1)


_PACOTE = _carregar()

FEATURES: list[str] = list(_PACOTE["features"])
CATEGORIAS: list[str] = list(_PACOTE["categorias"])
QUANTIS: list[float] = sorted(_PACOTE["quantis"])
METRICAS: dict = dict(_PACOTE["metricas"])
TREINADO_EM: str = _PACOTE["treinado_em"]
N_LINHAS: int = int(_PACOTE["n_linhas"])
ALVO: str = _PACOTE["alvo"]
AVISO: str = _PACOTE["aviso"]
_MODELOS = _PACOTE["modelos"]


def prever(linhas: Sequence[dict]) -> np.ndarray:
    """(n, 3) com q10, q50, q90 em centimetros do periodo, ja ordenados.

    Monta um array de OBJETO em vez de um DataFrame: a especie e string e as
    outras 19 sao numero, e o `_preprocessor` do sklearn (um ColumnTransformer
    com OrdinalEncoder) da conta do array de objeto sem o pandas entrar na
    lista de dependencias do lote. Um array de float com a especie ja
    codificada NAO funciona -- o OrdinalEncoder foi treinado nos rotulos.
    """
    if not linhas:
        return np.empty((0, 3))

    faltando = [c for c in FEATURES if c not in linhas[0]]
    if faltando:
        raise ValueError(f"faltam features: {faltando}")

    X = np.empty((len(linhas), len(FEATURES)), dtype=object)
    for i, linha in enumerate(linhas):
        for j, f in enumerate(FEATURES):
            X[i, j] = linha[f]

    with warnings.catch_warnings():
        # O modelo foi ajustado com DataFrame, entao ele reclama de receber
        # array sem nomes de coluna. A ordem esta certa por construcao acima.
        warnings.filterwarnings("ignore", message=".*valid feature names.*")
        bruto = np.column_stack([_MODELOS[q].predict(X) for q in QUANTIS])

    return np.sort(bruto, axis=1)


def curva(montar, horizonte: int = HORIZONTE_DIAS) -> np.ndarray:
    """(horizonte, 3): crescimento total previsto para 1, 2, ... N dias.

    `montar(d)` devolve o dicionario de features para uma janela de `d` dias.
    As N linhas vao numa chamada so ao sklearn -- 120 chamadas separadas custam
    ~40x mais, e o lote faz isso 50 vezes.
    """
    linhas = []
    for d in range(1, horizonte + 1):
        try:
            linhas.append(montar(d))
        except Exception:
            break              # a serie de clima acabou antes do horizonte
    return prever(linhas)


#: Abaixo disto o trecho e tratado como "nao cresce" e `dias_ate_limite` sai
#: NULO. Um centesimo de centimetro por dia e 1,2 cm no horizonte inteiro de 120
#: dias -- indistinguivel de ruido do modelo. O limiar anterior era 0,001, e com
#: ele um trecho de esmeralda no inverno crescendo 0,0014 cm/dia produzia
#: "2212 dias ate o limite": um numero exato construido sobre nada, do mesmo
#: tipo que o CLAUDE.md registra como sintoma ("um deles a 2196").
CRESCIMENTO_DESPREZIVEL = 0.01


def cruzamento(altura_inicial_cm: float, limite_cm: float,
               crescimento_q50: np.ndarray) -> tuple[int | None, float]:
    """(dias ate cruzar o limite, ritmo medio em cm/dia ate la).

    Devolve `0` quando ja esta acima e `None` quando nao cresce.

    Alem do horizonte varrido, estende em LINHA pela taxa media do horizonte
    inteiro. Nao e a resposta melhor -- e a que preserva a semantica da coluna,
    que sempre foi "quantos dias faltam" e nunca nulo para trecho folgado.
    `analisar_lote.py` fecha agendamento por `dias_ate_limite > 55` e a view
    carimba risco `baixa` quando a coluna e NULA; devolver nulo aqui faria o
    trecho folgado ser lido como "sem previsao nenhuma".

    O ritmo devolvido e o que TORNA as duas colunas coerentes: em qualquer dos
    dois ramos vale `altura_inicial + ritmo x dias = limite`. Sem isso a tela
    mostraria "0,5 cm/dia" ao lado de "25 dias" com 20 cm de folga, e os tres
    numeros nao fechariam entre si.
    """
    n = len(crescimento_q50)
    if n == 0:
        return None, 0.0

    folga = limite_cm - altura_inicial_cm
    if folga <= 0:
        return 0, float(crescimento_q50[min(JANELA_REFERENCIA, n) - 1]) / min(JANELA_REFERENCIA, n)

    for d in range(1, n + 1):
        if crescimento_q50[d - 1] >= folga:
            return d, float(crescimento_q50[d - 1]) / d

    taxa = float(crescimento_q50[n - 1]) / n
    if taxa < CRESCIMENTO_DESPREZIVEL:
        return None, max(taxa, 0.0)

    return int(round(folga / taxa)), taxa


def banda_de_cruzamento(altura_inicial_cm: float, limite_cm: float,
                        Q: np.ndarray) -> tuple[int | None, int | None]:
    """(mais cedo, mais tarde) que o trecho pode cruzar o limite.

    E aqui que o intervalo do modelo vira informacao de gestor. "+5,6 a +9,7 cm"
    nao ajuda ninguem a marcar equipe; "cruza o limite entre 28 e 61 dias"
    ajuda. Mais crescimento cruza mais CEDO, entao o q90 da a ponta de baixo e o
    q10 a de cima -- as colunas trocam de papel de proposito.

    `None` na ponta de cima significa "nesse ritmo pode nem cruzar no horizonte
    que o modelo enxerga", que e uma resposta e nao uma falha.
    """
    if len(Q) == 0:
        return None, None
    cedo, _ = cruzamento(altura_inicial_cm, limite_cm, Q[:, 2])
    tarde, _ = cruzamento(altura_inicial_cm, limite_cm, Q[:, 0])
    return cedo, tarde
