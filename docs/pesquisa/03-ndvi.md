# 03 · NDVI Sentinel-2 contra a verdade de campo

Gerado por `pesquisa/ndvi/analisar_ndvi.py` em 14/09/2026 10:46 (commit ea18d47).

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

A separação entre classes é real, mas **invertida em todas as datas com comparação possível**: a classe 3 (capim mais alto, ~40 cm) lê NDVI **mais baixo** que a classe 1 (capim recém-roçado, ~5 cm) — o oposto da expectativa ingênua de que mais vegetação lê NDVI mais alto. Valores observados: 2026-03-13 (AUC 0,155, p = 0,0049); 2026-03-20 (AUC 0,250, p = 0,1440); 2025-03-28 (AUC 0,188, p = 0,0072). A comparação é estatisticamente significativa em 2026-03-13, 2025-03-28 (p < 0,05); não significativa nas demais. Essa é exatamente a limitação já registrada abaixo — "NDVI mede verdor, não altura: capim alto e seco pode ler baixo" — confirmada pelos dados: em março, no fim do verão/início do outono em São Paulo, capim alto não roçado pode estar mais seco e senescente, lendo NDVI mais baixo do que um gramado recém-roçado ainda em crescimento ativo.

A leitura de sanidade de 2025-03-28 (AUC 0,188) usa as classes de campo de 13/03/2026 sobre uma imagem de satélite de um ano antes, e mostra a mesma direção de 2026-03-13, 2026-03-20. Isso é uma pergunta em aberto, não uma explicação assentada: parte do efeito pode ser do **lugar** (faixas estreitas, sombra de árvore, vegetação diferente naquele trecho) em vez da altura do capim naquele mês específico — o único fator realmente comum entre a leitura de 2025 e as de 2026 é a etiqueta de classe por segmento, não a imagem nem a estação do ano.

O teste de corte **não encontrou** diferença de NDVI entre roçados (n = 34, ΔNDVI mediano 0,014) e não roçados (n = 10, ΔNDVI mediano 0,014) — p = 0,6847. Consistente com o espec (seção 14, fora de escopo): 38 segmentos com roçada inferida no intervalo (34 dos 38 tinham NDVI válido em ambas as datas, entrando nesta comparação) é amostra pequena para um detector treinado, e o mesmo tamanho de amostra limita o poder deste teste de diferença de medianas.

## Limitações

- Pixel de 10 m e polígonos estreitos: segmentos com poucos pixels válidos pesam igual aos largos.
- Uma data por levantamento, com defasagem de até 7 dias.
- NDVI mede verdor, não altura: capim alto e seco pode ler baixo.

## Série 2019–2026 e detector de corte

Gerado por `pesquisa/ndvi/analisar_serie.py` em 14/09/2026 16:24 (commit c3dd5d8).

14730 observações limpas em 54 segmentos (~34,1 por segmento por ano). Detector: queda ≥ 0,15 em ≤ 12 dias partindo de NDVI ≥ 0,45.

| ano | cortes detectados |
|---|---|
| 2019 | 37 |
| 2020 | 18 |
| 2021 | 24 |
| 2022 | 16 |
| 2023 | 33 |
| 2024 | 20 |
| 2025 | 28 |
| 2026 | 14 |

Conferência contra as 38 roçadas inferidas de 13→20/03/2026: **2 detectadas** (recall 5%), 1 segmento(s) com queda sem roçada inferida. Recall baixo é consistente com o achado da Tarefa 14 (AUC invertida, teste de corte sem diferença significativa, p = 0,6847): uma série mais longa não recuperou o que três datas não acharam.
