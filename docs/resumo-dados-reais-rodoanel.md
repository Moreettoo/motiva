# Dados reais do Rodoanel — resumo

13 a 15 de setembro de 2026 · para a Motiva, em 16/09

---

## Em uma frase

Trocamos dados inventados por dados reais, medimos o modelo pela primeira vez, e descobrimos que
ele acerta **menos** do que simplesmente chutar "nada muda" — mas descobrimos também **por quê**, e
o motivo tem conserto.

---

## Antes e depois

|  | Antes | Agora |
|---|---|---|
| Dados | 1,8 milhão de exemplos **inventados por computador** | 1.440 observações **de campo real** |
| Rodovia | 50 trechos fictícios | 60 trechos reais do Rodoanel |
| Precisão | número de simulação | **medida contra grama de verdade** |

**A analogia:** o modelo era um motorista que só tinha dirigido em simulador. Ia muito bem no
simulador. Estes três dias foram a primeira vez que ele pegou uma estrada de verdade.

---

## O que foi feito

1. **Arrumamos a casa** — organizamos o código e trouxemos os 4 arquivos da Motiva para dentro.
2. **Lemos os arquivos** — as duas planilhas de campo, os marcos de quilometragem e os 642
   polígonos de roçada.
3. **Montamos a base real** — 60 trechos de 500 metros, com clima, solo e satélite.
4. **Medimos o modelo** — pela primeira vez, contra grama de verdade.
5. **Publicamos** — página nova no site, relatório e documentação.

Em paralelo, testamos o **satélite** como fonte alternativa de dados.

---

## Os números

### 1. O modelo perde para o palpite preguiçoso

| Quem está prevendo | Acerta |
|---|---|
| Nosso modelo | **60,5%** |
| Alguém que sempre responde "nada muda em 7 dias" | **83,1%** |

**A analogia:** é como um meteorologista que acerta 60% das vezes, competindo com um sujeito que só
repete "amanhã vai ser igual hoje" e acerta 83%. O preguiçoso ganha.

Testamos se isso podia ser azar. Não é: nos mesmos 195 casos, o modelo ganha em 9 e perde em 53. A
chance de ser coincidência é de **1 em 95 milhões**.

### 2. Se a equipe saísse a campo seguindo os alertas

| | |
|---|---|
| Alertas que o sistema emitiria | 63 |
| Quantos seriam reais | **10** |
| Crescimentos reais que passariam batido | **23 de 33** |

**A analogia:** é um alarme de incêndio que toca 100 vezes e 84 são falsas — e ainda deixa de tocar
em 7 de cada 10 incêndios de verdade. Ninguém consegue trabalhar com isso.

**Hoje o sistema não serve para despachar equipe.** Isso está dito no relatório sem rodeios.

### 3. Por que ele erra — e aqui está a boa notícia

O modelo prevê que a grama vai chegar a **9,93 cm**. A linha que separa "grama baixa" de "grama
média" fica em **10 cm**.

A diferença é de **0,74 milímetro**. Menos que a espessura de uma moeda.

**A analogia:** imagine medir a altura de uma pessoa e acertar em 1,799 m. Agora imagine que a
prova não pergunta a altura — pergunta só se ela é "baixa, média ou alta", e o corte para "alta" é
1,80 m. Você errou por 1 milímetro e leva zero na questão.

**O modelo não está errando a altura. Está errando a etiqueta.** A régua da Motiva tem só três
marcas — baixa, média, alta — e o modelo está justamente em cima de uma delas.

Prova disso: em **192 dos 195 casos** a altura prevista cai dentro da faixa certa ou a menos de 1,5
cm dela.

### 4. O que realmente decide o resultado

Testamos 27 combinações de premissas. O resultado assusta:

| Premissa | O modelo... |
|---|---|
| Capim batatais ou esmeralda | **nunca prevê mudança nenhuma** |
| Capim braquiária, roçado há 30 dias | **nunca prevê mudança nenhuma** |
| Capim braquiária, roçado há 60+ dias | prevê mudanças — e é aqui que ele erra |

Em **21 das 27 combinações o modelo vira o próprio palpite preguiçoso**: responde "nada muda" em
todo lugar.

**A analogia:** é um médico cujo diagnóstico depende inteiramente da idade do paciente — mas
ninguém perguntou a idade, alguém chutou.

**A espécie de capim nunca foi medida em campo.** É suposição nossa. E ela decide tudo.

### 5. O solo

17 dos 60 pontos (**28%**) não têm solo medido — usamos um valor suposto.

Mas aqui vem uma coisa boa: se tirarmos esses pontos da conta, o modelo fica **pior** (48,9%), não
melhor. Ou seja, **os 60,5% não estão inflados pelo chute**.

### 6. O satélite: duas perguntas, duas respostas

**"Dá para ver pelo satélite se o capim está alto?"** — Mais ou menos. O sinal veio **invertido**: o
capim alto aparece *menos* verde, não mais.

**A analogia:** o satélite enxerga cor, não altura. Capim alto e maduro é mais seco e opaco; capim
baixo e crescendo é verdinho. Ele confundiu os dois.

Corrigindo a inversão, ele até separa bem — mas só temos uma data de campo para confirmar.

**"Dá para ver pelo satélite quando a grama foi roçada?"** — **Não.**

Processamos **14.730 imagens de 8 anos**. De 38 roçadas que sabemos que aconteceram, o detector
achou **2**.

---

## O que isso significa para a Motiva

**✅ A base de dados foi entregue.** Era o primeiro pedido deles, e é o que mais tem valor: 60
trechos reais, 1.440 observações, clima, solo e satélite — tudo repetível toda semana.

**❌ A previsão ainda não serve para mandar equipe a campo.** 84 de cada 100 viagens seriam perdidas.

**⚠️ Mas o conserto é barato.** O modelo erra por 0,74 mm contra uma régua de três degraus. **Se a
Motiva anotar a altura em centímetros** em vez de "baixa/média/alta", em uma semana saberemos se o
modelo presta. Hoje não dá para saber — e a culpa é da régua, não do modelo.

**✅ A variabilidade que eles apontaram está comprovada com número:** 28% do solo é suposição, e a
espécie de capim — que decide tudo — nunca foi medida.

---

## O que pedir no próximo levantamento

| Pedido | Por quê |
|---|---|
| **Altura em centímetros**, não em três classes | é o que destrava tudo |
| **Anotar a espécie** do capim | ela sozinha decide o resultado |
| Medir o solo nos 17 pontos que faltam | tira 28% de suposição |
| Colocar marcos entre o km 23,7 e o 25,7 | hoje há 2 km sem nenhum |

---

## Duas notas de transparência

**O número antigo não era o que parecia.** O produto exibia algo como "75,8%", que todo mundo lia
como taxa de acerto. Não era: era uma medida de ajuste estatístico, calculada sobre dados
inventados. A comparação honesta com os 60,5% de hoje não existe — são coisas diferentes.

**24 decisões foram tomadas sem consultar ninguém.** Ao longo dos três dias apareceram contradições
no plano, erros do próprio plano e escolhas não previstas. Cada uma foi decidida na hora e
registrada com o motivo e com o estrago que causaria se estivesse errada. Cinco vezes o projeto se
pegou afirmando mais do que tinha medido — e cinco vezes corrigiu.

---

## Em resumo

Os números são ruins. Mas eles são **medidos**, pela primeira vez, contra grama de verdade — e é
isso que os torna úteis. O modelo antigo parecia melhor só porque nunca tinha sido testado fora do
simulador.

E sabemos exatamente o que pedir para melhorar: **centímetros em vez de três caixinhas.**
