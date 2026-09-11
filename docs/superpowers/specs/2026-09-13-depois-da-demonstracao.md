# Depois da demonstração — a lista do que ficou

Escrito em 10/09/2026, antes dos dois ensaios, para a demonstração de domingo **13/09/2026**.

Isto não é um backlog de desejos: é o registro do que foi **deliberadamente** cortado para
chegar ao domingo, com o motivo do corte e o que acontece se ficar assim. Um item que entrou
aqui não é uma falha de execução — é uma decisão tomada com data de validade. O que este
documento existe para evitar é a segunda categoria de dívida, a que ninguém escreveu e que
seis semanas depois vira "por que isso é assim?".

Cada item traz **o que é**, **por que ficou de fora** e **o que dói enquanto não for feito**.
A ordem dentro de cada bloco é de dor decrescente.

---

## Bloco 1 · Segurança e privacidade

### 1.1 · Políticas RLS por cargo, e leitura direta do Supabase pelo app

**Hoje.** RLS está ligado em todas as tabelas de `ia` e de `public`, e **sem nenhuma
política**. Sem política, RLS nega tudo: o único caminho até os dados é a chave secreta, no
servidor. O painel funciona porque toda leitura é Server Component e toda escrita é Server
Action; o app de campo funciona porque as três rotas de `/api/campo/*` também rodam no
servidor.

**Por que ficou de fora.** Escrever política por cargo é escrever a matriz de permissões uma
segunda vez, em SQL, e mantê-la igual à de `permissoes.ts`. Fazer isso na semana da
demonstração seria criar exatamente a classe de bug que o projeto mais teme: duas cópias da
mesma regra, divergindo em silêncio, num lugar onde a divergência é vazamento de dado.

**O que dói.** Todo dado do celular passa por um round-trip ao servidor da Vercel, mesmo
quando o Supabase estaria a um passo. E a arquitetura fica sem a rede de segurança de defesa
em profundidade: hoje um bug de autorização numa rota de API é o **único** obstáculo entre uma
sessão de Roçador e o chamado de outra equipe.

**Como fazer.** Uma política por tabela, lendo `auth.uid()` e o cargo de `ia.perfis` (por uma
função `stable security definer` para não recursar em `perfis`). Ordem sugerida: `chamados`,
`chamado_eventos`, `chamado_fotos`, `notificacoes` — as quatro que o app leria direto. E um
teste em `scripts/fumaca.mjs` por política, no formato dos dois que já existem ("publishável
não lê `ia.trechos`", "publishável não lê nem decide chamado"), mas invertidos: com um token
de cada cargo, provar que ele lê o que deve e **não** lê o resto. Sem esses testes, ligar
política é trocar uma garantia forte (nega tudo) por uma frouxa e não verificada.

### 1.2 · MFA TOTP

**Hoje.** E-mail e senha, mínimo 10 caracteres com letras e números, e a proteção de senha
vazada do Supabase quando o plano permite.

**Por que ficou de fora.** O Supabase Auth já suporta MFA, mas a tela de inscrição (QR do
autenticador, código de recuperação, o "onde eu guardo isto") é um fluxo inteiro, e um fluxo de
recuperação errado tranca a conta de administração — o oposto do que MFA deveria fazer.

**O que dói.** A conta de Super Admin abre o banco inteiro do produto com uma senha só. Isso é
aceitável numa demonstração e não é aceitável com dado de cliente dentro.

**Como fazer.** Obrigatório para `super_admin` e `admin`, opcional para `analista`,
**desligado para `rocador`** — o líder de equipe entra em celular de campo, com luva, sob sol,
e um segundo fator ali é a diferença entre registrar a roçada e não registrar. Antes de ligar,
resolver o item 1.3: sem e-mail funcionando, perder o autenticador é perder a conta.

### 1.3 · Domínio próprio e Resend fora do modo de teste

**Hoje.** O Resend está em modo de teste: sem domínio verificado, **só entrega para
enzo.moretto@sasi.com.br**. Todo o resto volta erro, e as telas contornam mostrando o link
copiável do convite.

**Por que ficou de fora.** Verificar domínio depende de DNS de terceiro, e não havia domínio
próprio para verificar.

**O que dói.** Duas coisas, e a segunda é pior. O convite virou trabalho manual — copiar link
e mandar por WhatsApp. E o "Esqueci a senha" **não funciona para ninguém além de uma pessoa**:
o link é gerado, o e-mail não sai, e a tela orienta a "pedir a um administrador uma senha
provisória" — que é o item 1.4, e que não existe.

**Como fazer.** Domínio próprio → registro no Resend → `EMAIL_REMETENTE` e `APP_URL` no
ambiente da Vercel. Atenção: trocar de domínio exige **APK novo** e `assetlinks.json` novo, na
ordem descrita em `docs/operacao/apk.md`; não desligue o domínio antigo no mesmo dia.

### 1.4 · Senha provisória por um caminho que existe

**Hoje.** `scripts/semear-super-admin.mjs` cria a primeira conta com `senha_provisoria = true`
e sai sem fazer nada se a conta já existir. Não há **nenhum** caminho, nem no painel nem em
script, para dar senha provisória a uma conta que já existe. `/esqueci-a-senha` orienta a
pedir uma ao administrador; o administrador não tem o botão.

**Por que ficou de fora.** Passou entre as fases: a Fase 1 tratou a criação da primeira conta,
e o texto do aviso foi escrito supondo um mecanismo que ninguém implementou.

**O que dói.** É a única frase do produto que promete algo que ele não faz. E o contorno
manual (definir a senha no Supabase e marcar `senha_provisoria = true` no SQL Editor, como
`docs/operacao/contas-e-cargos.md` §6 descreve) exige acesso ao projeto, que é justamente o
que um Admin não tem.

**Como fazer.** O menor corte honesto é um `npm run senha-provisoria -- --email …` no molde do
`semear-super-admin`: `admin.updateUserById` com uma senha aleatória, `senha_provisoria = true`
no perfil, senha impressa uma vez. Depois disso, um botão "Gerar senha provisória" na gaveta do
usuário, com a senha aparecendo **uma vez** na tela e `permitir("super_admin", "admin")`. E, aí
sim, o texto de `/esqueci-a-senha` deixa de ser uma promessa.

### 1.5 · CSP com nonce

**Hoje.** `next.config.ts` manda `X-Content-Type-Options`, `Referrer-Policy`,
`X-Frame-Options: DENY`, `Permissions-Policy` (câmera e GPS só na própria origem) e HSTS em
produção. **Sem `Content-Security-Policy`.**

**Por que ficou de fora.** O script inline que carimba `data-theme` antes da primeira pintura e
o Motion exigiriam `nonce`, e não havia tempo para medir a regressão antes de 13/09. Uma CSP
mal calibrada quebra a página em silêncio no navegador de quem está assistindo.

**O que dói.** Nada hoje, e muito no dia em que uma dependência de front-end for comprometida.
É a diferença entre um XSS ser um bug e ser um vazamento.

**Como fazer.** `nonce` gerado no proxy, propagado para o `<script>` do tema; `style-src` com
`'unsafe-inline'` no começo (Tailwind v4 e Motion escrevem estilo inline) e apertado depois;
`connect-src` fechado no Supabase, na OpenAI e na própria origem. Medir em `/simulador` e
`/campo`, que são as duas telas com mais script.

### 1.6 · Retenção de fotos

**Hoje.** Bucket privado `chamados`, URL assinada de 60 s, e **retenção indefinida**. A nota
de LGPD do spec diz isso em voz alta: nome, e-mail, cargo, e localização e hora de fotos de
trabalho em via pública, com retenção "a decidir com a Motiva".

**Por que ficou de fora.** É decisão de produto e de jurídico, não de código. Escolher um prazo
sozinho seria inventar política de privacidade.

**O que dói.** O acervo cresce para sempre, e cada foto é um dado pessoal com coordenada. Duas
fotos por etapa, duas etapas por chamado, ~4 por roçada: numa malha de 50 trechos roçados a
cada 40 dias, uns 1.800 arquivos por ano.

**Como fazer.** Definir o prazo com a Motiva (12 meses é o palpite razoável: cobre uma
temporada inteira de crescimento e um ciclo de auditoria). Depois, uma rotina que apaga o
objeto do bucket e **mantém a linha** de `ia.chamado_fotos` com o `caminho` marcado como
expirado — apagar a linha junto reescreveria o histórico, e o histórico é append-only por
princípio neste projeto.

### 1.7 · Autenticar ou remover o `main.py`

**Hoje.** O FastAPI de desenvolvimento continua no repositório, sem autenticação nenhuma,
escrevendo no **mesmo banco** que o painel. Nada em `web/` fala com ele.

**Por que ficou de fora.** Ele nunca foi publicado, e continua útil localmente: `/diagnostico`
é o único lugar que testa cada peça externa separadamente (OpenAI, Open-Meteo, SoilGrids,
Supabase, o `.pkl`).

**O que dói.** Enquanto ele existir sem guarda, um deploy distraído dele é acesso de escrita
anônimo ao banco de produção. O `CLAUDE.md` agora diz "não pode ser publicado", o que é
documentação, não impedimento.

**Como fazer.** A opção barata: exigir um cabeçalho com um segredo de ambiente e recusar sem
ele — três linhas, e o `/diagnostico` continua servindo. A opção limpa: mover `/diagnostico`
para um script (`python diagnostico.py`) e apagar o `main.py`, que é o que o projeto na prática
já fez com o resto das rotas.

---

## Bloco 2 · Atribuição e histórico

### 2.1 · `ia.atualizar_agendamento` com `app.autor`

**Hoje.** O gatilho `ia.tg_agendamentos_chamado` já lê o autor de uma variável de sessão:

```sql
v_autor := nullif(current_setting('app.autor', true), '')::uuid;
```

**e nada no sistema define `app.autor`** — nem o painel, nem o lote, nem os scripts. Medido:
uma busca por `app.autor` em todo o repositório dá **uma** ocorrência, a linha acima.

**A consequência é visível na tela.** Todo evento que o gatilho cria sai com `autor_id` nulo,
`autor_nome = 'sistema'` e origem `sistema` ou `lote`. Então:

- o gestor arrasta um cartão na agenda e a linha do tempo do chamado diz que **o sistema**
  mudou a data;
- o gestor clica em "Descartar" e o evento `cancelado` aparece com origem **`lote`** — o
  comentário imediatamente anterior carrega o nome certo, mas o evento que conta a história
  não;
- aceitar um adiamento remarca o agendamento, e o `remarcado` resultante também é do
  "sistema", logo abaixo de um `adiamento_aceito` que nomeia a pessoa corretamente.

**Por que ficou de fora.** `set_config('app.autor', …, true)` vale por **transação**, e o
PostgREST não dá controle de transação: um `db.rpc('set_config')` seguido de um `update` são
duas transações, e a variável já não existe na segunda. A saída correta é uma função SQL que
recebe o autor como parâmetro e faz as duas coisas dentro dela — ou seja, uma função nova, com
migração, na semana da demonstração.

**O que dói.** O histórico do chamado é a peça que o produto vende como "o sistema explica por
quê". Ele atribuir a "sistema" três das decisões mais humanas que existem (remarcar, descartar,
trocar equipe) contradiz isso na própria tela.

**Como fazer.** `ia.atualizar_agendamento(p_id, p_autor, p_status, p_data_sugerida,
p_equipe_id)`: `perform set_config('app.autor', p_autor::text, true)` e depois o `update`,
tudo numa transação, com `grant execute … to service_role`. Passam a chamá-la, em vez de
escrever na tabela, as sete actions que hoje mexem em `status`, `data_sugerida` ou `equipe_id`
— `mudarStatusAgendamento`, `atribuirEquipe`, `aprovarAgendamento`, `alocarAgendamento`,
`desfazerAlocacao`, `devolverParaFila` e `remarcarAgendamento` —, mais `ia.decidir_adiamento`,
que remarca por dentro. Um teste que prove que o evento resultante tem `autor_nome` da pessoa,
e não `'sistema'`.

### 2.2 · Um link para `/definir-senha`

**Hoje.** A tela existe, exige sessão e funciona para qualquer cargo — mas **não há link para
ela em lugar nenhum**. O menu de usuário tem só "Sair". Quem quer trocar a própria senha digita
o caminho na barra de endereço, o que `docs/operacao/contas-e-cargos.md` §6 é obrigado a
ensinar.

**Como fazer.** Um item "Trocar minha senha" em `menu-usuario.tsx`, e o equivalente na gaveta
de sair do app de campo. É a correção de menor custo desta lista inteira.

---

## Bloco 3 · Avisar as pessoas

### 3.1 · E-mail de aviso

**Hoje.** O único e-mail que o sistema manda é convite e redefinição de senha. Chamado
esperando aprovação, adiamento pedido, chamado devolvido: tudo vive no sino, dentro do painel.

**Por que ficou de fora.** Depende de 1.3 (Resend fora do modo de teste) para ter qualquer
utilidade.

**O que dói.** Um chamado finalizado às 17h de sexta espera até alguém abrir o painel. A
equipe fica sem resposta, e o "aguardando aprovação" some do radar exatamente no fim de
semana, que é quando ele mais atrasa a roçada seguinte.

**Como fazer.** Um resumo diário por cargo (não um e-mail por evento: `finalizado` e
`adiamento_solicitado` notificam **todos** os Admin ativos, e isso vira uma caixa de entrada
inutilizável). O template já tem base: `src/emails/base.tsx`. O disparo pode ser um passo a
mais no workflow das 06:00, que já roda todo dia e já tem a chave secreta.

### 3.2 · Web Push (VAPID e tabela de inscrições)

**Hoje.** O APK é gerado com `Notifications: enabled` justamente para isto ser possível sem
refazer o pacote — mas nada envia push, e nada guarda inscrição.

**Por que ficou de fora.** Exige par de chaves VAPID, tabela de inscrições, um handler de
`push` no service worker e um remetente no servidor. Nenhuma dessas peças é difícil; as quatro
juntas não caberiam antes de domingo.

**O que dói.** O líder de equipe só descobre que um chamado foi devolvido quando abre o app.
Se ele já saiu do trecho, a viagem se perde.

**Como fazer.** `ia.inscricoes_push (usuario_id, endpoint unique, p256dh, auth, criado_em,
ultimo_erro_em)` — com `endpoint` único, porque o navegador troca a inscrição sozinho e a
antiga precisa morrer. As chaves VAPID em `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`; a pública
vai ao cliente. O `push` handler entra em `src/app/sw.ts`, que já tem o handler de `sync` e já
é compilado por `@serwist/turbopack`. Quem dispara são as **funções SQL**, que já são o único
lugar que decide quem-avisa-quem (`ia.notificar`): o push é um segundo canal da mesma decisão,
nunca uma regra nova — se as duas divergirem, o sino e o celular contarão histórias
diferentes.

---

## Bloco 4 · Alcance

### 4.1 · iPhone

**Hoje.** Android 10+ com Chrome. O app é PWA, então abre num iPhone pelo Safari, mas com duas
perdas concretas: **não há Background Sync no iOS** (a fila só sobe quando o app está visível —
`pedirSincronizacaoEmSegundoPlano` já devolve `false` em silêncio ali), e "Adicionar à tela
inicial" é manual, sem APK equivalente.

**O que dói.** Uma equipe com iPhone precisa abrir o app para a fila subir. Funciona, mas o
"desligue o modo avião e esqueça" do roteiro não vale.

**Como fazer.** Medir primeiro: quantos aparelhos da operação são iPhone? Se for exceção,
basta a instrução de "abrir o app no fim do dia" e um aviso na tela quando
`Background Sync` não existe. Se não for, o caminho é Capacitor ou um app nativo fino, e isso
é projeto, não item de lista.

### 4.2 · Play Store

**Hoje.** APK por link direto, com "instalar apps de fontes desconhecidas" no meio do caminho.

**O que dói.** Esse passo assusta, e não é pouco: é um aviso de segurança do Android que a
pessoa tem que contrariar. Numa operação com dezenas de líderes, é atrito por aparelho e uma
pergunta por instalação.

**Como fazer.** Conta de desenvolvedor Google (US$ 25, uma vez), o `.aab` que o PWABuilder já
gera no mesmo zip, política de privacidade publicada (que depende de 1.6, retenção) e a ficha
de *Data safety* declarando localização e fotos. Distribuição interna (*Internal testing*)
resolve a operação sem revisão pública e é o caminho mais curto.

---

## Bloco 5 · Dívida técnica de plataforma

### 5.1 · `unstable_cache` → `use cache`

**Hoje.** `unstable_cache` em toda a camada de clima e solo do simulador, com a digital do
prompt e o solo dentro da chave de cache (porque `unstable_cache` monta a chave com os
argumentos **e** o corpo da função).

**Por que ficou de fora.** É troca de API sem ganho visível para a demonstração, e a chave de
cache é exatamente o lugar onde um erro silencioso serve resposta velha por uma hora.

**O que dói.** Nada funcionalmente. `unstable_cache` é API instável por nome; um dia ela sai.

**Como fazer.** `use cache` com `cacheLife`/`cacheTag`. Ao migrar, refazer à mão o que a chave
implícita fazia de graça: a digital do prompt e os parâmetros de solo têm que entrar em
`cacheTag`, ou editar as instruções da LLM deixa vivas as respostas do prompt antigo.

### 5.2 · `* { border-color: var(--border) }` fora de camada

**Hoje.** A linha 244 de `globals.css` mata **toda** utility `border-<cor>` do Tailwind v4, sem
erro de build e sem aviso do lint. O contorno é `style={{ borderColor: … }}`, documentado no
`CLAUDE.md` e no helper `borda()` de `campo/_componentes/base.tsx`.

**Por que ficou de fora.** Consertar é mover a regra para `@layer base`, e isso muda a
precedência de **toda borda do painel** de uma vez. É o tipo de mudança que se faz com tempo
de olhar cada tela, não na semana da demonstração.

**O que dói.** Toda vez que alguém escrever `border-critical` esperando vermelho e receber
cinza. Já aconteceu.

**Como fazer.** Envolver a regra em `@layer base`, rodar `npm run verificar`, e depois passar
pelas telas de borda informativa (agenda, chamados, avisos) confirmando que o `style` inline
continua vencendo — ele vence, porque atributo `style` bate qualquer camada; o que muda é o
que as classes passam a fazer. Aproveitar para trocar os `style` que existiam **só** por causa
disto de volta para classe.

### 5.3 · A espera entre tentativas da fila do campo não espera

**Hoje.** `esperaAntesDaTentativa` devolve 0, 2 s, 8 s, 30 s e 120 s, e tem teste. Mas
`sincronizar.ts` ancora a janela em `item.criado_em`, que **nunca muda**: um item criado há dez
minutos e que já falhou quatro vezes tem `criado_em + 120 s` no passado, então tenta de novo em
toda passada. A função existe, é testada, e não tem efeito.

**O que dói.** Pouco na prática — as passadas são disparadas por evento (montagem, `online`,
`visibilitychange`, registro novo), não por temporizador, então não há tempestade. Mas o
recuo desenhado não é o recuo que roda, e a próxima pessoa que ler o teste vai acreditar nele.

**Como fazer.** `ItemFila` ganha `ultima_tentativa_em`, gravado junto com `tentativas` em
`atualizarItem`, e a janela passa a ser `ultima_tentativa_em + esperaAntesDaTentativa`. O
IndexedDB já está na versão 1 com `keyPath: "evento_id"`; um campo novo e opcional não exige
migração de esquema, e ausente vale como "nunca tentou".

### 5.4 · O lote e o recorte de janela longa

**Hoje.** `carregar()` do treinador descarta toda janela com roçada ou fogo dentro. Para
horizontes de 60 a 120 dias o modelo só viu trajetórias que **nunca precisaram de roçada** —
um recorte enviesado para o crescimento lento. Está registrado no `CLAUDE.md` desde a v3.2 e
não mudou.

**O que dói.** A cauda longa do simulador (acima de uns 60 dias) é sistematicamente otimista.
A agenda não usa esse horizonte, então a operação não sente; a tela de simulação sente.

**Como fazer.** Não é conserto de código, é de dataset: gerar janelas longas **com** roçada
dentro e ensinar o modelo a responder "cresceu, foi cortado, cresceu de novo" — ou aceitar o
recorte e cortar o simulador em 60 dias, dizendo por quê. A segunda é honesta e barata; a
primeira é a certa.

---

## Bloco 6 · O que os ensaios mostrarem

**A preencher nos dois ensaios (Fase 4, Tasks 1 e 3).** Regra combinada: nada que o ensaio
revelar entra no código depois do Ensaio 2, exceto bloqueio total. O que incomodar e não for
bloqueio **entra aqui**, com uma linha dizendo o que aconteceu e em qual passo do roteiro.

Deixe esta seção como lista, e não como prosa: ela vai ser escrita com pressa, entre um ensaio
e outro, e uma lista aguenta isso.

- Passo do roteiro · o que incomodou · quanto custou (segundos, cliques, explicação)
- …

---

## O que **não** entra nesta lista

Para a lista continuar servindo, três coisas ficam fora dela de propósito.

**Pendências da própria Fase 3 que ainda são tarefa, não dívida.** O APK não foi gerado, o
`web/public/.well-known/assetlinks.json` não existe, não há release no GitHub e o cartão
"Baixar o app de campo" não está em `/usuarios`. Isso é a Task 7/8 da Fase 3 em aberto, com
procedimento escrito em `docs/operacao/apk.md`, e o plano já registra o corte se apertar
("Adicionar à tela inicial" pelo Chrome, que funciona desde que a PWA existe).

**Ideias sem dor medida.** Relatório de produtividade por equipe, mapa em tempo real, custo por
km — tudo plausível, nada pedido por ninguém que use o sistema. Entram quando alguém sentir
falta, não quando alguém imaginar.

**Refatoração por gosto.** Este repositório tem duas cópias deliberadas da mesma regra (a
máquina de estados, em SQL e em TypeScript; as features do modelo, em Python e em TypeScript) e
as duas são **de propósito**, com teste prendendo a paridade. Unificá-las é a tentação óbvia de
quem chega agora, e seria trocar duas implementações independentes que se conferem por uma que
ninguém confere.
