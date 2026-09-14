"""Fase 0: le os brutos, consolida, grava CSV + SQLite e escreve 01-consolidacao.md.

    .venv/bin/python -m pesquisa.consolidar
"""
from __future__ import annotations

import json

from pesquisa.rodoanel import (ARQ_LEV_1, ARQ_LEV_2, ARQ_MARCOS, ARQ_POLIGONOS, DERIVADOS, DOCS_PESQUISA,
                               banco, marcos, planilha, poligonos, relatorio, segmentos)


def main() -> None:
    lev1, lev2 = planilha.ler(ARQ_LEV_1), planilha.ler(ARQ_LEV_2)
    eixo = marcos.carregar(ARQ_MARCOS)
    pols = poligonos.ler_poligonos(ARQ_POLIGONOS)
    atrib = poligonos.atribuir(pols, eixo)
    resumo = poligonos.resumo_por_marco(pols, atrib)
    segs = segmentos.montar_segmentos(eixo, resumo)
    pares = segmentos.montar_pares(lev1, lev2)
    matriz = segmentos.matriz_transicao(pares)

    l_seg = [{"km_marco_m": s.km_marco_m, "km_inicio": s.km_inicio, "km_fim": s.km_fim, "latitude": s.latitude,
              "longitude": s.longitude, "metodo_rocada": s.metodo_rocada, "area_rocada_m2": s.area_rocada_m2,
              "areas_por_metodo": json.dumps(s.areas_por_metodo, ensure_ascii=False)} for s in segs]
    l_faixas = [{"codigo": c, "nome": n, "linha_planilha": l, "lado": lado, "em_escopo": int(e), "ordem": i + 1}
                for i, (l, n, c, lado, e) in enumerate(planilha.FAIXAS)]
    l_obs = [{"data": lev.data.isoformat(), "km_marco_m": o.km_m, "faixa": o.faixa, "classe": o.classe, "arquivo": lev.arquivo}
             for lev in (lev1, lev2) for o in lev.observacoes]
    l_pares = [{"km_marco_m": p.km_m, "faixa": p.faixa, "classe_d1": p.classe_d1, "classe_d2": p.classe_d2, "transicao": p.transicao}
               for p in pares]
    brutos = marcos.ler_marcos(ARQ_MARCOS)
    l_marcos = [{"ordem": k, "indice_original": i, "latitude": brutos[i][0], "longitude": brutos[i][1], "chainage_m": round(eixo.chainage[k], 1)}
                for k, i in enumerate(marcos.ORDEM_CORRIGIDA)]
    l_pols = [{"indice": p.indice, "metodo": p.metodo, "km_descricao": p.km_descricao, "km_marco_m": atrib[p.indice][0],
               "distancia_eixo_m": round(atrib[p.indice][1], 1), "area_m2": p.area_m2, "latitude": p.latitude, "longitude": p.longitude}
              for p in pols]

    for nome, linhas in (("segmentos", l_seg), ("faixas", l_faixas), ("observacoes", l_obs), ("pares", l_pares),
                         ("marcos_ordenados", l_marcos), ("poligonos", l_pols)):
        banco.gravar_csv(DERIVADOS / f"{nome}.csv", linhas)
    con = banco.abrir()
    for nome, linhas in (("segmentos", l_seg), ("faixas", l_faixas), ("observacoes", l_obs), ("pares", l_pares)):
        banco.substituir(con, nome, linhas)

    relatorio.escrever(DOCS_PESQUISA / "01-consolidacao.md", relatorio.consolidacao(
        lev1=lev1, lev2=lev2, eixo=eixo, segmentos=segs, pares=pares, matriz=matriz, poligonos=pols, atribuicao=atrib))
    print(f"{len(segs)} segmentos · {len(pares)} pares · matriz {dict(sorted(matriz.items()))}")
    print(f"-> {DERIVADOS} e {DOCS_PESQUISA / '01-consolidacao.md'}")


if __name__ == "__main__":
    main()
