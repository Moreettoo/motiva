# Roteiro da demonstração — domingo, 13/09/2026

Escrito depois do **ensaio 1**, rodado em 11/09/2026 das 10:29 às 10:52, sobre `npm run build &&
npm run start` (produção, não `dev`) contra o banco de demonstração. Os nove passos do spec
(`docs/superpowers/specs/2026-09-09-acesso-e-chamados-design.md`, §4) foram executados do começo
ao fim, um a um, cronometrados.

**O que este documento é:** o roteiro ajustado ao que o sistema faz de fato. Onde ele diverge do
spec, a divergência está anotada — o spec descreve o que o plano imaginava, este descreve o que
acontece na tela.

---

## 1 · O ensaio, passo a passo

| # | Passo | Medido | Realista no dia | Observação |
|---|---|---:|---:|---|
| 1 | Entrar como `admin.demo` | 0:49 | 0:30 | Limpo. Lateral sem Laboratório, como o spec pede. |
| 2 | Convidar Analista, aceitar, bater em `/sem-acesso` | 2:46 | 2:20 | O envio do convite trava ~11 s. Ver §2.1 e §2.2. |
| 3 | Aprovar sugestão da IA com equipe | 3:59 | 2:10 | Exige **arrastar e depois clicar**, não um clique. Ver §2.3. |
| 4 | Celular em modo avião: iniciar e finalizar com 4 fotos | 4:41 | 3:00 | Custo dominado pelas 4 fotos e pelo GPS. Ver §2.4. |
| 5 | Voltar o sinal, sincronizar, sino conta | 0:38 | 0:40 | Perfeito — sincronizou em ~5 s. Ver §2.5. |
| 6 | Aprovar na gaveta, ver a execução no trecho | 4:18 | 1:40 | Ver §2.6 (reanálise) e §2.7 (fotos piscam). |
| 7 | Adiamento: equipe pede, gestor aceita | 2:48 | 2:45 | Ver §2.8 — a data escolhida decide se o cartão some. |
| 8 | Encerrar administrativamente | 2:17 | 1:20 | Ver §2.9 — escolher um chamado **sem** fotos. |
| 9 | `/usuarios` com o QR do APK | 0:21 | 0:25 | Ver §2.10 — a release precisa existir. |
| | **Total** | **22:37** | **~15:50** | |

O total medido (22:37) carrega três coisas que não vão acontecer no domingo: um relogin forçado
(~0:50, §2.2), uma queda do servidor local (~1:10) e quatro esperas de GPS de 10 s cada porque o
navegador não tinha permissão de localização. Descontadas, e somada a narração, o roteiro do spec
leva **cerca de 15 minutos e 50 segundos — acima da meta de 12.**

O roteiro reescrito da §4 corta para **~11:30** sem perder nenhuma das nove batidas.

**Nenhuma página de erro apareceu.** Dois avisos vermelhos apareceram, e os dois são explicáveis:
o do Resend no passo 2 (§2.1) e o do `GITHUB_TOKEN` no passo 6 (§2.6) — ambos de ambiente, não de
código, e ambos com saída no roteiro reescrito.

---

## 2 · O que travou

### 2.1 · O convite trava 11 segundos e depois mostra um e-mail pessoal na tela

Clicar em "Enviar convite" deixa o botão em estado de carga, **sem rótulo**, por cerca de 11
segundos — é a ida ao Resend. Depois a gaveta mostra duas caixas:

- verde, "Convite criado", com o link inteiro e um botão "Copiar link" — funciona;
- âmbar, "O e-mail não saiu", repetindo a recusa do Resend **em inglês e citando
  `enzomoretto2006@gmail.com`**, que é a conta pessoal dona da chave.

O comportamento está certo (o produto degrada e entrega o link). O problema é de plateia: numa sala
com a Motiva, um aviso amarelo em inglês nomeando um gmail pessoal é a pior frase possível.

**Saída, sem tocar em código:** convidar **`enzomoretto2006@gmail.com`**. É o único endereço que o
Resend em modo de teste aceita, então o e-mail **chega de verdade** — e aí o passo 2 ganha a batida
que o spec queria ("mostrar o e-mail do Resend"), em vez de mostrar o erro dele. Deixe a caixa de
entrada aberta numa aba antes de começar.

### 2.2 · Aceitar o convite na mesma janela derruba a sessão de Admin

O spec diz "abrir o link em aba anônima". **Aba não basta: tem que ser janela anônima.** Abas do
mesmo perfil compartilham cookie — aceitei o convite numa segunda aba e a aba do Admin virou
Analista sozinha. Custou um relogin no meio do ensaio (~50 s de tela de login na frente do cliente).

**Saída:** abrir a **janela anônima antes de começar a demonstração**, já posicionada em
`localhost`/produção, e colar o link nela. Ctrl+Shift+N.

### 2.3 · Aprovar uma sugestão são dois gestos, não um

A gaveta de um agendamento sem equipe traz "Aprovar roçada" desabilitado e a frase "Atribua uma
equipe antes de aprovar." **Não há seletor de equipe na gaveta.** O único caminho é:

1. **arrastar** o cartão da "Fila de decisão" para a célula (equipe × dia) do quadro — isso grava
   data e equipe de uma vez, e mostra um "Desfazer";
2. **clicar** no cartão já posicionado e então "Aprovar roçada".

O arrasto funcionou de primeira com o mouse. Ensaie-o: é o gesto mais arriscado da apresentação
(§5.1).

Depois de aprovar, a **própria gaveta** passa a mostrar `CHAMADO · CH-2026-00xx · Aberto` com um
link "Abrir em Chamados ↗". Essa é uma batida melhor que ir até `/chamados` procurar o número na
lista — use-a.

Um detalhe que me pegou e vai pegar você: **a gaveta desliza da direita**, e clicar antes de ela
assentar acerta o botão errado. Cliquei em "Descartar" achando que clicava em "Aprovar". O sistema
pediu confirmação ("Confirmar descarte" / "Manter roçada") e nada se perdeu — mas conte um segundo
antes de clicar.

### 2.4 · As quatro fotos são o passo mais longo, e o GPS cobra 10 segundos por foto

Cada foto passa por "Preparando a foto…" enquanto espera a posição. Sem permissão de localização
concedida, são ~10 s por foto — 40 s de tela parada no passo 4. Com a permissão concedida e um sinal
de GPS válido, a segunda foto reaproveita a leitura da primeira (`maximumAge: 30 s`).

Isso é desenho deliberado (`src/lib/campo/imagem.ts` documenta por quê: o `timeout` da Geolocation
API não vale enquanto a permissão não é decidida). **Não é bug. É preparação:**

- conceder a permissão de localização ao app **na véspera**, com o app aberto uma vez ao ar livre;
- se a demonstração for em sala fechada, avisar: "sem GPS aqui dentro, a foto sai sem coordenada — e
  a tela diz isso, escrito `sem GPS` embaixo de cada uma". Isso na verdade **ajuda**: mostra que o
  app não inventa dado que não tem.

O indicador do topo conta **eventos, não fotos**: depois de iniciar e finalizar offline ele diz
"**2 pendentes · sem sinal**". O spec previa "4 pendentes". Use o número certo na fala.

### 2.5 · O sino só conta 1 se você tiver aberto o sino antes

O sino marca **tudo como lido na abertura** (é o desenho: abrir o sino *é* ler). Entrei com o
contador em "9+" acumulado dos seeds; nesse estado a chegada de 1 notificação nova não muda nada na
tela.

**Saída:** **abra o sino uma vez antes de começar**, com a gaveta fechando em seguida. O contador
zera, e no passo 5 ele aparece como **1** — exatamente a batida que o spec pede. Não existe botão
"marcar todas como lidas"; abrir é o gesto.

A sincronização em si foi impecável: ~5 s do "voltou o sinal" até "Tudo enviado · 10:41", com o selo
"aguardando envio" sumindo do cartão sozinho.

### 2.6 · A reanálise depende de `GITHUB_TOKEN`, e sem ele o aviso é vermelho

Aprovar o chamado com "Reanalisar o trecho depois de aprovar" marcado dispara o workflow do GitHub.
No ambiente do ensaio a variável não existia, e o resultado foi:

> **Não consegui enfileirar** — A reanálise sob demanda precisa da variável GITHUB_TOKEN (token de
> acesso pessoal com permissão Actions: Read and write no repositório). Configure-a no ambiente do
> painel.

A mensagem é honesta e a aprovação **não fica pendurada** — o chamado conclui, a execução e a medição
são gravadas, só a reanálise não sai. Mas é um toast vermelho no meio do passo 6.

**Item número 1 da checagem de sábado:** confirmar `GITHUB_TOKEN` e `GITHUB_REPO` no projeto da
Vercel. Se não der para resolver, **desmarque a caixa "Reanalisar o trecho depois de aprovar"** antes
de confirmar e narre "a reanálise roda às 6h de qualquer jeito" — que é verdade.

### 2.7 · Ao aprovar, as quatro fotos somem por ~5 segundos

Logo depois do "Aprovar", a gaveta revalida e as quatro miniaturas ficam cinzas por cerca de 5 s
antes de voltar (são URLs assinadas de 60 s, buscadas de novo). Não é erro, mas é feio no momento
mais fotogênico da tela. **Não role a página nem clique nesses 5 s** — fale por cima ("a execução e a
medição já estão gravadas no trecho") e elas voltam sozinhas.

### 2.8 · Um adiamento aceito para a semana que vem não "move o cartão": ele some

O spec promete "admin aceita e a agenda move o cartão". O quadro mostra **uma semana por vez**. Aceitei
um adiamento para 16 de set. estando na semana de 07–13 — e o cartão simplesmente desapareceu da tela.

**Saída:** quando a equipe pedir a nova data no celular, **escolha uma data dentro da semana visível**
(no domingo 13/09, escolha 14 ou 15 de set. e navegue uma semana). Aí o movimento é visível e a frase
"a agenda já se reorganizou" tem o que mostrar.

A gaveta de decisão do gestor é excelente e vale mostrar devagar: "A equipe pediu por chuva e sugeriu
16 de set. Aceitar remarca a roçada na agenda", com a data já preenchida e um campo "Resposta para a
equipe".

### 2.9 · Encerrar administrativamente num chamado que tem fotos contradiz o selo

Encerrei o CH-2026-0011, que já tinha as quatro fotos do app. O chamado fechou com o aviso âmbar
correto — "Este chamado foi encerrado no painel, sem as fotos do app. A execução existe no histórico
do trecho; a comprovação, não" — **logo acima das quatro fotos que ele tem.**

**Saída:** encerrar administrativamente um chamado **`aberto`**, que nunca passou pelo app. Aí o
"sem evidência" quer dizer o que diz, e as caixas de foto mostram "A equipe ainda não iniciou".

### 2.10 · O QR do APK aponta para uma release que ainda não existe

A seção "Baixar o app de campo" traz o banner:

> **Disponível a partir de 12 de set. de 2026** — O endereço e o QR abaixo já são os definitivos. Até
> a release ser publicada, o link abre a página de releases sem baixar o arquivo.

A demonstração é **13/09**. Se a release `campo-v0.1.0` não estiver publicada até sábado, escanear o
QR na frente do cliente abre uma lista de releases vazia. Ver §5.3.

### 2.11 · Dois defeitos consertados

Ambos em `web/src/app/(campo)/`, commit `2488c78`:

1. **O título da aba repetia a marca.** `campo/page.tsx` declarava `title: "Campo · HighwAI"` por
   extenso, mas o `template: "%s · HighwAI"` do layout raiz já acrescenta a marca — como em toda
   outra página, que declara só "Agenda", "Chamados". Saía **"Campo · HighwAI · HighwAI"** na aba e,
   pior, no nome da janela do app instalado por TWA. Agora sai "Campo · HighwAI".
2. **O grupo da lista contradizia o selo do cartão.** A seção "Aguardando aprovação" do app de campo
   junta três situações (`aguardando_aprovacao`, `adiamento_solicitado`, `devolvido`), e só a
   primeira espera aprovação. No passo 7, o cartão do adiamento aparecia com o selo "Adiamento
   pedido" **debaixo do título "Aguardando aprovação"** — duas frases que se contradizem na mesma
   tela, na tela que o cliente lê por cima do ombro. Passou a **"Já enviados"**, que é o que as três
   têm em comum.

`npm run verificar` verde (322 testes, 22 checagens de fumaça, build).

### 2.12 · O que NÃO consertei, e por quê

- **"Aprovar roçada" parecia aceso estando desabilitado** — falso alarme meu. `Botao` aplica
  `disabled:opacity-50`; o que vi foi a gaveta inteira em transição de opacidade. Sem mudança.
- **O tema claro não pega no `/campo`** — é deliberado e documentado: `(campo)/layout.tsx` fixa
  `data-theme="dark"`, "sol forte pede fundo escuro". Sem mudança.
- **A linha do tempo não mostrou "No aparelho: 10:39 (enviado às 10:42)"** — o limiar é de 5 minutos
  (`DIVERGENCIA_MS`), e meu intervalo offline foi de ~3. Comportamento correto; só **não prometa essa
  linha na narração** a menos que o modo avião dure mais de 5 minutos.
- **Data passada recusada no "Nova roçada"** — validação nativa do campo (`min` = hoje). Correto.
- **`ultimo_acesso_em` ficou "nunca entrou"** para a conta criada pelo convite, mesmo tendo entrado.
  Não encosta no roteiro. Fica registrado para o agente D: o gravador de último acesso vive em
  `web/src/lib/auth/` — o convite aceito entra pela action, não pela tela `/entrar`, e talvez não
  passe pelo mesmo ponto.

### 2.13 · O estado da base, e o que o seed não repõe

**Atenção: `npm run semear:demonstracao` sem argumento NÃO repõe chamado consumido.** Rodei-o ao fim
do ensaio, como manda a tarefa, e ele respondeu:

```
chamados: já semeados (há agendamento com justificativa "Demonstração:"). Nada a fazer.
```

`semearChamados` sai na primeira linha se já existir qualquer agendamento de demonstração. O único
caminho que repõe é `--limpar` **seguido de** um seed novo — e `--limpar` apaga medição e execução de
mentira, então é o caminho certo, só não pode rodar com outro agente mexendo na base.

Estado em 11/09 às 10:52 (22 chamados):

| Estado | Qtd |
|---|---:|
| Aberto | 1 |
| Em andamento | 1 |
| Aguardando aprovação | 1 |
| Devolvido | 2 |
| Adiamento pedido | 4 |
| Concluído | 8 |
| Cancelado | 5 |

**Os sete estados estão todos presentes.** O que falta é sabor, não estado: a coluna **"Atrasados"
está em 0**. O chamado `aberto-atrasado` do seed (CH-2026-0023) já tinha sido consumido por outra
sessão **antes** do meu ensaio — a base chegou às minhas mãos com 0022 cancelado, 0024 e 0023 com
adiamento pedido e 0025 concluído, em vez dos oito estados originais.

Tentei repor o atrasado pelo caminho limpo ("Nova roçada" com data de 09/09) e o formulário recusa
data passada — corretamente.

**Recomendação:** na noite de sábado, com ninguém mais mexendo na base, rodar

```bash
cd web && npm run semear:demonstracao -- --limpar && npm run semear:demonstracao
```

Isso devolve os oito estados, inclusive o atrasado, e apaga as medições e execuções de mentira que o
ensaio criou. **Depois disso, não rodar mais nada que consuma chamado.**

Também desativei a conta `ensaio.onda4@demo.highwai.com.br` que o ensaio criou, para `/usuarios` não
ter linha estranha no passo 9.

---

## 3 · Checagem de sábado (nesta ordem)

1. `GITHUB_TOKEN` e `GITHUB_REPO` no projeto da Vercel. **Sem isso o passo 6 dá toast vermelho.**
2. Publicar a release `campo-v0.1.0` no GitHub, com o APK, e conferir que o QR de `/usuarios` baixa
   o arquivo.
3. Copiar o `assetlinks.json` do PWABuilder para `web/public/.well-known/` e republicar — sem ele o
   app abre com a barra do Chrome por cima e parece "site", não aplicativo.
4. `cd web && npm run semear:demonstracao -- --limpar && npm run semear:demonstracao` (uma vez só).
5. Instalar o APK no Android, entrar como `lider.8.demo@demo.highwai.com.br`, **conceder a permissão
   de localização ao ar livre**, e deixar o app aberto uma vez com sinal para o snapshot baixar.
6. No navegador: entrar como `admin.demo`, **abrir o sino uma vez** (zera o contador), abrir uma
   **janela anônima** em branco e deixá-la pronta, e abrir a caixa de entrada de
   `enzomoretto2006@gmail.com` numa aba.

---

## 4 · O roteiro reescrito — ~11:30

> Convenção: **[clique]** o que fazer, *em itálico* o que falar, incluindo o que falar **enquanto
> carrega**, que é onde o silêncio mata a demonstração.

### Passo 1 — Entrar · 0:30

**[clique]** `/entrar`, `admin.demo@demo.highwai.com.br` / `Demo-2026-solo`.

*"Isto é o painel de quem decide a roçada. Eu entrei como Administrador. Reparem na lateral: Painel,
Malha, Agenda, Chamados, Campo, Usuários. Daqui a pouco eu entro com outro cargo e essa lista vai ser
menor — quem vê o quê é regra de servidor, não de tela."*

### Passo 2 — Convidar um Analista · 2:00

**[clique]** Usuários → Convidar → `enzomoretto2006@gmail.com`, cargo **Analista** → Enviar convite.

*(enquanto os ~11 s de envio rodam)* *"Não existe cadastro aberto aqui. A única porta é o convite, e
o banco guarda só o hash do token — o link inteiro só existe no e-mail. Vale sete dias."*

**[clique]** Copiar link → colar na **janela anônima já aberta** → nome "Carolina", senha, Criar
acesso e entrar.

*"E ele já entra. Olhem a lateral agora: sumiram Chamados, Usuários e Campo. E o aviso no topo —
'Acesso somente leitura'."*

**[clique]** na barra de endereço da janela anônima, digitar `/chamados`.

*"E se ele tentar na marra? `Esta tela não faz parte do seu acesso`. Isso é o servidor recusando, não
um botão escondido."*

**[clique]** fechar a janela anônima. Voltar à janela do Admin.

### Passo 3 — A IA propõe, o gestor decide · 2:10

**[clique]** Agenda.

*"Do lado esquerdo, a fila de decisão: são as roçadas que a IA propôs de madrugada e ninguém
respondeu. Cada uma tem prazo, quilometragem e risco. Do lado direito, as equipes por dia."*

**[clique]** **arraste** o primeiro cartão da fila para a célula de uma equipe **no dia de hoje**.

*"Soltar decide duas coisas de uma vez: quando e com quem."*

**[clique]** no cartão que acabou de pousar.

*"Aqui está o porquê. Altura hoje, limite do trecho, ritmo de crescimento, e a justificativa escrita
— que leva em conta a observação de campo daquele trecho: curva, reclamação, histórico."*

**[clique]** Aprovar roçada. *(espere a gaveta assentar antes de clicar)*

*"E olhem o que apareceu: CH-2026-00xx, Aberto. A ordem de serviço nasceu no banco, não neste botão —
ela nasce igual se quem aprovar for o lote das 6 da manhã."*

### Passo 4 — O celular, em modo avião · 3:00

**[ação]** Ligue o modo avião no Android **antes de mostrar a tela**. Abra o app.

*"Isso aqui é o celular do líder da equipe. Está em modo avião. Repararam que ele abriu? A tela toda
é guardada no aparelho — beira de estrada não tem 4G, e esse foi o requisito número um."*

**[toque]** no chamado que você acabou de criar.

*"Altura do mato agora: 41,8 cm, acima do limite de 30. Esse número não é medido, é o modelo
respondendo sobre o clima observado desde a última medição. A equipe chega sabendo o que vai
encontrar."*

**[toque]** Iniciar roçada → duas fotos (régua e extensão) → Revisar → Registrar início.

*(enquanto as fotos processam)* *"Duas fotos obrigatórias, sempre antes de cortar. Cada uma leva
coordenada e hora do aparelho."*

**[toque]** no chamado → Finalizar roçada → duas fotos → altura final `6,5` → Enviar para aprovação.

*"Olhem o topo: **2 pendentes, sem sinal**. Nada disso foi perdido e nada disso chegou ao servidor
ainda."*

### Passo 5 — Volta o sinal · 0:40

**[ação]** Desligue o modo avião. Não toque em mais nada.

*"Não vou apertar nenhum botão."*

*(em ~5 s)* *"Tudo enviado. E se o app estivesse fechado, o próprio service worker mandaria."*

**[clique]** na janela do painel, no **sino**.

*"E aqui, do lado do gestor: CH-2026-00xx aguarda sua aprovação."*

### Passo 6 — O gestor aprova · 1:40

**[clique]** Chamados → o cartão em "Aguardando aprovação".

*"Antes e depois, lado a lado. Altura inicial 41,8, final 6,5, limite 30."*

**[clique]** Aprovar → *(km já vem preenchido com a extensão do trecho)* → Aprovar.

*(nos 5 s em que as fotos piscam)* *"Esse clique não muda só um status: ele grava a execução com km e
custo, grava uma medição nova no trecho e dispara a reanálise — porque a roçada muda a fase de
rebrota, que é entrada do modelo."*

**[clique]** ir ao trecho (breadcrumb ou busca).

*"Última medição: hoje, 6,5 cm. Última roçada: hoje. E o aviso: a previsão que está na tela é
anterior a essa medição — vale até a próxima análise."*

### Passo 7 — Chuva · 2:45

**[toque]** no celular, em **outro** chamado: Pedir adiamento → **Chuva** → data **dentro da semana
que está na tela do painel** → Revisar → Pedir adiamento.

*"A equipe não some quando não dá. Ela diz por que, e sugere quando dá."*

**[clique]** no painel: Chamados → o cartão em "Adiamento pedido" → Decidir adiamento.

*"A data que ela sugeriu já vem preenchida, e eu posso responder por escrito."*

**[clique]** Aceitar e remarcar → Agenda.

*"O cartão andou sozinho."*

### Passo 8 — Quando a roçada não passou pelo app · 1:20

**[clique]** Chamados → um chamado **`aberto`** → Encerrar administrativamente.

*"Nem toda roçada vai passar pelo celular no primeiro mês. Então existe esta porta — e ela cobra o
preço: a observação é obrigatória."*

**[digite]** "Equipe roçou antes do app entrar em uso; confirmado pelo encarregado por rádio." →
Encerrar.

*"E o chamado fecha com este selo: **concluído sem evidência de campo**. A execução existe no
histórico do trecho; a comprovação, não. O sistema não finge que viu."*

### Passo 9 — O APK · 0:25

**[clique]** Usuários → rolar até o fim.

*"E é assim que a turma instala. QR code, o endereço, a versão, e as quatro instruções. Sem loja, sem
cadastro: o acesso é o convite que vocês viram no começo."*

---

## 5 · Os três momentos mais frágeis

### 5.1 · O arrasto do passo 3

**Por que é frágil:** é o único gesto de precisão da apresentação. Um arrasto que erra a célula, ou
que o navegador não registra porque a janela perdeu o foco, para a demonstração no passo 3 de 9 — e
sem ele não há chamado, e sem chamado não há passos 4 a 8.

**Se falhar ao vivo:** o cartão volta sozinho para a fila; não quebra nada. Tente **uma vez** mais,
devagar, soltando bem no meio da célula. Se falhar de novo, **não insista**: use um dos chamados que
já estão na base. *"Deixa eu usar um que a equipe já recebeu ontem"* — vá para `/chamados`, filtro
**Aberto**, e siga para o passo 4 com ele. A narração do passo 3 (a IA propõe, o gestor decide) você
já fez na gaveta, que é onde ela vale.

**Prevenção:** ensaie o arrasto três vezes no sábado, na mesma máquina e no mesmo tamanho de janela.

### 5.2 · A sincronização do passo 5

**Por que é frágil:** é a batida emocional da demonstração — "eu não apertei nada e chegou" — e
depende de três coisas fora do seu controle: o Wi-Fi da sala, a sessão do celular não ter expirado, e
a Vercel responder. Se a sessão do app tiver expirado, a API responde `401`, o app mostra "entre de
novo" e a fila **fica guardada** (não se perde) — mas o momento morre.

**Se falhar ao vivo:** o indicador continua dizendo "2 pendentes · sem sinal" ou "entre de novo".
Diga a verdade, que é melhor que a demonstração: *"Olhem que o trabalho não sumiu — está guardado no
aparelho com o número do evento. Quando a rede voltar ele sobe sozinho, e se subir duas vezes o banco
ignora a segunda."* Então **toque no ícone de sincronizar** no topo. Se ainda assim não for, entre de
novo no app (o login refaz o envio) e siga; se nem isso, **pule para o passo 6 usando o CH-2026-0010
ou CH-2026-0011**, que já estão em "Aguardando aprovação" com as quatro fotos.

**Prevenção:** entrar no app **no sábado e de novo na manhã de domingo**, com sinal, para a sessão
estar fresca. Levar um roteador de bolso ou usar o 4G do próprio celular, não o Wi-Fi da sala.

### 5.3 · O QR do APK do passo 9

**Por que é frágil:** é o único ponto do roteiro que depende de um artefato que **ainda não existe** —
a release `campo-v0.1.0` no GitHub. O painel já diz isso na cara: "Disponível a partir de 12 de set.
de 2026". Se alguém da Motiva escanear o QR na hora e cair numa lista de releases vazia, a última
imagem que fica é a de um produto que não está pronto.

**Se falhar ao vivo:** não tente consertar. *"O pacote é publicado nesta mesma página; hoje eu trouxe
ele já instalado neste aparelho."* E mostre o app instalado no Android — que é a prova de verdade, e
que você já usou nos passos 4, 5 e 7.

**Prevenção:** publicar a release no sábado e **escanear o QR você mesmo, de um segundo aparelho**,
até o arquivo baixar. E guardar `signing.keystore` e `signing-key-info.txt` no cofre de senhas, fora
de `E:` — perdida a keystore, nenhum aparelho com o APK instalado aceita atualização.
