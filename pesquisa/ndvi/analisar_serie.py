"""Detector de corte na serie NDVI, conferido contra as rocadas inferidas de marco/2026.

    .venv/bin/python -m pesquisa.ndvi.analisar_serie

A Tarefa 14 (tres datas) achou separacao invertida entre classes e NENHUMA diferenca de NDVI
entre segmentos rocados e nao rocados (p = 0,685) -- ver docs/pesquisa/03-ndvi.md. Este modulo
nao parte do pressuposto de que o detector vai achar as rocadas: testa se uma serie mais longa
acha o que tres datas nao acharam. Um recall baixo aqui e um resultado legitimo, nao um bug --
os limiares (QUEDA_MINIMA, MAX_DIAS, MINIMO_ANTES) NAO sao ajustados para fabricar deteccoes.
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, datetime

from pesquisa.rodoanel import DERIVADOS, DOCS_PESQUISA, banco, relatorio
from pesquisa.ndvi.analisar_ndvi import rocados_por_segmento

QUEDA_MINIMA = 0.15
MAX_DIAS = 12
MINIMO_ANTES = 0.45


def detectar_cortes(serie: list[tuple[date, float]], queda: float = QUEDA_MINIMA, max_dias: int = MAX_DIAS,
                    minimo_antes: float = MINIMO_ANTES) -> list[dict]:
    eventos = []
    for (d0, v0), (d1, v1) in zip(serie, serie[1:]):
        if (d1 - d0).days <= max_dias and v0 >= minimo_antes and (v0 - v1) >= queda:
            eventos.append({"de": d0, "ate": d1, "ndvi_antes": v0, "ndvi_depois": v1, "queda": round(v0 - v1, 4)})
    return eventos


def recall_marco_2026(eventos_por_marco: dict[int, list[dict]], rocados: set[int],
                      de: date = date(2026, 3, 6), ate: date = date(2026, 3, 27)) -> dict:
    def tem_evento(m):
        return any(de <= e["ate"] <= ate for e in eventos_por_marco.get(m, []))
    detectados = sum(1 for m in rocados if tem_evento(m))
    falsos = sum(1 for m in eventos_por_marco if m not in rocados and tem_evento(m))
    return {"n_rocados": len(rocados), "detectados": detectados, "recall": detectados / len(rocados) if rocados else None,
            "falsos": falsos}


def main() -> None:
    serie = banco.ler_csv(DERIVADOS / "ndvi_serie.csv")
    por_marco: dict[int, list] = defaultdict(list)
    for l in serie:
        por_marco[int(l["km_marco_m"])].append((date.fromisoformat(l["data_imagem"]), float(l["ndvi_mediana"])))
    eventos = {m: detectar_cortes(sorted(s)) for m, s in por_marco.items()}
    rocados = rocados_por_segmento(banco.ler_csv(DERIVADOS / "pares.csv"))
    conf = recall_marco_2026(eventos, rocados)
    por_ano: dict[int, int] = defaultdict(int)
    for evs in eventos.values():
        for e in evs:
            por_ano[e["ate"].year] += 1
    n_obs = len(serie)
    # Desvio do brief original: `observacoes_por_segmento_ano` dividia por `len(por_ano)`, que e
    # o numero de ANOS COM PELO MENOS UM CORTE DETECTADO (denominador de `eventos_por_ano`), nao
    # o numero de anos cobertos pela SERIE de observacoes. Um ano sem nenhum corte detectado --
    # um resultado legitimo, dado o nulo da Tarefa 14 -- sumiria do denominador e inflaria essa
    # taxa artificialmente. `anos_serie` conta os anos com pelo menos uma OBSERVACAO (nao evento).
    anos_serie = {date.fromisoformat(l["data_imagem"]).year for l in serie}
    saida = {"gerado_em": datetime.now(relatorio.FUSO_BR).strftime("%d/%m/%Y %H:%M"), "commit": relatorio._commit(),
             "n_observacoes": n_obs, "n_segmentos": len(por_marco),
             "observacoes_por_segmento_ano": round(n_obs / max(len(por_marco), 1) / max(len(anos_serie), 1), 1),
             "eventos_total": sum(len(v) for v in eventos.values()), "eventos_por_ano": dict(sorted(por_ano.items())),
             "conferencia_marco_2026": conf,
             "parametros": {"queda_minima": QUEDA_MINIMA, "max_dias": MAX_DIAS, "minimo_antes": MINIMO_ANTES}}
    (DERIVADOS / "ndvi_serie_analise.json").write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")
    banco.gravar_csv(DERIVADOS / "ndvi_eventos.csv", [{"km_marco_m": m, **{k: (v.isoformat() if isinstance(v, date) else v) for k, v in e.items()}}
                                                      for m, evs in sorted(eventos.items()) for e in evs])
    # Numeros na prosa em formato BR (virgula decimal) -- o resto de 03-ndvi.md ja usa esse padrao
    # (relatorio._num/_br, comentario do proprio modulo relatorio.py cita este arquivo como um dos
    # dois que ainda precisavam do fix); interpolar QUEDA_MINIMA/MINIMO_ANTES/observacoes_por_
    # segmento_ano direto no f-string sairia em formato US (ponto decimal), destoando do resto do
    # documento na MESMA secao.
    br = relatorio._br
    recall_txt = "—" if conf["recall"] is None else f"{conf['recall']:.0%}"
    # `p_valor_delta` vem de ndvi_analise.json (saida real da Tarefa 14), nunca digitado: e o
    # mesmo numero citado na secao acima deste documento, gerada por analisar_ndvi.py.
    leitura_recall = ""
    if conf["recall"] is not None and conf["recall"] < 0.5:
        p_delta = None
        caminho_ndvi_analise = DERIVADOS / "ndvi_analise.json"
        if caminho_ndvi_analise.exists():
            analise_tarefa14 = json.loads(caminho_ndvi_analise.read_text(encoding="utf-8"))
            r14 = next((r for r in analise_tarefa14["analises"] if r.get("n_rocados") is not None), None)
            p_delta = r14["p_valor_delta"] if r14 else None
        p_txt = f", p = {br(p_delta, 4)}" if p_delta is not None else ""
        leitura_recall = (f" Recall baixo é consistente com o achado da Tarefa 14 (AUC invertida, teste de corte "
                          f"sem diferença significativa{p_txt}): uma série mais longa não recuperou o que três "
                          f"datas não acharam.")
    texto = (f"\n## Série 2019–{date.today().year} e detector de corte\n\nGerado por `pesquisa/ndvi/analisar_serie.py` em {saida['gerado_em']} (commit {saida['commit']}).\n\n"
             f"{n_obs} observações limpas em {len(por_marco)} segmentos (~{br(saida['observacoes_por_segmento_ano'], 1)} por segmento por ano). "
             f"Detector: queda ≥ {br(QUEDA_MINIMA, 2)} em ≤ {MAX_DIAS} dias partindo de NDVI ≥ {br(MINIMO_ANTES, 2)}.\n\n"
             f"| ano | cortes detectados |\n|---|---|\n" + "\n".join(f"| {a} | {n} |" for a, n in sorted(por_ano.items())) +
             f"\n\nConferência contra as {conf['n_rocados']} roçadas inferidas de 13→20/03/2026: **{conf['detectados']} detectadas** "
             f"(recall {recall_txt}), {conf['falsos']} segmento(s) com queda sem roçada inferida.{leitura_recall}\n")
    with (DOCS_PESQUISA / "03-ndvi.md").open("a", encoding="utf-8") as f:
        f.write(texto)
    print(saida)


if __name__ == "__main__":
    main()
