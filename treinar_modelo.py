"""
PASSO 1 - Treina a IA de previsao de crescimento.

Rode isto UMA VEZ (no Colab ou no seu notebook).
Ele gera o arquivo modelo_vegetacao.pkl, que voce usa no servidor.

    pip install pandas scikit-learn joblib
    python treinar_modelo.py dataset.csv
"""

import sys
import time
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.inspection import permutation_importance

CAMINHO = sys.argv[1] if len(sys.argv) > 1 else "dataset.csv"
ALVO = "crescimento_medio_diario_cm"

# --- Colunas que NAO entram como feature, e por que ---------------------
# crescimento_total_cm = ALVO * dias_periodo          -> vazamento de alvo
# altura_final_cm      = altura_inicial + total       -> vazamento de alvo
# coloracao            = funcao pura de indice_vigor  -> redundante
# indice_vigor         = exige inspecao em campo      -> NAO existe em producao
# local / datas / id   = identificadores
EXCLUIR = [
    "crescimento_total_cm", "altura_final_cm",
    "coloracao", "indice_vigor",
    "id", "local", "data_inicio", "data_fim",
]
CATEGORICAS = ["especie", "uf"]


def main():
    print(f"Lendo {CAMINHO} ...")
    df = pd.read_csv(CAMINHO)
    df["mes"] = pd.to_datetime(df["data_inicio"]).dt.month
    print(f"  {len(df):,} linhas | {df.especie.nunique()} especies | {df.uf.nunique()} UFs")

    # Codifica texto -> numero, guardando o mapa para usar em producao
    mapas = {c: {v: i for i, v in enumerate(sorted(df[c].unique()))} for c in CATEGORICAS}
    for c in CATEGORICAS:
        df[c + "_cod"] = df[c].map(mapas[c])

    features = [c for c in df.columns
                if c not in EXCLUIR + CATEGORICAS + [ALVO]]
    print(f"  Features: {features}")

    X = df[features].to_numpy(dtype=float)
    y = df[ALVO].to_numpy()
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)

    idx_cat = [features.index(c + "_cod") for c in CATEGORICAS]
    modelo = HistGradientBoostingRegressor(
        max_iter=400, learning_rate=0.08,
        categorical_features=idx_cat, random_state=42,
    )

    t0 = time.time()
    modelo.fit(X_tr, y_tr)
    seg = time.time() - t0

    pred = modelo.predict(X_te)
    mae = mean_absolute_error(y_te, pred)
    r2 = r2_score(y_te, pred)

    print(f"\n{'='*52}\nRESULTADO  (numeros para o slide)\n{'='*52}")
    print(f"  Amostras de treino : {len(X_tr):,}")
    print(f"  Tempo de treino    : {seg:.0f} segundos")
    print(f"  R2                 : {r2:.4f}")
    print(f"  Erro medio (MAE)   : {mae:.4f} cm/dia")
    print(f"  Erro relativo      : {100*mae/y_te.mean():.1f}%")

    imp = permutation_importance(modelo, X_te[:20000], y_te[:20000],
                                 n_repeats=3, random_state=42, n_jobs=-1)
    print("\n  Fatores mais influentes:")
    for i in np.argsort(imp.importances_mean)[::-1][:6]:
        print(f"    {features[i]:<34} {imp.importances_mean[i]:.4f}")

    joblib.dump(
        {"modelo": modelo, "features": features, "mapas": mapas,
         "metricas": {"r2": float(r2), "mae": float(mae)}},
        "modelo_vegetacao.pkl",
    )
    print("\n>>> modelo_vegetacao.pkl gerado. Baixe este arquivo. <<<")


if __name__ == "__main__":
    main()
