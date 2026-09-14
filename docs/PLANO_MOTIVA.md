# Challenge Motiva — Gestão e Monitoramento de Vegetação

> **Handoff para agente de terminal.** Este documento contém todo o contexto,
> os achados da análise exploratória dos dados, o plano de execução e as
> questões em aberto. Foi escrito para que o agente não precise redescobrir
> nada. Leia inteiro antes de começar.

---

## 1. Contexto

### O desafio (briefing FIAP/Motiva, textual)

> "Como podemos monitorar e gerenciar a vegetação de forma mais inteligente,
> utilizando dados e tecnologia para orientar intervenções com maior precisão?"
>
> **O que buscamos:** Soluções que utilizem sensoriamento remoto, análise de
> dados ou inteligência artificial para mapear a vegetação, acompanhar sua
> evolução e indicar o momento ideal de intervenção.
>
> **Impacto esperado:** Monitoramento contínuo do verde · Intervenções mais
> estratégicas · Uso eficiente de recursos · Base de dados consolidada para
> planejamento.

### O feedback que a Motiva deu ao projeto atual

1. Plataforma com a fila de espera de ordens de serviço;
2. Ideia e lógica de predição são bem-vindas, necessitam do passo anterior:
   base de dados;
3. Captura de dados por análise preditiva — será necessário banco de dados
   estruturado, amplo e muito completo;
4. Nas rodovias encontramos variabilidade imensa de solos e espécies, o que
   torna a tarefa de predição muito complexa;
5. Pensar em outras possibilidades para captura de dados pode ser necessário.

### Objetivo final

Prever, para cada ponto/segmento da rodovia, **o dia ideal de roçada**.

### Ativo já existente (NÃO reconstruir)

Pipeline de ML de crescimento de vegetação, desenvolvido anteriormente:

- `gerador_v3_sigmoide.py` — gera dados sintéticos com rebrota sigmoide,
  balanço hídrico FAO e clima real da API Open-Meteo (ERA5).
- `treinar_modelo.py` — regressão quantílica (q10/q50/q90), salva `.pkl`.
- `preencher_features.py` — busca clima automaticamente.
- Três espécies parametrizadas: braquiária (*Brachiaria brizantha*),
  esmeralda (*Zoysia japonica*), batatais (*Paspalum notatum*).
- Parâmetros de alta sensibilidade: `taxa_base` e `altura_max`.
- Correção de temperatura já aplicada: `Teff = 0.65·tmed + 0.35·tmax`
  (resposta C4 com pico vespertino).

**Status do modelo:** funciona, mas nunca foi validado contra dado real.
Única observação de campo existente (Juiz de Fora/MG): braquiária cortada a
10 cm cresceu 7 cm em 4 dias; o modelo subestimou. Uma observação não permite
calcular viés.

---

## 2. O problema central, em uma frase

O dataset de 1 milhão de linhas é **sintético e nunca foi confrontado com a
realidade**. Por isso a banda de erro é ampla e não informativa: q10/q90 medem
dispersão *dentro* da simulação, não a distância entre a simulação e o campo.

**O dataset sintético não deve ser descartado.** Ele muda de papel: deixa de
ser "a base de dados" e passa a ser o **prior físico** que as observações reais
calibram. A sigmoide fornece a *forma* da curva; as observações ajustam os
*parâmetros* (`taxa_base`, `altura_max`). Calibrar 2–3 parâmetros com dezenas
de observações é viável; aprender a função inteira do zero não seria.

---

## 3. Os dados fornecidos pela Motiva

Arquivo: `Arquivos_-_Dados_challenge_MOTIVA__1_.7z` (7,7 MB)

```
Arquivos - Dados challenge MOTIVA/
├── 01. Rodovia Motiva - Rodoanel/
│   ├── classificacao_rocada.kmz          (1,9 MB — na verdade é KML puro)
│   └── Marco km_rodoanel 2.kmz           (3 KB — KMZ real, zip)
├── 02. Dados Gestão verde - Atual/Retigrafico/
│   ├── RA-RET-ROÇ-LIMP-2026-03-13.xlsx   (121 KB)
│   └── RA-RET-ROÇ-LIMP-2026-03-20.xlsx   (121 KB)
├── 03. Obrigações Contratuais/
│   ├── ANTT/Programa de Exploração da Rodovia - PER - Volume I…pdf
│   └── Artesp/LOTE 2 - Anexo 06 - Serviços de Conservação…pdf
└── Inovação Aberta_FIAP_04.26.pdf        (briefing do desafio)
```

**Rodovia:** SP-021 — Rodoanel Oeste (Mário Covas), km 000+000 ao km 029+300.
Extensão ~29,3 km. Região metropolitana de São Paulo.
Bbox aproximada: lat −23,6284 a −23,4080 · lon −46,8302 a −46,7294.

> **Restrição importante:** não é possível pedir dados adicionais à Motiva.
> Trabalhar exclusivamente com o que está no pacote.

### 3.1 Planilhas de levantamento de campo (o ativo mais valioso)

Duas datas, **7 dias de intervalo**. Aba única: `ROÇADA`.

**Estrutura:**
- Linha 9: cabeçalho de km, colunas F até BM (índices 6..65) = **60 marcos**,
  de 0 a 29.300 m, passo de 500 m (o último é 29.300, não 29.500).
- Coluna B: nome da faixa transversal. Linha 26 = TOTAL (ignorar).
- Colunas C/D/E: proporções de nível 1/2/3 já calculadas (derivadas, ignorar).

**Legenda das classes (linha 6):**

| valor | significado |
|---|---|
| `1` | h < 10 cm |
| `2` | 10 cm ≤ h ≤ 30 cm |
| `3` | h > 30 cm |
| `X` | N/A (faixa não existe naquele km) |

**Mapa linha → faixa, com contagem de pares válidos nas duas datas:**

| linha | faixa | pares válidos |
|---|---|---|
| 10 | CANT. DISPOSITIVO EXT. | 11 |
| 11 | CANT. MARGINAL EXTERNA | 8 |
| 12 | MARGINAL EXTERNA | 0 (toda N/A) |
| 14 | CANT. LATERAL EXTERNA | **55** |
| 15 | PISTA EXTERNA | 0 (toda N/A) |
| 17 | CANT. CENTRAL EXTERNA | **51** |
| 18 | CANT. CENTRAL INTERNA | **48** |
| 19 | PISTA INTERNA | 0 (toda N/A) |
| 21 | CANT. LATERAL INTERNA | **55** |
| 22 | MARGINAL INTERNA | 0 (toda N/A) |
| 24 | CANT. MARGINAL INTERNA | 9 |
| 25 | CANT. DISPOSITIVO INT. | 11 |

**Total: 248 pares de observação válidos.**
As 4 faixas em negrito concentram 209 deles (84%).

### 3.2 A matriz de transição — o achado que destrava o projeto

Cruzando 13/03 → 20/03 (7 dias):

| transição | n | leitura |
|---|---|---|
| 1 → 1 | 130 | estável |
| 1 → 2 | 30 | **cresceu** |
| 1 → 3 | 3 | **cresceu** |
| 2 → 1 | 27 | **roçada ocorreu** |
| 2 → 2 | 22 | estável |
| 3 → 1 | 22 | **roçada ocorreu** |
| 3 → 2 | 4 | **roçada ocorreu** |
| 3 → 3 | 10 | estável |

**Resumo:** 33 cresceram (13%) · 53 foram roçados (21%) · 162 estáveis (65%).

Isso significa que já existem, no pacote:
- **195 segmentos** onde só houve crescimento natural → base de validação do
  modelo preditivo.
- **53 eventos de roçada** com localização conhecida e janela temporal de
  7 dias → gabarito para calibrar detecção por satélite.

### 3.3 `classificacao_rocada.kmz` — método de roçada, NÃO espécie

⚠️ **Apesar do nome, não contém informação de espécie de vegetação.**
Classifica o **método/equipamento** exigido em cada polígono.

- 642 polígonos, área total **981.817 m² (98,2 ha)**
- Campo `<description>` = marco de KM (0 a 28)
- Campo `<name>` = a classe real

| classe | área | % | n |
|---|---|---|---|
| Spider, Giro-Zero ou Trator com trincheira | 66,4 ha | 67,6% | 180 |
| Apenas manual | 27,4 ha | 27,9% | 342 |
| Trator com braço articulado | 4,1 ha | 4,2% | 106 |
| Spider, com ancoragem | 0,2 ha | 0,3% | 14 |

**Uso:** alimenta a fila de ordens de serviço (qual equipamento + quanta área).
"Spider com ancoragem" e "trincheira" indicam declividade alta — proxy útil
de terreno.

### 3.4 `Marco km_rodoanel 2.kmz`

30 placemarks, **apenas coordenadas** — sem `<name>`, sem `ExtendedData`.
É o que georreferencia as planilhas (que só têm km, sem lat/lon).

### 3.5 Obrigação contratual — define o alvo da predição

**PER da ANTT, item 6:**

> "Ausência de vegetação rasteira com comprimento superior a **30 cm** nos
> demais locais da faixa de domínio numa largura mínima de 4 m, e nos bordos
> internos das curvas, com largura suficiente para assegurar adequada
> visibilidade."

**30 cm é exatamente a fronteira da classe 3 da planilha.** Isso não é
coincidência — o formulário de campo foi desenhado em cima do contrato.

**Consequência para o modelo:** o alvo não é "prever altura em cm". É
**prever a data em que o segmento entra na classe 3** (= não-conformidade
contratual). O `.pkl` continua entregando cm; aplica-se o threshold de 30 cm
por cima.

**Definição operacional de "dia ideal de roçada":**

```
dia_ideal = data_prevista_de_cruzar_30cm − tempo_de_mobilização_da_equipe
```

- Roçar cedo demais → desperdício (corta capim baixo).
- Roçar tarde demais → não-conformidade contratual.

**Saída final não é uma data isolada, é uma FILA:** cada segmento com sua
data prevista, ordenado por urgência, já com equipamento (do §3.3) e área em m².
Isso responde diretamente ao ponto 1 do feedback da Motiva.

---

## 4. Armadilhas técnicas já mapeadas

> Todas foram descobertas na análise exploratória. Não perca tempo
> redescobrindo.

### 4.1 `classificacao_rocada.kmz` não é um ZIP

Apesar da extensão `.kmz`, é **XML/KML puro**. `zipfile` e `unzip` falham.
Abrir direto com `xml.etree.ElementTree`.
(O `Marco km_rodoanel 2.kmz` **é** um zip de verdade, com `doc.kml` dentro.)

### 4.2 Os nomes de campo do Schema estão deslocados em uma posição

O `<Schema>` declara `classe, KM, Latitude, Longitude, Area_m2`, mas os
`<SimpleData>` gravados contêm outra coisa. Mapeamento **real**:

| `name=` do SimpleData | conteúdo real |
|---|---|
| `classe` | **latitude** |
| `KM` | **longitude** |
| `Latitude` | **Area_m2** |

E a classe verdadeira está na tag `<name>` do Placemark; o KM está em
`<description>`. Não confie nos nomes dos campos.

### 4.3 Os marcos de km estão fora de ordem no arquivo

Os índices 28 e 29 (últimos do arquivo) **não são outliers** — são os marcos
que preenchem as lacunas da sequência:

- índice **29** (−23.460578, −46.794858) entra **entre os índices 7 e 8**
- índice **28** (−23.484169, −46.803521) entra **entre os índices 9 e 10**

Ordem correta: `[0..7] + [29] + [8, 9] + [28] + [10..27]`

Com essa ordem, os 30 marcos somam **29.025 m**, coerente com os 29,3 km da
rodovia. Resta **uma única lacuna real** entre os índices 22 e 23 (2.042 m —
falta um marco ali). Os marcos ficam a ~1 km; as colunas da planilha estão a
cada 500 m → é preciso **interpolar** para obter lat/lon de cada segmento.

### 4.4 Discrepância de datas — não resolvida

Os nomes dos arquivos dizem **2026-03-13** e **2026-03-20**, mas o campo
"LEVANTAMENTO DE CAMPO" **dentro das duas planilhas** diz **2025-03-28**.
O ID do formulário é `RA-ROÇ-LIMP-2024-12-6-R00`.

Provavelmente campo de template não atualizado, mas isso **importa** na hora
de casar com a passagem do satélite. **Decisão recomendada:** adotar as datas
dos nomes de arquivo (13 e 20 de março de 2026), documentar a inconsistência
como limitação, e verificar se a série de NDVI é coerente com uma ou outra
hipótese (isso pode inclusive resolver a ambiguidade empiricamente).

### 4.5 Classe 1 é um intervalo aberto embaixo

`1` = "h < 10 cm" não distingue 2 cm de 9 cm. Um segmento `1 → 1` pode ter
crescido 7 cm ou 1 cm. Por isso:

- Adotar ponto médio por classe como altura estimada: **5 / 20 / 40 cm**
  (o 40 é arbitrário — classe 3 é aberta em cima; documentar a escolha).
- **A informação está nas transições.** Os 33 que mudaram de classe carregam
  mais sinal que os 162 estáveis, porque neles sabe-se que o crescimento
  cruzou uma fronteira conhecida. Concentrar a análise ali.

### 4.6 Faixa transversal × pixel de satélite

As faixas são posições **transversais** (canteiro central, lateral externa,
marginal…). O pixel do Sentinel-2 tem **10 m**. Várias faixas cabem no mesmo
pixel, e asfalto (NDVI baixíssimo) contamina.

**Escopo realista:** começar por CANT. CENTRAL (EXT/INT) e CANT. LATERAL
(EXT/INT) — as mais largas e as que têm mais dados (209 dos 248 pares).
Declarar dispositivo/marginal como fora do escopo.

### 4.7 Correção sobre o arquivo Sentinel-2

O Sentinel-2A subiu em 2015, mas a revisita de 5 dias só existe após o 2B
(2017), e a coleção de **refletância de superfície** (necessária para NDVI)
começa em 2017 e só fica consistente de 2018/2019 em diante.

**Arquivo realmente utilizável: ~6–7 anos, não 10.** (Se em algum ponto do
projeto aparecer a afirmação "10 anos de histórico", está errada.)

### 4.8 Máscara de nuvem não é opcional

NDVI sem mascarar nuvem é lixo. Março em São Paulo é fim de estação chuvosa —
**pode não haver imagem limpa nas datas exatas**.

Mitigação: aceitar a passagem mais próxima dentro de **±3 dias** e registrar
a defasagem. Se nem assim houver imagem, **isso é um resultado legítimo** —
"cobertura de nuvem inviabilizou a validação nas datas disponíveis" justifica
SAR (Sentinel-1) como trabalho futuro.

---

## 5. Setup do Google Earth Engine

Fazer **antes** de começar os dias de trabalho (leva ~10 min).

1. Acessar `https://console.cloud.google.com/earth-engine/configuration`
2. Login Google → "Get Started" no painel de elegibilidade não-comercial
3. Uso **não pago** → tipo de projeto **Academia & Research**
4. Preencher o formulário → o sistema confirma elegibilidade → descrever o
   trabalho → registrar → habilitar a API
5. Tier: **Community** (150 EECU-hours/mês). Suficiente com folga.
   - **Não** escolher Contributor (exige conta de faturamento).
   - **Não** escolher Partner (revisão manual, pode levar semanas).
6. Editor em `https://code.earthengine.google.com/`

**Enquadramento:** registrar como **estudante/trabalho acadêmico da FIAP**,
usando e-mail institucional se houver. As regras de uso gratuito proíbem
entregar resultado pago por contrato de prestação de serviço com empresa.
Challenge de faculdade não é isso, mas **não registrar como trabalho da
empresa empregadora**.

---

## 6. Plano de execução — 3 dias

### Fase 0 — Consolidar os dados (Dia 1, manhã)

**Entregável:** uma tabela georreferenciada única.

1. Parsear os dois `.xlsx` → long format:
   `(faixa, km_m, classe_d1, classe_d2)`
2. Parsear `Marco km_rodoanel 2.kmz`, **reordenar conforme §4.3**, calcular
   km acumulado, **interpolar** para obter lat/lon a cada 500 m.
3. Parsear `classificacao_rocada.kmz` (**respeitar §4.1 e §4.2**), agregar
   por KM: método dominante + área total por classe.
4. Join. Schema sugerido:

```
segmento_id | km_m | lat | lon | faixa | classe_d1 | classe_d2
            | transicao | metodo_rocada | area_m2
```

**Critério de sucesso:** 248 linhas com lat/lon válidos dentro da bbox.

### Fase 1 — Validar o modelo atual (Dia 1 tarde/noite + Dia 2 manhã)

**Este é o resultado central da entrega.** É o que produz, pela primeira vez,
um número de erro real.

1. Buscar clima Open-Meteo para as coordenadas, período 13–20/03.
2. Buscar SoilGrids por coordenada (textura, bdod, soc, pH) — endpoint:
   `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=&lat=&property=&depth=0-5cm&value=mean`.
   Cachear; há rate limit não publicado. Agrupar por km (250 m de resolução
   nativa torna redundante consultar a cada 500 m).
3. Rodar o `.pkl` a partir do estado de 13/03 (altura = ponto médio da classe),
   7 dias de clima real, prever o estado de 20/03.
4. **Filtrar os 53 segmentos roçados** — o modelo não sabe que passou máquina.
   Restam **195**.
5. Reclassificar a saída em 1/2/3 e montar matriz de confusão.
6. Medir viés: o modelo subestima sistematicamente (como em Juiz de Fora) ou
   aquilo foi específico do local?
7. **Calibrar `taxa_base`** para corrigir o viés. Rodar de novo.

**Entregável:** erro antes × depois da calibração. Esse par de números é o
coração do trabalho.

### Fase 2 — Validar sensoriamento remoto (Dia 2 noite + Dia 3)

1. *Hello world* do GEE: NDVI de um ponto só, confirmar auth e API.
2. NDVI dos ~60 segmentos (faixas largas) nas duas datas (±3 dias, §4.8).
3. **Teste-chave:** segmentos em classe 3 têm NDVI significativamente maior
   que os em classe 1?

Se separar → sensoriamento remoto validado **contra verdade de campo da
própria concessionária**. É exatamente o que o briefing pede, e não exige
varrer o histórico para ser afirmado.

### Fase 3 (bônus, se sobrar tempo no Dia 3)

Disparar a varredura da série temporal completa (~6–7 anos) dos 60 segmentos
e **apenas olhar**: aparece padrão de serra (sobe, cai brusco, sobe)?

O processamento é desatendido — dispara e trabalha em outra coisa. Se a serra
aparecer, é histórico de intervenção reconstruído de graça, que atende ao
"histórico de intervenções" citado no briefing.

**Não construir detector de roçada treinado.** Ver §7.1.

---

## 7. O que está FORA do escopo dos 3 dias

Documentar na entrega como **próximos passos** — isso não enfraquece o
trabalho, é o formato normal.

### 7.1 Detector de roçada treinado

**Motivo não é processamento, é rótulo ruim na origem:** os 53 eventos têm
janela de 7 dias, não data. O Sentinel-2 passa a cada 5 dias. Não dá para
ensinar "queda de NDVI nesta data = roçada" sem saber a data. Mais tempo de
compute não resolve isso.

### 7.2 Calibração por segmento (`taxa_base` individual)

Depende de ter as curvas de rebrota extraídas do histórico (§7.1).

### 7.3 Predição da data de cruzar 30 cm em produção

Depende de 7.2. É a Fase 5 do plano completo.

### 7.4 Classificação de espécies

Conceito a **aproveitar sem implementar**: espécies de gramínea C4 são
praticamente indistinguíveis no espectro de uma data isolada. O que as separa
é o **comportamento temporal** — velocidade de rebrota pós-corte, profundidade
da dormência seca, amplitude sazonal.

**Insight central:** não é preciso saber o *nome* da espécie. É preciso saber
o `taxa_base` daquele ponto — e a curva de rebrota entrega isso diretamente,
pulando a classificação. É assim que o ponto 4 do feedback ("variabilidade
imensa de espécies") deixa de ser obstáculo e vira parâmetro medido.

### 7.5 Krigagem / downscaling espacial

Só faz sentido com grade espacial contínua. Aqui trabalha-se com segmentos
discretos. Fora de escopo, provavelmente para sempre neste projeto.

### 7.6 SAR (Sentinel-1)

Entra **reativamente**, se e somente se a cobertura de nuvem se mostrar
impeditiva na Fase 2.

---

## 8. Regras de execução

1. **Não avançar de fase sem fechar e escrever a anterior.** Se o Dia 2
   terminar sem o número de erro calibrado, o Dia 3 vai para terminar aquilo,
   não para o GEE.
2. **Fase 1 sozinha é entrega defensável.** Fase 2 sem Fase 1 é um gráfico de
   NDVI sem modelo, que não responde nada.
3. **Postgres local** para os dados de pesquisa; Supabase só para a aplicação.
   Não deixar o banco de pesquisa virar dependência silenciosa do código de
   produção. Pastas separadas.
4. **Três dias seguidos não rendem uniformemente.** O terceiro dia rende menos
   e é justamente quando as decisões mais delicadas apareceriam. Planejar com
   folga no fim, não com otimismo.

---

## 9. Como cada ponto da Motiva é respondido

| ponto | resposta |
|---|---|
| **1. Fila de ordens de serviço** | Saída do modelo ordenada por data prevista de cruzar 30 cm, com equipamento (§3.3) e área em m² |
| **2 e 3. Base de dados** | Dataset sintético reposicionado como *prior*, calibrado contra 248 observações reais de campo; caminho para expandir via arquivo Sentinel-2 (~6–7 anos) |
| **4. Variabilidade de solos e espécies** | Solo: SoilGrids por coordenada alimentando o balanço hídrico FAO. Espécie: **não é preciso identificar** — a curva de rebrota entrega o `taxa_base` diretamente (§7.4) |
| **5. Outras formas de captura** | Sensoriamento remoto (Sentinel-2), que é textualmente o que o briefing pede |

---

## 10. Limitações a declarar explicitamente na entrega

Declarar antes que perguntem — é mais forte que ser pego.

- **Duas datas apenas, ambas em março.** Toda relação NDVI↔altura calibrada
  vale para o fim da estação chuvosa em São Paulo. Não há base para afirmar
  que vale em agosto.
- **Classes ordinais, não altura contínua.** Classe 1 é intervalo aberto
  embaixo; classe 3, aberto em cima. O ponto médio é uma aproximação.
- **Resolução de 10 m, não métrica.** Faixas estreitas (dispositivo, marginal)
  ficam fora do escopo por pixel misto com asfalto.
- **Calibração é local.** Parâmetros ajustados no Rodoanel não transferem para
  outra rodovia. A **física e o método transferem** — replicar em outra via é
  rodar o mesmo procedimento, não reconstruir.
- **Fatores não observáveis permanecem como ruído irredutível:** altura exata
  do corte anterior, pisoteio, herbicida, queimada, pastoreio na faixa.
- **53 eventos de roçada é amostra pequena.** Suficiente para prova de
  conceito, insuficiente para detector robusto.
- **A acurácia não deve ser prometida, deve ser medida.** A formulação correta
  para a Motiva é: *o sistema passa a ter mecanismo de validação contra
  observação real, e a acurácia deixa de ser alegação para virar número.*

---

## 11. Questões em aberto

Questões que a análise exploratória **não** conseguiu resolver e que o agente
deve decidir ou testar:

1. **Qual data vale** — a do nome do arquivo (mar/2026) ou a do campo interno
   (mar/2025)? §4.4. Pode ser resolvido empiricamente pela série de NDVI.
2. **Qual altura assumir para a classe 3** (aberta em cima)? 40 cm é chute.
   Testar sensibilidade do resultado a esse valor.
3. **Há imagem Sentinel-2 sem nuvem** nas datas ±3 dias sobre o Rodoanel?
   Verificar **antes** de investir na Fase 2.
4. **Largura real do canteiro central do Rodoanel** — determina quantos pixels
   puros existem. Verificável por imagem de alta resolução ou pelos próprios
   polígonos do §3.3.
5. **O modelo atual aceita solo parametrizado como entrada**, ou o balanço
   hídrico FAO está com capacidade de campo/PMP fixos? Se estiver fixo, é
   preciso expor esses parâmetros antes de plugar o SoilGrids. **Verificar no
   código antes de planejar a Fase 1.**
6. **Os 53 segmentos roçados são de fato roçada**, ou parte é erro de
   medição/observador diferente entre as duas semanas? Não há como verificar
   com os dados disponíveis — tratar como premissa declarada.
7. **A espécie do Rodoanel é conhecida?** O `.pkl` foi treinado para três
   espécies específicas. Se a vegetação do Rodoanel não for nenhuma delas, a
   calibração absorve a diferença, mas isso deve ser declarado.
8. **Qual o tempo de mobilização de equipe** a subtrair na fórmula do dia
   ideal? Não está nos dados. Parametrizar e deixar configurável.

---

## 12. Comandos úteis de partida

```bash
# Extrair o pacote (py7zr; não há 7z no ambiente padrão)
pip install py7zr --break-system-packages
python3 -c "
import py7zr
with py7zr.SevenZipFile('Arquivos_-_Dados_challenge_MOTIVA__1_.7z','r') as z:
    z.extractall('./dados')
"

# classificacao_rocada.kmz é KML puro — NÃO é zip
python3 -c "
import xml.etree.ElementTree as ET
ns={'k':'http://www.opengis.net/kml/2.2'}
r=ET.parse('classificacao_rocada.kmz').getroot()
for pm in r.findall('.//k:Placemark',ns)[:3]:
    print(pm.find('k:name',ns).text, pm.find('k:description',ns).text)
"

# Marco km_rodoanel 2.kmz É zip
unzip -o "Marco km_rodoanel 2.kmz" -d marcos/   # → marcos/doc.kml
```

**Dependências:** `py7zr`, `openpyxl`, `pandas`, `requests`, `earthengine-api`,
`geopandas` (opcional), `shapely` (opcional).
