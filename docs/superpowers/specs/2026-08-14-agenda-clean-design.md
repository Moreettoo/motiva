# Agenda clean — design

Data: 2026-08-14 · Escopo: `web/src/app/agenda/`, `analisar_lote.py`, uma migração em `ia.agendamentos`

## O problema

A agenda ficou confusa de operar. A causa não é enfeite: **metade do que ela mostra
não deveria estar lá**, e o resto está dito duas ou três vezes.

Três causas independentes, medidas na base em 2026-08-14:

**1. Metade da fila é trecho que não precisa de nada.** Dos 106 agendamentos em
aberto:

| Risco | Em aberto | `dias_ate_limite` |
|---|---|---|
| crítica | 23 | 0 – 4 |
| alta | 15 | 9 – 19 |
| média | 15 | 26 – 43 |
| baixa | **53** | **54 – 2196** |

Existe agendamento `aprovado` e vencido para trecho a 719 dias do limite, e um a
2196. **27 dos 47 "vencidos"** — o botão vermelho mais forte da tela — são de risco
baixa. O alarme principal da agenda é, na maioria, ruído. Pior: **21 trechos
carregam 77 dos 106**; um único trecho tem **9 agendamentos em aberto**, três têm 7.
(Este último fato tem causa própria e conserto próprio — ver §2b, escrita depois da
verificação.)

**2. O mesmo cartão é desenhado duas vezes.** A "Fila de decisão" mostra todos os
sem-equipe, agrupados em "Vence nesta semana" / "Depois". A linha "Propostas da IA"
mostra os sem-equipe cuja data cai na semana visível — quase exatamente o grupo
"Vence nesta semana", a 30 cm de distância. Pelos cabeçalhos de dia:
**31 cartões duplicados** numa tela.

**3. Onze números antes do quadro.** Cabeçalho (106 / 60 / 10) + chips de status
(59 / 47 / 33 / 59) + faixa de resumo (48 / 178,5 / 8 de 10 / 0), em três escopos
diferentes — malha, malha, semana — empilhados; mais 7 itens de legenda em dois
blocos e 3 frases explicativas. Isso come ~470 px, metade da altura útil, antes de
o quadro começar. `planejamento.tsx` carrega um comentário de 25 linhas ("a REGRA
dos dois grupos") defendendo por que esses números divergem legitimamente. Quando
um layout precisa de um ensaio para não se contradizer, o problema é o layout.

## §1 · A regra: quem tem agendamento em aberto

Uma regra, derivada de `dias_ate_limite` como toda regra de risco do projeto:

| Risco | Prazo | Tem agendamento em aberto? |
|---|---|---|
| crítica | ≤ 7 d | sim, sempre |
| alta | 8 – 20 d | sim |
| média | 21 – 45 d | sim |
| baixa | > 45 d | **não** |

O corte em 45 dias é o `LIMIAR_DIAS` que o `analisar_lote.py` já usa para **criar**.
A mudança é que ele passa a valer também para **fechar**. Hoje vale numa direção
só, e é exatamente por isso que sobrou estoque: nada nunca fechava um agendamento
cujo trecho deixou de precisar dele.

### Histerese: fecha em > 55, não em > 45

Com o mesmo número nas duas pontas, um trecho oscilando entre 44 e 46 dias por
causa de uma medição nova abre e fecha agendamento todo dia, gerando uma linha
`descartado` por dia por trecho. A banda de 10 dias resolve: cria em ≤ 45, fecha em
> 55. Hoje **1** agendamento em aberto está na faixa 46–55, então a banda custa um
cartão e compra imunidade ao tremor da previsão.

## §2 · A limpeza: o que a máquina fecha e o que ela devolve ao gestor

O lote fecha o que o lote criou, e o que é factualmente morto. Não desfaz decisão
humana viva.

| O que | Quantos hoje | Ação |
|---|---|---|
| `sugerido` de trecho baixa | 31 | → `descartado`, automático |
| `aprovado` **vencido** de trecho baixa | 13 | → `descartado`: a data passou e não foi executado; esse plano não aconteceu |
| `aprovado` **futuro** de trecho baixa | 9 | **fica.** Ganha o selo "não é mais necessário" e um descarte de um clique |

Os 9 que ficam não são ruído esquecido — são uma decisão que pertence ao gestor,
tornada visível. Alguém aprovou aquela roçada com a informação de então; a previsão
mudou depois. A tela diz isso e oferece o botão; a máquina não apaga por cima.

`descartado` já é o terminal legítimo do fluxo (`sugerido → aprovado → executado ou
descartado`), então nada é deletado.

Uma migração faz os 44 de hoje. O `analisar_lote.py` passa a aplicar a mesma regra
a cada rodada das 06:00, o que impede o estoque de voltar.

### O efeito na tela

| | Hoje | Depois |
|---|---|---|
| em aberto | 106 | 62 |
| sem equipe | 60 | 34 |
| vencidos | **47** | **20** |
| com data nesta semana | 48 | 25 |

## §2b · Um agendamento aberto por trecho

**Esta seção foi escrita DEPOIS da verificação no navegador, e existe porque a §2
estava errada.** O texto original dizia que "os 21 trechos com 7–9 agendamentos
empilhados colapsam sem uma linha de código de tela". Não colapsam: aquilo é um
defeito próprio, com causa própria, e a limpeza da §2 não o toca.

A tela mostrou: 35 cartões na agenda, **10 rótulos distintos**. Um mesmo trecho —
`BR-101 Rio-Santos km 524,0–527,5` — com **9 cartões idênticos** lado a lado.

A causa está em `analisar_lote.py`: ele **insere uma linha nova a cada rodada**
para todo trecho dentro do limiar, sem nunca olhar se já existe uma aberta. Um
trecho que fica crítico por duas semanas acumula catorze agendamentos. É a mesma
classe de defeito da §1 — nada nunca fecha —, mas do lado da CRIAÇÃO: nada nunca
deduplica. Depois da §2, 12 trechos ainda carregavam de 2 a 9 abertos: **42 linhas
de excesso em 62**.

Na tela isso é a pior espécie de poluição, porque não se lê como dado: nove cartões
iguais parecem defeito de renderização.

### A regra

Um trecho tem **um** agendamento em aberto. Sobrevive o mais recente por
`(criado_em desc, id desc)` — exatamente o critério que `ia.vw_trecho_status` já
usa para eleger "o" agendamento de um trecho. Não é uma escolha nova: é fazer a
agenda concordar com o que `/malha`, `/painel` e o Copiloto já mostravam. A agenda
era a única tela que exibia os perdedores.

**A equipe é herdada antes do descarte**, e a ordem é o ponto: atribuir equipe é
trabalho humano, e o sobrevivente é quase sempre a linha mais nova, criada pelo
lote e portanto sem equipe. Descartar primeiro jogaria fora a alocação de alguém, e
a roçada voltaria para a fila como se ninguém tivesse mexido nela. Nove
sobreviventes herdaram equipe.

No lote, a fronteira é a mesma da §2: `sugerido` é da máquina, então ela ATUALIZA
em vez de duplicar — a previsão de hoje é melhor que a de ontem. `aprovado` é de
quem aprovou: grava a previsão nova e não mexe na data.

### O efeito somado das duas limpezas

| | Antes | §2 | §2b |
|---|---|---|---|
| em aberto | 106 | 62 | **20** |
| trechos com aberto | 50 | 20 | 20 |
| maior pilha num trecho | **9** | 9 | **1** |
| sem equipe | 60 | 34 | **2** |
| vencidos | 47 | 20 | **0** |

"Vencidos: 0" não é maquiagem: os vencidos eram, na maioria, duplicatas antigas de
trechos que já tinham um agendamento fresco. O que sobrou é o plano de verdade.

**Consequência a encarar:** com 20 agendamentos em 20 trechos espalhados por quatro
semanas, o quadro semanal fica bem vazio — quatro serviços na semana visível. Isso
é o estado honesto da base; a "densidade" anterior era o empilhamento. Se a agenda
precisar parecer cheia para demonstração, o caminho é semear serviços em trechos
DISTINTOS com datas escalonadas, nunca restaurar a pilha.

## §3 · O quadro: um protagonista

A página passa a ter **um** objeto — o quadro da semana. Todo o resto é legenda dele
ou sai.

### Sai a faixa de 4 números (`resumo.tsx`, deletado)

- `roçadas planejadas` + `km previstos` → legenda na linha da semana:
  `24 roçadas · 96 km`. É o rodapé do quadro, não um painel de instrumentos.
- `equipes mobilizadas 8 de 10` → **morre**. O quadro já mostra: duas linhas sem
  cartão. Um número que repete o que está desenhado a 10 cm dele não informa.
- `críticos sem data` → só renderiza quando `> 0`. Hoje é 0, então desaparece
  inteiro em vez de ocupar um quarto de faixa dizendo "nada errado".

### Cabeçalho da página: 3 métricas → 1

Fica `34 esperando decisão`. "Em aberto" duplicava os chips de status; "equipes
ativas" duplicava as linhas do quadro.

### Chips de status → um controle

De uma faixa permanente com 4 números para um botão `Status: sugerido, aprovado ▾`
que abre os quatro alternadores com as contagens. Nenhuma função se perde. O
`role` é `menuitemcheckbox` e o menu **não fecha** ao alternar — filtro não é ação
de menu, e fechar a cada clique obrigaria a reabrir para o segundo ajuste.

### Seletor de equipe vai para o cabeçalho do quadro

Ele destaca linhas do quadro, então pertence ao quadro, não a uma faixa de página.

### Duas legendas + 3 frases → uma linha

```
● Crítica  ▲ Alta  ◕ Média │ ▮ com equipe  ▯ sem equipe │ ⚠ acima da capacidade
```

A faixa de risco perde "Baixa": pela §1 ela não pode mais aparecer no quadro. A
frase da hachura sai — o item `⚠ acima da capacidade` diz a mesma coisa, e a
explicação do mini-mapa ("a altura de cada barra é o total de serviços do dia")
sai porque a marca de cor no mesmo token da faixa já é auto-explicativa.

### A linha "Propostas da IA" sai do quadro

É a causa 2. Consequências, todas ditas:

- **O cabeçalho do dia passa a mostrar só `N com equipe`.** Manter `M s/ equipe`
  seria um número sem nenhum cartão para conferir contra — a contradição que
  `dados.tsx` existe para impedir.
- **A pressão de propostas por dia continua legível na banda de cima do
  mini-mapa**, que cobre 28 dias em vez de 7. Ela ganha importância, não perde.
- **O cartão da fila ganha o dia da semana** (`qui 13 · 3,0 km`) para não perder a
  posição no tempo que a coluna dava.
- **Somem com a linha**: `alvoPropostas`/`ehAlvoPropostas`, a recusa "Escolha uma
  equipe — um dia só é marcado com equipe" e a região de foco `"propostas"`.

E some a maquinaria de **gêmeos**, que existia só porque um serviço montava em duas
regiões ao mesmo tempo: `idsNasPropostas`, `idsElegiveisNoTrilho`,
`idAtivoNoTrilho`, o desempate no padrão de `decidirCartaoAtivoTrilho`, e o
`RegiaoFoco` de três valores. Sem duplicação não há gêmeo a desempatar. Isto é o
maior ganho estrutural da mudança: a regra "as Propostas ganham o desempate"
deixa de precisar existir.

## §4 · O cartão: a cor, medida

Hoje o cartão é preenchido com a cor do risco. Com 4 faixas e ~48 cartões na tela,
o quadro é um campo de cor onde nada se destaca porque tudo está pintado.

A primeira ideia — cartão neutro com tarja em `token.cor` — **foi medida e
reprovada**. Contraste da tarja sobre `--surface-2` (`#ffffff`), tema claro:

| | sobre `#ffffff` | veredito |
|---|---|---|
| `--warning` (média) | **1,83:1** | invisível |
| `--serious` (alta) | **2,64:1** | reprova (piso 3:1) |
| `--good` | 3,35:1 | raspando |
| `--critical` | 4,80:1 | passa |

O `globals.css` já avisa: *"no claro, warning e serious ficam abaixo de 3:1 de
propósito"*. O preenchimento suave de hoje não é enfeite — é o que carrega o risco
no tema claro. Então o desenho é:

- **Cartão neutro** (`--surface-2`, borda `--border`), com tarja e ícone em
  **`token.tinta`**, não `token.cor`. Medido: 6,66 – 7,54:1 no claro,
  7,57 – 11,57:1 no escuro. Passa em todas as combinações, nos dois temas.
- **Preenchimento reservado à crítica** (`--critical-soft` / `--critical-ink`, como
  hoje). São 23 cartões, não 106.
- **Vencido** continua com o chip `critical` com ícone e rótulo, que já existe.

O quadro passa a ser um campo neutro com vermelho onde queima. A regra da skill
`dataviz` continua honrada: cor de status nunca sozinha — os três ícones de risco
são formas diferentes (`OctagonAlert`, `TriangleAlert`, `Clock`), e a legenda os
nomeia.

## §5 · Dois defeitos achados na verificação (2026-08-14, depois do resto)

Os dois vieram de uso real da tela, não de leitura de código, e nenhum dos dois
foi introduzido pelas mudanças acima — ambos já existiam.

### §5a · O filtro de status oferecia duas opções mortas

`montarGrade` recebe `visiveis` (o que o filtro deixou passar) e então descartava
tudo fora de `sugerido`/`aprovado`. Marcar "Executado" nunca podia ACRESCENTAR
nada: das quatro opções do menu, duas eram estruturalmente mortas, com a contagem
de cada uma (34 e 145) anunciada ao lado. `?status=executado` deixa os sete dias
em "0 serviços" e a fila ainda afirmava "Nada esperando decisão".

Pista de que era intenção original: `cartao-servico.tsx` tem um estado visual
`encerrado` completo — fundo `--surface-3`, ícone de status, tarja esmaecida —
que era **código morto**, porque nenhum item encerrado chegava a uma célula.

**Correção:** o portão único de status virou **três predicados**, cada um
respondendo ao que de fato governa:

| Predicado | Governa | Executado | Descartado |
|---|---|---|---|
| (nenhum) | desenhar cartão na célula | sim | sim |
| `CONSOME_CAPACIDADE` | a barra de km do dia | **sim** — a equipe passou o dia lá | **não** — não aconteceu |
| `EM_ABERTO` | entrar na fila de decisão | não | não |

As duas opções continuam **desmarcadas por padrão** (`STATUS_PADRAO`), então a
tela abre sem histórico; marcar uma passa a mostrar de fato. `resumo28` e
`diasComExcesso` seguem o mesmo conjunto, senão o mini-mapa marcaria excesso num
dia que o quadro mostra dentro da capacidade.

Efeito colateral corrigido junto: a legenda da semana contava só os em aberto e
anunciava "0 roçadas · 0,0 km" sobre uma semana com dez cartões visíveis. Passou a
contar o que a grade desenha.

### §5b · O destaque de equipe respondia sem dar sinal

O seletor funcionava — 76 véus montavam —, mas o único efeito visual era
`bg-velatura` (preto puro) a **3%**. Medido, a diferença que isso produz entre
linha atenuada e linha normal:

| tema | a 3% | a 20% | custo em `ink-3` a 6% |
|---|---|---|---|
| claro | 1,072:1 | 1,601:1 | **4,37:1** (piso 4,5) |
| escuro | **1,007:1** | **1,030:1** | — |

Não existe alfa ao mesmo tempo legal e visível: no escuro, preto sobre
quase-preto não tem para onde ir. **O mecanismo era incapaz, não mal
calibrado** — e o comentário que fixava os 3% citava uma restrição que nem se
aplica (o rótulo `km/capacidade` carrega `bg-surface` próprio).

**Correção:** matiz em vez de luminância, e marcar UMA linha em vez de apagar
nove. A linha escolhida recebe `--accent-soft` nas células e um trilho `--accent`
de 4 px na calha (4,82:1 no claro, 12,31:1 no escuro, ambos acima do piso de
3:1), com o nome em negrito e a linha de capacidade subindo para `ink-2`
(`ink-3` sobre `accent-soft` daria 3,98:1 no escuro). Custo em contraste de
texto: zero. `linhaAtenuada` virou `linhaDestacada` + `destaqueVisivel`.

## §6 · Verificação

- `vitest` — `dados.test.ts`, `navegacao.test.ts`, `usar-arrasto.test.ts`,
  `usar-foco-grade.test.ts`, `cartao-servico.test.ts`. Tirar a linha de propostas
  **apaga** casos (os de gêmeo e de pseudo-alvo); não muda os que sobram.
- `npm run build` — verificação de tipos.
- Chrome, nos dois temas: o arrasto fila → dia → equipe exercitado de verdade, por
  mouse **e** por teclado (a rede de Tab e as duas regiões vivas são o que a
  remoção de uma região de foco mais ameaça).
- Contagens da tela conferidas contra SQL depois da migração.

## Fora de escopo

- Ligar RLS (decisão de produto, ver `CLAUDE.md`).
- Mexer em `/malha`, `/painel` ou no Copiloto além do que a limpeza da base já
  muda por consequência.
- O trabalho não-commitado que já estava na árvore (rename "turma → equipe",
  `erroFaltaEquipe`): construído por cima, não revertido.
