"""Confronto do modelo com os pares do levantamento: metricas, calibracao, fila retrospectiva.

Definicoes na spec 7.3. Nada aqui chama rede: clima e solo chegam prontos, e o
preditor e injetado (o `.pkl` de producao em `preditor_modelo()`, um dublê nos
testes).
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date

import numpy as np

import clima  # ml/

from .planilha import PONTO_MEDIO_CM
from .segmentos import Par, Segmento

LIMITE_1_2 = 10.0
LIMITE_2_3 = 30.0
FAIXA_CLASSE = {1: (0.0, 10.0), 2: (10.0, 30.0), 3: (30.0, 300.0)}
GRADE_FATOR = tuple(round(0.25 + 0.05 * i, 2) for i in range(76))    # 0,25 .. 4,00


def classe_de(altura_cm: float) -> int:
    if altura_cm < LIMITE_1_2:
        return 1
    if altura_cm <= LIMITE_2_3:
        return 2
    return 3


@dataclass(frozen=True)
class Parametros:
    especie: str = "braquiaria"
    ponto_medio_c3_cm: float = 40.0
    dias_desde_rocada: float = 200.0
    dias_periodo: int = 7

    def ponto_medio(self, classe: int) -> float:
        return float(self.ponto_medio_c3_cm) if classe == 3 else PONTO_MEDIO_CM[classe]

    def rotulo(self) -> str:
        return f"{self.especie} · c3={self.ponto_medio_c3_cm:g} cm · roçada há {self.dias_desde_rocada:g} d"


@dataclass(frozen=True)
class Linha:
    km_m: int
    faixa: str
    classe_inicial: int
    classe_final: int
    altura_inicial_cm: float
    features: dict


def montar_linhas(pares: list[Par], segmentos_por_marco: dict[int, Segmento], series_por_zona: dict,
                  zona_de, solo_por_marco: dict[int, dict], p: Parametros, inicio: date) -> list[Linha]:
    linhas = []
    for par in pares:
        if par.transicao == "rocado":
            continue
        seg = segmentos_por_marco[par.km_m]
        serie = series_por_zona[zona_de(par.km_m)]
        terra = solo_por_marco[par.km_m]
        h0 = p.ponto_medio(par.classe_d1)
        fr, en = clima.balanco_solo(serie.dias, terra["capacidade_mm"], h0)
        feats = clima.montar_features(
            especie=p.especie, altura_cm=h0, dias_desde_rocada=p.dias_desde_rocada, latitude=seg.latitude,
            serie=serie, inicio=inicio, dias_periodo=p.dias_periodo,
            fertilidade=terra["fertilidade"], capacidade_mm=terra["capacidade_mm"], fracoes=fr, encharcado=en)
        linhas.append(Linha(par.km_m, par.faixa, par.classe_d1, par.classe_d2, h0, feats))
    return linhas


def preditor_modelo():
    import modelo  # ml/: carrega o .pkl na importacao
    return lambda feats: modelo.prever(feats)


def prever(linhas: list[Linha], preditor) -> np.ndarray:
    if not linhas:
        return np.empty((0, 3))
    return np.asarray(preditor([l.features for l in linhas]), dtype=float).reshape(len(linhas), 3)


def avaliar(linhas: list[Linha], Q: np.ndarray, fator: float = 1.0) -> dict:
    n = len(linhas)
    ini = np.array([l.altura_inicial_cm for l in linhas], dtype=float)
    c1 = np.array([l.classe_inicial for l in linhas])
    c2 = np.array([l.classe_final for l in linhas])
    lo, med, hi = (ini + Q[:, i] * fator for i in range(3))
    cp = np.array([classe_de(h) for h in med])
    banda = np.array([FAIXA_CLASSE[c][0] <= h_hi and h_lo <= FAIXA_CLASSE[c][1] for c, h_lo, h_hi in zip(c2, lo, hi)])
    cresceu, estavel = c2 > c1, c2 == c1
    detectadas = int((cp[cresceu] > c1[cresceu]).sum())
    alarmes = int((cp[estavel] > c1[estavel]).sum())
    J = detectadas / max(int(cresceu.sum()), 1) - alarmes / max(int(estavel.sum()), 1)
    matriz = {str(a): {str(b): int(((c2 == a) & (cp == b)).sum()) for b in (1, 2, 3)} for a in (1, 2, 3)}
    por_par = [{"km_marco_m": l.km_m, "faixa": l.faixa, "classe_inicial": l.classe_inicial,
                "classe_final_observada": l.classe_final, "classe_final_prevista": int(cp[i]),
                "altura_inicial_cm": l.altura_inicial_cm,
                "q10_cm": round(float(Q[i, 0]), 3), "q50_cm": round(float(Q[i, 1]), 3), "q90_cm": round(float(Q[i, 2]), 3)}
               for i, l in enumerate(linhas)]
    return {"n": n, "fator": float(fator), "acuracia": float((cp == c2).mean()) if n else None,
            "mae_ordinal": float(np.abs(cp - c2).mean()) if n else None, "matriz": matriz,
            "transicoes_total": int(cresceu.sum()), "transicoes_detectadas": detectadas,
            "estaveis_total": int(estavel.sum()), "alarmes_falsos": alarmes, "J": float(J),
            "cobertura_banda": float(banda.mean()) if n else None, "por_par": por_par}


def km_par(l: Linha) -> bool:
    return (l.km_m // 500) % 2 == 0


def calibrar(linhas: list[Linha], Q: np.ndarray, mascara=None) -> tuple[float, float]:
    idx = np.arange(len(linhas)) if mascara is None else np.flatnonzero(np.asarray(mascara))
    sub = [linhas[i] for i in idx]
    melhor_k, melhor_J = 1.0, -np.inf
    for k in GRADE_FATOR:
        J = avaliar(sub, Q[idx], k)["J"]
        if J > melhor_J + 1e-12 or (abs(J - melhor_J) <= 1e-12 and abs(k - 1.0) < abs(melhor_k - 1.0)):
            melhor_k, melhor_J = float(k), float(J)
    return melhor_k, melhor_J


def rodar(linhas: list[Linha], Q: np.ndarray) -> dict:
    base = avaliar(linhas, Q, 1.0)
    m_par = np.array([km_par(l) for l in linhas])
    k_aj, J_aj = calibrar(linhas, Q, m_par)
    impares = [l for l, m in zip(linhas, m_par) if not m]
    Q_imp = Q[~m_par]
    k_todos, J_todos = calibrar(linhas, Q)
    final = avaliar(linhas, Q, k_todos)
    vigente = k_todos if final["J"] > base["J"] + 1e-12 else 1.0
    return {
        "sem_calibracao": base,
        "ajuste_km_pares": {"fator": k_aj, "J": J_aj, "n": int(m_par.sum())},
        "teste_km_impares": {"n": len(impares), "sem": avaliar(impares, Q_imp, 1.0), "com": avaliar(impares, Q_imp, k_aj)},
        "calibracao_todos": {"fator": k_todos, "J": J_todos},
        "final": final if vigente != 1.0 else base,
        "fator_vigente": vigente,
        "linha_de_base": {"acuracia": base["estaveis_total"] / base["n"] if base["n"] else None, "J": 0.0,
                          "descricao": "modelo que responde 'nada muda em 7 dias'"},
    }


def fila_retrospectiva(linhas: list[Linha], Q: np.ndarray, fator: float, em_escopo: frozenset[str]) -> dict:
    """Em 13/03, quais segmentos o sistema marcaria como 'cruza 30 cm em ate 7 dias', e quantos cruzaram."""
    por_seg: dict[int, dict] = {}
    for i, l in enumerate(linhas):
        if l.faixa not in em_escopo:
            continue
        s = por_seg.setdefault(l.km_m, {"ini": 0, "prev": 0, "obs": 0})
        s["ini"] = max(s["ini"], l.classe_inicial)
        s["prev"] = max(s["prev"], classe_de(l.altura_inicial_cm + Q[i, 1] * fator))
        s["obs"] = max(s["obs"], l.classe_final)
    marcados = {k for k, s in por_seg.items() if s["ini"] < 3 and s["prev"] == 3}
    cruzaram = {k for k, s in por_seg.items() if s["ini"] < 3 and s["obs"] == 3}
    return {"segmentos_avaliados": len(por_seg), "marcados": sorted(marcados), "cruzaram": sorted(cruzaram),
            "acertos": sorted(marcados & cruzaram), "n_marcados": len(marcados), "n_cruzaram": len(cruzaram),
            "n_acertos": len(marcados & cruzaram)}
