"""
PASSO 3 - Exporta o modelo treinado para um formato que o painel consegue ler.

O `.pkl` e um `HistGradientBoostingRegressor`: carrega-lo exige scikit-learn,
scipy e numpy, mais de 250 MB descompactados. Isso cabe no GitHub Actions e nao
cabe numa funcao serverless. A pagina /simulador precisa da previsao SINCRONA,
entao o que vai para a Vercel nao e o modelo: e o desenho das arvores.

Gera dois arquivos em web/src/lib/modelo/:

  modelo.json    as 165 arvores, no e no, mais os mapas e as faixas de treino
  amostras.json  vetores de entrada e a saida do PROPRIO scikit-learn

O segundo arquivo e a rede de seguranca. `arvores.test.ts` reprova se o
percurso em TypeScript divergir do scikit-learn em qualquer amostra. Sem ele o
risco seria o pior de todos: prever errado em silencio. Quem retreinar o modelo
e esquecer de rodar este script quebra o `npm run verificar` em vez de publicar
numero errado.

    python exportar_modelo.py

--------------------------------------------------------------------------
A ARMADILHA QUE ESTE SCRIPT EXISTE PARA DOCUMENTAR
--------------------------------------------------------------------------
`p["features"]` NAO e a ordem das colunas dentro das arvores.

Quando `categorical_features` e usado, o sklearn monta um `_preprocessor`
(um ColumnTransformer) que roda antes de tudo e JOGA AS CATEGORICAS PARA A
FRENTE. A ordem real vista pelos nos e:

    [especie_cod, uf_cod, latitude, dias_periodo, altura_inicial_cm, ...]

...enquanto `p["features"]` diz `[latitude, dias_periodo, ..., especie_cod,
uf_cod]`. Quem chama `modelo.predict()` monta o vetor na ordem de
`p["features"]` e esta certo — o preprocessor reordena por baixo. Quem le os
nos direto, como este script, precisa aplicar a permutacao na mao.

Uma porta ingenua nao quebra: ela roda, devolve numero plausivel e erra sempre.
Latitude (negativa) cairia no split categorico da especie e seria tratada como
valor faltante. Por isso a permutacao vai EXPLICITA no JSON, e por isso as
amostras existem.
"""

import json
import sys
from pathlib import Path

import joblib
import numpy as np

DESTINO = Path("web/src/lib/modelo")
N_AMOSTRAS = 500
SEMENTE = 20260816


def carregar():
    try:
        return joblib.load("modelo_vegetacao.pkl")
    except Exception as e:
        import sklearn
        print("\nERRO AO CARREGAR modelo_vegetacao.pkl")
        print(f"  scikit-learn instalado: {sklearn.__version__}")
        print(f"  detalhe: {type(e).__name__}: {e}")
        sys.exit(1)


def permutacao_interna(modelo, features):
    """Da ordem de `features` para a ordem que os nos enxergam.

    Devolve `perm` tal que `interno[i] = entrada[perm[i]]`. Sai do proprio
    ColumnTransformer em vez de ser escrita a mao: se um dia o modelo for
    retreinado com outro conjunto de categoricas, isto continua certo.
    """
    pre = getattr(modelo, "_preprocessor", None)
    if pre is None:
        # Sem categoricas declaradas nao ha reordenacao: identidade.
        return list(range(len(features)))

    categoricas = [i for i, e in enumerate(modelo.is_categorical_) if e]
    numericas = [i for i, e in enumerate(modelo.is_categorical_) if not e]
    perm = categoricas + numericas

    # Conferencia contra o binner: a cardinalidade de cada coluna interna tem
    # que bater com o que se espera da feature que a permutacao aponta.
    n_bins = modelo._bin_mapper.n_bins_non_missing_
    for pos, origem in enumerate(perm):
        if modelo.is_categorical_[origem] and n_bins[pos] > 64:
            print(f"  AVISO: coluna interna {pos} ({features[origem]}) deveria "
                  f"ser categorica mas tem {n_bins[pos]} bins.")
    return perm


def faixas_de_treino(modelo, features, perm):
    """Minimo e maximo que cada feature numerica assumiu no treino.

    Sai dos limiares de bin do proprio modelo, e os limiares sao PONTOS MEDIOS
    entre valores distintos observados — nunca os valores em si. Ou seja: o
    menor limiar ja esta DENTRO da faixa real, e o maior tambem. Usar os
    limiares crus como faixa estreita a verdade nas duas pontas.

    Para feature de valores INTEIROS da para recuperar a faixa exata. Se todos
    os limiares distam 1,0 e todos terminam em ,5, os valores observados sao os
    inteiros de `menor - 0,5` ate `maior + 0,5`. E o caso de `dias_periodo`:
    limiares de 7,5 a 119,5 de um em um significam que o treino tinha periodos
    de 7 a 120 dias, e nao de 8 a 119 como um `ceil`/`floor` faria supor.

    Para feature continua nao da: `altura_inicial_cm` usa 255 bins de quantil, e
    o quanto o primeiro valor observado fica abaixo de 2,06 nao esta no modelo.
    Nesses casos a faixa sai um tico ESTREITA, o que erra para o lado seguro —
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


def gerar_amostras(modelo, features, mapas):
    """Vetores de entrada plausiveis, na ordem de `features`, e a saida real.

    As faixas sao as do dominio (rodovia brasileira, gramineas), nao as do
    treino: o teste tem que cobrir tambem o que acontece FORA do que o modelo
    viu, porque a pagina deixa a pessoa digitar fora e o TypeScript precisa
    saturar igual ao scikit-learn.
    """
    r = np.random.default_rng(SEMENTE)
    n = N_AMOSTRAS
    coluna = {
        "latitude": r.uniform(-28.0, -15.0, n),
        "dias_periodo": r.integers(1, 200, n).astype(float),
        "altura_inicial_cm": r.uniform(0.5, 130.0, n),
        "temperatura_media_c": r.uniform(2.0, 42.0, n),
        "umidade_media_pct": r.uniform(15.0, 100.0, n),
        "precipitacao_total_mm": r.uniform(0.0, 1200.0, n),
        "precipitacao_media_diaria_mm": r.uniform(0.0, 40.0, n),
        "radiacao_media_mj_m2": r.uniform(0.0, 35.0, n),
        "et0_medio_mm_dia": r.uniform(0.05, 9.0, n),
        "balanco_hidrico_chuva_sobre_et0": r.uniform(0.0, 12.0, n),
        "mes": r.integers(1, 13, n).astype(float),
        "especie_cod": r.integers(0, len(mapas["especie"]), n).astype(float),
        "uf_cod": r.integers(0, len(mapas["uf"]), n).astype(float),
    }

    faltando = [f for f in features if f not in coluna]
    if faltando:
        print(f"\nERRO: o modelo pede features sem faixa definida aqui: {faltando}")
        print("Acrescente-as em `gerar_amostras` antes de exportar.")
        sys.exit(1)

    X = np.column_stack([coluna[f] for f in features]).astype(float)
    y = modelo.predict(X)
    return X, y


def main():
    p = carregar()
    modelo, features, mapas = p["modelo"], p["features"], p["mapas"]

    perm = permutacao_interna(modelo, features)
    conhecidas, mapa_cat = modelo._bin_mapper.make_known_categories_bitsets()

    import sklearn
    pacote = {
        "gerado_por": "exportar_modelo.py",
        "sklearn": sklearn.__version__,
        "metricas": p.get("metricas", {}),
        # Ordem em que QUEM CHAMA monta o vetor. E a de `p["features"]`, a
        # mesma que `analisar_lote.py` usa.
        "entrada": list(features),
        # `interno[i] = entrada[permutacao[i]]`. Ver o cabecalho deste arquivo.
        "permutacao": [int(x) for x in perm],
        "mapas": mapas,
        "faixas": faixas_de_treino(modelo, features, perm),
        "base": float(np.ravel(modelo._baseline_prediction)[0]),
        "conhecidas": [[int(y) for y in linha] for linha in conhecidas],
        "mapaCat": [int(x) for x in mapa_cat],
        "arvores": serializar_arvores(modelo),
    }

    X, y = gerar_amostras(modelo, features, mapas)
    amostras = {
        "gerado_por": "exportar_modelo.py",
        "entrada": list(features),
        "vetores": [[float(v) for v in linha] for linha in X],
        "saidas": [float(v) for v in y],
    }

    DESTINO.mkdir(parents=True, exist_ok=True)
    # `separators` sem espaco e o que derruba o arquivo de ~600 KB para ~430 KB.
    # Nao arredonde os floats: o teste de paridade compara bit a bit, e o repr
    # padrao do Python ja e o mais curto que volta ao mesmo float64.
    for nome, conteudo in (("modelo.json", pacote), ("amostras.json", amostras)):
        caminho = DESTINO / nome
        caminho.write_text(json.dumps(conteudo, separators=(",", ":")), encoding="utf-8")
        print(f"  {caminho}  {caminho.stat().st_size/1024:.0f} KB")

    n_nos = sum(len(a["f"]) for a in pacote["arvores"])
    print(f"\n{len(pacote['arvores'])} arvores, {n_nos} nos.")
    print(f"Ordem interna: {[features[i] for i in perm]}")
    print(f"{N_AMOSTRAS} amostras de referencia para o teste de paridade.")


if __name__ == "__main__":
    main()
