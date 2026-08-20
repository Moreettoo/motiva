#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Confronta o modelo com as medicoes de campo de `validacao_campo.json`.

POR QUE ISTO EXISTE
-------------------
O proprio `.pkl` carrega o aviso: "Treinado em dados SINTETICOS calibrados por
literatura. Nao validado contra medicoes de campo." Duas versoes do gerador
(v3.1 e v3.2) foram calibradas contra UMA medicao que vivia numa celula de
notebook, como `OBSERVADO = 7.0`. Uma constante numa celula nao tem como
registrar que aquela leitura era de uma touceira so, com o zero da trena fora do
quadro, num pasto -- e sem isso a leitura foi tratada como se fosse altura de
dossel de um trecho de faixa de dominio, e a fisica foi ajustada para alcanca-la.

Este arquivo troca a constante por um registro. Cada observacao declara COMO foi
medida, e o codigo -- nao o comentario -- decide se ela e comparavel com o alvo
do modelo. As nao comparaveis continuam aparecendo, com o motivo; elas so nao
entram no erro agregado.

O QUE E "COMPARAVEL"
--------------------
O alvo do modelo e `crescimento_total_cm`: diferenca de ALTURA DE DOSSEL medida.
Uma leitura de folha estendida sobe na taxa de alongamento foliar (TAlF), que e
varias vezes maior. Uma leitura de uma touceira so mede o micrositio dela, e
micrositio e justamente o fator que o modelo NAO observa. Os requisitos estao em
`protocolo_exigido`, no JSON, e a regra em `comparavel()`, aqui.

USO
---
  python validar_campo.py                  # confronta tudo (rede + modelo)
  python validar_campo.py --autoteste      # so a regra de comparabilidade
  python validar_campo.py --regime pasto   # filtra

O `--autoteste` nao toca em rede nem no `.pkl` de proposito: a regra de
comparabilidade e o miolo deste arquivo e tem que ser conferivel sem depender de
o SoilGrids estar de pe nem de a versao do scikit-learn casar.
"""

import argparse
import json
import os
import sys
from datetime import date, timedelta

ARQUIVO = os.getenv("VALIDACAO_CAMPO", "validacao_campo.json")

#: Grandeza que o alvo do modelo significa. Qualquer outra e outra coisa.
GRANDEZA_DO_ALVO = "dossel"
#: Abaixo disto a leitura mede o micrositio de uma touceira, nao o dossel.
PONTOS_MINIMOS = 5
#: Manta de folha seca de 2-3 cm entra inteira na diferenca entre duas visitas.
BASES_ACEITAS = ("solo",)


# ----------------------------------------------------------------------
# A regra. Pura, sem rede e sem modelo.
# ----------------------------------------------------------------------
def comparavel(obs: dict) -> tuple[bool, list[str]]:
    """(entra no erro agregado?, motivos para nao entrar).

    Nao e filtro de qualidade e nao julga quem mediu: e a pergunta "esta leitura
    e da MESMA grandeza que o modelo preve?". Uma medicao impecavel de folha
    estendida continua sendo incomparavel.
    """
    p = obs.get("protocolo", {})
    motivos = []

    grandeza = p.get("grandeza")
    if grandeza != GRANDEZA_DO_ALVO:
        motivos.append(
            f"grandeza '{grandeza}': o modelo preve altura de DOSSEL. "
            "Folha estendida sobe na TAlF (ate 17,5 mm/dia no marandu) e "
            "'indefinido' nao da para comparar com nada."
        )

    pontos = p.get("pontos")
    if not isinstance(pontos, int) or pontos < PONTOS_MINIMOS:
        motivos.append(
            f"{pontos} ponto(s) de medicao: com menos de {PONTOS_MINIMOS} a "
            "leitura mede o micrositio de uma touceira, que e o fator que o "
            "modelo nao observa."
        )

    base = p.get("base")
    if base not in BASES_ACEITAS:
        motivos.append(
            f"base '{base}': sem o zero apoiado no solo, a serapilheira entra "
            "na diferenca entre as duas visitas."
        )

    return (not motivos), motivos


def avisos(obs: dict) -> list[str]:
    """Ressalvas que NAO desqualificam, mas mudam como ler o numero."""
    p = obs.get("protocolo", {})
    saida = []
    if p.get("mesmo_instrumento") is False:
        saida.append(f"instrumentos diferentes entre as visitas ({p.get('instrumentos', '?')})")
    if p.get("zero_visivel_na_foto") is False:
        saida.append("o zero do instrumento nao aparece na foto: a base nao da para conferir")
    if p.get("chuva_24h_antes_da_ultima_leitura"):
        saida.append("choveu nas 24 h antes da ultima leitura: parte da subida e turgor")
    return saida


def dias_da_janela(obs: dict) -> int:
    """Dias da janela. `ate` e a data da segunda leitura, e o crescimento
    aconteceu nos dias ANTERIORES a ela -- [de, ate) e a mesma convencao do
    caderno de calibracao."""
    d0 = date.fromisoformat(obs["de"])
    d1 = date.fromisoformat(obs["ate"])
    return (d1 - d0).days


def crescimento_observado(obs: dict) -> float:
    return float(obs["altura_final_cm"]) - float(obs["altura_inicial_cm"])


# ----------------------------------------------------------------------
# O confronto. Este lado precisa de rede e do .pkl.
# ----------------------------------------------------------------------
def prever_uma(obs: dict) -> dict:
    """Roda o pipeline de producao na janela da observacao.

    Importa `clima`, `solo` e `modelo` AQUI dentro, e nao no topo, para o
    `--autoteste` rodar sem rede e sem o `.pkl` -- `modelo.py` carrega o pickle
    na importacao e sai com erro quando a versao do scikit-learn nao casa, que e
    proposital e nao pode derrubar a conferencia da regra.
    """
    import clima
    import modelo
    import solo as solo_mod

    d0 = date.fromisoformat(obs["de"])
    dias = dias_da_janela(obs)
    hoje = date.today()

    serie = clima.buscar_serie(obs["latitude"], obs["longitude"], hoje)
    cobre = [d for d in serie.dias if d0 <= d.data < d0 + timedelta(days=dias)]
    if len(cobre) < dias:
        raise RuntimeError(
            f"a serie do Open-Meteo cobre {len(cobre)} dos {dias} dias da janela. "
            f"A API de previsao guarda ~63 dias de passado e a janela comeca em "
            f"{d0} ({(hoje - d0).days} dias atras): para janela mais antiga que "
            f"isso o confronto precisa do arquivo ERA5, que `clima.buscar_serie` "
            f"nao busca."
        )

    terra = solo_mod.buscar(obs["latitude"], obs["longitude"], obs["regime"])
    fracoes, encharcado = clima.balanco_solo(
        serie.dias, terra.capacidade_mm, float(obs["altura_inicial_cm"]))
    linha = clima.montar_features(
        especie=obs["especie"], altura_cm=float(obs["altura_inicial_cm"]),
        dias_desde_rocada=float(obs["dias_desde_rocada_inicio"]),
        latitude=obs["latitude"], serie=serie, inicio=d0, dias_periodo=dias,
        fertilidade=terra.fertilidade, capacidade_mm=terra.capacidade_mm,
        fracoes=fracoes, encharcado=encharcado)

    q10, q50, q90 = modelo.prever([linha])[0]
    return dict(q10=float(q10), q50=float(q50), q90=float(q90),
                solo=terra, dias=dias, features=linha)


# ----------------------------------------------------------------------
# Saida
# ----------------------------------------------------------------------
def num(v: float, casas: int = 2) -> str:
    return f"{v:.{casas}f}".replace(".", ",")


def relatar(obs: dict, previsto: dict | None, erro: str | None) -> dict | None:
    ok, motivos = comparavel(obs)
    dias = dias_da_janela(obs)
    cresc = crescimento_observado(obs)

    print(f"\n{'='*72}")
    print(f"{obs['id']}  |  {obs['especie']}  |  regime {obs['regime']}  |  "
          f"{obs['de']} a {obs['ate']} ({dias} dias)")
    print(f"{'='*72}")
    print(f"  campo    : {obs['altura_inicial_cm']} -> {obs['altura_final_cm']} cm "
          f"= {num(cresc, 1)} cm ({num(cresc/dias)} cm/dia)")

    if previsto:
        s = previsto["solo"]
        dentro = previsto["q10"] <= cresc <= previsto["q90"]
        print(f"  modelo   : q10 {num(previsto['q10'])} | q50 {num(previsto['q50'])} "
              f"| q90 {num(previsto['q90'])} cm")
        print(f"  solo     : fert {num(s.fertilidade)} | cap {num(s.capacidade_mm, 1)} mm "
              f"| {s.fonte}" + (f" a {num(s.distancia_km, 1)} km" if s.distancia_km else "")
              + f" | raiz de {obs['regime']}")
        print(f"  dentro da banda q10-q90? {'SIM' if dentro else 'NAO'}"
              + ("" if dentro else f"  (excede o q90 em {num(cresc - previsto['q90'])} cm)"))
    elif erro:
        print(f"  modelo   : nao foi possivel prever -- {erro}")

    if ok:
        print("  protocolo: comparavel com o alvo do modelo.")
    else:
        print("  protocolo: NAO COMPARAVEL com o alvo do modelo.")
        for m in motivos:
            print(f"             - {m}")
    for a in avisos(obs):
        print(f"  ressalva : {a}")
    for n in obs.get("notas", []):
        print(f"  nota     : {n}")

    if not (ok and previsto):
        return None
    return dict(id=obs["id"], obs=cresc, **{k: previsto[k] for k in ("q10", "q50", "q90")})


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1],
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--arquivo", default=ARQUIVO)
    ap.add_argument("--regime", default=None, help="confronta so este regime")
    ap.add_argument("--autoteste", action="store_true",
                    help="so a regra de comparabilidade: sem rede, sem .pkl")
    a = ap.parse_args()

    try:
        with open(a.arquivo, encoding="utf-8") as f:
            registro = json.load(f)
    except FileNotFoundError:
        print(f"Nao achei {a.arquivo}.")
        return 1

    obs_todas = registro["observacoes"]
    if a.regime:
        obs_todas = [o for o in obs_todas if o["regime"] == a.regime]
    if not obs_todas:
        print("Nenhuma observacao no filtro pedido.")
        return 0

    if a.autoteste:
        return autoteste(obs_todas)

    print(f"{len(obs_todas)} observacao(oes) em {a.arquivo}")
    comparaveis = []
    for obs in obs_todas:
        previsto, erro = None, None
        # So paga rede e modelo pelo que da para comparar: pedir o SoilGrids
        # para uma leitura que nao e da grandeza do alvo produz um numero que
        # nao responde pergunta nenhuma.
        if comparavel(obs)[0]:
            try:
                previsto = prever_uma(obs)
            except Exception as e:
                erro = f"{type(e).__name__}: {e}"
        linha = relatar(obs, previsto, erro)
        if linha:
            comparaveis.append(linha)

    print(f"\n{'='*72}")
    print("AGREGADO")
    print(f"{'='*72}")
    if not comparaveis:
        print(f"  Nenhuma das {len(obs_todas)} observacoes e comparavel com o alvo do")
        print("  modelo, entao nao ha erro agregado a calcular. Isto NAO e o modelo")
        print("  acertando nem errando: e a ausencia de medicao da grandeza que ele")
        print("  preve. O protocolo exigido esta em `protocolo_exigido`, no JSON.")
        return 0

    n = len(comparaveis)
    mae = sum(abs(c["obs"] - c["q50"]) for c in comparaveis) / n
    vies = sum(c["obs"] - c["q50"] for c in comparaveis) / n
    dentro = sum(1 for c in comparaveis if c["q10"] <= c["obs"] <= c["q90"])
    print(f"  {n} observacao(oes) comparavel(eis)")
    print(f"  MAE contra o q50      : {num(mae)} cm")
    print(f"  vies (campo - modelo) : {num(vies)} cm"
          f"   ({'modelo subestima' if vies > 0 else 'modelo superestima'})")
    print(f"  dentro da banda 80%   : {dentro}/{n}"
          + ("   <- esperado ~80%" if n >= 5 else "   (poucas para julgar cobertura)"))
    return 0


def autoteste(obs_todas: list[dict]) -> int:
    """Confere a regra sem rede e sem modelo, com casos construidos a mao."""
    casos = [
        (dict(protocolo=dict(grandeza="dossel", pontos=5, base="solo")), True),
        (dict(protocolo=dict(grandeza="dossel", pontos=20, base="solo")), True),
        (dict(protocolo=dict(grandeza="folha_estendida", pontos=20, base="solo")), False),
        (dict(protocolo=dict(grandeza="dossel", pontos=1, base="solo")), False),
        (dict(protocolo=dict(grandeza="dossel", pontos=5, base="serapilheira")), False),
        (dict(protocolo=dict(grandeza="dossel", pontos=5, base="nao_verificavel")), False),
        (dict(protocolo={}), False),
    ]
    falhas = 0
    for caso, esperado in casos:
        obtido, motivos = comparavel(caso)
        marca = "ok " if obtido == esperado else "FALHOU"
        if obtido != esperado:
            falhas += 1
        print(f"  [{marca}] {caso['protocolo'] or '(protocolo vazio)'} -> "
              f"{'comparavel' if obtido else 'nao comparavel'}"
              + (f" ({len(motivos)} motivo(s))" if motivos else ""))

    print(f"\n  registro atual: {len(obs_todas)} observacao(oes)")
    for obs in obs_todas:
        ok, motivos = comparavel(obs)
        dias = dias_da_janela(obs)
        print(f"    {obs['id']:<16} {obs['regime']:<6} {dias:>3}d  "
              f"{num(crescimento_observado(obs)/dias)} cm/dia  "
              f"{'comparavel' if ok else 'NAO comparavel: ' + motivos[0].split(':')[0]}")

    print(f"\n  {len(casos)-falhas}/{len(casos)} casos da regra passaram.")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
