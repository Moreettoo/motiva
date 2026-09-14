"""Testes-chave do satelite contra a verdade de campo (spec 10).

    .venv/bin/python -m pesquisa.ndvi.analisar_ndvi [--gravar]

(1) Separacao: nos segmentos em classe 3, o NDVI e maior que nos em classe 1? (Mann-Whitney, AUC)
(2) Corte: o NDVI caiu mais, de 13 para 20/03, nos segmentos com rocada inferida? (Mann-Whitney)
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime
from statistics import median

from scipy.stats import mannwhitneyu

from pesquisa.rodoanel import DERIVADOS, DOCS_PESQUISA, banco, relatorio
from pesquisa.rodoanel.planilha import CODIGOS_EM_ESCOPO


def classe_por_segmento(observacoes: list[dict], data: str) -> dict[int, int]:
    saida: dict[int, int] = {}
    for o in observacoes:
        if o["data"] != data or o["faixa"] not in CODIGOS_EM_ESCOPO or o["classe"] in ("", None):
            continue
        m, c = int(o["km_marco_m"]), int(o["classe"])
        saida[m] = max(saida.get(m, 0), c)
    return saida


def rocados_por_segmento(pares: list[dict]) -> set[int]:
    return {int(p["km_marco_m"]) for p in pares if p["transicao"] == "rocado"}


def separacao(ndvi_por_seg: dict[int, float], classes: dict[int, int]) -> dict:
    c1 = [v for m, v in ndvi_por_seg.items() if classes.get(m) == 1 and v is not None]
    c3 = [v for m, v in ndvi_por_seg.items() if classes.get(m) == 3 and v is not None]
    saida = {"n_classe1": len(c1), "n_classe3": len(c3),
             "ndvi_mediana_c1": median(c1) if c1 else None, "ndvi_mediana_c3": median(c3) if c3 else None,
             "auc": None, "p_valor": None}
    if c1 and c3:
        u = mannwhitneyu(c3, c1, alternative="two-sided")
        saida["auc"] = float(u.statistic) / (len(c1) * len(c3))
        saida["p_valor"] = float(u.pvalue)
    return saida


def delta(ndvi_a: dict[int, float], ndvi_b: dict[int, float], rocados: set[int]) -> dict:
    d = {m: ndvi_b[m] - ndvi_a[m] for m in ndvi_a if m in ndvi_b and ndvi_a[m] is not None and ndvi_b[m] is not None}
    roc = [v for m, v in d.items() if m in rocados]
    nao = [v for m, v in d.items() if m not in rocados]
    saida = {"n_rocados": len(roc), "n_nao_rocados": len(nao),
             "delta_rocados": median(roc) if roc else None, "delta_nao_rocados": median(nao) if nao else None, "p_valor_delta": None}
    if roc and nao:
        saida["p_valor_delta"] = float(mannwhitneyu(roc, nao, alternative="two-sided").pvalue)
    return saida


def _ndvi_por_alvo(linhas: list[dict]) -> dict[str, dict[int, float]]:
    saida: dict[str, dict[int, float]] = {}
    for l in linhas:
        v = l["ndvi_mediana"]
        saida.setdefault(l["data_alvo"], {})[int(l["km_marco_m"])] = float(v) if v not in ("", None) else None
    return saida


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gravar", action="store_true", help="grava em ia.ndvi_observacoes e ia.ndvi_analises")
    a = ap.parse_args(argv)

    linhas = banco.ler_csv(DERIVADOS / "ndvi_datas.csv")
    obs = banco.ler_csv(DERIVADOS / "observacoes.csv")
    pares = banco.ler_csv(DERIVADOS / "pares.csv")
    por_alvo = _ndvi_por_alvo(linhas)
    meta = {l["data_alvo"]: l for l in linhas}
    rocados = rocados_por_segmento(pares)

    analises = []
    for alvo in ("2026-03-13", "2026-03-20", "2025-03-28"):
        if alvo not in por_alvo:
            analises.append({"data_alvo": alvo, "sem_imagem": True})
            continue
        classes = classe_por_segmento(obs, alvo if alvo.startswith("2026") else "2026-03-13")
        r = {"data_alvo": alvo, "data_imagem": meta[alvo]["data_imagem"], "defasagem_dias": int(meta[alvo]["defasagem_dias"]),
             "nuvem_pct_media": (lambda xs: sum(xs) / len(xs) if xs else None)(
                 [float(l["nuvem_pct"]) for l in linhas if l["data_alvo"] == alvo and l["nuvem_pct"] not in ("", None)]),
             **separacao(por_alvo[alvo], classes)}
        if alvo == "2026-03-20" and "2026-03-13" in por_alvo:
            r.update(delta(por_alvo["2026-03-13"], por_alvo["2026-03-20"], rocados))
        analises.append(r)

    saida = {"gerado_em": datetime.now(relatorio.FUSO_BR).strftime("%d/%m/%Y %H:%M"), "commit": relatorio._commit(),
             "analises": analises, "n_segmentos_rocados": len(rocados)}
    (DERIVADOS / "ndvi_analise.json").write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")
    relatorio.escrever(DOCS_PESQUISA / "03-ndvi.md", relatorio.ndvi(saida))
    for r in analises:
        print(r)

    if a.gravar:
        from pesquisa.rodoanel import supabase_io
        sb = supabase_io.cliente()
        ids = supabase_io.ids_por_marco(sb)
        supabase_io.upsert_ndvi(sb, [{"trecho_id": ids[int(l["km_marco_m"])], "data_imagem": l["data_imagem"],
                                      "data_alvo": l["data_alvo"], "defasagem_dias": int(l["defasagem_dias"]),
                                      **{k: (float(l[k]) if l[k] not in ("", None) else None) for k in ("ndvi_medio", "ndvi_mediana", "ndvi_p10", "ndvi_p90", "nuvem_pct")},
                                      "n_pixels": int(l["n_pixels"] or 0)} for l in linhas])
        for r in analises:
            if r.get("sem_imagem"):
                supabase_io.inserir_ndvi_analise(sb, {"data_alvo": r["data_alvo"], "observacoes": "sem imagem utilizavel em +-7 dias", "parametros": {}})
                continue
            supabase_io.inserir_ndvi_analise(sb, {k: r.get(k) for k in (
                "data_alvo", "data_imagem", "defasagem_dias", "nuvem_pct_media", "n_classe1", "n_classe3", "ndvi_mediana_c1",
                "ndvi_mediana_c3", "auc", "p_valor", "n_rocados", "n_nao_rocados", "delta_rocados", "delta_nao_rocados", "p_valor_delta")}
                | {"parametros": {"mascara": "poligonos_kml", "colecao": "COPERNICUS/S2_SR_HARMONIZED", "commit": saida["commit"]}})
        print("gravado em ia.ndvi_observacoes e ia.ndvi_analises")


if __name__ == "__main__":
    main()
