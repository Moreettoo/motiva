# Contas e cargos — guia de operação

Para quem **usa** o HighwAI, não para quem o programa. Cobre convidar gente, entender o que
cada cargo alcança, trocar o líder de uma equipe, desativar um acesso e resolver senha
esquecida.

Tudo o que está aqui se faz na tela **Usuários**, na lateral, grupo *Administração*. Ela só
aparece para Admin e Super Admin.

---

## 1 · Os quatro cargos

| Cargo | Vê | Faz |
|---|---|---|
| **Super Admin** | Tudo, inclusive o *Laboratório* (Simulador) | Tudo. É o único que convida outro Super Admin e o único que promove alguém a Super Admin. |
| **Admin** | Painel, Malha, Agenda, Trechos, Copiloto, Chamados, Campo, Usuários | Aprova e descarta agendamentos, aprova e devolve chamados, decide adiamentos, encerra administrativamente, convida e desativa gente. Não vê o Simulador. |
| **Analista** | Painel, Malha, Agenda, Trechos, Copiloto | **Nada.** Somente leitura, e a tela diz isso numa frase no topo. Sem botões de ação, sem arrasto na agenda, e `/chamados` ou `/usuarios` na barra de endereço caem em "Esta tela não faz parte do seu acesso". |
| **Roçador** | Só `/campo` | É o **líder de uma equipe**: inicia e finaliza roçada com foto, e pede adiamento. Entrar no sistema o leva direto ao app de campo; nenhuma tela do painel abre para ele. |

Três coisas que costumam surpreender:

- **Roçador é líder, não é "a equipe".** Uma equipe tem **exatamente um** líder, e é a conta
  dele que abre os chamados daquela equipe no celular. Uma equipe sem líder existe, aparece na
  agenda e recebe chamado — mas **ninguém a vê no app** até um Roçador ser convidado para ela.
- **Admin e Super Admin também abrem `/campo`.** É de propósito: é como se dá suporte a uma
  equipe sem pedir o celular dela. Ao entrar, o app pergunta qual equipe mostrar.
- **O Analista não é um "quase Admin".** Ele existe para quem precisa acompanhar a malha e
  não deve mover nada. Se a pessoa precisa aprovar qualquer coisa, o cargo é Admin.

---

## 2 · Convidar alguém

Ninguém se cadastra sozinho: não existe tela de cadastro, e a única porta de entrada é o
convite — a conta é criada pelo servidor no momento em que o convite é aceito.

1. **Usuários → Convidar** (o botão fica no canto do cabeçalho; a gaveta também abre pela URL
   `/usuarios?convidar=true`).
2. **E-mail.** Se já existir conta com esse endereço, o convite é recusado com "Já existe uma
   conta com este e-mail" — nesse caso o caminho é a seção 6, não um convite novo.
3. **Cargo.** A lista já vem filtrada: um Admin não vê a opção Super Admin.
4. **Equipe que vai liderar** — só aparece, e é **obrigatória**, quando o cargo é Roçador.
   Se a equipe escolhida já tem líder, o convite é recusado até você marcar
   *"substituir o líder atual (Nome)"*. A troca só acontece quando a pessoa **aceitar** o
   convite; até lá o líder antigo continua no lugar.
5. **Enviar convite.** A tela mostra o **link do convite** com um botão *Copiar link*, e diz
   se o e-mail saiu.

O convite vale **7 dias**. A pessoa abre o link, escreve o nome como a equipe a conhece,
escolhe uma senha (mínimo 10 caracteres, misturando letras e números) e já entra logada.

### O e-mail pode não sair, e isso é esperado hoje

O Resend está em **modo de teste**: sem domínio verificado, ele só entrega para o e-mail da
própria conta — hoje, **enzo.moretto@sasi.com.br**. Qualquer outro destinatário volta erro.

Por isso a tela **sempre** mostra o link copiável, e mostra um aviso amarelo
*"O e-mail não saiu — mande o link por outro canal"* quando foi o caso. Mande o link por
WhatsApp ou pessoalmente. **O link é o convite**: quem tem o link cria a conta, então trate-o
como senha e não o coloque em grupo.

### Convites pendentes

A lista abaixo da tabela de usuários mostra os convites que ninguém aceitou ainda, com
"vale até" ou "venceu em".

- **Reenviar** gera um **link novo** (o anterior deixa de valer) e tenta o e-mail de novo. É o
  que se faz com convite vencido. O botão *Copiar link* aparece só para o convite reenviado
  **nesta sessão** — o banco guarda apenas o resumo criptográfico do token, não o link; para
  qualquer outro, o caminho é reenviar.
- **Revogar** cancela o convite. Pede confirmação. Um convite revogado não pode ser
  ressuscitado: convide de novo.

---

## 3 · Trocar o líder de uma equipe

Há dois caminhos, e a escolha é entre "a pessoa nova já existe no sistema?".

**A pessoa nova ainda não tem conta** → convide-a como Roçador escolhendo aquela equipe e
marcando *"substituir o líder atual"*. A troca acontece no momento em que ela aceita.

**A pessoa nova já tem conta de Roçador** → Usuários → clique no nome dela → campo **Equipe
liderada** → escolha a equipe → *Gravar*. Se a equipe já tem outro líder, marque
*"substituir o líder atual"*.

**A pessoa nova tem conta, mas não é Roçador** → são duas gravações, nesta ordem: mude o cargo
para Roçador e clique em *Alterar cargo*; **o campo Equipe liderada só aparece depois disso**,
porque ele é desenhado a partir do cargo que está gravado, não do que está escolhido na tela.

Em qualquer dos dois casos, o líder antigo **continua com a conta ativa**, apenas sem equipe:
ele passa a ver a mensagem "Você ainda não lidera uma equipe. Peça a um administrador." ao
abrir o app. Se ele saiu da empresa, desative-o (seção 5).

**Uma pessoa lidera no máximo uma equipe.** Escolher outra solta a anterior automaticamente.
E escolher **"Nenhuma"** deixa a equipe sem líder: os chamados dela continuam existindo no
painel, mas nenhum celular os mostra.

**Mudar o cargo de um Roçador para Admin ou Analista solta a equipe** dele na hora. Um Admin
não lidera turma.

---

## 4 · Alterar o cargo de alguém

Usuários → clique no nome → **Cargo** → *Alterar cargo*.

Quando a mudança não é permitida, o campo já mostra o motivo antes de você clicar, com a
mesma frase que o servidor usaria:

| Situação | Frase |
|---|---|
| Você tentando alterar você mesmo | "Você não pode alterar a si mesmo. Peça a outro administrador." |
| Admin mexendo num Super Admin | "Um Admin não altera um Super Admin." |
| Alguém que não é Super Admin promovendo a Super Admin | "Só um Super Admin promove a Super Admin." |
| Rebaixar ou desativar o **último** Super Admin ativo | "Este é o último Super Admin ativo; promova outro antes." |

A última é a que salva o sistema de uma tarde ruim: sem ela, um clique tranca a administração
inteira e a única saída é mexer no banco.

---

## 5 · Desativar e reativar

Usuários → clique no nome → **Desativar acesso** → confirmar.

O que acontece:

- o login novo é bloqueado (a tela diz "Esta conta está desativada. Fale com um
  administrador.");
- a sessão que já estava aberta morre na **próxima** ação da pessoa — não em uma hora, na
  próxima requisição;
- se ela liderava uma equipe, a equipe fica **sem líder** (lembre de dar um líder novo);
- **nada é excluído.** O histórico continua nomeando quem fez cada coisa, porque o nome de
  quem agiu é copiado para o evento no momento em que ele acontece.

**Reativar** devolve o acesso com a mesma senha, mas **não devolve a equipe**: se a pessoa
volta a ser líder, aponte a equipe de novo (seção 3).

Desativar não é o mesmo que trocar de cargo. Quem mudou de função continua precisando entrar —
troque o cargo. Quem saiu da empresa, desative.

---

## 6 · "Esqueci a senha" — e o e-mail não chega

Este é o ponto frágil de hoje, e vale ler antes de precisar.

### Quem consegue entrar e só quer trocar a senha

Peça para abrir **`/definir-senha`** com a sessão aberta (digitando o caminho na barra de
endereço — ainda não há link no menu). A tela pede a senha nova duas vezes e pronto.

### Quem não consegue entrar

O caminho desenhado é **Entrar → "Esqueci a senha"**: a pessoa informa o e-mail e recebe um
link válido por 1 hora. A tela responde sempre a mesma coisa, exista a conta ou não — é de
propósito, para não confirmar quem tem acesso ao sistema.

**Enquanto o Resend estiver em modo de teste, esse e-mail só chega para
enzo.moretto@sasi.com.br.** Para todos os outros o link é gerado e não é entregue. A própria
tela avisa: *"O serviço de e-mail está em modo de teste; se você não receber, peça a um
administrador uma senha provisória."*

E aqui está a parte que o painel **ainda não faz**: não existe botão de "senha provisória".
Convidar de novo também não resolve, porque a conta já existe. Então, hoje, o desempate é
manual e precisa de quem tem acesso ao projeto no Supabase:

1. No Supabase, defina uma senha nova para aquela conta (Authentication → Users → a conta).
2. No SQL Editor, marque a conta para ser obrigada a trocá-la no primeiro acesso:

   ```sql
   update ia.perfis set senha_provisoria = true where email = 'pessoa@empresa.com.br';
   ```

3. Passe a senha nova por um canal direto. No próximo login o painel leva a pessoa para
   `/definir-senha` e não a deixa sair de lá antes de definir a definitiva.

O passo 2 não é burocracia: sem ele a senha que você digitou continua valendo, e você passa a
conhecer a senha de outra pessoa.

**A saída definitiva é verificar um domínio no Resend** — está na lista do depois
(`docs/superpowers/specs/2026-09-13-depois-da-demonstracao.md`), junto de um script de senha
provisória que dispensa o Supabase.

---

## 7 · A primeira conta, e as contas de demonstração

**A primeira conta do sistema** não vem de convite: ela é criada uma vez por
`npm run semear:super-admin -- --email … --nome "…"`, dentro de `web/`. O script imprime uma
senha provisória **uma única vez** e o primeiro login cai em `/definir-senha`. Se a conta já
existir, ele não faz nada.

**As contas de demonstração** vêm de `npm run semear:demonstracao` e usam o domínio
`demo.highwai.com.br`: `super.demo@`, `admin.demo@`, `analista.demo@` e um `lider.<id>.demo@`
para cada equipe ativa. Todas com a mesma senha, a de `SEED_SENHA` em `web/.env.local`,
impressa no fim da execução. **`SEED_SENHA` é obrigatória e não tem valor de reserva**: o
literal que existia no script até 11/09/2026 era a senha de `super.demo@`, que nasce
`super_admin` no mesmo banco de produção — quem lesse o repositório entrava como Super Admin.

Duas cautelas com o seed:

- Ele **não sequestra equipe que já tem líder**: só preenche as que estavam vazias.
- `npm run semear:demonstracao -- --limpar` desfaz o que ele criou, **incluindo a medição e a
  execução** que a aprovação de chamado gravou. Isso importa porque medição é entrada do
  modelo: deixada para trás, ela mudaria a agenda de um trecho real na rodada seguinte do
  lote. Rode a limpeza antes de sair de uma demonstração.

---

## 8 · Limites conhecidos

Nada disto é bug a ser aberto: é o estado de hoje, escrito para ninguém perder tempo
procurando o botão.

| Limite | O que fazer hoje |
|---|---|
| E-mail só chega para `enzo.moretto@sasi.com.br` (Resend em modo de teste) | Use o link copiável do convite; para senha, a seção 6. |
| Não há botão de "senha provisória" para conta existente | Seção 6, passos manuais. |
| Não há link para `/definir-senha` no menu | Digite o caminho. |
| Não há como **excluir** uma conta pelo painel | Desative. Excluir apagaria o histórico junto. |
| Uma pessoa lidera no máximo uma equipe | Se uma turma se divide, crie a segunda equipe e convide outro líder. |
| Equipe sem líder não aparece em nenhum celular | O painel continua mostrando os chamados; a execução fica com "encerrar administrativamente". |
| Não há verificação em duas etapas | Está na lista do depois. |
| O sino do Analista fica sempre vazio | As notificações são endereçadas a Admin, Super Admin e ao líder da equipe; nunca ao Analista. |
| Não há tela de "quem fez o quê" por usuário | O histórico existe **por chamado**, na gaveta de Chamados. |
