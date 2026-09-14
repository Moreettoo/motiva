"""Fase 1: confronta o modelo com os pares sem rocada, calibra e escreve 02-validacao.md.

    .venv/bin/python -m pesquisa.validar
"""
from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime

import numpy as np

from pesquisa.rodoanel import (ARQ_MARCOS, DERIVADOS, DOCS_PESQUISA, banco, clima_janela, marcos, relatorio,
                               solo_km, validacao)
from pesquisa.rodoanel.planilha import CODIGOS_EM_ESCOPO
from pesquisa.rodoanel.segmentos import Par, Segmento
from pesquisa.rodoanel.validacao import Parametros

ESPECIES = ("braquiaria", "batatais", "esmeralda")
PONTOS_C3 = (35.0, 40.0, 50.0)
DIAS_ROCADA = (30.0, 60.0, 200.0)


def _sensibilidade_solo(linhas: list, Q: np.ndarray, solo: dict[int, dict]) -> dict:
    """O que os marcos com solo ASSUMIDO (a premissa do Tarefa 8, quando o
    SoilGrids nao respondeu) fazem no resultado: quantos sao -- dos 60 marcos
    e dos pares desta validacao -- e como fica a metrica (sem calibracao)
    excluindo-os. A fertilidade da premissa e comparada com a faixa
    REALMENTE medida para que o relatorio nao afirme um numero sem o
    calculo por tras (regra do projeto).
    """
    premissa = {km for km, v in solo.items() if v["fonte"] == "premissa"}
    mask = np.array([l.km_m in premissa for l in linhas])
    medida = [l for l, m in zip(linhas, mask) if not m]
    Q_medida = Q[~mask] if len(linhas) else Q
    fert_medida = [v["fertilidade"] for km, v in solo.items() if km not in premissa]
    cap_medida = [v["capacidade_mm"] for km, v in solo.items() if km not in premissa]
    fert_premissa = sorted({round(v["fertilidade"], 3) for km, v in solo.items() if km in premissa})
    cap_premissa = sorted({round(v["capacidade_mm"], 3) for km, v in solo.items() if km in premissa})
    r_medida = validacao.avaliar(medida, Q_medida, 1.0)
    r_medida.pop("por_par")
    return {
        "n_marcos_premissa": len(premissa), "n_marcos_total": len(solo),
        "n_pares_premissa": int(mask.sum()), "n_pares_total": len(linhas),
        "fertilidade_premissa": fert_premissa, "fertilidade_medida_min": min(fert_medida),
        "fertilidade_medida_max": max(fert_medida), "capacidade_premissa": cap_premissa,
        "capacidade_medida_min": min(cap_medida), "capacidade_medida_max": max(cap_medida),
        "sem_premissa": r_medida,
    }


def _segmentos() -> dict[int, Segmento]:
    saida = {}
    for r in banco.ler_csv(DERIVADOS / "segmentos.csv"):
        saida[int(r["km_marco_m"])] = Segmento(int(r["km_marco_m"]), float(r["km_inicio"]), float(r["km_fim"]),
                                               float(r["latitude"]), float(r["longitude"]),
                                               r["metodo_rocada"] or None, float(r["area_rocada_m2"]))
    return saida


def _pares() -> list[Par]:
    return [Par(int(r["km_marco_m"]), r["faixa"], int(r["classe_d1"]), int(r["classe_d2"]))
            for r in banco.ler_csv(DERIVADOS / "pares.csv")]


def main() -> None:
    eixo = marcos.carregar(ARQ_MARCOS)
    segs, pares = _segmentos(), _pares()
    series = clima_janela.carregar_todas(eixo)
    solo = solo_km.carregar_ou_buscar(eixo)
    preditor = validacao.preditor_modelo()
    padrao = Parametros()

    def linhas_e_Q(p: Parametros):
        linhas = validacao.montar_linhas(pares, segs, series, clima_janela.zona_de, solo, p, clima_janela.JANELA_DE)
        return linhas, validacao.prever(linhas, preditor)

    linhas, Q = linhas_e_Q(padrao)
    resultado = validacao.rodar(linhas, Q)

    sensibilidade = []
    for esp in ESPECIES:
        for c3 in PONTOS_C3:
            for roc in DIAS_ROCADA:
                p = Parametros(esp, c3, roc)
                l2, Q2 = linhas_e_Q(p)
                r = validacao.avaliar(l2, Q2, 1.0)
                r.pop("por_par")
                sensibilidade.append({"rotulo": p.rotulo(), "parametros": asdict(p), **r})

    saida = {
        "gerado_em": datetime.now(relatorio.FUSO_BR).strftime("%d/%m/%Y %H:%M"),
        "commit": relatorio._commit(),
        "janela": {"de": clima_janela.JANELA_DE.isoformat(), "ate": clima_janela.JANELA_ATE.isoformat()},
        "parametros": asdict(padrao),
        "resultado": resultado,
        "sensibilidade": sensibilidade,
        "solo_premissa": _sensibilidade_solo(linhas, Q, solo),
        "fila_retrospectiva": validacao.fila_retrospectiva(linhas, Q, resultado["fator_vigente"], CODIGOS_EM_ESCOPO),
        "pares": resultado["final"]["por_par"],
    }
    (DERIVADOS / "validacao.json").write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")
    con = banco.abrir()
    con.execute("insert or replace into validacoes (chave, json) values ('vigente', ?)", (json.dumps(saida, ensure_ascii=False),))
    con.commit()
    relatorio.escrever(DOCS_PESQUISA / "02-validacao.md", relatorio.validacao(saida))

    b, f = resultado["sem_calibracao"], resultado["final"]
    print(f"n={b['n']} · base acuracia={resultado['linha_de_base']['acuracia']:.3f}")
    print(f"sem calibracao: acuracia={b['acuracia']:.3f} transicoes={b['transicoes_detectadas']}/{b['transicoes_total']} "
          f"alarmes={b['alarmes_falsos']}/{b['estaveis_total']} J={b['J']:.3f}")
    print(f"vigente fator={resultado['fator_vigente']:.2f}: acuracia={f['acuracia']:.3f} transicoes={f['transicoes_detectadas']}/{f['transicoes_total']} "
          f"alarmes={f['alarmes_falsos']}/{f['estaveis_total']} J={f['J']:.3f}")
    print(f"-> {DERIVADOS / 'validacao.json'} e {DOCS_PESQUISA / '02-validacao.md'}")


if __name__ == "__main__":
    main()
