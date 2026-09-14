# 01 · Consolidação dos dados da Motiva

Gerado por `pesquisa/consolidar.py` em 14/09/2026 01:23 (commit 3f3d25c).

## Fontes

| Arquivo | Data adotada | Data interna (BF6) | Observações |
|---|---|---|---|
| RA-RET-ROÇ-LIMP-2026-03-13.xlsx | 2026-03-13 | 2025-03-28 | 720 |
| RA-RET-ROÇ-LIMP-2026-03-20.xlsx | 2026-03-20 | 2025-03-28 | 720 |

A data interna é a mesma nos dois arquivos, logo não pode ser a data das duas caminhadas: é template.
Adotam-se as datas dos nomes.

## Eixo

30 marcos reordenados (`[-23.41620665170857, -46.73676819732765]` … `[-23.63253885917052, -46.83184134075487]`), comprimento **29.025 m**,
escala para o km da planilha **1,0095**.

## Pares de observação (13/03 → 20/03)

248 pares · cresceram **33** · roçados **53** · estáveis **162**.

| transição | n |
|---|---|
| 1 → 1 | 130 |
| 1 → 2 | 30 |
| 1 → 3 | 3 |
| 2 → 1 | 27 |
| 2 → 2 | 22 |
| 3 → 1 | 22 |
| 3 → 2 | 4 |
| 3 → 3 | 10 |

| faixa | pares |
|---|---|
| cant_lateral_externa | 55 |
| cant_lateral_interna | 55 |
| cant_central_externa | 51 |
| cant_central_interna | 48 |
| cant_dispositivo_ext | 11 |
| cant_dispositivo_int | 11 |
| cant_marginal_interna | 9 |
| cant_marginal_externa | 8 |

## Polígonos de roçada

642 polígonos, 98,2 ha. Distância do centróide ao eixo: mediana 56 m, p90 204 m, máximo 930 m.

| método | polígonos | ha |
|---|---|---|
| Spider, Giro-Zero ou Trator com trincheira | 180 | 66,400 |
| Apenas manual | 342 | 27,400 |
| Spider, com ancoragem | 14 | 0,200 |
| Trator com braço articulado | 106 | 4,100 |

## Os 60 segmentos

| marco (m) | km ini | km fim | lat | lon | método dominante | área m² |
|---|---|---|---|---|---|---|
| 0 | 0,000 | 0,500 | -23,416 | -46,737 | Spider, Giro-Zero ou Trator com trincheira | 72826 |
| 500 | 0,500 | 1,000 | -23,419 | -46,741 | Spider, Giro-Zero ou Trator com trincheira | 4063 |
| 1000 | 1,000 | 1,500 | -23,421 | -46,745 | Spider, Giro-Zero ou Trator com trincheira | 9863 |
| 1500 | 1,500 | 2,000 | -23,423 | -46,749 | Spider, Giro-Zero ou Trator com trincheira | 32550 |
| 2000 | 2,000 | 2,500 | -23,426 | -46,752 | Spider, Giro-Zero ou Trator com trincheira | 16283 |
| 2500 | 2,500 | 3,000 | -23,430 | -46,755 | — | 0 |
| 3000 | 3,000 | 3,500 | -23,433 | -46,759 | — | 0 |
| 3500 | 3,500 | 4,000 | -23,435 | -46,763 | Apenas manual | 977 |
| 4000 | 4,000 | 4,500 | -23,438 | -46,767 | Spider, Giro-Zero ou Trator com trincheira | 40271 |
| 4500 | 4,500 | 5,000 | -23,440 | -46,771 | Spider, Giro-Zero ou Trator com trincheira | 19430 |
| 5000 | 5,000 | 5,500 | -23,443 | -46,775 | Spider, Giro-Zero ou Trator com trincheira | 29723 |
| 5500 | 5,500 | 6,000 | -23,446 | -46,779 | Spider, Giro-Zero ou Trator com trincheira | 33081 |
| 6000 | 6,000 | 6,500 | -23,448 | -46,783 | Spider, Giro-Zero ou Trator com trincheira | 17261 |
| 6500 | 6,500 | 7,000 | -23,451 | -46,786 | Spider, Giro-Zero ou Trator com trincheira | 14936 |
| 7000 | 7,000 | 7,500 | -23,454 | -46,790 | Apenas manual | 27428 |
| 7500 | 7,500 | 8,000 | -23,458 | -46,793 | — | 0 |
| 8000 | 8,000 | 8,500 | -23,462 | -46,796 | — | 0 |
| 8500 | 8,500 | 9,000 | -23,465 | -46,798 | Apenas manual | 3179 |
| 9000 | 9,000 | 9,500 | -23,469 | -46,800 | Spider, Giro-Zero ou Trator com trincheira | 17124 |
| 9500 | 9,500 | 10,000 | -23,474 | -46,801 | Spider, Giro-Zero ou Trator com trincheira | 35528 |
| 10000 | 10,000 | 10,500 | -23,478 | -46,802 | Spider, Giro-Zero ou Trator com trincheira | 20513 |
| 10500 | 10,500 | 11,000 | -23,482 | -46,803 | Apenas manual | 7513 |
| 11000 | 11,000 | 11,500 | -23,486 | -46,805 | Apenas manual | 2123 |
| 11500 | 11,500 | 12,000 | -23,490 | -46,808 | Apenas manual | 7707 |
| 12000 | 12,000 | 12,500 | -23,493 | -46,812 | Spider, Giro-Zero ou Trator com trincheira | 17024 |
| 12500 | 12,500 | 13,000 | -23,496 | -46,815 | Spider, Giro-Zero ou Trator com trincheira | 11376 |
| 13000 | 13,000 | 13,500 | -23,499 | -46,818 | Spider, Giro-Zero ou Trator com trincheira | 18206 |
| 13500 | 13,500 | 14,000 | -23,503 | -46,821 | Spider, Giro-Zero ou Trator com trincheira | 7648 |
| 14000 | 14,000 | 14,500 | -23,507 | -46,821 | Spider, Giro-Zero ou Trator com trincheira | 18534 |
| 14500 | 14,500 | 15,000 | -23,511 | -46,819 | Apenas manual | 474 |
| 15000 | 15,000 | 15,500 | -23,516 | -46,817 | Spider, Giro-Zero ou Trator com trincheira | 27006 |
| 15500 | 15,500 | 16,000 | -23,520 | -46,817 | Apenas manual | 5838 |
| 16000 | 16,000 | 16,500 | -23,524 | -46,817 | Apenas manual | 923 |
| 16500 | 16,500 | 17,000 | -23,529 | -46,818 | Spider, Giro-Zero ou Trator com trincheira | 10351 |
| 17000 | 17,000 | 17,500 | -23,533 | -46,818 | Apenas manual | 2647 |
| 17500 | 17,500 | 18,000 | -23,538 | -46,818 | Spider, Giro-Zero ou Trator com trincheira | 15918 |
| 18000 | 18,000 | 18,500 | -23,542 | -46,819 | Spider, Giro-Zero ou Trator com trincheira | 28543 |
| 18500 | 18,500 | 19,000 | -23,546 | -46,820 | Apenas manual | 7146 |
| 19000 | 19,000 | 19,500 | -23,551 | -46,820 | Spider, Giro-Zero ou Trator com trincheira | 36476 |
| 19500 | 19,500 | 20,000 | -23,555 | -46,820 | Spider, Giro-Zero ou Trator com trincheira | 29190 |
| 20000 | 20,000 | 20,500 | -23,560 | -46,819 | Spider, Giro-Zero ou Trator com trincheira | 40946 |
| 20500 | 20,500 | 21,000 | -23,564 | -46,819 | Spider, Giro-Zero ou Trator com trincheira | 9282 |
| 21000 | 21,000 | 21,500 | -23,568 | -46,817 | Apenas manual | 1127 |
| 21500 | 21,500 | 22,000 | -23,571 | -46,814 | Spider, Giro-Zero ou Trator com trincheira | 14836 |
| 22000 | 22,000 | 22,500 | -23,574 | -46,811 | Spider, Giro-Zero ou Trator com trincheira | 19227 |
| 22500 | 22,500 | 23,000 | -23,579 | -46,809 | Spider, Giro-Zero ou Trator com trincheira | 9149 |
| 23000 | 23,000 | 23,500 | -23,583 | -46,809 | Spider, Giro-Zero ou Trator com trincheira | 25922 |
| 23500 | 23,500 | 24,000 | -23,587 | -46,809 | Spider, Giro-Zero ou Trator com trincheira | 43349 |
| 24000 | 24,000 | 24,500 | -23,592 | -46,810 | Spider, Giro-Zero ou Trator com trincheira | 52787 |
| 24500 | 24,500 | 25,000 | -23,596 | -46,811 | Spider, Giro-Zero ou Trator com trincheira | 17446 |
| 25000 | 25,000 | 25,500 | -23,600 | -46,812 | Apenas manual | 8137 |
| 25500 | 25,500 | 26,000 | -23,605 | -46,814 | Apenas manual | 6184 |
| 26000 | 26,000 | 26,500 | -23,608 | -46,816 | Spider, Giro-Zero ou Trator com trincheira | 13037 |
| 26500 | 26,500 | 27,000 | -23,612 | -46,819 | Spider, Giro-Zero ou Trator com trincheira | 24097 |
| 27000 | 27,000 | 27,500 | -23,615 | -46,823 | Spider, Giro-Zero ou Trator com trincheira | 24468 |
| 27500 | 27,500 | 28,000 | -23,618 | -46,826 | Apenas manual | 5397 |
| 28000 | 28,000 | 28,500 | -23,621 | -46,828 | Apenas manual | 987 |
| 28500 | 28,500 | 29,000 | -23,626 | -46,829 | Spider, Giro-Zero ou Trator com trincheira | 15763 |
| 29000 | 29,000 | 29,150 | -23,630 | -46,831 | — | 0 |
| 29300 | 29,150 | 29,300 | -23,633 | -46,832 | — | 0 |

## Decisões de parsing e limitações

- A célula de data interna (BF6) é idêntica nas duas planilhas (template não atualizado pela
  Motiva): a data de cada levantamento vem do NOME do arquivo, não da célula.
- O esquema de `classificacao_rocada.kmz` está deslocado: `SimpleData name="classe"` traz a
  latitude, `name="KM"` traz a longitude e `name="Latitude"` traz a área em m². A classe real do
  método vem de `<name>` e o km inteiro de `<description>`. `area_m2` já é líquida de buracos
  (`<innerBoundaryIs>`); a geometria (`aneis`/`aneis_internos`) é que precisa da subtração
  explícita — ver `poligonos.py`.
- O eixo (`Marco km_rodoanel 2.kmz`) tem 2 marcos fora de ordem no arquivo, corrigidos por `marcos.ORDEM_CORRIGIDA`; mesmo corrigido, resta uma lacuna real de **2.042 m** sem marco intermediário, entre os km de planilha **23,67** e **25,73** (entre os km 23 e 26). Nesse trecho o eixo reordenado vira uma corda reta onde a rodovia de verdade faz curva, e a atribuição de polígono → marco (`metodo_rocada`/`area_rocada_m2` dos segmentos nesse trecho) é por isso menos confiável: **54** dos **70** polígonos cujo centróide diverge por mais de 1 km do seu km descrito caem nesse trecho (**77%**). Não é erro de projeção: mesmo o pior caso (polígono 596, descrito no km 25, projetando a 1,96 km de distância disso) fica a só **18 m** do eixo — bem abaixo da mediana geral de **56 m**. É lacuna de levantamento da Motiva, não defeito de projeção: **30** marcos não dá para cobrir os **29,3 km** da planilha sem aproximar em algum trecho. Ver o docstring de `poligonos.atribuir`.
- **6** dos **60** segmentos não têm nenhum polígono de roçada atribuído (`metodo_rocada`/`area_rocada_m2` ficam vazios/zero): km 2,50–3,50; km 7,50–8,50; km 29,00–29,30. Não é erro de agrupamento — a soma de polígonos por marco continua cobrindo o lote inteiro (**642** polígonos); é ausência de cobertura desses trechos no KML de roçada da Motiva.
- **8** das **12** faixas transversais da planilha
  ficam fora do escopo contratual (ver `planilha.CODIGOS_EM_ESCOPO`): a medição derivada usa a
  pior classe apenas dentre as **4** faixas em escopo (canteiro
  lateral e central, interno e externo).
