"""
PASSO 3 - Exporta o modelo treinado para um formato que o painel consegue ler.

O `modelo_gramas.pkl` sao QUATRO `HistGradientBoostingRegressor` (q10, q50, q90
e uma media que nao usamos). Carrega-los exige scikit-learn, scipy e numpy, mais
de 250 MB descompactados: cabe no GitHub Actions e nao cabe numa funcao
serverless. Por isso a reanalise de trecho vai para o Actions. Mas a pagina
/simulador precisa da previsao SINCRONA, entao o que vai para a Vercel nao e o
modelo: e o desenho das arvores.

Gera dois arquivos em web/src/lib/modelo/:

  modelo.json    os TRES ensembles de quantil, no a no, mais categorias,
                 permutacao e faixas de treino
  amostras.json  vetores de entrada e as tres saidas do PROPRIO scikit-learn

O segundo arquivo e a rede de seguranca. `arvores.test.ts` reprova se o percurso
em TypeScript divergir do scikit-learn em qualquer amostra. Sem ele o risco seria
o pior de todos: prever errado em silencio. Quem retreinar o modelo e esquecer de
rodar este script quebra o `npm run verificar` em vez de publicar numero errado.

    python exportar_modelo.py

--------------------------------------------------------------------------
DUAS ARMADILHAS QUE ESTE SCRIPT EXISTE PARA DOCUMENTAR
--------------------------------------------------------------------------
1. `p["features"]` NAO e necessariamente a ordem das colunas dentro das arvores.

   Quando `categorical_features` e usado, o sklearn monta um `_preprocessor` (um
   ColumnTransformer) que roda antes de tudo e JOGA AS CATEGORICAS PARA A
   FRENTE. No modelo antigo isso reordenava de verdade, porque as categoricas
   estavam no FIM da lista. Neste, `especie` ja e a primeira feature e a
   permutacao sai identidade -- o que e uma coincidencia do treino, nao uma
   garantia. A permutacao continua saindo do proprio ColumnTransformer e vai
   EXPLICITA no JSON: no dia em que o treino mudar de ordem, nada quebra
   sozinho, e o teste de paridade e quem avisa.

2. A CATEGORICA AGORA E TEXTO, e nao um codigo pre-calculado.

   O modelo antigo recebia `especie_cod` e `uf_cod` ja em numero, e o `.pkl`
   trazia o mapa que os produziu. Este recebe a string "braquiaria" e o
   ColumnTransformer a converte com um `OrdinalEncoder(unknown_value=nan)`
   ajustado em `categorias`. Quer dizer duas coisas para o TypeScript:
     - o codigo e o INDICE na lista `categorias`, e nada mais;
     - especie desconhecida vira NaN, e NaN e tratado como FALTANTE pelo
       percurso -- nao como categoria zero. As amostras cobrem esse caso.
"""

import json
import sys
import warnings
from pathlib import Path

import joblib
import numpy as np

DESTINO = Path("web/src/lib/modelo")
CAMINHO_PKL = "modelo_gramas.pkl"
N_AMOSTRAS = 600
#: Quantas das amostras usam uma especie que o modelo nunca viu, para o
#: TypeScript ter que reproduzir o caminho do valor faltante.
N_DESCONHECIDAS = 40
SEMENTE = 20260818


def carregar():
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", UserWarning)
            return joblib.load(CAMINHO_PKL)
    except Exception as e:
        import sklearn
        print(f"\nERRO AO CARREGAR {CAMINHO_PKL}")
        print(f"  scikit-learn instalado: {sklearn.__version__}")
        print(f"  detalhe: {type(e).__name__}: {e}")
        sys.exit(1)


def permutacao_interna(modelo, features):
    """Da ordem de `features` para a ordem que os nos enxergam.

    Devolve `perm` tal que `interno[i] = entrada[perm[i]]`. Sai do proprio
    ColumnTransformer em vez de ser escrita a mao: se um dia o modelo for
    retreinado com outro conjunto de categoricas, isto continua certo.
    """
    if getattr(modelo, "_preprocessor", None) is None:
        return list(range(len(features)))

    categoricas = [i for i, e in enumerate(modelo.is_categorical_) if e]
    numericas = [i for i, e in enumerate(modelo.is_categorical_) if not e]
    perm = categoricas + numericas

    n_bins = modelo._bin_mapper.n_bins_non_missing_
    for pos, origem in enumerate(perm):
        if modelo.is_categorical_[origem] and n_bins[pos] > 64:
            print(f"  AVISO: coluna interna {pos} ({features[origem]}) deveria "
                  f"ser categorica mas tem {n_bins[pos]} bins.")
    return perm


def faixas_de_treino(modelo, features, perm):
    """Minimo e maximo que cada feature numerica assumiu no treino.

    Sai dos limiares de bin do proprio modelo, e os limiares sao PONTOS MEDIOS
    entre valores distintos observados -- nunca os valores em si. Ou seja: o
    menor limiar ja esta DENTRO da faixa real, e o maior tambem. Usar os
    limiares crus como faixa estreita a verdade nas duas pontas.

    Para feature de valores INTEIROS da para recuperar a faixa exata. Se todos
    os limiares distam 1,0 e todos terminam em ,5, os valores observados sao os
    inteiros de `menor - 0,5` ate `maior + 0,5`. E o caso de `dias_periodo`:
    limiares de 1,5 a 119,5 de um em um significam que o treino tinha periodos
    de 1 a 120 dias -- e nao de 2 a 119 como um `ceil`/`floor` faria supor.

    Para feature continua nao da: `altura_inicial_cm` usa 255 bins de quantil, e
    o quanto o primeiro valor observado fica abaixo de 2,7 nao esta no modelo.
    Nesses casos a faixa sai um tico ESTREITA, o que erra para o lado seguro --
    marca como extrapolacao algo que talvez estivesse na borda do treino. O
    campo `exata` diz qual dos dois casos e, para a tela nao prometer precisao
    que nao tem.
    """
    faixas = {}
    for pos, limiares in enumerate(modelo._bin_mapper.bin_thresholds_):
        nome = features[perm[pos]]
        if modelo.is_categorical_[perm[pos]] or len(limiares) == 0:
            continue

        menor, maior = float(np.min(limiares)), float(np.max(limiares))
        exata = (
            len(limiares) >= 2
            and np.allclose(np.diff(limiares), 1.0)
            and np.allclose(np.mod(limiares, 1.0), 0.5)
        )
        if exata:
            menor, maior = menor - 0.5, maior + 0.5

        faixas[nome] = {"min": menor, "max": maior, "exata": bool(exata)}
    return faixas


def serializar_arvores(modelo):
    arvores = []
    for grupo in modelo._predictors:
        nos = grupo[0].nodes
        arvores.append({
            # Arrays paralelos, um indice por no. Fica menor e mais rapido de
            # percorrer que uma lista de objetos.
            "f": [int(x) for x in nos["feature_idx"]],
            "t": [float(x) for x in nos["num_threshold"]],
            "e": [int(x) for x in nos["left"]],
            "d": [int(x) for x in nos["right"]],
            "v": [float(x) for x in nos["value"]],
            "folha": [int(x) for x in nos["is_leaf"]],
            "cat": [int(x) for x in nos["is_categorical"]],
            "faltaEsq": [int(x) for x in nos["missing_go_to_left"]],
            "bi": [int(x) for x in nos["bitset_idx"]],
            "bits": [[int(y) for y in linha] for linha in grupo[0].raw_left_cat_bitsets],
        })
    return arvores


def serializar_ensemble(modelo):
    conhecidas, mapa_cat = modelo._bin_mapper.make_known_categories_bitsets()
    return {
        "base": float(np.ravel(modelo._baseline_prediction)[0]),
        "conhecidas": [[int(y) for y in linha] for linha in conhecidas],
        "mapaCat": [int(x) for x in mapa_cat],
        "arvores": serializar_arvores(modelo),
    }


#: Faixas do DOMINIO (rodovia brasileira, gramineas), nao as do treino: o teste
#: tem que cobrir tambem o que acontece FORA do que o modelo viu, porque a
#: pagina deixa a pessoa digitar fora e o TypeScript precisa saturar igual.
FAIXAS_AMOSTRA = {
    "dias_periodo": ("inteiro", 1, 140),
    "altura_inicial_cm": ("real", 0.5, 130.0),
    "dias_desde_rocada_inicio": ("inteiro", 0, 260),
    "temperatura_media_c": ("real", 2.0, 42.0),
    "temperatura_min_c": ("real", -6.0, 30.0),
    "temperatura_max_c": ("real", 8.0, 46.0),
    "graus_dia_acumulados": ("real", 0.0, 1600.0),
    "umidade_media_pct": ("real", 15.0, 100.0),
    "precipitacao_total_mm": ("real", 0.0, 900.0),
    "dias_com_chuva": ("inteiro", 0, 130),
    "et0_medio_mm_dia": ("real", 0.4, 9.5),
    "radiacao_media_mj_m2": ("real", 2.0, 33.0),
    "agua_solo_media_pct": ("real", 0.0, 100.0),
    "capacidade_agua_solo_mm": ("real", 20.0, 140.0),
    "fertilidade_solo": ("real", 0.02, 1.0),
    "latitude": ("real", -33.0, 5.0),
    "geadas_no_periodo": ("inteiro", 0, 20),
    "dias_encharcado": ("inteiro", 0, 40),
    "dias_floracao": ("inteiro", 0, 130),
}


def gerar_amostras(modelos, features, categorias, quantis):
    """Vetores de entrada plausiveis, na ordem de `features`, e as saidas reais.

    A especie entra no sklearn como TEXTO e sai no JSON como CODIGO -- o indice
    em `categorias`, que e o que o OrdinalEncoder produz. As ultimas
    `N_DESCONHECIDAS` linhas usam uma especie inventada, que o encoder converte
    em NaN: e o unico jeito de o teste de paridade cobrir o caminho do valor
    faltante numa coluna categorica.
    """
    r = np.random.default_rng(SEMENTE)
    n = N_AMOSTRAS

    faltando = [f for f in features
                if f != "especie" and f not in FAIXAS_AMOSTRA]
    if faltando:
        print(f"\nERRO: o modelo pede features sem faixa definida aqui: {faltando}")
        print("Acrescente-as em FAIXAS_AMOSTRA antes de exportar.")
        sys.exit(1)

    coluna = {}
    for nome, (tipo, lo, hi) in FAIXAS_AMOSTRA.items():
        coluna[nome] = (r.integers(lo, hi + 1, n).astype(float) if tipo == "inteiro"
                        else r.uniform(lo, hi, n))

    especies = np.array(categorias, dtype=object)[r.integers(0, len(categorias), n)]
    codigos = np.array([categorias.index(e) for e in especies], dtype=float)
    if N_DESCONHECIDAS:
        especies[-N_DESCONHECIDAS:] = "capim-que-nao-existe"
        codigos[-N_DESCONHECIDAS:] = np.nan

    X = np.empty((n, len(features)), dtype=object)
    vetores = np.empty((n, len(features)), dtype=float)
    for j, f in enumerate(features):
        if f == "especie":
            X[:, j] = especies
            vetores[:, j] = codigos
        else:
            X[:, j] = coluna[f]
            vetores[:, j] = coluna[f]

    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message=".*valid feature names.*")
        saidas = np.column_stack([modelos[q].predict(X) for q in quantis])

    return vetores, saidas


def main():
    p = carregar()
    features = list(p["features"])
    categorias = [str(c) for c in p["categorias"]]
    quantis = sorted(p["quantis"])
    modelos = p["modelos"]
    referencia = modelos[quantis[len(quantis) // 2]]

    perm = permutacao_interna(referencia, features)

    # A permutacao e as faixas saem do q50, mas os tres foram treinados na mesma
    # matriz: se divergirem, algo esta muito errado e e melhor parar aqui.
    for q in quantis:
        outra = permutacao_interna(modelos[q], features)
        if outra != perm:
            sys.exit(f"q{int(q*100)} tem permutacao diferente do q50: {outra} != {perm}")

    import sklearn
    pacote = {
        "gerado_por": "exportar_modelo.py",
        "sklearn": sklearn.__version__,
        "treinadoEm": p["treinado_em"],
        "alvo": p["alvo"],
        "nLinhas": int(p["n_linhas"]),
        "aviso": p["aviso"],
        "metricas": p.get("metricas", {}),
        # Ordem em que QUEM CHAMA monta o vetor. E a de `p["features"]`, a
        # mesma que `clima.montar_features` produz no lote.
        "entrada": features,
        # `interno[i] = entrada[permutacao[i]]`. Ver o cabecalho deste arquivo.
        "permutacao": [int(x) for x in perm],
        # Nome da coluna categorica -> categorias na ordem do OrdinalEncoder.
        # O codigo de uma categoria E o indice nesta lista.
        "categorias": {"especie": categorias},
        "faixas": faixas_de_treino(referencia, features, perm),
        "quantis": [float(q) for q in quantis],
        "ensembles": [serializar_ensemble(modelos[q]) for q in quantis],
    }

    X, y = gerar_amostras(modelos, features, categorias, quantis)
    amostras = {
        "gerado_por": "exportar_modelo.py",
        "entrada": features,
        "quantis": [float(q) for q in quantis],
        "vetores": [[None if np.isnan(v) else float(v) for v in linha] for linha in X],
        "saidas": [[float(v) for v in linha] for linha in y],
    }

    DESTINO.mkdir(parents=True, exist_ok=True)
    # `separators` sem espaco derruba o arquivo em ~30%. Nao arredonde os
    # floats: o teste de paridade compara bit a bit, e o repr padrao do Python
    # ja e o mais curto que volta ao mesmo float64.
    for nome, conteudo in (("modelo.json", pacote), ("amostras.json", amostras)):
        caminho = DESTINO / nome
        caminho.write_text(json.dumps(conteudo, separators=(",", ":")), encoding="utf-8")
        print(f"  {caminho}  {caminho.stat().st_size/1048576:.2f} MB")

    n_nos = sum(len(a["f"]) for e in pacote["ensembles"] for a in e["arvores"])
    print(f"\n{len(quantis)} ensembles, "
          f"{sum(len(e['arvores']) for e in pacote['ensembles'])} arvores, {n_nos} nos.")
    print(f"Ordem interna: {[features[i] for i in perm]}")
    print(f"{N_AMOSTRAS} amostras de referencia ({N_DESCONHECIDAS} com especie "
          f"desconhecida) para o teste de paridade.")


if __name__ == "__main__":
    main()
