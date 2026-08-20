"""
Duas features de solo que o modelo pede e o banco nao tem.

O `modelo_gramas.pkl` recebe `fertilidade_solo` (0 a 1) e
`capacidade_agua_solo_mm` (35 a 120). Nenhuma das duas e leitura de campo: no
`gerador_v3_1_rebrota.py` elas sao SORTEADAS por trajetoria --
`fert ~ Beta(2, 3.2) * 1.15` e `cap ~ U(35, 120)`. Quer dizer que o modelo
aprendeu a responder a elas, mas nao existe nenhuma coluna em `ia.trechos` que
as preencha.

Elas nao sao detalhe. Medido no proprio .pkl, braquiaria a 15 cm por 30 dias:

    fertilidade_solo  0,20 -> 0,90   move o q50 de 13,3 para 22,7 cm   (+71%)
    capacidade_mm       35 -> 120    move o q50 de 14,0 para 21,8 cm   (+55%)

Deixar as duas num numero chutado e o mesmo que decidir a agenda no chute. Por
isso aqui elas saem do SoilGrids (ISRIC), que e mapa de solo global de verdade,
gratuito e sem chave, na resolucao de 250 m.

DE ONDE SAI CADA UMA
--------------------
capacidade_agua_solo_mm
    Agua disponivel para a planta = (teta_33kPa - teta_1500kPa) x profundidade
    de raiz. Os dois teores saem da pedotransferencia de Saxton & Rawls (2006)
    aplicada a areia, argila e materia organica dos 0-30 cm. A profundidade de
    raiz efetiva de gramineas e 500 mm (FAO-56 da 0,5 a 1,0 m para pastagem).
    Nada aqui e calibracao minha: e a equacao publicada, com o dado publicado.

fertilidade_solo
    Aqui NAO existe funcao publicada, porque `fertilidade_solo` e uma grandeza
    inventada pelo gerador. O que ela faz la dentro e uma coisa so:
    `f_N = 0.25 + 0.75 * fert`, citando Gastal 1992 -- resposta a NITROGENIO.
    Entao a rampa abaixo le o nitrogenio total do SoilGrids e o estica de
    "solo pobre" a "solo rico" de forma explicita e auditavel. A rampa E uma
    premissa; ela esta escrita numa constante com nome, e nao escondida.

O QUE ISTO NAO E
----------------
O SoilGrids mapeia o solo da PAISAGEM. A faixa de dominio e outra coisa:
decapitada na terraplenagem, compactada, muitas vezes sobre material de
emprestimo. O numero daqui e o do entorno, e tende a superestimar a beira da
estrada. Nao ha fator de correcao aqui de proposito -- inventar um seria trocar
um chute conhecido por outro disfarcado de conta. A tela diz de onde veio.

O SOILGRIDS MASCARA MANCHA URBANA
---------------------------------
E o ponto medio de uma zona de rodovia cai em cidade com frequencia: Campinas,
Curitiba e Resende voltaram 200 com TUDO nulo. Nao e erro de rede -- e o mapa
dizendo "aqui nao ha solo mapeado". Por isso `buscar` sonda a VIZINHANCA antes
de desistir: o ponto exato, depois quatro pontos a ~2 km nas quatro direcoes. O
solo a 2 km da mesma paisagem e estimativa melhor que uma constante global, e o
`Solo` devolvido carrega a distancia para a tela poder dizer de onde veio.

Quando nem a vizinhanca responde, cai na PREMISSA, que e o par do notebook de
calibracao: 0,35 e 60 mm. E os 60 mm nao sao numero redondo por acaso -- a
mediana medida nesta malha deu 59,6 mm, entao a queda e para perto de onde o
dado teria caido.
"""

import math
import os
import time
from typing import NamedTuple

import httpx

API = "https://rest.isric.org/soilgrids/v2.0/properties/query"

# Camadas dos 0-30 cm e a espessura de cada uma, em mm. E a zona de raiz onde a
# textura importa para o balde; abaixo de 30 cm o SoilGrids ja fica mais grosso.
CAMADAS = (("0-5cm", 50.0), ("5-15cm", 100.0), ("15-30cm", 150.0))
PROPRIEDADES = ("clay", "sand", "soc", "nitrogen")

# Profundidade de raiz efetiva de gramineas, em mm (FAO-56: 0,5 a 1,0 m para
# pastagem; a ponta de baixo, porque faixa de dominio e solo raso e compactado).
RAIZ_MM = 500.0

# A faixa que o modelo VIU no treino. Fora dela ele satura, entao o valor sai
# preso aqui em vez de ser entregue cru -- ver `faixas` no modelo.json.
CAP_MIN, CAP_MAX = 35.0, 120.0

# A rampa de nitrogenio -> fertilidade. PREMISSA, nao equacao publicada.
# 0,5 g/kg e topsoil arenoso pobre; 3,5 g/kg e topsoil organico rico. Nesta
# malha o SoilGrids devolveu de 1,53 a 2,50 g/kg, que cai em 0,34 a 0,67 --
# straddling os 0,35 do notebook de calibracao.
N_POBRE_GKG, N_RICO_GKG = 0.5, 3.5
FERT_MIN, FERT_MAX = 0.05, 1.0

# A queda, quando o SoilGrids nao cobre o ponto.
FERTILIDADE_PREMISSA = 0.35
CAPACIDADE_PREMISSA_MM = 60.0

TIMEOUT_S = 60.0
# O SoilGrids limita taxa e devolve 429 em rajada. Quatro tentativas com espera
# dobrando cobrem o caso do lote, que pede uma zona atras da outra: sem isto a
# malha caia na premissa em 4 de 7 zonas so por chegar rapido demais.
TENTATIVAS = 4
PAUSA_S = 3.0
#: Quando verdadeiro, imprime o motivo de cada recusa. Ligado por `SOLO_VERBOSO=1`.
VERBOSO = os.getenv("SOLO_VERBOSO") == "1"


#: Deslocamentos sondados quando o ponto exato esta mascarado. ~0,02 grau e
#: ~2,2 km em latitude e ~2,0 km em longitude nas latitudes desta malha.
VIZINHANCA = ((0.0, 0.0, 0.0), (0.02, 0.0, 2.2), (-0.02, 0.0, 2.2),
              (0.0, 0.02, 2.0), (0.0, -0.02, 2.0))


class Solo(NamedTuple):
    fertilidade: float
    capacidade_mm: float
    #: "soilgrids" ou "premissa". Vai para a tela e para o contexto da LLM: o
    #: painel nunca deve mostrar estimativa e medicao com a mesma cara.
    fonte: str
    #: Nitrogenio total 0-30 cm em g/kg, quando veio do SoilGrids. Serve para
    #: alguem conferir a rampa sem ter que refazer a chamada.
    nitrogenio_g_kg: float | None = None
    #: A que distancia do ponto pedido o mapa respondeu, em km. Zero quando o
    #: proprio ponto tinha dado.
    distancia_km: float = 0.0


PREMISSA = Solo(FERTILIDADE_PREMISSA, CAPACIDADE_PREMISSA_MM, "premissa")


def agua_disponivel(areia_pct: float, argila_pct: float, mo_pct: float) -> float:
    """Agua disponivel para a planta, em fracao volumetrica.

    Saxton & Rawls (2006), "Soil Water Characteristic Estimates by Texture and
    Organic Matter for Hydrologic Solutions", SSSAJ 70:1569-1578, equacoes 1 e
    2. `S`, `C` em fracao (0-1) e `OM` em porcentagem de massa.
    """
    S, C, OM = areia_pct / 100.0, argila_pct / 100.0, mo_pct

    t15 = (-0.024 * S + 0.487 * C + 0.006 * OM + 0.005 * (S * OM)
           - 0.013 * (C * OM) + 0.068 * (S * C) + 0.031)
    murcha = t15 + (0.14 * t15 - 0.02)

    t33 = (-0.251 * S + 0.195 * C + 0.011 * OM + 0.006 * (S * OM)
           - 0.027 * (C * OM) + 0.452 * (S * C) + 0.299)
    campo = t33 + (1.283 * t33 * t33 - 0.374 * t33 - 0.015)

    return max(campo - murcha, 0.0)


def fertilidade_por_nitrogenio(n_g_kg: float) -> float:
    """A rampa. Isolada numa funcao para ser trocavel e testavel de fora."""
    bruto = (n_g_kg - N_POBRE_GKG) / (N_RICO_GKG - N_POBRE_GKG)
    return min(FERT_MAX, max(FERT_MIN, bruto))


def _media_ponderada(camadas: dict[str, float | None]) -> float | None:
    """Media das camadas dos 0-30 cm, pesada pela espessura de cada uma."""
    soma = peso = 0.0
    for nome, espessura in CAMADAS:
        v = camadas.get(nome)
        if v is None:
            continue
        soma += v * espessura
        peso += espessura
    return soma / peso if peso > 0 else None


def _consultar(lat: float, lon: float) -> dict[str, dict[str, float | None]] | None:
    params: list[tuple[str, object]] = [("lon", lon), ("lat", lat), ("value", "mean")]
    for nome, _ in CAMADAS:
        params.append(("depth", nome))
    for p in PROPRIEDADES:
        params.append(("property", p))

    for tentativa in range(TENTATIVAS):
        if tentativa:
            # Dobrando: 3s, 6s, 12s. O 429 do SoilGrids nao passa em 1 segundo.
            time.sleep(PAUSA_S * (2 ** (tentativa - 1)))
        try:
            r = httpx.get(API, params=params, timeout=TIMEOUT_S)
            if r.status_code != 200:
                if VERBOSO:
                    print(f"    [solo] HTTP {r.status_code} em {lat},{lon} "
                          f"(tentativa {tentativa+1}/{TENTATIVAS})")
                continue
            camadas = r.json()["properties"]["layers"]
        except Exception as e:
            if VERBOSO:
                print(f"    [solo] {type(e).__name__} em {lat},{lon} "
                      f"(tentativa {tentativa+1}/{TENTATIVAS})")
            continue

        out: dict[str, dict[str, float | None]] = {}
        for camada in camadas:
            # O SoilGrids devolve inteiros na "mapped unit" e o divisor para
            # chegar na unidade convencional vem no proprio corpo. Ler o divisor
            # da resposta, e nao fixa-lo aqui, e o que impede o erro classico de
            # argila virar 3,4% em vez de 34%.
            divisor = camada["unit_measure"]["d_factor"]
            out[camada["name"]] = {
                d["label"]: (None if d["values"]["mean"] is None
                             else d["values"]["mean"] / divisor)
                for d in camada["depths"]
            }
        if any(v is not None for c in out.values() for v in c.values()):
            return out
        # Resposta 200 com tudo nulo e o ponto FORA do mapa (agua, mancha
        # urbana). Insistir nao muda: cai na premissa de uma vez.
        if VERBOSO:
            print(f"    [solo] SoilGrids nao cobre {lat},{lon}")
        return None
    return None


def buscar(lat: float, lon: float) -> Solo:
    """As duas features para um ponto. Nunca levanta: cai na premissa."""
    for dlat, dlon, distancia in VIZINHANCA:
        s = _ler_ponto(lat + dlat, lon + dlon, distancia)
        if s is not None:
            return s
    return PREMISSA


def _ler_ponto(lat: float, lon: float, distancia: float) -> Solo | None:
    bruto = _consultar(lat, lon)
    if bruto is None:
        return None

    areia = _media_ponderada(bruto.get("sand", {}))
    argila = _media_ponderada(bruto.get("clay", {}))
    carbono = _media_ponderada(bruto.get("soc", {}))       # g/kg
    nitrogenio = _media_ponderada(bruto.get("nitrogen", {}))  # g/kg

    if None in (areia, argila, carbono, nitrogenio):
        return None

    # SOC em g/kg -> % de massa -> materia organica pelo fator de Van Bemmelen.
    materia_organica = (carbono / 10.0) * 1.724
    capacidade = agua_disponivel(areia, argila, materia_organica) * RAIZ_MM

    if not math.isfinite(capacidade) or capacidade <= 0:
        return None

    return Solo(
        fertilidade=fertilidade_por_nitrogenio(nitrogenio),
        capacidade_mm=min(CAP_MAX, max(CAP_MIN, capacidade)),
        fonte="soilgrids",
        nitrogenio_g_kg=nitrogenio,
        distancia_km=distancia,
    )
