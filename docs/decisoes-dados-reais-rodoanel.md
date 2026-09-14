# As 24 decisões que foram tomadas sozinhas

**Projeto:** trocar a malha fictícia de 50 trechos pelos dados reais do Rodoanel Oeste (SP-021)
**Quando:** 13 a 15 de setembro de 2026
**Para quê:** apresentação à Motiva em 16/09/2026

---

## Por que este documento existe

O plano de trabalho tinha 23 tarefas. Nenhum plano prevê tudo: no meio do caminho aparecem
contradições, coisas que o plano mandou fazer e que estavam erradas, e escolhas que ninguém tinha
antecipado. Em vez de parar e perguntar a cada uma — o que teria custado dias — elas foram
decididas na hora e anotadas.

São 24 decisões, agrupadas aqui por assunto e não pela ordem em que aconteceram — algumas se
entendem melhor contadas juntas. Cada uma traz **o que foi decidido**, **por quê**, e **o que custa
se estiver errado**. Essa última parte é a mais importante: nenhuma foi tomada sem saber o tamanho
do estrago caso fosse a escolha errada.

O registro técnico completo, com códigos de versão e números de linha, está no arquivo de
acompanhamento da execução. Este documento é a versão para ler.

Se alguém perguntar na apresentação "por que vocês fizeram assim?", a resposta está aqui.

---

## 1. Como o trabalho foi organizado

### Trabalhar direto na versão principal do código, sem cópia separada

O jeito seguro de fazer esse tipo de trabalho é criar uma cópia isolada do projeto e mexer nela.
Mas a spec, o plano e os arquivos originais da Motiva **não estavam guardados no sistema de
versionamento** — eles existiam só na máquina. Uma cópia isolada viria vazia justamente desses
arquivos, e duas tarefas que dependiam deles seriam impossíveis.

*Se estivesse errado:* desfazer alterações fica mais trabalhoso. Reduzido por dois motivos: havia
backup do banco, e o repositório é pessoal, sem outras pessoas trabalhando nele ao mesmo tempo.

### A trilha do satélite rodou em paralelo, numa cópia separada

O satélite precisava dos polígonos, que ficavam prontos na Tarefa 6. Esperar até a Tarefa 13
desperdiçaria meio dia. Mas duas frentes mexendo no mesmo lugar ao mesmo tempo se atropelam —
como duas pessoas editando o mesmo documento sem perceber.

A solução foi dar à trilha do satélite uma cópia própria do projeto. Ela pôde trabalhar sozinha e
o resultado foi juntado depois.

*Se estivesse errado:* se a junção desse problema, perderia-se uma função que gera um relatório em
texto. Nenhum número e nenhum dado do banco seriam afetados.

### Dois arquivos vazios criados a mais

O plano mandava configurar o sistema de testes apontando para duas pastas que **ainda não
existiam** — uma delas só nasceria dez tarefas depois. O programa de testes não avisa que a pasta
falta: ele simplesmente se recusa a rodar.

Criar os dois arquivos vazios resolveu, e manteve os testes rodando desde o primeiro dia.

*Se estivesse errado:* dois arquivos vazios sobrando no projeto.

---

## 2. Quando o plano estava errado

Um plano é um argumento, não uma ordem. Cinco vezes ele estava errado e foi corrigido.

### O falso alarme do Earth Engine

A primeira tarefa voltou dizendo que o acesso às imagens de satélite não estava autorizado. Se
fosse verdade, a trilha inteira do satélite estaria bloqueada.

Não era verdade. O acesso funcionava perfeitamente — **o teste é que estava quebrado**. Ele
procurava o arquivo de configuração de um jeito que não funciona quando o programa é executado de
uma forma específica, e o erro que aparecia não dizia nada disso. Bastou apontar o caminho do
arquivo explicitamente.

*Se estivesse errado:* nada. Se o arquivo realmente não estivesse lá, o teste voltaria a acusar —
o mesmo resultado de antes, sem perda.

### Não apagar e refazer o ambiente de trabalho

O plano mandava recriar do zero o ambiente onde os programas rodam. Antes de obedecer, conferiu-se
o que havia ali: **todas** as bibliotecas necessárias, nas versões certas, mais três que tarefas
futuras precisariam. Refazer do zero derrubaria justamente essas três e quebraria quatro tarefas
adiante.

*Se estivesse errado:* se o ambiente estivesse sutilmente quebrado, isso apareceria no primeiro
teste seguinte, e refazê-lo custa dois minutos.

### A lista de versões passou a dizer a verdade

O plano fixava versões de bibliotecas que **ninguém tinha testado** — três das quatro estavam
diferentes do que rodava de verdade. Uma lista assim é pior que nenhuma: quem instalasse o projeto
do zero para a apresentação receberia versões nunca exercitadas.

Foi alinhada ao que estava realmente em uso, e uma biblioteca que o plano listava mas ninguém usava
foi removida.

*Se estivesse errado:* se algum código futuro precisar dela, o erro aparece alto e na hora, e
recolocar a linha leva dez segundos.

### O script que avisa, além de aprovar ou reprovar

O plano dizia que cada linha do script de conferência começaria com "OK" ou "FALTA". Mas o próprio
plano, duas páginas depois, mostrava linhas de "AVISO" como resultado esperado. Contradição interna.

Decidiu-se a favor do AVISO, porque é ele que faz uma configuração ausente do satélite **não
bloquear** o trabalho principal — que é exatamente a regra que a spec exige.

*Se estivesse errado:* se algum dia alguém escrever um programa que lê essa saída de forma rígida,
ele erraria em quatro tipos de linha. Ninguém escreveu.

### O diário nomeia sempre o passo anterior

Cada tarefa escreve uma linha num diário, com a data e o código da versão. Descobriu-se que **toda
linha nomeia a versão anterior, não a dela** — porque a linha é escrita antes de a versão ser
registrada.

Reordenar os passos de vinte tarefas por causa disso não valia. Em vez disso, a última tarefa
corrigiu a primeira linha e acrescentou uma frase no topo explicando a convenção.

*Se estivesse errado:* o diário fica com códigos deslocados em uma posição. Cosmético, sem efeito
em nenhum número.

---

## 3. Quando um limite foi declarado em vez de escondido

Este é o grupo que mais define o projeto. Toda vez que apareceu uma limitação, a escolha foi
**mostrá-la**, não maquiá-la.

### O vão de 2 km onde a rodovia não foi medida

Uma métrica de qualidade mostrava 100% de acerto, mas uma medição mais rigorosa acusava folga em 70
polígonos. Investigando, a causa é física: **a Motiva não levantou nenhum marco por 2 quilômetros
seguidos**, entre o km 23,67 e o km 25,73. Ali o sistema traça uma linha reta entre dois pontos, mas
a estrada real faz curva — e a linha reta é mais curta que a estrada. Dos 70 polígonos com folga,
54 caem exatamente nessa faixa.

Não havia o que apertar no código: ele está fazendo o melhor possível com os marcos que existem.
Então a decisão foi publicar a métrica rigorosa **ao lado** dos 100%, para a folga não ficar
escondida atrás de um número bonito, e declarar no relatório que cerca de 5 dos 60 segmentos têm
atribuição menos confiável.

### Os 6 segmentos sem dado de roçada

Seis marcos aparecem com traço na tabela — não têm polígono de roçada. Estava lá, mas só quem
varresse uma tabela de 60 linhas perceberia. Outras duas limitações já tinham ganhado cada uma sua
frase; essa não tinha nenhuma. Ganhou.

*Se estivesse errado:* uma frase a mais num relatório.

### Os buracos nos polígonos

Os polígonos que marcam a área a roçar têm buracos no meio — trechos que não se roça. Descobriu-se
que o programa lia só a borda externa e **ignorava os buracos**. E não era detalhe: 49 dos 642
polígonos têm buraco, e os buracos somam **12,5% da área total**.

O cálculo de área já estava certo (vinha pronto do arquivo). O que estava errado era o **desenho**
usado como máscara do satélite — e uma máscara 11% maior que o real inclui asfalto, que é
exatamente a contaminação que a máscara existe para evitar.

Cuidado importante: não bastava jogar os buracos junto com as bordas, porque do jeito que o programa
monta as formas, os buracos virariam área **somada** em vez de subtraída — pior que ignorá-los.
Por isso foram guardados num campo separado.

### Vírgula em vez de ponto

Um texto novo do relatório escrevia "23.67" com ponto, enquanto o resto do documento usa vírgula.
Normalmente isso ficaria para o fim, mas eram **as mesmas linhas** que já seriam editadas, e o
documento vai para um cliente brasileiro. Foi junto.

---

## 4. Quando os testes não protegiam nada

Três vezes seguidas o mesmo padrão: o programa estava **certo**, mas o teste não perceberia se ele
deixasse de estar. Um teste assim dá uma falsa sensação de segurança.

### Testes que eram verdadeiros por construção

Um teste comparava um resultado com a própria coisa de onde ele saiu — sempre passa, não afirma
nada. Outro usava uma margem de erro de 20 metros, frouxa o bastante para deixar passar um defeito
real. E um método importante, usado para posicionar 642 polígonos, não tinha teste nenhum.

### O arredondamento silencioso

Uma função que lê as planilhas transformava o número 2,9 em 2 sem avisar. Nas planilhas de hoje isso
nunca acontece — mas **essa mesma função vai ler as planilhas futuras da Motiva**, que ninguém
auditou. Passou a recusar o valor em vez de arredondar.

### A partir da Tarefa 5, mudou o processo

Depois de ver o mesmo padrão duas vezes, todo pedido de trabalho seguinte passou a incluir uma
instrução: *antes de implementar, procure no teste que o plano mandou escrever três coisas — uma
afirmação que é sempre verdadeira, uma margem frouxa demais, e um método sem teste nenhum. Reforce
e relate.*

Rendeu logo na primeira aplicação.

*Se estivesse errado:* alguns testes a mais do que o plano pediu. Barato perto de descobrir o
problema depois.

### O vazio e o nulo que viram a mesma coisa

Um revisor mostrou que ao salvar e reler um arquivo de planilha, "não observado" e "observado vazio"
viram a mesma coisa. Real e bem achado — mas foi verificado um por um que **todos** os pontos do
programa que leem esses arquivos já tratam os dois casos igual, e que no significado do negócio eles
querem dizer a mesma coisa mesmo. Não mexer.

*Se estivesse errado:* se alguma tarefa futura precisar distinguir os dois, o dado não volta.
Nenhuma precisa.

---

## 5. Quando eu mesmo errei

### Um diagnóstico do satélite que estava pela metade

A medição de nuvem no satélite estava dando valores negativos — impossível. Foi identificada uma
causa, corrigida, e anunciada como resolvida.

**Continuou errado.** Ao investigar de verdade, havia **dois** defeitos, não um, e o que tinha sido
corrigido era o menor dos dois. O erro de método foi generalizar a partir de uma única amostra
medida com uma ferramenta diferente da que o programa realmente usa.

O defeito principal: o programa pedia várias estatísticas de uma vez, e a contagem de pixels que
vinha nesse pacote **não era a contagem de pixels válidos** — inflava entre 1,8 e 2,8 vezes. Pior:
esse número errado não afetava só a nuvem, ia também para o banco de dados.

Os dois foram corrigidos, e a correção do diagnóstico foi comunicada explicitamente.

*Se estivesse errado:* nenhum número de produção dependia disso — só a trilha do satélite.

### Um número passado adiante sem conferir o denominador

Na última noite, uma revisão apontou que "39 de 195 pares (16%)" vinham de faixas fora de escopo.
Esse número foi repassado sem verificar de onde vinha.

Estava errado. O 39 é a contagem sobre os **248** pares totais — e 39 dividido por 248 dá justamente
16%, que foi o que disfarçou o erro. Sobre os 195 pares da validação, são **29 (15%)**.

Quem pegou foi o próprio trabalho de conserto, porque o pedido dizia explicitamente: *se discordar
de algum item, diga por quê em vez de fazer errado.*

---

## 6. A última noite: a revisão que quase deixou passar

Depois das 23 tarefas, uma revisão final olhou o trabalho inteiro com uma pergunta diferente: não
"cada pedaço está certo?", mas "o conjunto se sustenta, e é honesto?".

### O arquivo que chamava de "vigente" o que tinha sido rejeitado

Durante o projeto foi testado um fator de ajuste do modelo (1,15), medido contra uma metade separada
dos dados, e **rejeitado** — ele piorava o resultado. O sistema ficou com 1,0, e o 1,15 guardado como
inativo.

Só que o arquivo que guarda os resultados continuou gravando **1,15 como "vigente" e "final"**, e o
documento de pesquisa citado pelo relatório dizia a mesma coisa — o contrário do que o relatório
afirma. O cenário verdadeiro estava escondido num campo de nome secundário.

Que isso morde de verdade ficou provado na prática: ao recalcular um número a partir do campo de
nome óbvio, saiu o resultado do cenário rejeitado. Duas pessoas caíram nessa armadilha no mesmo dia.

### O "±1,5 cm" que nunca foi medido

O relatório dizia que o modelo "acerta a altura a menos de um centímetro e meio para cada lado".
Isso **nunca foi medido**. Os 2,91 cm citados são a faixa de incerteza que o modelo declara **de si
mesmo** — é o modelo dizendo que está confiante, não uma medida de quanto ele erra. Erro de altura
não existe neste projeto, porque o campo mediu classes ("baixo, médio, alto"), não centímetros.

Essa manchete tinha sido escolhida por você. A decisão não foi reverter a escolha, e sim **torná-la
defensável**: manter os 2,91 cm com o rótulo correto e acrescentar o que dá para medir — em 192 dos
195 casos, a altura prevista cai dentro da faixa da classe observada ou a menos de 1,5 cm dela.

Foi a **quinta** vez que o projeto se pegou exagerando, e a primeira que ia chegar ao documento do
cliente.

### As sete perguntas de um examinador hostil

A revisão simulou alguém que sabe estatística e quer achar o ponto fraco. Três perguntas o relatório
não sobrevivia; duas sobrevivia pela metade; duas sobrevivia bem.

A decisão foi incorporar **as sete**, não só as que falhavam — porque três delas **fortalecem** o
resultado e estavam de fora só por esquecimento. A mais importante: excluindo os trechos onde o solo
foi chutado em vez de medido, a precisão **cai** para 48,9%. O modelo é pior onde o solo é conhecido.
Esse é o sentido honesto, e ele mata o argumento "seu número está escorado num palpite".

### Não esperar as 06:00

Todo dia às 06:00 um processo automático roda sozinho contra o banco real. Depois de todas as
mudanças, a primeira execução seria na manhã da apresentação.

A decisão foi **disparar antes, à mão**, para transformar uma execução desacompanhada em uma
supervisionada — 36 horas de margem para reagir em vez de 3.

**Pagou.** Duas execuções seguidas perderam a mesma metade da rodovia por falha de conexão. Não era
passageiro: a segunda consulta de cada rodada é estrangulada porque o servidor do GitHub tem
endereço compartilhado por muita gente.

O prejuízo era alto e silencioso. A busca pega clima **e** solo juntos, então o erro do clima
derrubava a metade inteira — 30 trechos que **já tinham o solo guardado no banco** e só precisavam
do clima. O painel os mostrava como "sem previsão nova", confundindo falha de rede com falta de
levantamento.

A causa era uma assimetria que ninguém tinha notado: a busca do solo **já tentava três vezes** antes
de desistir, com um comentário explicando por quê; a busca do clima não tentava nenhuma. Foi
espelhado o mesmo comportamento.

Depois do conserto, rodando de novo: as duas metades resolvem, o resultado é exatamente o previsto,
zero escritas, zero erros.

*Se isso tivesse acontecido às 06:00 do dia 16, apareceriam 34 trechos com agenda velha e ninguém
saberia por quê, uma hora antes da apresentação.*

### As duas decisões menores da mesma noite

**Os dois itens deixados em aberto foram decididos, não empurrados.** Uma leitura sem paginação num
script interno: **carregar** — sem risco antes de 16/09, e se um dia falhar, falha alto e vermelho em
vez de mentir em silêncio. Uma frase na tela dizendo que o modelo "prevê a altura dentro de poucos
centímetros": **corrigir**, contra o parecer de quem fez o conserto. Tirar o exagero do relatório e
deixá-lo na tela que o cliente vai olhar seria mudar o problema de lugar, não resolver.

---

## O fio que liga tudo

Lendo as 24 de uma vez, aparece um padrão só:

**Toda vez que havia a escolha entre um número bonito e um número verdadeiro, foi escolhido o
verdadeiro** — e, quando o verdadeiro era feio, ele foi explicado em vez de escondido.

O resultado final do projeto é desconfortável: o modelo acerta 60,5% e a aposta mais preguiçosa
possível ("nada muda em sete dias") acerta 83,1%. O satélite não achou nada, duas vezes.

Esses números estão no relatório do jeito que saíram. O que os torna úteis não é serem bons — é
serem **medidos**, pela primeira vez, contra grama de verdade. Antes disso, a precisão anunciada
pelo produto vinha de dados inventados por computador.

Cinco vezes ao longo de três dias o projeto se pegou afirmando mais do que tinha medido. Cinco vezes
corrigiu. É essa a razão de confiar no que sobrou.
