# 03 · NDVI Sentinel-2 contra a verdade de campo

Gerado por `pesquisa/ndvi/analisar_ndvi.py` em 14/09/2026 00:18 (commit 5c15cf1).

Máscara: polígonos de roçada do KML por segmento. Coleção `COPERNICUS/S2_SR_HARMONIZED`, pixel válido com SCL fora de {3, 8, 9, 10, 11} e probabilidade de nuvem < 40%.
Classe do segmento = pior faixa em escopo na data. A leitura de 28/03/2025 usa as classes de 13/03/2026 e serve só como sanidade da hipótese de data.

### 2026-03-13

Imagem de **2026-03-16** (defasagem +3 d, nuvem média 0,21).

| | classe 1 | classe 3 |
|---|---|---|
| segmentos | 7 | 23 |
| NDVI mediano | 0,584 | 0,502 |

AUC (classe 3 acima da 1) = **0,155** · p = 0,0049.

### 2026-03-20

Imagem de **2026-03-21** (defasagem +1 d, nuvem média 0,22).

| | classe 1 | classe 3 |
|---|---|---|
| segmentos | 17 | 4 |
| NDVI mediano | 0,572 | 0,483 |

AUC (classe 3 acima da 1) = **0,250** · p = 0,1440.

ΔNDVI 13→20/03: roçados (n = 34) **0,014** · não roçados (n = 10) **0,014** · p = 0,6847.

### 2025-03-28

Imagem de **2025-03-31** (defasagem +3 d, nuvem média 0,45).

| | classe 1 | classe 3 |
|---|---|---|
| segmentos | 11 | 16 |
| NDVI mediano | 0,549 | 0,410 |

AUC (classe 3 acima da 1) = **0,188** · p = 0,0072.

## Leitura

AUC 0,5 = o satélite não separa; 1,0 = separa perfeitamente. 38 segmentos tiveram roçada inferida no intervalo.

## Limitações

- Pixel de 10 m e polígonos estreitos: segmentos com poucos pixels válidos pesam igual aos largos.
- Uma data por levantamento, com defasagem de até 7 dias.
- NDVI mede verdor, não altura: capim alto e seco pode ler baixo.
