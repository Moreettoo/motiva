# Revisão adversarial — Onda 4, agente D

Revisão do que entrou entre `3faee68` e `336d9db`: 79 commits, quatro ondas,
~14.100 linhas em `web/src` mais seis migrações. Lida por área e não por commit,
procurando o que teste de tela não pega.

Classificação usada em todo o documento:

- **(a)** quebra a demonstração de 13/09/2026
- **(b)** quebra em produção depois
- **(c)** dívida

Fronteira de escrita deste agente: `web/src/lib/**` e `web/src/components/**`.
Achado fora disso vai para o relatório com caminho e linha — `web/src/app/**` é
do agente B, `scripts/` e o lote são do agente C, e migração já aplicada
ninguém reescreve.

---

## 1. O que foi consertado

Quinze commits, um por defeito, todos com `tipos + lint + testes` verdes e
`build` passando. A contagem de testes foi de 322 para 329.

| hash | defeito | classe |
|---|---|---|
| `248c1ba` | o gráfico de crescimento vinha cortado em mil linhas, sem avisar | (a) |
| `ac80ee8` | o app de campo se recarregava sozinho quando a rede voltava | (a) |
| `a49a5fa` | falha de leitura do perfil virava "Esta conta está desativada" | (a) |
| `429baf6` | definir a senha podia travar a conta num ciclo de desvio sem erro | (b), na 1ª tela |
| `a71c9cf` | um Admin reenviava o convite de um Super Admin e ficava com o link | (b) |
| `f7a4d9b` | `?proximo=/\evil.com` saía do domínio depois de um login legítimo | (b) |
| `cb2e7fb` | uma recusa definitiva numa foto travava a fila do campo, para sempre | (b) |
| `a24a958` | o encerramento administrativo aceitava data futura pela rede | (b) |
| `af7b23b` | faltando uma variável do Supabase, toda URL devolvia 500 opaco | (b) |
| `828991c` | alterar cargo soltava a equipe antes de saber se o cargo mudaria | (b) |
| `504f5a1` | quatro leituras diziam "não há nada" quando na verdade falharam | (b) |
| `a79c950` | cinco "a mais recente" sem o desempate por `id` que a view usa | (b) |
| `ac6bb67` | `CONVITE_VALIDADE_DIAS` vazio fazia todo convite nascer vencido | (b) |
| `eacdf89` | a lista de agendamentos desempatava pela palavra da LLM | (c) |
| `d133386` | o hash do token do convite saía no payload do RSC | (c) |

### 1.1 `248c1ba` — o gráfico cortado em mil linhas *(a)*

`web/src/lib/queries.ts`, `serieCrescimentoPorEspecie`.

A consulta a `ia.previsoes` não paginava. O `db-max-rows` do PostgREST corta a
resposta em mil linhas e avisa **apenas** no cabeçalho `content-range` —
medido: `0-999/1490`, com `error` nulo. Para o cliente, consulta truncada e
consulta que acabou são a mesma coisa, e o `if (error)` da linha seguinte nunca
dispara.

Como a ordem é ascendente, sobrevivem as **mil mais velhas**, e o corte não cai
numa fronteira de dia: cai dentro de um dia. Medido em 11/09: o gráfico de "45
dias" terminava em **26/08**, e o último ponto era a média de 3 das 28 previsões
daquele dia, todas esmeralda — braquiária e batatais caíam no `: 0` do
agrupamento e desenhavam uma queda vertical até zero.

O dano não para no gráfico: `(painel)/page.tsx` tira a variação de 7 dias desse
mesmo último ponto, então o cartão "Crescimento médio" anunciava uma **queda**,
com a seta verde de "crescer menos é bom", sobre um número que é artefato do
corte.

`ia.previsoes` acumula ~50 linhas/dia, então a janela de 45 dias passou de mil
há tempo e só piora. Corrigido paginando por `.range()` até a página vir
incompleta, com ordem total (`data_previsao, id`) para a paginação não repetir
nem pular linha.

### 1.2 `ac80ee8` — o app de campo se recarregava sozinho *(a)*

`web/src/components/campo/serwist-provider.tsx`.

`SerwistProvider` vem com `reloadOnOnline` ligado por padrão, e o layout não
passava a prop. O que a prop liga é `window.addEventListener("online", () =>
location.reload())`.

As fotos recém-capturadas e a altura digitada vivem em estado do React até a
pessoa confirmar. A equipe preenche "Finalizar roçada" numa sombra sem sinal, o
caminhão anda duzentos metros, o modem reengata, `online` dispara — e o
formulário some sem uma palavra, com `evento_id` novo no próximo mount e as
fotos órfãs no aparelho. Se houvesse um `enviarFotos` em voo, o reload o mata no
meio.

Não há nada a recarregar: `/campo` lê do IndexedDB e a fila já reage a `online`
por conta própria. O reexporte de uma linha virou componente para inverter o
padrão sem tocar em `app/`.

### 1.3 `a49a5fa` — falha de leitura virava "conta desativada" *(a)*

`web/src/lib/auth/acoes.ts` e `web/src/lib/auth/sessao.ts`.

As duas descartavam o `error` da leitura de `ia.perfis`, então "a consulta
falhou" e "`ativo = false`" chegavam ao mesmo `if (!perfil || !perfil.ativo)`.

Em `entrar`: a senha certa, o Supabase confirma, a leitura do perfil tem um
soluço — e o sistema faz `signOut` e responde, em tom definitivo, que um
administrador desativou a conta. Em `obterSessao` é pior, porque ela roda em
**toda** requisição: `null` ali significa "esta pessoa não pode entrar", então
cinco segundos ruins no Supabase deslogavam todo mundo, em toda rota.

`obterSessao` passou a levantar, seguindo a convenção de leitura do projeto
("leitura lança, o `error.tsx` da rota trata"). Nas rotas de `/api/campo` isso
também melhora: 5xx é transitório para a fila do aparelho, que reenvia, enquanto
o 401 de antes fazia o app anunciar sessão expirada e parar.

### 1.4 `a71c9cf` — escalada de privilégio pelo botão "Reenviar" *(b)*

`web/src/lib/usuarios/acoes.ts`.

`convidarUsuario` checa `podeConvidar`; `reenviarConvite` não checava. E
reenviar não é reenviar: `emitirConvite` **gera um token novo**, sobrescreve o
`token_hash`, reabre o prazo e devolve o link inteiro a quem clicou — a tela até
oferece "Copiar link".

Um Admin abria `/usuarios`, via o convite pendente de um Super Admin, clicava em
Reenviar, copiava o link da própria tela e aceitava no lugar dele.
`aceitarConvite` lê o cargo da linha do convite, que continua `super_admin`. Um
clique contornava "um Admin não altera um Super Admin" e a trava do último Super
Admin ativo, que só olham para `alterarCargo` e `mudarAtivo`.

`revogarConvite` tinha o mesmo buraco na versão branda.

### 1.5 `f7a4d9b` — redirecionamento aberto depois de um login legítimo *(b)*

`web/src/lib/auth/acoes.ts`, `destinoSeguro`.

A checagem era por texto: começa com `/` e não com `//`. O parser de URL não
concorda com essa leitura. Reproduzido:

```
"/" + "\" + "evil.com"    startsWith("//") = false  ->  origem https://evil.com
"/" + TAB + "/evil.com"   startsWith("//") = false  ->  origem https://evil.com
```

`podeVerRota` não segura, porque rota desconhecida devolve `true` de propósito
para quem não é roçador. O ataque é discreto: manda-se ao gestor
`/entrar?proximo=/\evil.com`; ele digita a senha no domínio **verdadeiro**, o
login funciona de verdade, e o `router.replace` o entrega numa página do
atacante dizendo "sua sessão expirou, entre de novo". Ele não tem motivo para
desconfiar.

Agora quem decide é o mesmo parser do navegador: resolve contra uma origem de
mentira e só aceita se a origem sobreviveu.

### 1.6 `cb2e7fb` — a fila do campo travava para sempre numa foto *(b)*

`web/src/lib/campo/sincronizar.ts` e `fila.ts`.

A rota de **eventos** responde 200 mesmo quando recusa, com `situacao` no corpo,
e o `recusado` sempre seguiu em frente. A rota de **fotos** não tem esse
contrato: responde 400, 403, 404, 413, 415 ou 502 no status. Do lado do
aparelho, `recusa()` embrulhava todos num erro só e o `catch` tratava todos como
falha de rede: `break`. Como o `break` derruba a passada inteira e o item volta
a falhar a cada 120 s, **nada atrás dele subia nunca**.

O gatilho é um fluxo documentado: o gestor troca a equipe do agendamento; a foto
que a equipe anterior tinha na fila passa a levar 403; os outros serviços que
aquela equipe fechou na mesma tarde ficam no aparelho.

`recusaPermanente` mora em `fila.ts`, com as outras regras puras, e tem teste:
4xx é definitivo, menos 408 e 429; 5xx é transitório. O travamento passou a ser
por **chamado** e não pela fila, porque a ordem só precisa valer dentro de um
chamado — é o servidor quem recusa `iniciado` depois de `finalizado`, e ele não
olha o chamado do vizinho.

### 1.7 As demais

- **`a24a958`** — `encerrarAdministrativamente` só tinha a trava de data futura
  na tela. Num arquivo `"use server"` toda action é POST alcançável, e
  `ia.encerrar_chamado_admin` escreve em `ia.execucoes(data_execucao)` **e** em
  `ia.medicoes(data)`: uma data de 2027 vira a medição mais recente do trecho
  para sempre, `dias_desde_rocada_inicio` fica negativo e a janela de
  `altura_atual_cm` inverte. Entrou junto o `Number.isFinite` que faltava na
  altura (`NaN < 0` e `NaN > 300` são ambos falsos).
- **`af7b23b`** — o proxy usava `process.env.…!` em duas variáveis que o
  `.env.example` distribui **vazias**. Faltando qualquer uma, o `@supabase/ssr`
  levanta lá dentro e, como o matcher pega tudo, o resultado não é "o login
  quebrou" e sim "toda URL responde 500", `/entrar` inclusive. Agora segue em
  frente — o proxy é conveniência de navegação, não segurança — e a falha
  aparece legível em `configPublica()`, na página que precisa de sessão.
- **`828991c`** — `alterarCargo` soltava `equipes.lider_id` antes de gravar o
  cargo, sem conferir nenhuma das duas escritas. Falhando a gravação do cargo, a
  pessoa continuava Roçador e já não liderava nada, enquanto a tela dizia "Não
  foi possível alterar o cargo" — que o Admin lê, com razão, como "nada
  aconteceu". O sintoma só aparece do outro lado: o app de campo abre vazio no
  dia seguinte.
- **`504f5a1`** — quatro leituras (`filaDeDecisao`, o adiamento de
  `obterChamado`, `contarNaoLidas`, o `catch {}` do `Shell`) transformavam falha
  em afirmação: "Nada esperando você", "0 não lidas", botão que abre seção
  vazia.
- **`a79c950`** — cinco consultas de "a mais recente" sem o desempate por `id`
  que a view usa. `listarNotificacoes` é a mais garantida: um
  `registrar_evento_chamado` escreve várias notificações na **mesma** transação,
  então elas não empatam por azar, empatam sempre.
- **`eacdf89`** — `listarAgendamentos` desempatava por
  `ordemRisco(a.prioridade)`, a palavra da LLM. Mesmo defeito que
  `chamados/queries.ts` já corrigira um arquivo ao lado, com o motivo escrito
  lá.
- **`d133386`** — `select("*")` em `ia.convites` mandava `token_hash` para um
  componente de cliente. O tipo `Convite` não declara a coluna, então o
  TypeScript não tinha como reclamar. `COLUNAS_CONVITE` agora fica ao lado do
  tipo, com o comentário dizendo o que está de fora e por quê.
- **`ac6bb67`** — `Number(process.env.CONVITE_VALIDADE_DIAS ?? "7")`: variável
  presente e **vazia** passa pelo `??`, porque string vazia não é nullish, e
  `Number("")` é zero. Todo convite nascia vencido e a pessoa lia "Este convite
  expirou" num link de dez segundos atrás.

---

## 2. O que ficou, com caminho e linha

### 2.1 Fora da minha fronteira — `web/src/app/**` (agente B)

**(a) — quebram a demonstração**

1. **`agenda/_componentes/painel-agendamento.tsx:411, 416, 424`** — a gaveta lê a
   previsão **congelada** (`ag.previsao`, ligada por `previsao_id`, de quando o
   agendamento nasceu) enquanto o cartão lê a **atual** (a view).
   `dados.tsx:615-619` usa a precedência **oposta** e explica por quê logo
   acima. Medido: 2 dos 27 agendamentos abertos já divergem — agendamento 159,
   SP-348 Bandeirantes, cartão "2 dias / 29,44 cm", gaveta "110 dias / 9,8 cm",
   na mesma tela, nada marcando qual é velho. Correção: inverter as três linhas
   para `trecho?.x ?? previsao?.x`. Nenhum teste cobre — `dados.test.ts:99`
   sempre passa `trechos: []`.

2. **`(campo)/campo/_componentes/cartao-chamado.tsx:37-38`** +
   **`api/campo/estado/route.ts:104`** — o app de campo pinta
   `chamado.prioridade` cru, a palavra da LLM. Todas as superfícies do painel
   passam por `prioridadeExibida`. Medido: 14 de 22 chamados divergem;
   CH-2026-0011 está a 2 dias do limite e aparece **Baixa, sem selo de
   urgência**, no celular, enquanto o painel o pinta Crítica. A correção é uma
   linha em `route.ts:104` —
   `prioridadeExibida(c.prazo_dias, c.agendamento.prioridade, c.agendamento.origem).risco`
   — porque `listarChamados` já calcula `prazo_dias` e `paraCampo` recebe um
   `ChamadoNaTela`.

3. **`chamados/_componentes/painel-chamado.tsx:191-199`**, `confirmarAltura` —
   `Number("")` é `0` e `Number.isFinite(0)` é true, então campo vazio submete
   como zero medido. O `<form noValidate>` não bloqueia, e o estado começa vazio
   quando `altura_inicial_cm` é null. O gestor abre para **ver** quanto é,
   aperta Enter, e o sistema grava `0,0 cm · informada pelo gestor`; na
   aprovação vira `altura_antes_cm = 0` em `ia.execucoes`. O irmão no mesmo
   recurso faz certo: `formularios-decisao.tsx:128-133`, `paraNumero`.

4. **`agenda/_componentes/painel-agendamento.tsx:77-95, 120-122, 533`** — a
   gaveta nunca desmonta ao fechar (`ultimo` é mantido de propósito, para o
   conteúdo não sumir no meio da animação) e a `key` é só `item.id`, então
   `novaData` e `confirmando` sobrevivem. Três cliques: abre o cartão 31
   (20/08), Esc, arrasta para 27/08, reabre — o `<dl>` diz 27/08, o input diz
   20/08, "Remarcar" está **habilitado**, e um clique devolve o serviço uma
   semana atrás. O mesmo caminho deixa "Confirmar descarte" na tela sem passo de
   armar. Correção: `key={`${item.id}:${item.data}`}`.

**(b)**

5. **`api/campo/estado/route.ts:66-76, 102`** — `error` descartado em três
   consultas. Falhando a de `trechos`, **todo** chamado do snapshot vira
   braquiária (a espécie mais rápida do modelo, o padrão mais enganoso
   disponível) e fica errado offline o dia inteiro; falhando a de `eventos`,
   some o `comentario_gestor` de um chamado `devolvido` e a equipe refaz sem
   saber por quê.
6. **`(campo)/campo/_componentes/fluxo-adiar.tsx:26`** — `somarDias(new Date(),
   1)` mistura getters locais com `toISOString()`. Entre 21:00 e meia-noite de
   Brasília o `min` do seletor pula dois dias e o roçador não consegue pedir
   adiamento para amanhã. É a armadilha que `isoHoje()` existe para evitar, e
   `hojeNoFusoDoPainel()` já está importado no mesmo app.
7. **`(campo)/campo/_componentes/tela-revisao.tsx:66-68`** — `void
   aoConfirmar().finally(...)`: `.finally` não trata rejeição e `void` não
   captura. Aparelho com pouco espaço, `enfileirar` lança `QuotaExceededError`
   depois de gravar as seis fotos → as fotos ficam no IndexedDB sem item de fila
   apontando para elas, nunca enviadas e nunca recolhidas, e o roçador não vê
   erro nenhum — só o spinner parar.
8. **`(campo)/campo/_componentes/usar-sincronizacao.ts:88-92`** — o snapshot só é
   rebaixado quando `pendentes === 0 && erro == null`, ou quando `enviados > 0`.
   Com um item permanentemente `recusado`, nenhuma das duas condições volta a
   valer: a lista da equipe congela e a interface troca "Atualizar a lista" por
   "Enviar agora", tirando também a saída manual.
9. **`(campo)/campo/_componentes/app-campo.tsx:191, 230`** — se o chamado sai de
   `estado.chamados` (cancelado, ou fora da janela de 7 dias) durante um
   refresh, `chamadoDaVista` vira null e o fluxo inteiro desmonta para a lista,
   levando fotos comprimidas, GPS e altura digitada, sem mensagem.
10. **`(campo)/campo/_componentes/regua-altura.tsx:137, 142`** — `antesCm ?? 0` e
    o rótulo `ESTADO_ALTURA.dentro`: altura anterior desconhecida é desenhada
    como barra de 0 cm pintada de verde "dentro do limite", no gráfico cujo
    trabalho declarado é mostrar o quanto baixou.
11. **`api/campo/eventos/route.ts:80-83`** — se a regravação do `fora_de_ordem`
    falha, a rota ainda responde `fora_de_ordem` e o aparelho apaga o item e os
    blobs. Fotos órfãs no servidor, zero eventos, e o único rastro é um
    `console.error`. É o incidente da Fase 2 reproduzido pelo código escrito
    para evitá-lo. Na mesma função: `admins_ativos` com erro descartado (ninguém
    é avisado, enquanto o app diz "O gestor foi avisado"), `autor_nome ??
    "equipe"` gravando um nome inventado na tabela append-only, e `?? "encerrado"`
    — que não é membro de `StatusChamado` — indo para o payload de auditoria.
12. **`app/sw.ts:27`** — `runtimeCaching: defaultCache` inclui um `NetworkFirst`
    para `/api/*` com 24 h. `GET /api/campo/estado` é interceptado apesar do
    `cache: "no-store"` (que é diretiva de HTTP cache, não de Cache Storage), e
    o `networkTimeoutSeconds: 10` pode devolver o snapshot **pré-evento**,
    desfazendo na tela o que a equipe acabou de registrar.
13. **`app/sw.ts:50-55`** — `matchAll({ type: "window", includeUncontrolled: true })`
    enumera qualquer janela da origem. Com o celular em segundo plano — que é o
    caso para o qual Background Sync existe — o cliente congelado é listado, o
    `postMessage` fica na fila e o `waitUntil` resolve: o navegador considera o
    sync entregue e descarta o registro, sem nada ter subido. No laptop, uma aba
    de `/malha` aberta basta para o worker nunca sincronizar.
14. **`api/fotos/[id]/route.ts:16`** — `error` descartado: foto que existe vira
    **404 "Foto não encontrada."** na tela de aprovação.
15. **`agenda/_componentes/dados.tsx:561-566`**, `riscoDoItem` — `if (trecho)
    return trecho.risco`, e a view carimba `baixa` quando `dias_ate_limite` é
    NULL. O chip verde diz "Mais de 45 dias de folga" enquanto a gaveta ao lado
    diz "Prazo até o limite: sem crescimento". `semPrazo`, de
    `dominio.ts:279-281`, é calculado, testado e **lido por nenhum arquivo** —
    `grep -rn semPrazo app components` não devolve nada.
16. **`(painel)/page.tsx:198, 204`** — `Number(p[nome]) || 0` e, no meu lado,
    `ponto[esp] = … : 0` (`queries.ts`): espécie sem previsão naquele dia é
    desenhada como crescimento zero em vez de lacuna. `GraficoLinha` já trata
    `null` em todo o caminho, então o conserto é dos dois lados ao mesmo tempo —
    mexer só num deles não muda nada.

**(c)** — `agenda/page.tsx:81-83` (o contador do cabeçalho não segue o filtro que
a badge logo abaixo segue, contra a regra escrita em `planejamento.tsx:361-365`);
`dados.tsx:783` vs `:237` (`executado` conta para a capacidade do dia numa conta
e não na outra, na tela cujo trabalho é "que ninguém estoure uma equipe sem
ver"); `planejamento.tsx:426-429` (o km da semana soma serviços inteiros
enquanto o quadro os fatia por dia); `cartao-servico.tsx:47-50` e
`chamado-do-trecho.tsx:60` (`as keyof` afirmando totalidade que o tipo não
garante — um oitavo status renderiza `<undefined />` e derruba a página inteira;
`satisfies Record<StatusChamado, …>`, padrão que `dominio.ts:18-23` já usa,
faria disso erro de build); `usuarios/_componentes/painel-usuario.tsx:59` (cargo
semeado de prop sob `key` que não muda); `chamados/_componentes/cartao-chamado.tsx:23`
(o único `Intl` construído fora de `format.ts`); `lista-chamados.tsx:152-159` e
`tabela-usuarios.tsx:121-123` (`.tnum` faltando em coluna de dígitos).

### 2.2 Fora da minha fronteira — `scripts/` e banco (agentes C e A)

1. **`web/scripts/semear-demonstracao.mjs:54`** — **(a)**. `const SENHA =
   process.env.SEED_SENHA || env.SEED_SENHA || "Demo-2026-solo"`. `SEED_SENHA`
   não está no `.env.example` e o CLAUDE.md documenta a invocação sem ela, então
   o literal é o que vale. `semearUsuarios` cria
   `super.demo@demo.highwai.com.br` com `cargo: "super_admin"` e
   `senha_provisoria: false`. Quem lê este repositório abre a URL da Vercel e
   entra como Super Admin no mesmo banco da demonstração. `garantirUsuario`
   ainda redefine a senha de uma conta existente a cada execução, então trocá-la
   à mão não gruda. **Tirar o literal e exigir a variável.**
2. **`web/scripts/semear-demonstracao.mjs:552-558`** — `--limpar` desativa os
   perfis mas não aplica `ban_duration` no Auth, ao contrário de
   `desativarUsuario`. A credencial continua válida contra o endpoint do
   Supabase.
3. **`supabase/migrations/20260911091000_chamados_funcoes.sql:253`** — `v_autor
   := nullif(current_setting('app.autor', true), '')::uuid`, e `app.autor`
   **nunca é definido em lugar nenhum do repositório** (grep devolve essa única
   linha). Logo `v_autor` é sempre NULL e o gatilho grava `origem = 'lote'`,
   `autor_nome = 'sistema'`. Um cancelamento feito por um Admin com
   justificativa escrita aparece no histórico como *"Cancelado — sistema · pelo
   lote"*, na tela cujo comentário diz que "pelo lote" vs "pelo painel" é
   justamente o que separa uma decisão de um efeito dela. Aparece na
   demonstração.
4. **`…chamados_funcoes.sql:204`** — `encerrar_chamado_admin` grava
   `altura_final_cm = p_altura_depois_cm` **incondicionalmente**, e o caminho
   inteiro permite NULL. Encerrar administrativamente um chamado que a equipe já
   finalizou apaga a altura que ela mediu (8 → NULL), não insere `ia.medicoes`,
   e ainda carimba `sem_evidencia = true` sobre um chamado cujas fotos estão no
   bucket. O botão está a um clique em `aguardando_aprovacao`.
5. **`…chamados_funcoes.sql:79-84`** — o `raise` do `P0003` aborta a própria
   subtransação e descarta o `fora_de_ordem` que acabou de inserir. A rota do
   campo refaz o registro; o painel não, e `mensagemDoBanco` diz ao gestor "o
   evento ficou registrado como fora de ordem" quando nada foi registrado.
6. **`…chamados_funcoes.sql:69-73`** — o `exists` de idempotência está **fora**
   do `for update`, então dois POSTs simultâneos com o mesmo `evento_id`
   respondem `recusado` em vez de `repetido`. Auto-corrige na passada seguinte,
   mas põe uma frase errada e assustadora na tela do campo.
7. **`…chamados_funcoes.sql:158, 190`** — `aprovar_chamado` e
   `encerrar_chamado_admin` não têm `if not found`, e `NULL <>
   'aguardando_aprovacao'` é NULL, então a guarda não dispara para um chamado
   inexistente: o segundo chega a inserir em `ia.execucoes` com `trecho_id` nulo
   e devolve o erro do Postgres cru.
8. **`ocorrido_em` vem do relógio do aparelho e nada o limita** —
   `api/campo/eventos/route.ts:103` só valida que é data parseável, e ele vira
   `finalizado_em`, que `aprovar_chamado` converte em `ia.medicoes.data` e
   `ia.execucoes.data_execucao`. Um celular que voltou com a data errada
   envenena a entrada do modelo sem nenhum sinal, e a medição futura ganha o
   `order by data desc` do lote para sempre. O relógio do servidor já vai no
   snapshot e não é usado para limitar.
9. **Cancelar um chamado com adiamento pendente órfã o pedido** — o
   `chamado_adiamentos` fica com `decisao is null` para sempre,
   `ux_adiamento_pendente_por_chamado` segura a vaga, `decidir_adiamento` passa
   a levantar P0001 para ele, e o snapshot do campo carrega por uma semana um
   "adiamento pendente" preso a um cartão "Cancelado" que o gestor nem vê.
10. **`ia.chamados.status_anterior` aceita `'devolvido'`**, valor que nenhuma das
    duas máquinas consegue produzir — registra uma intenção que ninguém
    implementou. **(c)**

### 2.3 Dentro da minha fronteira, deixados de propósito

1. **`web/src/lib/campo/sincronizar.ts:127-128, 164-169`** — **(b)**. Depois de
   um envio bem-sucedido, `removerDaFila` roda e só então `baixarEstado`; se
   essa atualização falhar, o estado otimista (que vive na fila) já sumiu e o
   cartão volta a "não iniciado". A equipe toca de novo, gera `evento_id` novo,
   e o servidor recusa com P0001. **Não consertei** porque a correção honesta —
   adiar a remoção até o snapshot confirmar — troca este defeito por um pior: um
   `baixarEstado` que falhe permanentemente (o gestor sem `?equipe=`, que
   responde 400) deixaria a fila sem esvaziar nunca. Depois de `cb2e7fb` o item
   duplicado ao menos não trava mais os outros chamados.
2. **`web/src/lib/queries.ts:125-132`, `listarAgendamentos` sem `.limit()`** —
   **(b)**. Quatro páginas a chamam sem filtro. Hoje são 237 linhas; quando
   passar de mil, o corte silencioso do PostgREST reabilita no seletor um trecho
   que já tem roçada aberta, derrubando a ponta do "um agendamento aberto por
   trecho" que existe para **evitar** o erro em vez de relatá-lo. Mesma trilha
   em `listarChamados` (`chamados/queries.ts:56-68`) e em `execucoesDoTrecho`.
   Não consertei porque a paginação de `248c1ba` é o padrão a seguir e aplicá-la
   a quatro consultas que alimentam a agenda inteira, dois dias antes, tem mais
   risco do que o defeito latente.
3. **`web/src/lib/auth/sessao.ts:72`, `permitir` não olha `senhaProvisoria`** —
   **(c)**. `exigirSessao` redireciona; `permitir` não, e as rotas de API chamam
   `obterSessao` direto. Uma conta ainda na senha provisória pode acionar toda
   action a que o cargo dá direito. Exige conhecer a senha provisória, então é
   defesa em profundidade; mudar isso agora mexeria em todo caminho de escrita.
4. **`web/src/lib/auth/acoes-senha.ts:51-80`** — **(c)**. O corpo da resposta é
   constante (correto, medido e comentado), mas o caminho não: uma conta
   inexistente volta depois de uma consulta; uma existente, depois de uma
   consulta, um insert e uma chamada HTTP ao Resend. Dá para enumerar contas
   pelo tempo, e o limite de 5 minutos é por conta e não atrapalha.
   `redefinirSenha` (linhas 112-119) também não confere a escrita de `usada_em`
   — então "funciona uma vez só" não é imposto — e não encerra as outras sessões
   da conta (`db.auth.admin.signOut(id, "global")`), que costuma ser o ponto de
   uma redefinição.
5. **`web/src/lib/acoes.ts:29`, `revalidatePath("/", "layout")`** — **(c)**.
   Invalida tudo sob o layout raiz, inclusive o `/campo` estático que o service
   worker precacheia. `marcarNotificacoesLidas` dispara isso a cada abertura do
   sino e não precisa de nenhum dos alvos úteis. Deixado porque o painel é
   `force-dynamic` e escolher alvos mais estreitos, por action, é refatoração.
6. **`web/src/lib/campo/sincronizar.ts:124-125`** — **(c)**. `const r =
   resultados[0]` sem guarda: um 200 com corpo inesperado vira TypeError que o
   `catch` genérico traduz como "Sem conexão com o servidor" para quem está
   visivelmente online — diagnóstico errado na mão de quem tem que agir.
7. **`web/src/lib/campo/sincronizar.ts:111`** — **(c)**. O recuo entre tentativas
   só vale no caminho da página; o worker o ignora. E um `ultima_tentativa_em`
   corrompido dá NaN, `agora >= NaN` é falso, e o `break` trava a fila sem erro
   na tela.
8. **`web/src/lib/campo/`** — **(c)**, e o mais importante desta lista.
   `sincronizar.ts` não tem arquivo de teste. `fila.ts`, `banco-local.ts` e
   `imagem.ts` têm. O laço de drenagem — ordem, os quatro `situacao`, 500 vs 4xx
   vs rede, fotos antes do evento, a remoção pareada com o apagamento dos blobs
   — é onde mora quase todo achado de campo deste relatório.
   `recusaPermanente` ganhou teste porque é regra pura; o laço continua
   descoberto.
9. **`web/src/lib/usuarios/acoes.ts`** — **(c)**. `mudarAtivo` bane no Auth antes
   de gravar o perfil e não confere a segunda escrita (banido no Auth, verde na
   tela); e `superAdminsAtivos` é lido e usado de forma não atômica, então dois
   Admins desativando dois Super Admins diferentes ao mesmo tempo veem `2` e
   ambos passam — zero Super Admins, exatamente o estado que
   `motivoParaNaoAlterar` existe para impedir.
10. **`web/src/lib/auth/acoes-convite.ts:39-75`** — **(c)**. `aceitarConvite`
    relata o órfão honestamente mas não desfaz nada, e o administrador que a
    mensagem manda procurar não tem ferramenta: `/usuarios` lista `ia.perfis`,
    então a conta sem perfil é invisível, o login dela diz "Esta conta está
    desativada" (mentira) e reconvidar termina em "Já existe uma conta com este
    e-mail" (também mentira). Beco sem saída, alcançável só a partir do painel
    do Supabase. As escritas de `equipes.lider_id` e de `convites.aceito_em`
    também não são conferidas.
11. **`web/src/lib/chamados/acoes.ts:120-124`, `cancelarChamado`** — **(c)**.
    Duas idas ao banco, não uma transação: o comentário
    *"Cancelamento: obra na pista"* entra em `ia.chamado_eventos` — tabela
    append-only — e só então o agendamento é descartado. Falhando o segundo, o
    histórico diz que foi cancelado e o status diz que não. Toda outra transição
    desta tela é tudo-ou-nada dentro de uma função SQL; não existe
    `ia.cancelar_chamado`.
12. **`web/src/lib/modelo/campos.ts` → `arvores.ts` → `modelo.json`** — **(c)**,
    e **anterior a este intervalo**. `simulador/_componentes/parametros.ts`
    importa `LIMITES` de `@/lib/modelo/campos`, que importa `preverBruto` de
    `arvores.ts`, que faz `import pacote from "./modelo.json"`. `parametros.ts`
    é importado por `formulario.tsx`, que é `"use client"`: o build produz um
    chunk de **6,33 MB** ligado à página do simulador. Não resolve por
    tree-shaking, porque `LIMITES` depende de verdade de `FAIXAS_TREINO`, que
    sai do JSON. O conserto honesto é `exportar_modelo.py` emitir um arquivo
    pequeno só com as faixas — mudança em Python mais artefato regerado, que
    exige o `.pkl` e as versões pinadas.

---

## 3. O que foi verificado e está limpo

Vale registrar, porque o valor de uma revisão também está no que ela descarta.

- **As duas máquinas de estado concordam, transição por transição.** Enumerando
  `chamados_funcoes.sql:88-95` contra `maquina.ts:21-47` para os 5 status não
  terminais × 15 tipos de evento, a diferença simétrica é **exatamente**
  `{aprovado, encerrado_admin, adiamento_aceito, adiamento_recusado}` — os
  quatro que o CLAUDE.md documenta como deliberadamente mais largos no
  TypeScript. Nenhum botão que o banco recuse, nenhum evento do campo que o
  banco aceite e a fila descarte. `TERMINAIS` bate com o `P0003`, e a exigência
  de fotos (`P0004`) bate com os papéis obrigatórios dos dois fluxos.
  `maquina.test.ts` **não** é tautologia: toda expectativa é literal escrito à
  mão.
- **Autorização.** Todas as actions exportadas dos seis arquivos `"use server"`
  chamam `permitir(...)` antes de qualquer leitura ou escrita; as três públicas
  (aceitar convite, pedir e executar redefinição) são públicas de propósito e
  têm as próprias proteções — o cargo vem da linha do convite e nunca do
  cliente. Todas as 11 páginas de `(painel)` chamam `exigirCargo`. Nenhuma rota
  de `/api/campo` lê `?equipe=` para autorizar escrita: a equipe sai do
  `chamado_id` do corpo, via o join até o agendamento, então não há IDOR.
  `/api/fotos/[id]` confere a matriz antes da URL assinada. `podeVerRota` casa
  com fronteira de `/`, então `/campos` não passa por `/campo`. `obterSessao` lê
  cargo e `ativo` do perfil a cada requisição; `app_metadata.cargo` é lido em um
  único lugar, o proxy, e só para escolher um destino.
- **A regra de risco.** `riscoPorPrazo` bate exatamente com o SQL da view.
  `DIAS_FOLGA_DISPENSA` espelha `LIMIAR_FECHAR_DIAS` (55) e a histerese está
  intacta; `dispensaAgendamento` fecha por `dias_ate_limite`, nunca por
  `risco === 'baixa'`. `dispensavel` é falso quando `origem = 'manual'`, com
  `!manual` no campo e não na tela. Toda superfície de `justificativa` lê a
  origem antes de nomear o autor.
- **Um agendamento aberto por trecho**: as três pontas existem e concordam sobre
  o que é "aberto", e a corrida entre dois gestores é capturada pelo `23505` e
  virada em frase legível.
- **A máquina só desfaz o que a máquina fez**: `mudarStatusAgendamento` recusa
  `executado` na action e não só na tela.
- **Nenhum N+1.** Nenhum `await` ao banco dentro de laço sobre linhas em caminho
  de render; `estado/route.ts` agrupa com `.in(...)`; o laço sequencial de
  `eventos/route.ts` é caminho de escrita sobre máquina de estados e está
  documentado como deliberado.
- **Nenhum componente `"use client"` alcança módulo de servidor** — verificado
  pelo grafo de importação, não só pelos imports diretos.
- **`/campo` continua estático** (`○` no `next build`) depois de todas as
  mudanças. Nenhum `cookies()`, `headers()`, `useSearchParams` ou `nuqs` no
  caminho de render dele.
- **`sair` não apaga o precache**: o nome do precache do serwist está em
  `PRESERVADOS` e `banco-local.test.ts` prende isso.
- **Idempotência da foto e do evento**: a deduplicação por `(evento_id, papel,
  capturada_em)` cobre o 201 cuja resposta não chegou, e o objeto do bucket é
  removido quando a linha falha. O `401` é sentinela tratada por tipo e não
  incrementa tentativas.
- **`ia.proximo_numero_chamado` é livre de corrida**; o gatilho não recursa (as
  funções nunca escrevem em `ia.agendamentos`) e as duas funções de conclusão
  marcam o chamado terminal **antes** de mexer no agendamento, então o gatilho
  as vê e retorna sem tocar em nada.
- **`numeric` chegando como string** é hipótese falsa neste banco: a view
  devolve números JSON. Os `Number()` espalhados são inofensivos, e o comentário
  de `queries.ts` que afirma "a conta lexicográfica daria 27" documenta uma
  invariante que não existe.
- **O arrasto da agenda** reverte corretamente em recusa e em exceção, com toast
  persistente, `finally` limpando `salvandoIds`, e o desfazer atrelado ao
  sucesso.

---

## 4. Onde este sistema quebra primeiro, quando a Motiva usar de verdade

**Primeiro: a fila do aparelho, não o painel.** O painel tem rede boa, servidor
sabendo das coisas e uma pessoa olhando. O campo tem uma barra de sinal, um
aparelho que passa de mão em mão e ninguém para reclamar na hora. Os achados
mais graves desta revisão vieram todos de `web/src/lib/campo/` e de `(campo)/`, e
não é acaso: é o único lugar onde estado, ordem e rede se encontram sem
supervisão. Consertei o travamento da fila e o recarregamento automático, mas
§2.3.1 continua de pé — quando o `baixarEstado` falha logo depois de um envio
bom, o cartão anda para trás e a equipe registra duas vezes. Numa malha de
verdade, com dezenas de equipes, isso acontece toda semana. **O que falta não é
mais correção pontual: é um teste do laço de drenagem** (§2.3.8). É o arquivo
mais crítico do sistema e o único sem rede de segurança.

**Segundo: os cortes silenciosos do PostgREST.** `248c1ba` corrigiu o primeiro a
estourar; `listarAgendamentos`, `listarChamados` e `execucoesDoTrecho` estão na
mesma trilha, e a diferença entre "ainda cabe" e "já não cabe" é só o tempo. O
modo de falha é o pior que este projeto tem — número plausível, errado, em
silêncio, com `error` nulo. Vale uma varredura dedicada: toda leitura cuja
contagem cresce com o uso precisa paginar ou ter `.limit()` explícito, e a
ausência disso devia ser erro de revisão, não descuido.

**Terceiro: a autoria que o banco nunca captura** (§2.2.3). `app.autor` é lido e
nunca escrito, então todo cancelamento, remarcação e troca de equipe entra no
histórico como "sistema · pelo lote". Hoje é constrangimento de demonstração;
quando a Motiva usar `ia.chamado_eventos` para responder "quem decidiu isso", a
tabela append-only vai estar cheia e não vai responder. E o defeito é silencioso
por natureza: nada falha, só ninguém sabe de quem foi.

**Quarto: a senha no repositório** (§2.2.1). Não é bug de lógica e por isso é o
mais fácil de esquecer. Um Super Admin com senha literal no código, num banco que
é o de produção da demonstração, com o script redefinindo a senha a cada execução
para que trocá-la à mão não adiante.

**E uma observação sobre a forma, não sobre os defeitos.** Este código tem uma
qualidade incomum: quase toda decisão difícil está explicada por escrito, ao lado
dela. Isso é o que tornou esta revisão possível em um dia — em vários casos o
defeito era literalmente a distância entre o que o comentário promete e o que a
linha abaixo faz (`dados.tsx` versus `painel-agendamento.tsx`; a ordem prometida
em `eventos/route.ts` versus a remoção em `sincronizar.ts`; "os dois saem da
mesma conta" em `agenda/page.tsx`). Vale tratar essas frases como o que elas já
são: asserções. **Onde uma delas afirma que duas implementações precisam
continuar iguais, o lugar certo é um teste, não um parágrafo** — é o que
`paridade-python.test.ts` e `maquina.test.ts` já fazem, e é a única razão pela
qual a parte mais perigosa do sistema, as duas máquinas de estado, foi a que
voltou limpa.
