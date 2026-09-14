# 02 · Validação do modelo contra o levantamento da Motiva

Gerado por `pesquisa/validar.py` em 14/09/2026 01:31 (commit 3f3d25c).

Janela **13 → 20/03/2026** (7 dias). Pares usados: **195** dos 248 (os 53 com queda de classe são roçada e ficam fora).
Premissas do cenário vigente: espécie **braquiaria**, classe 3 = **40 cm**, dias desde a roçada = **200**.

## O número

| cenário | n | fator | acurácia de classe | transições detectadas | alarmes falsos | J | cobertura da banda |
|---|---|---|---|---|---|---|---|
| linha de base: nada muda | 195 | — | 83,1% | 0 de 33 | 0 de 162 | 0,000 | — |
| modelo sem calibração | 195 | 1,00 | 60,5% | 10 de 33 | 53 de 162 | -0,024 | 94,4% |
| modelo calibrado (fator vigente 1,15) | 195 | 1,15 | 31,8% | 33 de 33 | 130 de 162 | 0,198 | 98,5% |

`J` = fração das transições detectadas − fração de alarmes falsos. A linha de base acerta 83,1% sem prever nada: **acurácia total não é o critério**; transições detectadas e alarmes falsos são.

## Calibração honesta: ajuste nos km pares, teste nos km ímpares

- Ajuste (n = 103): fator **1,05**, J = 0,254
- Teste (n = 92): J sem calibração = -0,119 → com o fator do ajuste = 0,033
- Reajuste em todos: fator 1,15, J = 0,198. Vigente: **1,15**.

## Matriz de confusão do cenário vigente (linhas = observado em 20/03, colunas = previsto)

|  | prevista 1 | prevista 2 | prevista 3 |
|---|---|---|---|
| observada 1 | 0 | 130 | 0 |
| observada 2 | 0 | 52 | 0 |
| observada 3 | 0 | 3 | 10 |

## Sensibilidade às premissas (sem calibração)

| cenário | n | acurácia | transições detectadas | alarmes falsos | J |
|---|---|---|---|---|---|
| braquiaria · c3=35 cm · roçada há 30 d | 195 | 83,1% | 0 de 33 | 0 de 162 | 0,000 |
| braquiaria · c3=35 cm · roçada há 60 d | 195 | 61,5% | 9 de 33 | 50 de 162 | -0,036 |
| braquiaria · c3=35 cm · roçada há 200 d | 195 | 60,5% | 10 de 33 | 53 de 162 | -0,024 |
| braquiaria · c3=40 cm · roçada há 30 d | 195 | 83,1% | 0 de 33 | 0 de 162 | 0,000 |
| braquiaria · c3=40 cm · roçada há 60 d | 195 | 61,5% | 9 de 33 | 50 de 162 | -0,036 |
| braquiaria · c3=40 cm · roçada há 200 d | 195 | 60,5% | 10 de 33 | 53 de 162 | -0,024 |
| braquiaria · c3=50 cm · roçada há 30 d | 195 | 83,1% | 0 de 33 | 0 de 162 | 0,000 |
| braquiaria · c3=50 cm · roçada há 60 d | 195 | 61,5% | 9 de 33 | 50 de 162 | -0,036 |
| braquiaria · c3=50 cm · roçada há 200 d | 195 | 60,5% | 10 de 33 | 53 de 162 | -0,024 |
| batatais · c3=35 cm · roçada há 30 d | 195 | 83,1% | 0 de 33 | 0 de 162 | 0,000 |
| batatais · c3=35 cm · roçada há 60 d | 195 | 83,1% | 0 de 33 | 0 de 162 | 0,000 |
| batatais · c3=35 cm · roçada há 200 d | 195 | 83,1% | 0 de 33 | 0 de 162 | 0,000 |
| batatais · c3=40 cm · roçada há 30 d | 195 | 83,1% | 0 de 33 | 0 de 162 | 0,000 |
| batatais · c3=40 cm · roçada há 60 d | 195 | 83,1% | 0 de 33 | 0 de 162 | 0,000 |
| batatais · c3=40 cm · roçada há 200 d | 195 | 83,1% | 0 de 33 | 0 de 162 | 0,000 |
| batatais · c3=50 cm · roçada há 30 d | 195 | 83,1% | 0 de 33 | 0 de 162 | 0,000 |
| batatais · c3=50 cm · roçada há 60 d | 195 | 83,1% | 0 de 33 | 0 de 162 | 0,000 |
| batatais · c3=50 cm · roçada há 200 d | 195 | 83,1% | 0 de 33 | 0 de 162 | 0,000 |
| esmeralda · c3=35 cm · roçada há 30 d | 195 | 83,1% | 0 de 33 | 0 de 162 | 0,000 |
| esmeralda · c3=35 cm · roçada há 60 d | 195 | 83,1% | 0 de 33 | 0 de 162 | 0,000 |
| esmeralda · c3=35 cm · roçada há 200 d | 195 | 83,1% | 0 de 33 | 0 de 162 | 0,000 |
| esmeralda · c3=40 cm · roçada há 30 d | 195 | 83,1% | 0 de 33 | 0 de 162 | 0,000 |
| esmeralda · c3=40 cm · roçada há 60 d | 195 | 83,1% | 0 de 33 | 0 de 162 | 0,000 |
| esmeralda · c3=40 cm · roçada há 200 d | 195 | 83,1% | 0 de 33 | 0 de 162 | 0,000 |
| esmeralda · c3=50 cm · roçada há 30 d | 195 | 83,1% | 0 de 33 | 0 de 162 | 0,000 |
| esmeralda · c3=50 cm · roçada há 60 d | 195 | 83,1% | 0 de 33 | 0 de 162 | 0,000 |
| esmeralda · c3=50 cm · roçada há 200 d | 195 | 83,1% | 0 de 33 | 0 de 162 | 0,000 |

## Sensibilidade ao solo assumido

**28%** dos marcos (17 de 60) não têm solo medido pelo SoilGrids: caem na premissa do Rodoanel, com fertilidade **0,35** e capacidade **60,0 mm** — a fertilidade fica ABAIXO do mínimo realmente medido nos outros 43 marcos (**0,430–0,702**), não é um valor médio. Isso responde por **64** dos **195** pares desta validação. Sem calibração e excluindo esses pares: acurácia 48,9%, transições detectadas 10 de 23, alarmes falsos 53 de 108, J = -0,056 — contra 60,5% e J = -0,024 com os 195 pares inteiros (premissa incluída). Precisão por segmento de solo não é o que estes dados sustentam para os **28%** da rodovia onde o solo é assumido, não medido.

## Fila retrospectiva

Em 13/03, com o fator vigente, o sistema marcaria **0** segmento(s) como "cruza 30 cm em até 7 dias" entre os 55 com faixa em escopo; **1** de fato chegaram à classe 3 em 20/03; acertos: **0**.

## Limitações

- Duas datas, ambas em março: vale para o fim da estação chuvosa em São Paulo.
- Classes ordinais, não altura; o ponto médio é aproximação (ver sensibilidade).
- Dias desde a roçada desconhecidos: premissa de 200 dias, testada em 30 e 60.
- 33 transições é amostra pequena; o fator é local ao Rodoanel.
- Solo assumido, não medido, em **28%** dos marcos (ver "Sensibilidade ao solo assumido"): não dá para reivindicar precisão por segmento de solo nessa fração da rodovia.
