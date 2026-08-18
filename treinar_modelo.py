#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Treina o modelo de crescimento a partir do dataset v3 e salva um .pkl.

DIFERENCAS PARA UM TREINO INGENUO
---------------------------------
1. INTERVALO, NAO PONTO. Treina 3 modelos (q10, q50, q90). Crescimento de
   grama tem variancia grande e irredutivel; um numero unico engana.
2. TRAVA ANTI-VAZAMENTO. Colunas que so existem porque o simulador as gerou
   (indice_vigor, altura fisiologica, coloracao, altura_final) sao BLOQUEADAS
   por lista explicita + assercao. Se vazarem, o R2 sobe e o campo desmente.
3. VALIDACAO POR LOCAL. Alem do split aleatorio, testa em cidades que o
   modelo NUNCA viu. A diferenca entre os dois R2 mede o quanto ele
   generaliza geograficamente - que e o que importa quando voce leva pra
   uma rodovia nova.
4. FILTRA JANELAS SUJAS. Periodos com rocada ou fogo no meio nao sao
   problema de "prever crescimento": a altura foi resetada. Ficam de fora.

O ALVO e crescimento_total_cm (altura MEDIDA, com turgor), porque e isso que
o bastao graduado le no campo. crescimento_fisiologico_cm fica disponivel via
--alvo para quem quiser separar tecido novo de reidratacao.

USO
---
  pip install numpy pandas scikit-learn joblib
  python treinar_modelo.py --treinar dataset_gramas_v3.csv
  python treinar_modelo.py --prever --especie braquiaria --altura-inicial 10 \\
      --dias 4 --temp 22.1 --tmin 13 --tmax 32 --chuva 9 --dias-chuva 1 \\
      --umidade 62 --et0 3.2 --radiacao 18 --dias-desde-rocada 40
  python treinar_modelo.py --prever --csv meus_cenarios.csv
"""

import argparse, json, os, sys, time
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import r2_score, mean_absolute_error

MODELO = "modelo_gramas.pkl"

# Nunca entram como feature. Ou sao a resposta, ou nao existem no campo.
BLOQUEADAS = {
    "crescimento_total_cm", "crescimento_fisiologico_cm",
    "crescimento_medio_diario_cm", "altura_final_cm",
    "altura_final_fisiologica_cm", "altura_inicial_fisiologica_cm",
    "indice_vigor_medio", "coloracao_final", "atingiu_limite_rocada_50cm",
    "altura_teto_sitio_cm",          # so o simulador sabe o teto do sitio
    "id", "data_inicio", "data_fim", "local",
}

# Medivel/estimavel em campo antes de prever.
FEATURES = [
    "especie", "dias_periodo", "altura_inicial_cm", "dias_desde_rocada_inicio",
    "temperatura_media_c", "temperatura_min_c", "temperatura_max_c",
    "graus_dia_acumulados", "umidade_media_pct", "precipitacao_total_mm",
    "dias_com_chuva", "et0_medio_mm_dia", "radiacao_media_mj_m2",
    "agua_solo_media_pct", "capacidade_agua_solo_mm", "fertilidade_solo",
    "latitude", "geadas_no_periodo", "dias_encharcado", "dias_floracao",
]
QUANTIS = [0.10, 0.50, 0.90]


def carregar(caminho, alvo, max_linhas=None, seed=0):
    print(f"Lendo {caminho} ...")
    usar = sorted(set(FEATURES) | {alvo, "local", "rocadas_no_periodo",
                                   "fogo_no_periodo"})
    d = pd.read_csv(caminho, usecols=lambda c: c in usar)
    n0 = len(d)
    d = d[(d.rocadas_no_periodo == 0) & (~d.fogo_no_periodo.astype(bool))]
    print(f"  {n0:,} linhas -> {len(d):,} apos remover janelas com rocada/fogo"
          .replace(",", "."))
    if max_linhas and len(d) > max_linhas:
        d = d.sample(max_linhas, random_state=seed)
        print(f"  subamostrado para {len(d):,}".replace(",", "."))
    faltando = [c for c in FEATURES if c not in d.columns]
    if faltando:
        sys.exit(f"Dataset sem as colunas: {faltando}\n"
                 "Gere a planilha com gerador_v3_sigmoide.py.")
    vaz = BLOQUEADAS & set(FEATURES)
    assert not vaz, f"VAZAMENTO: {vaz}"
    return d


def montar_X(d):
    X = d[FEATURES].copy()
    X["especie"] = X["especie"].astype("category")
    return X


def treinar(args):
    d = carregar(args.treinar, args.alvo, args.max_linhas, args.seed)
    y = d[args.alvo].to_numpy()
    X = montar_X(d)
    cat = [X.columns.get_loc("especie")]
    rng = np.random.default_rng(args.seed)

    # --- split por LOCAL (cidades nunca vistas) --------------------------
    locais = d["local"].unique()
    n_out = max(1, int(round(len(locais) * 0.25)))
    fora = set(rng.choice(locais, n_out, replace=False))
    m_out = d["local"].isin(fora).to_numpy()
    print(f"\nvalidacao geografica: {n_out} de {len(locais)} locais fora do treino")
    print(f"  fora: {', '.join(sorted(fora))}")

    # --- split aleatorio -------------------------------------------------
    idx = rng.permutation(len(d)); corte = int(len(d)*0.8)
    tr_r, te_r = idx[:corte], idx[corte:]

    def ajusta(Xa, ya, q=None):
        kw = dict(max_iter=args.iteracoes, learning_rate=0.08,
                  max_leaf_nodes=63, min_samples_leaf=40,
                  categorical_features=cat, random_state=args.seed,
                  early_stopping=True, validation_fraction=0.1)
        if q is None:
            m = HistGradientBoostingRegressor(**kw)
        else:
            m = HistGradientBoostingRegressor(loss="quantile", quantile=q, **kw)
        return m.fit(Xa, ya)

    t0 = time.time()
    print("\ntreinando mediana (q50)...")
    m50_r = ajusta(X.iloc[tr_r], y[tr_r])
    p = m50_r.predict(X.iloc[te_r])
    r2_rand, mae_rand = r2_score(y[te_r], p), mean_absolute_error(y[te_r], p)

    m50_g = ajusta(X[~m_out], y[~m_out])
    pg = m50_g.predict(X[m_out])
    r2_geo, mae_geo = r2_score(y[m_out], pg), mean_absolute_error(y[m_out], pg)

    print(f"\n  split aleatorio        : R2 {r2_rand:.3f} | MAE {mae_rand:.2f} cm")
    print(f"  locais nunca vistos    : R2 {r2_geo:.3f} | MAE {mae_geo:.2f} cm")
    queda = (r2_rand - r2_geo) / max(r2_rand, 1e-9) * 100
    print(f"  queda de generalizacao : {queda:.1f}%"
          + ("   <- ATENCAO: o modelo depende do local" if queda > 25 else ""))

    print("\ntreinando quantis no dataset completo...")
    # BUG CORRIGIDO: antes o q50 era treinado com perda quadratica, ou seja,
    # previa a MEDIA. Como a distribuicao de crescimento e assimetrica a
    # direita (muitos casos perto de zero, poucos eventos grandes), a media
    # podia sair ACIMA do q90 - saida incoerente. Agora os tres usam perda
    # de quantil e a mediana e mediana de verdade.
    modelos = {}
    for q in QUANTIS:
        modelos[q] = ajusta(X, y, q)
        print(f"  q{int(q*100)} ok")
    modelos["media"] = ajusta(X, y, None)
    print("  media ok (rotulada separadamente; nao e o q50)")

    # cobertura empirica do intervalo no holdout geografico
    lo = ajusta(X[~m_out], y[~m_out], 0.10).predict(X[m_out])
    hi = ajusta(X[~m_out], y[~m_out], 0.90).predict(X[m_out])
    cob = float(((y[m_out] >= lo) & (y[m_out] <= hi)).mean())
    print(f"\ncobertura do intervalo q10-q90 em locais novos: {cob*100:.1f}% "
          f"(nominal 80%)")

    imp = pd.Series(
        getattr(m50_r, "feature_importances_", np.zeros(len(FEATURES))),
        index=FEATURES) if hasattr(m50_r, "feature_importances_") else None
    if imp is None:
        from sklearn.inspection import permutation_importance
        sub = rng.choice(te_r, min(6000, len(te_r)), replace=False)
        pi = permutation_importance(m50_r, X.iloc[sub], y[sub], n_repeats=3,
                                    random_state=args.seed)
        imp = pd.Series(pi.importances_mean, index=FEATURES)
    print("\nfeatures mais influentes:")
    print(imp.sort_values(ascending=False).head(10).round(4).to_string())

    joblib.dump({
        "modelos": modelos, "features": FEATURES, "alvo": args.alvo,
        "quantis": QUANTIS, "categorias": list(X["especie"].cat.categories),
        "metricas": {"r2_aleatorio": r2_rand, "mae_aleatorio": mae_rand,
                     "r2_locais_novos": r2_geo, "mae_locais_novos": mae_geo,
                     "cobertura_q10_q90": cob},
        "treinado_em": time.strftime("%Y-%m-%d %H:%M"),
        "n_linhas": int(len(d)), "fonte": os.path.basename(args.treinar),
        "aviso": ("Treinado em dados SINTETICOS calibrados por literatura. "
                  "Nao validado contra medicoes de campo."),
    }, args.saida_modelo, compress=3)
    print(f"\nOK -> {args.saida_modelo} ({time.time()-t0:.0f}s)")


def prever(args):
    if not os.path.exists(args.modelo):
        sys.exit(f"'{args.modelo}' nao existe. Treine antes com --treinar.")
    pk = joblib.load(args.modelo)
    if args.csv:
        d = pd.read_csv(args.csv)
    else:
        d = pd.DataFrame([{
            "especie": args.especie, "dias_periodo": args.dias,
            "altura_inicial_cm": args.altura_inicial,
            "dias_desde_rocada_inicio": args.dias_desde_rocada,
            "temperatura_media_c": args.temp, "temperatura_min_c": args.tmin,
            "temperatura_max_c": args.tmax,
            "graus_dia_acumulados": max(args.temp - 15., 0.) * args.dias,
            "umidade_media_pct": args.umidade,
            "precipitacao_total_mm": args.chuva,
            "dias_com_chuva": args.dias_chuva, "et0_medio_mm_dia": args.et0,
            "radiacao_media_mj_m2": args.radiacao,
            "agua_solo_media_pct": args.agua_solo,
            "capacidade_agua_solo_mm": args.cap_solo,
            "fertilidade_solo": args.fertilidade, "latitude": args.latitude,
            "geadas_no_periodo": args.geadas, "dias_encharcado": 0,
            "dias_floracao": 0}])
    for c in pk["features"]:
        if c not in d.columns:
            sys.exit(f"Falta a coluna '{c}' no CSV de cenarios.")
    X = d[pk["features"]].copy()
    X["especie"] = pd.Categorical(X["especie"], categories=pk["categorias"])
    out = d.copy()
    # modelos de quantil sao independentes e podem se cruzar; ordenar linha a
    # linha garante q10 <= q50 <= q90 em qualquer cenario.
    Q = np.sort(np.column_stack(
        [pk["modelos"][q].predict(X) for q in sorted(pk["quantis"])]), axis=1)
    for i, q in enumerate(sorted(pk["quantis"])):
        out[f"q{int(q*100)}"] = np.round(Q[:, i], 2)
    if "media" in pk.get("modelos", {}):
        out["media"] = np.round(pk["modelos"]["media"].predict(X), 2)
    out["altura_final_q50"] = np.round(out.altura_inicial_cm + out.q50, 2)

    m = pk["metricas"]
    print(f"modelo treinado em {pk['treinado_em']} | {pk['n_linhas']:,} linhas"
          .replace(",", "."))
    print(f"R2 em locais nunca vistos: {m['r2_locais_novos']:.3f} | "
          f"MAE {m['mae_locais_novos']:.2f} cm\n")
    for _, r in out.iterrows():
        print(f"{r.especie}: {r.altura_inicial_cm:.1f} cm + {r.dias_periodo:.0f} dias")
        print(f"  crescimento provavel : {r.q50:+.2f} cm")
        print(f"  intervalo 80%        : {r.q10:+.2f} a {r.q90:+.2f} cm")
        print(f"  altura final estimada: {r.altura_final_q50:.1f} cm "
              f"({r.altura_inicial_cm + r.q10:.1f} a "
              f"{r.altura_inicial_cm + r.q90:.1f})")
    if args.csv:
        s = args.csv.replace(".csv", "_previsto.csv")
        out.to_csv(s, index=False); print(f"\n-> {s}")
    print(f"\n{pk['aviso']}")


def main():
    ap = argparse.ArgumentParser(description="Treina/usa o modelo de crescimento de gramineas.")
    ap.add_argument("--treinar", metavar="CSV")
    ap.add_argument("--prever", action="store_true")
    ap.add_argument("--csv", help="CSV de cenarios para prever em lote")
    ap.add_argument("--modelo", default=MODELO)
    ap.add_argument("--saida-modelo", default=MODELO)
    ap.add_argument("--alvo", default="crescimento_total_cm",
                    choices=["crescimento_total_cm", "crescimento_fisiologico_cm"])
    ap.add_argument("--max-linhas", type=int, default=1_200_000)
    ap.add_argument("--iteracoes", type=int, default=400)
    ap.add_argument("--seed", type=int, default=42)
    for n, t, dflt in [("especie",str,"braquiaria"),("altura-inicial",float,10.),
        ("dias",int,7),("dias-desde-rocada",float,30.),("temp",float,24.),
        ("tmin",float,16.),("tmax",float,31.),("umidade",float,70.),
        ("chuva",float,20.),("dias-chuva",int,2),("et0",float,3.5),
        ("radiacao",float,18.),("agua-solo",float,55.),("cap-solo",float,70.),
        ("fertilidade",float,0.35),("latitude",float,-22.),("geadas",int,0)]:
        ap.add_argument(f"--{n}", type=t, default=dflt)
    a = ap.parse_args()
    a.dias_chuva = getattr(a, "dias_chuva")
    if a.treinar: treinar(a)
    elif a.prever: prever(a)
    else: ap.print_help()


if __name__ == "__main__":
    main()
