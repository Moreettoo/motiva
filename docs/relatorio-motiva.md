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
| 4 | "Nas rodovias encontramos variabilidade imensa de solos e espécies, o que torna a tarefa de predição muito complexa" | Solo: 43 dos 60 marcos vêm do SoilGrids (fertilidade e capacidade de água por coordenada); os 17 restantes (28%) usam uma premissa regional, declarada como tal — nunca escondida atrás de um número que parece medido. Espécie: braquiária é a premissa declarada para o Rodoanel inteiro; não foi medida em campo, e a seção 4 mostra que essa premissa decide o resultado inteiro. |
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
95%, calculados sobre as contagens acima) nem se sobrepõem quase: 53%–67% contra 77%–88%. O `J`
(fração de transições detectadas menos fração de alarmes falsos) do modelo é **negativo**
(−0,024): ele erra mais alarmes falsos, proporcionalmente, do que acerta transições reais. Isso
não é uma leitura favorável, e não estamos escrevendo de outro jeito.

Por classe (mesma validação, `ia.validacao_pares`, conferido ao vivo): classe 1 = 77 de 130
(59,2%, IC 50,3%–67,8%); classe 2 = 31 de 52 (59,6%, IC 45,1%–73,0%); classe 3 = 10 de 13 (76,9%,
IC **46,2%–95,0%**). O número da classe 3 parece o melhor dos três, mas **13 observações não
sustentam uma leitura de 77%** — o intervalo de confiança vai de 46% a 95%, e não deve ser levado
à apresentação sem ele.

**O diagnóstico, que é o achado mais valioso desta semana:** o modelo não erra a altura por
muito. Nos mesmos 195 pares, a banda de incerteza do modelo (q10–q90) tem **largura mediana de
2,91 cm** — ele acerta a altura a menos de um centímetro e meio para cada lado. O problema não é
o modelo prever mal; é a régua de três classes que julga ele. Para quem começou a semana em
classe 1, a mediana das alturas finais previstas fica em **9,93 cm**, a **menos de 1 mm** (0,74
mm, exatamente) da fronteira de 10 cm que separa a classe 1 da classe 2. O modelo está acertando
a altura quase exatamente em cima da linha que decide se ele "acertou" ou "errou" a classe — um
empurrão de menos de um milímetro na fronteira muda o resultado de certo para errado, para dezenas
de trechos ao mesmo tempo. A régua de três classes destrói uma precisão que o modelo já tem.

*(Fontes: `ia.validacoes` id 29 e `ia.validacao_pares` da validação vigente, consultados ao vivo
em 14/09/2026; intervalos de confiança calculados por método exato de Clopper-Pearson sobre as
mesmas contagens, não copiados de nenhum resumo anterior.)*

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

**O teste que importa para operação — detectar quando uma roçada aconteceu — deu nulo.** Entre
13 e 20/03/2026, a queda de NDVI nos 34 segmentos com roçada inferida (mediana 0,014) foi
**idêntica** à dos 10 segmentos sem roçada (mediana 0,014) — p = 0,685. Sem diferença nenhuma.

Isso não ficou como dúvida em aberto: rodamos a série histórica completa do satélite sobre os 54
segmentos — **14.730 observações limpas, 2019 a 2026, 8 anos inteiros** — e testamos um detector
de corte (queda de NDVI ≥ 0,15 em até 12 dias, partindo de NDVI ≥ 0,45) contra as 38 roçadas que
sabemos que aconteceram em março de 2026. Resultado: **2 das 38 detectadas — recall de 5,3%**, com
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
- 53 roçadas inferidas (38 com NDVI válido nas duas datas) é amostra pequena para um detector
  automático — a seção 6 mostra o que acontece quando se tenta mesmo assim, com 8 anos de dados.
- A acurácia não é prometida: é medida, e a linha de base "nada muda em 7 dias" acerta 83,1%
  hoje — mais que o modelo.

Uma nota de transparência sobre este próprio relatório: a versão do sistema hoje em produção
(página `/validacao`) troca a quarta limitação acima por outra, mais específica, sobre os dias
desde a última roçada serem desconhecidos (premissa de 200 dias, testada contra 30 e 60) — uma
substituição consciente feita durante o projeto, não uma perda. As duas limitações são
verdadeiras e as duas estão listadas aqui.

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

Desta lista de 22 tarefas, ficam ainda abertos, registrados para quem continuar: a regra de
aceitação de calibração da especificação é circular e foi corrigida por decisão humana em
produção (seção 5) — vale reescrever a regra, não só contornar o resultado dela; e a página
`/validacao` não linka para `docs/pesquisa/` como a especificação original previa (seção 7).

**O próximo passo mais barato e com mais efeito prático é este: pedir à Motiva para registrar a
altura da vegetação em centímetros, não em três classes, no próximo levantamento de campo.** A
seção 4 mostra que o modelo já prevê a altura a menos de 1,5 cm de erro para cada lado — o
problema não é o modelo, é a régua de três classes que o julga. Trocar a régua por um número
custa à Motiva o mesmo levantamento de campo que já é feito hoje (marcar "12 cm" em vez de
escolher entre 1/2/3), e muda o que este sistema pode ser avaliado por: de uma classificação que
perde para não fazer nada, para um erro de altura em centímetros que já é pequeno e medido.
