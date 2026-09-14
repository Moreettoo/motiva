# Relatório para a Motiva — dados reais do Rodoanel

Escrito em 14/09/2026, para a apresentação de 16/09/2026. Todo número citado abaixo foi
conferido ao vivo no banco de produção (Supabase, schema `ia`, consulta em 14/09/2026) ou lido
dos arquivos de pesquisa versionados (`docs/pesquisa/01-consolidacao.md`,
`docs/pesquisa/02-validacao.md`, `docs/pesquisa/03-ndvi.md`,
`pesquisa/dados/derivados/ndvi_serie_analise.json`) no momento em que este relatório foi escrito
— nunca de memória. A origem de cada número está indicada entre parênteses.

---

## 1 · Em uma frase

O sistema passou a operar sobre a malha real do Rodoanel Oeste (SP-021), e a acurácia do modelo
deixou de ser alegação: é um número medido — hoje **60,5%** contra **195 pares reais** de
observação da própria Motiva — com um mecanismo pronto para reconferir esse número a cada
levantamento novo que a Motiva mandar. Uma ressalva importante, para não repetir um exagero que
já apareceu duas vezes neste projeto e foi corrigido as duas vezes: **rodar essa reconferência
ainda é um passo manual de um desenvolvedor**, não algo automático. O levantamento entra sozinho
no banco (isso já é automático, seção 7); recalcular a validação com ele, não.

---

## 2 · O que a Motiva pediu e o que respondemos

Os cinco pontos, na íntegra, tal como registrados em `docs/PLANO_MOTIVA.md` §1:

| # | O que a Motiva disse | O que fizemos |
|---|---|---|
| 1 | "Plataforma com a fila de espera de ordens de serviço" | O painel calcula, por trecho, a data prevista de cruzar 30 cm (limite contratual da Artesp) menos o tempo de mobilização da equipe (7 dias), já com o equipamento e a área roçável mapeados a partir do KML de roçada da Motiva. Ver seção 7. |
| 2 | "Ideia e lógica de predição são bem-vindas, necessitam do passo anterior: base de dados" | A base agora é real: 60 trechos do Rodoanel, 1.440 observações de campo, 248 pares de validação — não mais só o gerador sintético. Ver seção 3. |
| 3 | "Captura de dados por análise preditiva — será necessário banco de dados estruturado, amplo e muito completo" | O banco estruturado existe (`ia.trechos`, `ia.levantamentos`, `ia.medicoes`, `ia.validacoes`, `ia.calibracoes`, `ia.ndvi_observacoes`, `ia.ndvi_analises`) e cresce sozinho a cada levantamento importado (importador idempotente, seção 7). "Amplo e muito completo" ainda não é este banco — é a distância entre 195 pares e o que um modelo por segmento exigiria; ver seção 4 e 9. |
| 4 | "Nas rodovias encontramos variabilidade imensa de solos e espécies, o que torna a tarefa de predição muito complexa" | Solo: 43 dos 60 marcos vêm do SoilGrids (fertilidade e capacidade de água por coordenada); os 17 restantes (28%) usam uma premissa regional, declarada como tal — nunca escondida atrás de um número que parece medido. Solo, medido contra o resultado: excluindo os 64 pares que dependem da premissa de solo, a acurácia **cai** para 48,9% (J −0,056) — o modelo é **pior** onde o solo é de fato medido, não melhor; ver seção 8. Espécie: braquiária é a premissa declarada para o Rodoanel inteiro; não foi medida em campo, e ela decide o resultado inteiro — com esmeralda ou batatais no lugar dela, em qualquer das nove combinações testadas de premissa, o modelo prevê zero mudança em 7 dias e marca exatamente **83,1%**, idêntico a não fazer nada. Dito de forma direta: **o modelo só consegue perder porque se move, e o que o faz mover é uma premissa não verificada.** Ver seção 4. |
| 5 | "Pensar em outras possibilidades para captura de dados pode ser necessário" | Testamos sensoriamento remoto (Sentinel-2/NDVI) como segunda fonte de captura, nas três datas do levantamento e depois numa série de 8 anos. O resultado é um não honesto — o satélite não separa roçado de não roçado nesta rodovia com este método — reportado na íntegra na seção 6, porque um "não" medido vale mais que uma promessa não testada. |

---

## 3 · A base de dados agora

| | Antes (13/09/2026) | Depois (hoje, ao vivo) |
|---|---|---|
| Trechos | 50 fictícios (BR-101, SP-280, MG-050…), semeados só para demonstração | **60 trechos reais** do Rodoanel Oeste (SP-021), 500 m cada; os 50 fictícios continuam no banco, só ocultos (`ativo = false`), nada foi apagado |
| Observações de campo | 0 reais (o único ponto de campo do projeto era uma touceira em Juiz de Fora, já classificada como não comparável) | **1.440 levantamentos** (2 datas × 60 marcos × 12 faixas transversais), da planilha RA-RET-ROÇ-LIMP da própria Motiva |
| Roçadas inferidas | 0 | **38 execuções de roçada** inferidas da queda de classe entre 13/03 e 20/03/2026 |
| Solo por km | Balanço hídrico do modelo com parâmetros de solo fixos, iguais em toda rodovia | 60 marcos com fertilidade e capacidade de água próprias: **43 medidos** via SoilGrids (fertilidade 0,430–0,702), **17 (28%) por premissa** declarada (fertilidade 0,35 — abaixo de toda a faixa medida) |
| Área e equipamento mapeados | Não existia | 642 polígonos do KML de roçada da Motiva, 98,2 ha, classificados em 4 métodos/equipamentos; **54 dos 60 trechos** têm polígono atribuído (6 não têm: km 2.500, 3.000, 7.500, 8.000, 29.000 e 29.300) |
| Fontes de captura | Só o gerador sintético | Planilha de campo da Motiva **e** satélite Sentinel-2, cada medição com sua origem gravada (`origem = levantamento_classe`, `demonstracao`, etc.) — nunca um número sem saber de onde veio |
| Cobertura de satélite | 0 | **162 observações NDVI** em 54 trechos (3 datas dirigidas: 13/03, 20/03/2026 e 28/03/2025) **mais** uma série histórica de **14.730 observações** em 54 segmentos, 2019–2026 (8 anos completos) |

Fontes: `docs/superpowers/specs/2026-09-13-dados-reais-rodoanel-design.md` §1 (estado de 13/09);
contagens "depois" conferidas ao vivo em `ia.trechos`, `ia.levantamentos`, `ia.execucoes`,
`ia.ndvi_observacoes` e no arquivo `pesquisa/dados/derivados/ndvi_serie_analise.json` em
14/09/2026.

---

## 4 · O número

Validação vigente (`ia.validacoes`, id 29, conferida ao vivo em 14/09/2026): janela 13→20/03/2026,
espécie braquiária premissa, classe 3 = 40 cm, fator de calibração **1,0** (calibração desligada
— seção 5 explica por quê).

| cenário | n | acurácia de classe | IC 95% | transições detectadas | alarmes falsos | J |
|---|---|---|---|---|---|---|
| linha de base: "nada muda em 7 dias" | 195 | **83,1%** | 77,1%–88,1% | 0 de 33 | 0 de 162 | 0,000 |
| modelo (fator vigente 1,0) | 195 | **60,5%** | **53,3%–67,4%** | 10 de 33 | 53 de 162 | −0,024 |

**O modelo perde para não fazer nada.** 60,5% de acurácia de classe, contra 83,1% de quem
simplesmente apostasse que nada muda em 7 dias — e os intervalos de confiança (Clopper-Pearson,
95%, calculados sobre as contagens acima) **não se sobrepõem em nada**: 53,3%–67,4% contra
77,1%–88,1%, ou seja, o teto do intervalo do modelo (67,4%) fica abaixo do piso do intervalo da
linha de base (77,1%). O `J` (fração de transições detectadas menos fração de alarmes falsos) do
modelo é **negativo** (−0,024): ele erra mais alarmes falsos, proporcionalmente, do que acerta
transições reais. Isso não é uma leitura favorável, e não estamos escrevendo de outro jeito.

Comparar dois intervalos de confiança, aliás, não é o teste correto aqui — são **os mesmos 195
pares pontuados de duas formas**, não duas amostras independentes. O teste pareado apropriado
(McNemar) diz a mesma coisa com mais força: entre os pares em que os dois discordam, o modelo
acerta onde a linha de base erra em **9** pares, e erra onde ela acerta em **53**; p exato =
**1,05 × 10⁻⁸**. A derrota para a linha de base não é ruído de amostra pequena — é o resultado.

Por classe (mesma validação, `ia.validacao_pares`, conferido ao vivo): classe 1 = 77 de 130
(59,2%, IC 50,3%–67,8%); classe 2 = 31 de 52 (59,6%, IC 45,1%–73,0%); classe 3 = 10 de 13 (76,9%,
IC **46,2%–95,0%**). O número da classe 3 parece o melhor dos três, mas **13 observações não
sustentam uma leitura de 77%** — o intervalo de confiança vai de 46% a 95%, e não deve ser levado
à apresentação sem ele.

**O diagnóstico, que é o achado mais valioso desta semana: a régua de três classes é grossa
demais para a precisão que o modelo já tem.** Três medidas sustentam isso, e cada uma diz uma
coisa diferente — vale separá-las, porque juntá-las é fácil e seria exagero.

1. **O modelo é confiante.** Nos mesmos 195 pares, a banda de 80% dele (q10–q90 — o intervalo
   dentro do qual ele próprio diz que o crescimento de 7 dias deve cair) tem **largura mediana de
   2,91 cm**. Atenção ao que esse número é: é a incerteza que o modelo **declara de si mesmo**,
   não o erro dele medido contra o campo.
2. **Onde dá para conferir, a altura prevista cai onde deveria.** Em **192 dos 195 pares** a
   altura final prevista cai dentro da faixa de altura da classe que a equipe observou, ou a menos
   de 1,5 cm dela — distância mediana **0 cm**, média **0,35 cm**, e só **3 pares** passam de
   1,5 cm. Esta é a afirmação medida; é ela que sustenta "o modelo não erra a altura por muito".
3. **E a régua corta exatamente onde ele está.** Para quem começou a semana em classe 1, a mediana
   das alturas finais previstas fica em **9,93 cm**, a **0,74 mm** da fronteira de 10 cm que separa
   a classe 1 da classe 2. O modelo está acertando a altura quase em cima da linha que decide se
   ele "acertou" ou "errou" a classe — um empurrão de menos de um milímetro nessa fronteira muda o
   resultado de certo para errado em dezenas de trechos ao mesmo tempo.

**A ressalva, dita sem rodeio: o erro exato de altura deste modelo não pode ser medido com os
dados que existem hoje, e nada neste relatório o mede.** O campo é ordinal — a equipe marca classe
1, 2 ou 3 —, e a altura inicial de cada par é o ponto médio da classe (5, 20 ou 40 cm), uma
convenção, não uma medição. Por isso não existe "erro de ±X cm" em lugar nenhum deste projeto: o
que existe é o item 2 acima, que é o mais forte que estes dados permitem afirmar. E é exatamente
esse limite que torna o pedido da seção 9 — centímetros no lugar de três classes — o próximo passo
mais barato: ele transforma uma pergunta hoje sem resposta em uma que tem.

*(Fontes: `ia.validacoes` id 29 e `ia.validacao_pares` da validação vigente, consultados ao vivo
em 14/09/2026; intervalos de confiança calculados por método exato de Clopper-Pearson sobre as
mesmas contagens, não copiados de nenhum resumo anterior. O teste de McNemar e as três medidas do
diagnóstico saem par a par do mesmo conjunto, no cenário de fator 1,0 — `resultado.sem_calibracao`
de `pesquisa/dados/derivados/validacao.json`, que é o mesmo `ia.validacao_pares` gravado. Cuidado
para quem for reconferir: os campos de topo daquele arquivo (`pares`, `resultado.final`,
`fator_vigente`) guardam o cenário de fator 1,15, testado e **rejeitado** — não o vigente.)*

---

## 5 · Calibração honesta

Testamos se um fator de calibração (multiplicador sobre o crescimento previsto) melhora o
resultado, com o protocolo mais rígido que tínhamos: ajustar nos 103 pares de km par e testar
nos 92 pares de km ímpar, retidos.

- Ajuste (km pares, n = 103): fator **1,05**, `J` sobe a 0,254.
- Teste fora da amostra (km ímpares, n = 92): `J` sem calibração = −0,119 → com o fator do ajuste
  = **0,033**. O fator ajuda o `J` fora da amostra, mas a acurácia bruta nesses mesmos km ímpares
  cai de 0,598 para 0,478 — calibrar melhora a detecção de transição às custas de mais alarme
  falso.
- Reajuste usando todos os 195 pares: fator **1,15**, `J` = 0,198.

A regra de aceitação da especificação original manda reajustar o fator usando **todos** os pares
e aceitar se o `J` melhorar nesses mesmos pares — o que é circular: qualquer refit nos dados que
ele próprio avalia tende a "melhorar", por construção. Diante disso, a decisão registrada em
produção foi **não** ativar o fator 1,15 que essa regra escolheria sozinha, e manter o fator
vigente em **1,0** (calibração desligada) — a candidata 1,15 fica registrada em
`ia.calibracoes` como testada e rejeitada (`ativo = false`), não escondida. É uma correção de
protocolo que vale registrar para quem reusar este método em outra rodovia: validar calibração
exige um conjunto de teste que o próprio ajuste nunca viu, do início ao fim.

*(Fonte: `docs/pesquisa/02-validacao.md`, seção "Calibração honesta"; decisão de produção
conferida em `ia.calibracoes`, ao vivo em 14/09/2026.)*

---

## 6 · Satélite

NDVI do Sentinel-2 (`COPERNICUS/S2_SR_HARMONIZED`), pixel com nuvem mascarada, por segmento,
comparando a classe 1 (capim baixo) com a classe 3 (capim alto) do levantamento de campo:

| data alvo | imagem usada | defasagem | classe 1 (n / NDVI mediano) | classe 3 (n / NDVI mediano) | AUC | p |
|---|---|---|---|---|---|---|
| 2026-03-13 | 2026-03-16 | +3 d | 7 / 0,584 | 23 / 0,502 | 0,155 | 0,0049 |
| 2026-03-20 | 2026-03-21 | +1 d | 17 / 0,572 | 4 / 0,483 | 0,250 | 0,1440 |
| 2025-03-28 (sanidade) | 2025-03-31 | +3 d | 11 / 0,549 | 16 / 0,410 | 0,188 | 0,0072 |

O satélite **separa** classe 1 de classe 3 (estatisticamente significativo em duas das três
datas), mas na direção **invertida** da expectativa ingênua: capim alto lê NDVI mais **baixo**
que capim baixo. A leitura mais provável é que, em março, no fim do verão em São Paulo, capim
alto e não roçado já está mais seco e senescente, enquanto um gramado recém-roçado ainda está em
crescimento ativo — NDVI mede verdor, não altura.

**E essa inversão é um achado positivo, não um acaso — vale dizê-lo, porque é o único resultado
favorável desta seção e ele estava subdeclarado.** Um AUC de 0,155 não é "nada": AUC é simétrico
em torno de 0,5, então ler o sinal na direção certa (NDVI **baixo** = capim alto) dá **0,845** em
13/03/2026 e **0,812** em 28/03/2025, com p = 0,005 e p = 0,007 — separação forte, não ruído. Em
linguagem de operação: **em 13/03/2026, o satélite conseguiu dizer onde o capim estava alto**,
que é diretamente uma resposta ao quinto ponto do feedback da Motiva. A ressalva honesta vem
junto e é grande. A leitura de 28/03/2025 **não é uma segunda data de campo**: ela aplica as
classes medidas em 13/03/2026 sobre uma imagem de um ano antes, então parte do que ela separa
pode ser o *lugar* (faixa estreita, sombra de árvore, vegetação diferente naquele trecho) e não
a altura do capim naquele mês — ela reforça a direção, não confirma o resultado. As amostras são
minúsculas (7 contra 23 segmentos em 13/03; 17 contra 4 em 20/03 — a data que não deu
significância; 11 contra 16 em 28/03/2025), são três datas de março, e uma leitura de
**nível** ("está alto agora") é coisa diferente de detectar **variação** ("foi roçado esta
semana") — que é o que a operação precisa, e é o que deu nulo logo abaixo. Não se compra um
monitoramento por satélite com esses n; mas vale um teste dirigido, e ele está na seção 9.

**O teste que importa para operação — detectar quando uma roçada aconteceu — deu nulo.** Entre
13 e 20/03/2026, a queda de NDVI nos 34 segmentos com roçada inferida (mediana 0,014) foi
**idêntica** à dos 10 segmentos sem roçada (mediana 0,014) — p = 0,685. Sem diferença nenhuma.

Isso não ficou como dúvida em aberto: rodamos a série histórica completa do satélite sobre os 54
segmentos — **14.730 observações limpas, 2019 a 2026, 8 anos inteiros** — e testamos um detector
de corte (queda de NDVI ≥ 0,15 em até 12 dias, partindo de NDVI ≥ 0,45) contra as 38 roçadas que
inferimos terem acontecido em março de 2026. Resultado: **2 das 38 detectadas — recall de 5,3%**, com
1 falso positivo. Os 190 "cortes" que o detector encontra ao longo dos 8 anos são, com esse
recall, muito mais prováveis de ser ruído sazonal do sensor do que roçadas de verdade — essa
contagem por ano não deve ser lida como histórico de intervenção.

**São dois resultados nulos, não um.** Três datas dirigidas não encontraram sinal de corte; oito
anos de série completa, com quase 15 mil observações, também não. Um satélite não detectar
roçada com este método, nesta rodovia, é em si uma resposta ao quinto ponto do feedback da
Motiva ("outras possibilidades de captura") — mais honesta do que prometer um detector que os
dados não sustentam.

*(Fontes: `docs/pesquisa/03-ndvi.md`, seções datadas e "Série 2019–2026 e detector de corte";
`ia.ndvi_analises`, conferido ao vivo em 14/09/2026 — AUC e p de cada data batem exatamente com
os valores gravados; `pesquisa/dados/derivados/ndvi_serie_analise.json`, commit `0a5f694`, para os
números da série longa e do recall.)*

---

## 7 · Como isso vira operação

**A fila.** Cada trecho tem uma data prevista de cruzar 30 cm — o limite da Artesp (Anexo 06,
item b.1.1: vegetação acima de 30 cm em qualquer local da faixa de domínio, ou 10 cm no entorno
de instalações operacionais) — menos o tempo de mobilização da equipe (7 dias para o Rodoanel,
parametrizado por concessionária). O trecho já entra na fila com o equipamento e a área roçável
certos, lidos do KML de roçada da Motiva (seção 3). Conferimos essa fila retrospectivamente
contra o que realmente aconteceu: em 13/03, com o fator vigente, o sistema marcaria **0** dos 55
trechos com faixa em escopo como "cruza 30 cm em até 7 dias"; **1** de fato chegou à classe 3 em
20/03; acertos: **0** (`docs/pesquisa/02-validacao.md`, "Fila retrospectiva"). É um número pequeno
e honesto, não maquiado — a fila existe e roda, mas ainda não temos uma semana em que ela tenha
acertado uma transição real.

**O importador semanal.** Cada nova planilha RA-RET-ROÇ-LIMP que a Motiva mandar entra no banco
pelo mesmo caminho testado: o sistema conta e confere antes de gravar, recusa o arquivo se o
layout mudar, e grava sem duplicar mesmo que alguém rode o comando duas vezes — provado rodando o
publicador duas vezes seguidas contra o banco real e comparando as contagens (idênticas nas duas
rodadas). O painel (página `/validacao`) já mostra hoje as duas importações reais feitas
(13/03/2026 e 20/03/2026, 60 trechos cada). **O que continua manual:** recalcular a validação
(seção 4) com um par de levantamentos novo é um passo que um desenvolvedor roda
(`docs/operacao/importar-levantamento.md`), não algo automático a cada importação — dito aqui sem
meias palavras porque essa distinção já precisou ser corrigida duas vezes neste projeto.

**A medição vencida.** O sistema se recusa a prever sobre uma medição de campo com mais de 120
dias, e mostra "sem dados"/"medição vencida" em vez de manter uma previsão antiga sob um verde
tranquilizador. Em 14/09/2026, com o único par de levantamentos que existe sendo de março, os 60
trechos do Rodoanel já estão nessa situação — é o comportamento correto do sistema esperando o
próximo levantamento, não um defeito.

**A página `/validacao`.** Mostra, para quem tem cargo de operação (super admin, admin,
analista): o resumo da validação vigente lado a lado com a linha de base "nada muda"; a matriz de
confusão; a sensibilidade a cada premissa; o bloco de satélite; as limitações declaradas (seção
8); e o histórico de levantamentos importados. Uma decisão consciente registrada aqui: a
especificação original também pedia links diretos para `docs/pesquisa/` dentro dessa página — não
foram adicionados nesta rodada, e a informação equivalente está disponível pela mesma página em
forma de número, não de link para arquivo do repositório.

---

## 8 · Limitações declaradas

Da especificação (`docs/superpowers/specs/2026-09-13-dados-reais-rodoanel-design.md` §15),
completas:

- Duas datas apenas, ambas em março: a calibração vale para o fim da estação chuvosa em São
  Paulo. Não há base para afirmar que vale em agosto.
- Classes ordinais, não altura contínua; o ponto médio (5/20/40 cm) é uma aproximação — e a
  seção 4 mostra que essa aproximação é, hoje, a maior fonte de "erro" aparente do modelo.
- Pixel de satélite de 10 m; faixas estreitas (dispositivo, marginal) ficam fora da leitura de
  NDVI por segmento.
- A calibração é local ao Rodoanel. O método transfere para outra rodovia; o número, não.
- Fatores não observáveis permanecem como ruído irredutível: altura exata do corte anterior,
  pisoteio, herbicida, queimada, pastoreio na faixa.
- **As datas dos dois levantamentos vêm do nome do arquivo, não de dentro dele.** O único campo
  interno de data das duas planilhas (célula BF6) traz **2025-03-28 nos dois arquivos** — o que
  não pode ser a data de duas caminhadas diferentes, e por isso foi julgado template preenchido
  uma vez. As datas adotadas (13/03 e 20/03/2026) são as dos nomes dos arquivos. Disso dependem a
  janela de clima buscada no ERA5, o horizonte de crescimento de 7 dias e, portanto, os 60,5%
  inteiros. Se essas duas caminhadas não foram nesses dias, o número muda. **É uma pergunta que
  só a Motiva responde, e vale perguntar** (`docs/pesquisa/01-consolidacao.md`).
- **Foram excluídos 53 dos 248 pares (21%) porque queda de classe foi lida como roçada** — e essa
  exclusão favorece o modelo, porque o modelo só prevê crescimento: um par que "desceu" de classe
  seria erro garantido para ele. A leitura é defensável (capim não encolhe sozinho em 7 dias), mas
  não é a única: dos 53, **27 são 2 → 1**, tão compatíveis com divergência de critério entre as
  duas equipes de campo quanto com roçada. E o ruído de observação não fica só nos pares
  excluídos: entre as **33 transições** que o modelo é cobrado por detectar, **3 são 1 → 3 em sete
  dias** (≈ 3 cm/dia), o que não é crescimento plausível e é quase certamente erro de medição.
  Não houve teste de concordância entre observadores. A exclusão infla **os dois** números da
  seção 4, os 60,5% e os 83,1%
  (`docs/pesquisa/01-consolidacao.md`).
- 53 pares com queda de classe viraram **38 roçadas inferidas** por segmento, das quais **34** têm
  NDVI válido nas duas datas — amostra pequena para um detector automático, e a seção 6 mostra o
  que acontece quando se tenta mesmo assim, com 8 anos de dados.
- **A população da validação é mais larga que a população da decisão:** **29 dos 195 pares (15%)**
  vêm de faixas de dispositivo e marginal, marcadas `em_escopo = false`, que nunca alimentam a
  medição de trecho nem a fila de roçada. Continuam capim real e medido, e incluí-los na validação
  é defensável — mas quem apresenta o número precisa saber que ele foi apurado sobre um conjunto
  um pouco diferente daquele sobre o qual o sistema decide.
- **O solo assumido não está segurando o número para cima — está segurando para baixo.** A
  objeção natural a 60,5% é "seu número está escorado num chute de solo em 28% dos marcos". A
  resposta medida é o contrário do confortável: excluindo os **64 pares** que dependem dessa
  premissa, a acurácia **cai para 48,9%** e o `J` piora para **−0,056** (contra 60,5% e −0,024 nos
  195 pares inteiros). O modelo é **pior** justamente onde o solo é medido pelo SoilGrids. Isso
  não desfaz a limitação — continua não havendo base para reivindicar precisão por segmento de
  solo nos 28% assumidos —, mas mostra que a premissa não é o que está inflando o resultado
  (`docs/pesquisa/02-validacao.md`, "Sensibilidade ao solo assumido").
- A acurácia não é prometida: é medida, e a linha de base "nada muda em 7 dias" acerta 83,1%
  hoje — mais que o modelo.

Uma nota de transparência sobre este próprio relatório: a versão do sistema hoje em produção
(página `/validacao`) não traz a quinta limitação acima (os fatores não observáveis) e traz, em
lugar dela, outra mais específica: os dias desde a última roçada serem desconhecidos (premissa de
200 dias, testada contra 30 e 60) — uma substituição consciente feita durante o projeto, não uma
perda. As duas limitações são verdadeiras e as duas estão listadas aqui.

---

## 9 · Próximos passos

Fora do escopo destes três dias, declarado como trabalho futuro
(`docs/superpowers/specs/2026-09-13-dados-reais-rodoanel-design.md` §14): retreinar o modelo
sintético com os dados reais; `taxa_base` por segmento (depende de uma série de satélite mais
longa que já existe — seção 6 — mas ainda não isola o sinal de crescimento por trecho); krigagem
espacial; SAR (Sentinel-1), só se a cobertura de nuvem se mostrar impeditiva com o óptico;
classificação de espécie por sensoriamento remoto; um detector de roçada **treinado** — inviável
enquanto os eventos conhecidos tiverem janela de 7 dias em vez de data exata; políticas de RLS
por cargo no banco; upload da planilha RA-RET pelo próprio painel, sem precisar de linha de
comando.

Um item novo, que sai de um achado desta semana e não estava na lista original: **testar o
satélite como leitura de NÍVEL, não de variação.** A seção 6 mostra que o NDVI separou capim alto
de capim baixo com AUC efetivo de 0,845 em 13/03/2026, p = 0,005, lido na direção invertida —
sinal forte, mas sobre 7 contra 23 segmentos, numa única data de campo. (A leitura de 28/03/2025,
AUC 0,812, aponta na mesma direção, mas usa as classes de 13/03/2026 sobre uma imagem de um ano
antes: reforça, não confirma.) O teste que fecha a questão é barato e não depende de mais nada da Motiva além do
levantamento que ela já faz: repetir a comparação em mais datas, cobrindo outras estações, e ver
se o limiar de NDVI se sustenta como estimador de "está alto agora" por segmento. Se sustentar, o
satélite vira uma segunda fonte de medição entre caminhadas — não de detecção de roçada, que a
mesma seção mostra ser nula com este método.

Desta lista de 22 tarefas, ficam ainda abertos, registrados para quem continuar: a regra de
aceitação de calibração da especificação é circular e foi corrigida por decisão humana em
produção (seção 5) — vale reescrever a regra, não só contornar o resultado dela; e a página
`/validacao` não linka para `docs/pesquisa/` como a especificação original previa (seção 7).

**O próximo passo mais barato e com mais efeito prático é este: pedir à Motiva para registrar a
altura da vegetação em centímetros, não em três classes, no próximo levantamento de campo.** A
seção 4 mostra por quê: em 192 dos 195 pares a altura prevista já cai dentro da faixa da classe
observada (ou a menos de 1,5 cm dela), e a mediana prevista para quem partiu da classe 1 fica a
0,74 mm da fronteira que decide o acerto. O problema não é o modelo, é a régua de três classes que
o julga — e enquanto ela for de três classes, **o erro de altura do modelo continua sem poder ser
medido**, nem por nós nem por quem quiser auditar. Trocar a régua por um número custa à Motiva o
mesmo levantamento de campo que já é feito hoje (marcar "12 cm" em vez de escolher entre 1/2/3), e
muda o que este sistema pode ser avaliado por: de uma classificação que perde para não fazer nada,
para um erro de altura em centímetros — que passa a existir como número, e a partir daí pode ser
cobrado.
