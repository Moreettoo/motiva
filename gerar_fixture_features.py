"""
Gera o fixture que prova que o Python e o TypeScript montam o MESMO vetor.

O teste de paridade das arvores (`arvores.test.ts`) cobre o PERCURSO: dado um
vetor de 20 numeros, o TypeScript devolve o que o scikit-learn devolveria. Ele
nao cobre a MONTAGEM -- e a montagem tem duas implementacoes independentes,
`clima.montar_features` (Python, roda no lote que grava no banco) e
`montarFeatures` (TypeScript, roda no simulador).

Duas implementacoes da mesma conta divergem. E o modo de falha e o de sempre:
nada quebra, os dois numeros ficam plausiveis, e o simulador passa a responder
diferente do lote para o mesmo trecho. Como a discordancia seria de graus-dia ou
de agua no solo, ninguem repara olhando.

Este script serializa uma serie de clima SINTETICA (sem rede, para o teste ser
deterministico) e o vetor que o Python monta a partir dela, em varios cenarios.
`paridade-python.test.ts` refaz a montagem em TypeScript e compara campo a campo.

    python gerar_fixture_features.py
"""

import json
from datetime import date, timedelta
from pathlib import Path

import clima

DESTINO = Path("web/src/lib/modelo/fixture-features.json")

INICIO = date(2026, 6, 1)          # 60 dias de aquecimento + janela
AQUECIMENTO = 60
TOTAL = 60 + 130


def serie_sintetica() -> clima.Serie:
    """Clima que varia de verdade: sem variacao, metade das features seria
    constante e o teste passaria sem provar nada."""
    dias = []
    for i in range(TOTAL):
        d = INICIO + timedelta(days=i)
        # Ondas de periodos diferentes para nenhuma feature ficar acoplada a outra.
        onda = (i % 17) / 17.0
        estacao = (i % 91) / 91.0
        dias.append(clima.Dia(
            data=d,
            tmed=round(12.0 + 16.0 * estacao + 4.0 * onda, 1),
            tmin=round(2.0 + 12.0 * estacao + 3.0 * onda, 1),
            tmax=round(19.0 + 16.0 * estacao + 5.0 * onda, 1),
            umidade=round(45.0 + 45.0 * onda, 1),
            # Chuva concentrada: dias secos, dias de 0,4 mm (abaixo do limiar de
            # `dias_com_chuva`) e dias de temporal, para o balde encher e secar.
            chuva=round(0.0 if i % 5 == 0 else (0.4 if i % 5 == 1 else 9.0 * onda + 6.0), 1),
            radiacao=round(6.0 + 18.0 * estacao, 1),
            et0=round(1.2 + 4.5 * estacao, 2),
            fonte="previsao",
        ))
    return clima.Serie(dias, AQUECIMENTO, "historico", 2025, None)


CENARIOS = [
    dict(especie="braquiaria", altura_cm=12.0, dias_desde_rocada=40.0,
         latitude=-22.53, dias_periodo=45, fertilidade=0.35, capacidade_mm=60.0),
    dict(especie="esmeralda", altura_cm=5.0, dias_desde_rocada=0.0,
         latitude=-25.43, dias_periodo=1, fertilidade=0.05, capacidade_mm=35.0),
    dict(especie="batatais", altura_cm=31.7, dias_desde_rocada=203.0,
         latitude=-16.68, dias_periodo=120, fertilidade=0.92, capacidade_mm=118.0),
    dict(especie="braquiaria", altura_cm=48.0, dias_desde_rocada=7.0,
         latitude=-19.92, dias_periodo=7, fertilidade=0.61, capacidade_mm=95.0),
    # Altura alta muda o Kc do balde e a floracao; periodo longo atravessa a
    # virada da estacao, que e onde `dias_floracao` e `graus_dia` se separam.
    dict(especie="batatais", altura_cm=22.0, dias_desde_rocada=15.0,
         latitude=-21.18, dias_periodo=90, fertilidade=0.35, capacidade_mm=60.0),
]


def main():
    serie = serie_sintetica()
    inicio = INICIO + timedelta(days=AQUECIMENTO)

    casos = []
    for c in CENARIOS:
        fracoes, ench = clima.balanco_solo(serie.dias, c["capacidade_mm"], c["altura_cm"])
        v = clima.montar_features(serie=serie, inicio=inicio, fracoes=fracoes,
                                  encharcado=ench, **c)
        casos.append({"pedido": c, "features": v,
                      "agua_solo_no_inicio_pct": round(fracoes[AQUECIMENTO] * 100, 4)})

    fixture = {
        "gerado_por": "gerar_fixture_features.py",
        "aquecimento": AQUECIMENTO,
        "inicio": inicio.isoformat(),
        "serie": [{"data": d.data.isoformat(), "tmed": d.tmed, "tmin": d.tmin,
                   "tmax": d.tmax, "umidade": d.umidade, "chuva": d.chuva,
                   "radiacao": d.radiacao, "et0": d.et0} for d in serie.dias],
        "casos": casos,
    }

    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.write_text(json.dumps(fixture, separators=(",", ":")), encoding="utf-8")
    print(f"  {DESTINO}  {DESTINO.stat().st_size/1024:.0f} KB")
    print(f"{len(CENARIOS)} cenarios, serie de {TOTAL} dias ({AQUECIMENTO} de aquecimento).")


if __name__ == "__main__":
    main()
