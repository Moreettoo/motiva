# Dados reais do Rodoanel — resumo do trabalho

**Projeto:** substituir a malha fictícia de 50 trechos pelos dados reais do Rodoanel Oeste (SP-021)
**Período:** 13 a 15 de setembro de 2026
**Destino:** apresentação à Motiva em 16/09/2026

---

## 1. O ponto de partida

O produto previa o crescimento da grama em rodovias e exibia um número de qualidade que parecia
uma taxa de acerto. Ele era real, mas media outra coisa: um **R² de 0,758** com erro médio de
**1,29 cm** — e medido sobre **1.815.037 janelas de treino geradas por computador**, calibradas por
literatura científica.

Duas ressalvas se perdiam no caminho. R² não é taxa de acerto: é o quanto o modelo explica da
variação, e vira "75,8%" na leitura apressada de quem vê a porcentagem. E, sobretudo, o teste era
sobre cidades simuladas — **nenhuma folha de grama de verdade tinha entrado na conta.**

A Motiva apontou três coisas:

1. previsão é bem-vinda, mas **primeiro é preciso uma base de dados real**, estruturada e ampla;
2. rodovia tem **variabilidade enorme** de solo e de espécie de capim;
3. vale considerar **outros métodos de captura** de dados.

O trabalho destes três dias respondeu aos três pontos — e o terceiro respondeu com um "não"
medido, o que também é resposta.

---

## 2. O que foi feito, etapa por etapa

O plano tinha 23 tarefas, numeradas de 0 a 22. Elas se agrupam em cinco fases.

### Fase 1 — Arrumar a casa (Tarefas 0 a 2)

Conferência do ambiente, reorganização dos arquivos do modelo para uma pasta própria, e criação do
espaço de pesquisa com uma cópia versionada dos quatro arquivos originais da Motiva. Nada de
ciência ainda: é a fundação que permite que tudo depois seja reproduzível.

Um detalhe que rendeu: antes dessa arrumação, o modelo só funcionava se executado de um diretório
específico. Depois, funciona de qualquer lugar.

### Fase 2 — Ler os arquivos da Motiva (Tarefas 3 a 5)

Três leitores escritos com teste antes do código, cada um contra os arquivos reais:

- **As planilhas de campo.** Duas caminhadas de equipe, em 13 e 20 de março de 2026. Descobriu-se
  que a data interna da planilha dizia 28/03/2025 nos **dois** arquivos — um campo de modelo que
  ninguém atualizou. As datas verdadeiras vieram do nome do arquivo.
- **Os marcos quilométricos.** O arquivo vinha com a ordem trocada; foi preciso reordenar para
  reconstruir o eixo da rodovia. Apareceu aí um vão real de **2.042 metros sem nenhum marco**,
  entre o km 23,67 e o km 25,73.
- **Os polígonos de roçada.** 642 áreas, num arquivo cujos campos estavam deslocados (o campo
  "classe" continha latitude, o campo "KM" continha longitude). Descobriu-se também que 49 deles
  têm buracos no meio, somando 12,5% da área.

### Fase 3 — Montar a base real (Tarefas 6 a 9, e 14)

Consolidação de tudo em **60 segmentos reais** de 500 metros, com **248 pares de observação** (o
mesmo ponto visto nas duas caminhadas).

Antes de rodar a consolidação, a matriz inteira de transições foi reproduzida à mão a partir do
leitor de planilhas. Quando a consolidação rodou, bateu célula por célula — o que transformou o
teste de aceitação em previsão verificada, não em conferência depois do fato.

Nesta fase entraram também o clima real (ERA5, duas zonas climáticas), o solo por marco
(SoilGrids) e a primeira leitura de satélite.

### Fase 4 — Medir o modelo (Tarefas 9 a 13)

A parte central. Pela primeira vez o modelo foi confrontado com grama de verdade.

Aqui aconteceram três coisas importantes:

- **Uma regra nova:** o sistema passou a **se recusar a prever** sobre medição com mais de 120 dias,
  em vez de responder com confiança sobre dado velho.
- **Um fator de ajuste foi testado e rejeitado.** A regra da especificação para aceitar o ajuste era
  circular — ela recalibrava usando todos os dados e depois perguntava se tinha melhorado nos mesmos
  dados. Nunca poderia reprovar. Foi feito o teste honesto, reservando metade dos dados: o ajuste
  **piorava**. Ficou gravado 1,0 (desligado), com o 1,15 preservado e marcado como rejeitado.
- **Os dados foram gravados em produção** pelo mesmo caminho que o importador semanal usa — ou seja,
  provando que o processo é repetível, não um carregamento manual de uma vez só.

### Fase 5 — Mostrar, documentar e publicar (Tarefas 15 a 22)

Página `/validacao` construída para **calcular** os números na hora, não exibi-los escritos. Isso é
deliberado: um número escrito na tela envelhece em silêncio; um número calculado não consegue mentir
depois que os dados mudam.

Mais: calibração e solo por trecho entrando no processamento diário, um estado novo de risco para
"não sei" (antes, ausência de previsão aparecia como risco baixo — "não sei" se parecia com "está
tudo bem"), o cartão de levantamentos na página do trecho, o manual de importação, o relatório para
a Motiva e o deploy.

### Trilha paralela — O satélite (Tarefas 14 e 20)

Rodou em paralelo, numa cópia separada do projeto, a partir do momento em que os polígonos ficaram
prontos. Duas perguntas foram feitas ao Sentinel-2, e as duas foram respondidas com "não".

---

## 3. Os números

### 3.1 O que existe hoje no banco

| Item | Quantidade |
|---|---|
| Trechos reais do Rodoanel (ativos) | **60** |
| Levantamentos de campo | **1.440** |
| Medições derivadas | **765** |
| Faixas cadastradas | **12** |
| Pares de validação | **248** |
| Observações de satélite (NDVI) | **162** |
| Análises de satélite | **3** |
| Execuções de serviço registradas | **161** |
| Previsões já geradas | **2.584** |
| Calibrações | **2** (1,0 vigente · 1,15 rejeitada) |
| Validações | **28** (1 vigente + 27 de sensibilidade) |

Cobertura: 30 km de rodovia, 60 segmentos de 500 m, 12 faixas por segmento, duas caminhadas de
equipe com uma semana de intervalo.

### 3.2 A precisão do modelo, medida contra campo real

Dos 248 pares, **53 foram excluídos** porque a grama desceu de classe entre as duas visitas — leitura
de que houve roçada no meio. Sobraram **195 pares** para medir.

| Medida | Modelo | "Nada muda em 7 dias" |
|---|---|---|
| Acerto de classe | **60,5%** | **83,1%** |
| Intervalo de confiança 95% | 53,3% – 67,4% | 77,1% – 88,1% |
| Erro médio (em classes) | 0,405 | — |

Os intervalos **não se sobrepõem**. E como são os mesmos 195 pares julgados de dois jeitos, o teste
correto é o pareado: o modelo ganha em **9** pares e perde em **53**. A chance disso ser acaso é de
1 em 95 milhões.

**O modelo perde para o palpite mais preguiçoso possível.** Isso é medição, não opinião.

### 3.3 Acerto por classe

| Classe observada | Acertos | Total | Taxa | Intervalo 95% |
|---|---|---|---|---|
| Classe 1 (abaixo de 10 cm) | 77 | 130 | 59% | 50% – 68% |
| Classe 2 (10 a 30 cm) | 31 | 52 | 60% | 45% – 73% |
| Classe 3 (acima de 30 cm) | 10 | 13 | 77% | **46% – 95%** |

Atenção ao último: **77% sobre 13 casos não significa nada sozinho**. O intervalo vai de 46% a 95% —
poderia ser pior que cara ou coroa. Esse número não deve ser apresentado sem o intervalo ao lado.

### 3.4 A leitura operacional — o que acontece se a equipe seguir os alertas

Esta é a tabela que mais importa para decidir se o sistema serve hoje.

| Pergunta | Resposta |
|---|---|
| Mudanças reais de classe nos 195 pares | 33 |
| Quantas o modelo detectou | **10** (recall de 30,3%) |
| Trechos estáveis | 162 |
| Alarmes falsos | **53** (especificidade de 67,3%) |
| **Precisão dos alertas** | **15,9%** |

Em linguagem de operação: **a cada 100 alertas emitidos, cerca de 16 são reais.** As outras 84
viagens seriam desperdiçadas. E, ao mesmo tempo, 7 de cada 10 crescimentos reais passariam
despercebidos.

O índice combinado (J de Youden) é **−0,024** — ligeiramente negativo, ou seja, indistinguível de
sortear.

### 3.5 O diagnóstico: por que o modelo erra

Aqui está o achado mais valioso, e ele não é uma desculpa — é uma medida.

| Medida | Valor |
|---|---|
| Largura da faixa de incerteza do modelo (q10–q90) | **2,91 cm** |
| Altura final prevista dentro da faixa da classe observada, ou a menos de 1,5 cm dela | **192 de 195** |
| Distância mediana | **0 cm** |
| Distância média | **0,35 cm** |
| Casos que erram por mais de 1,5 cm | **3** |
| Altura típica prevista para quem começou na classe 1 | **9,93 cm** |
| Distância dessa previsão até a fronteira de 10 cm | **0,74 mm** |
| Cobertura real da faixa de 80% | **94,4%** (promete 80%, entrega 94%) |

Leia junto: o modelo prevê uma altura que cai a **menos de um milímetro** da linha que separa a
classe 1 da classe 2. Um empurrão de 0,74 mm muda "acertou" para "errou" em dezenas de segmentos ao
mesmo tempo.

A régua de três classes é grosseira demais para o que o modelo está fazendo. Ele não erra a altura
por muito — ele erra a **classe**, porque a classe corta exatamente onde ele está.

*Ressalva honesta: o erro exato de altura não pode ser medido neste projeto, porque o campo mediu
classes e não centímetros. Os 2,91 cm são a incerteza que o próprio modelo declara, não seu erro
verificado. É justamente por isso que o pedido à Motiva é medir em centímetros.*

### 3.6 O quanto as premissas decidem o resultado

27 cenários testados, variando espécie, ponto médio da classe 3 e dias desde a última roçada:

| Espécie | Dias desde a roçada | Acurácia | Mudanças detectadas |
|---|---|---|---|
| batatais | 30 / 60 / 200 | 83,1% | **0** |
| esmeralda | 30 / 60 / 200 | 83,1% | **0** |
| braquiária | 30 | 83,1% | **0** |
| braquiária | 60 | 61,5% | 9 |
| braquiária | 200 | **60,5%** | 10 |

Três conclusões diretas:

1. **O ponto médio da classe 3 (35, 40 ou 50 cm) não muda absolutamente nada** — as três colunas são
   idênticas em todas as linhas.
2. **Em 21 dos 27 cenários o modelo prevê que nada muda em lugar nenhum** e marca exatamente 83,1% —
   ou seja, vira o próprio palpite preguiçoso.
3. **O modelo só se mexe sob uma combinação específica de premissas:** braquiária, com 60 dias ou
   mais desde a roçada. E a espécie **nunca foi medida em campo** — é premissa declarada.

O corolário desconfortável, e ele precisa ser dito: **o modelo só consegue perder porque se mexe, e
o que o faz mexer é uma suposição não verificada.**

### 3.7 O solo

| Medida | Valor |
|---|---|
| Marcos com solo medido por satélite | 43 de 60 |
| Marcos com solo assumido | **17 de 60 (28%)** |
| Pares afetados pela suposição | 64 de 195 |
| Fertilidade assumida | 0,35 |
| Faixa realmente medida | 0,430 – 0,702 |
| **Acurácia excluindo os pares de solo assumido** | **48,9%** |

Repare na terceira linha de baixo para cima: a fertilidade assumida está **abaixo de toda a faixa
medida**. Não é uma média, é um chute pessimista.

E o resultado vai no sentido honesto: excluindo os trechos de solo chutado, o modelo fica **pior**
(48,9%), não melhor. Ou seja, o número de 60,5% **não está inflado** pela suposição.

### 3.8 O satélite

Duas perguntas, dois "não" — mas com uma nuance importante.

**Pergunta 1: o satélite enxerga a diferença entre capim alto e baixo hoje?**

| Data | AUC bruto | Lido na direção certa | p |
|---|---|---|---|
| 13/03/2026 | 0,155 | **0,845** | 0,005 |
| 20/03/2026 | 0,250 | 0,750 | 0,144 |
| 28/03/2025 (sanidade) | 0,188 | 0,812 | 0,007 |

O sinal veio **invertido** — NDVI baixo corresponde a capim alto, não o contrário. Provável
explicação: capim alto e maduro reflete menos verde que capim baixo em crescimento ativo. O NDVI
mede verdor, não altura.

Invertido, **0,845 é separação forte, não ruído**. Esse é o único resultado favorável do satélite, e
ele responde diretamente ao terceiro ponto da Motiva. Mas as amostras são minúsculas (7 contra 23
segmentos) e é uma única data de campo.

**Pergunta 2: o satélite detecta que houve roçada?**

| Medida | Valor |
|---|---|
| Observações processadas | **14.730** |
| Período | 2019 a 2026 (8 anos) |
| Segmentos cobertos | 54 |
| "Cortes" que o detector encontrou | 190 |
| Roçadas conhecidas em março/2026 | 38 |
| **Quantas o detector achou** | **2 (recall de 5,3%)** |
| Diferença de NDVI entre roçados e não roçados | p = 0,685 (nenhuma) |

Resposta clara: **não**. Ler nível ("está alto agora") é coisa diferente de detectar variação ("foi
roçado esta semana"), e é a variação que a operação precisaria.

### 3.9 Qualidade da entrega

| Medida | Valor |
|---|---|
| Testes automatizados (Python) | **237** |
| Testes automatizados (web) | **382** |
| Verificação completa do site | tipos, lint, testes, fumaça e build — todos verdes |
| Tarefas concluídas | 23 de 23 |
| Revisões de código | 23 por tarefa + 1 do conjunto + 1 de conferência |

---

## 4. O que estes números querem dizer para a Motiva

**A base de dados foi entregue.** Era o primeiro pedido, e é o que mais tem valor: 60 segmentos
reais, 1.440 observações de campo, clima, solo e satélite, tudo reproduzível e com o caminho de
importação semanal já testado.

**A previsão, hoje, não serve para despachar equipe.** Com 16% de precisão nos alertas, seguir o
sistema significaria 84 viagens perdidas a cada 100. Isso está dito no relatório sem rodeios.

**Mas o diagnóstico aponta um caminho barato.** O modelo não está errando por muito — está errando
por 0,74 mm contra uma régua de três degraus. Se a Motiva medir **altura em centímetros** em vez de
três classes, no próximo levantamento, dá para saber em uma semana se o modelo é bom ou ruim. Hoje
não dá, e o motivo é a régua, não o modelo.

**A variabilidade que a Motiva levantou está comprovada com número.** 28% do solo é suposição, e a
espécie — que decide o resultado inteiro — nunca foi medida. Os dois são pedidos concretos para o
próximo levantamento.

**Sobre outros métodos de captura:** o satélite foi testado a sério, com 8 anos de dados, e não
serve para detectar roçada. Serve, possivelmente, para dizer onde o capim está alto — mas isso
precisa de mais datas para confirmar.

---

## 5. As 24 decisões tomadas sem consultar

Nenhum plano prevê tudo. Vinte e quatro vezes apareceu uma contradição, um erro do próprio plano ou
uma escolha não antecipada, e a decisão foi tomada na hora e registrada com três informações: o que
foi decidido, por quê, e **o que custa se estiver errado**.

**Organização do trabalho (3).** Trabalhar direto na versão principal do código, porque a spec, o
plano e os arquivos da Motiva estavam fora do controle de versão e uma cópia isolada viria vazia
deles. Rodar o satélite em cópia separada, para trabalhar em paralelo sem duas frentes se
atropelando. Criar dois arquivos vazios que o plano não previu, sem os quais o sistema de testes se
recusava a rodar.

**Corrigir o plano quando ele estava errado (5).** O falso alarme que dizia que o satélite não tinha
autorização — o acesso funcionava, o teste é que estava quebrado. A ordem de apagar e refazer o
ambiente, que teria derrubado três bibliotecas e quebrado quatro tarefas adiante. A lista de versões
que fixava três bibliotecas nunca testadas. A contradição interna sobre o formato do script de
conferência. E o diário, que por construção nomeia sempre o passo anterior.

**Declarar um limite em vez de escondê-lo (4).** O vão de 2 km sem marco, que explica 54 dos 70
polígonos com folga de atribuição. Os 6 segmentos sem dado de roçada, que estavam na tabela mas
ninguém veria. Os buracos dos polígonos, 12,5% da área, que inflavam a máscara do satélite com
asfalto. E a vírgula decimal, corrigida junto porque eram as mesmas linhas.

**Consertar testes que não protegiam nada (4).** Três vezes seguidas o programa estava certo e o
teste não perceberia se ele deixasse de estar — comparações verdadeiras por construção, margens
frouxas demais, métodos importantes sem teste algum. Na quarta, o processo mudou: todo pedido
seguinte passou a exigir auditoria dos próprios testes antes de implementar.

**Corrigir os próprios erros (2).** O diagnóstico do satélite anunciado como resolvido quando ainda
estava pela metade — eram dois defeitos, e o corrigido era o menor. E um número repassado sem
conferir o denominador (39 era sobre 248 pares, não sobre 195; o certo é 29).

**A última noite (6).** O arquivo que gravava como "vigente" justamente o fator que tinha sido
rejeitado. A frase "±1,5 cm" que nunca foi medida e ia para o cliente. As sete perguntas de um
examinador hostil, incorporadas todas — inclusive as três que **fortalecem** o resultado. A decisão
de disparar o processo automático antes das 06:00, que achou um defeito real. E as duas pendências
que ficaram, decididas em vez de empurradas.

O registro completo de cada uma, com códigos de versão, está no arquivo de acompanhamento da
execução.

---

## 6. O que fica para depois

| Item | Urgência |
|---|---|
| Pedir à Motiva altura em **centímetros**, não em três classes | alta — é o que destrava a medição |
| Registrar a **espécie** em campo, em vez de assumir | alta — ela decide o resultado inteiro |
| Medir solo nos 17 marcos que hoje são suposição | média |
| Preencher o vão de 2 km sem marco (km 23,7 a 25,7) | média |
| Testar o satélite como leitura de **nível** em mais datas | média — há sinal, falta confirmar |
| Repetir a medição a cada levantamento novo | hoje exige um desenvolvedor, não é automático |

---

## O fio que liga tudo

Lendo os três dias de uma vez, aparece um padrão só:

**Toda vez que havia a escolha entre um número bonito e um número verdadeiro, foi escolhido o
verdadeiro** — e, quando o verdadeiro era feio, ele foi explicado em vez de escondido.

O resultado é desconfortável: o modelo acerta 60,5% e o palpite mais preguiçoso acerta 83,1%. O
satélite não achou nada, duas vezes. A cada 100 alertas, 16 seriam reais.

Esses números estão no relatório do jeito que saíram. O que os torna úteis não é serem bons — é
serem **medidos**, pela primeira vez, contra grama de verdade. Antes disso, a precisão anunciada
vinha de 1,8 milhão de linhas inventadas por computador.

Cinco vezes ao longo de três dias o projeto se pegou afirmando mais do que tinha medido. Cinco vezes
corrigiu. É essa a razão para confiar no que sobrou.
