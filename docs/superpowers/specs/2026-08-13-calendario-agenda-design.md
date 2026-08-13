# Quadro da semana — a agenda vira um calendário arrastável

Data: 2026-08-13 · Estado: aprovado, pronto para plano de implementação

## O problema

A agenda hoje é uma régua Gantt: equipes nas linhas, dias nas colunas, blocos cuja largura é o
tempo de serviço. Ela informa bem e não faz nada — toda decisão sai por formulário, e a fila de
decisão vive numa coluna de 380 px ao lado, desconectada do plano que ela alimenta.

O gestor abre essa tela para responder uma pergunta só: **quem roça o quê, em que dia.** Hoje ele
lê a régua, decide de cabeça, e depois procura o formulário certo. O quadro novo faz da decisão o
próprio gesto: arrastar o serviço para o cruzamento de um dia com uma turma **é** a decisão.

## O que decidiu o desenho

Quatro escolhas do usuário, tomadas antes da spec:

1. **O dia é a coluna**, e dentro de cada dia os serviços ficam agrupados por equipe, com a barra
   de capacidade da turma naquele dia. Não é mais uma régua Gantt transposta: é um calendário.
2. **A fila de decisão é a primeira coluna do quadro**, sempre visível.
3. **Semana fixa de 7 dias**, com navegação `‹ ›` e `Hoje`. Some o seletor Semana/Quinzena/Mês.
   Acima do quadro, uma faixa de 28 dias que salta para a semana clicada.
4. **Para um serviço ocupar um dia, ele precisa ter equipe.** Esta é a regra que estrutura tudo
   abaixo: o alvo de solta é sempre o par `(dia, equipe)`, nunca um dia solto.

## Os números que o desenho precisa aguentar

Medidos no banco em 2026-08-13, não estimados:

| Fato | Valor | Consequência de projeto |
|---|---|---|
| Agendamentos em aberto | 97 | O trilho e o quadro carregam tudo; nada de paginação |
| Em aberto **com** equipe | 35 | O quadro nasce quase vazio — ver §2 |
| Em aberto **sem** equipe | 62 (52 sugerido + 10 aprovado) | O trilho é o conteúdo principal, não um apêndice |
| Equipes ativas | 10, de 4,5 a 11,0 km/dia | 10 linhas × 7 dias = 70 células por semana |
| Extensão dos trechos | 3,0 a 5,0 km | `diasServico` é **1** em 97 de 97; o pior caso alcançável é 2 |
| Horizonte dos abertos | 2026-06-07 a 2026-10-05 | 17 semanas: a faixa de 28 dias nunca cobre tudo |

O terceiro e o quinto derrubaram premissas que eu tinha antes de medir. **`diasServico` é 1 em
todos os serviços de hoje** — o "km 524,0" da tela é marco quilométrico, não extensão. Logo a
maquinaria de bloco atravessando colunas não se paga: fica só o caso de 2 dias, e num laço de
quatro linhas.

E **35 de 97 com equipe** significa que um quadro que só mostre trabalho alocado teria 6 cartões
em 70 células. Isso é o §2.

---

## 1. Modelo da tela

Cada agendamento em aberto está em exatamente um dos dois estados, e o estado é derivado do
banco, nunca guardado na tela:

| Estado | Condição | Onde aparece |
|---|---|---|
| **Proposto** | `equipe_id IS NULL` e `status ∈ {sugerido, aprovado}` | Trilho da fila **e** linha "Propostas da IA" |
| **Programado** | `equipe_id` preenchido e `status ∈ {sugerido, aprovado}` | Célula `(dia, equipe)` |

`executado` e `descartado` aparecem em cinza quando o filtro de status os inclui, e não são
arrastáveis.

### O trilho e a linha de propostas são a mesma lista, em duas ordens

Esta é a decisão que merece explicação, porque parece duplicação e não é.

- **Trilho** — os 62 sem equipe, ordenados por urgência (`ordenarPorUrgencia`), com cabeçalhos
  "Vence nesta semana" e "Depois". A contagem **não muda ao navegar entre semanas**: é o backlog,
  e um backlog que encolhe quando você olha para outra semana não é um backlog.
- **Linha "Propostas da IA"** — a primeira linha do quadro, presente em todas as 7 colunas. Mostra
  os mesmos itens, posicionados no dia que a IA propôs, para os que caem na semana visível.

Focar ou sobrevoar um cartão acende o gêmeo no outro lugar. Arrastar qualquer um dos dois grava a
mesma coisa. A leitura que cada um entrega é diferente: o trilho responde "o que é mais urgente",
a linha responde "o que a IA quer neste dia".

A linha de propostas **não aceita solta**. Soltar ali seria marcar um dia sem equipe, que é
exatamente o que a regra 4 proíbe. A recusa mostra o motivo: *"Escolha uma equipe — um dia só é
marcado com turma."*

### As 10 linhas de equipe ficam sempre visíveis

Nada de colapsar turmas sem serviço. Duas razões:

1. Uma célula vazia é um **alvo de solta**, não espaço morto. Colapsar as turmas ociosas esconde
   64 das 70 oportunidades justamente na tela cuja função é distribuir trabalho.
2. Colapsar exigiria expandir durante o arrasto, e expandir muda a altura do quadro no instante
   em que o cartão está sob o dedo. Animar altura violaria a regra de só `transform`/`opacity`, e
   não animar faria a tela saltar no pior momento possível.

A ordem das linhas é **estável e sempre a mesma**: `base_uf` e depois `nome`, como
`montarRaias` já faz. Nunca por carga da semana — se a ordem mudasse ao navegar, "a mesma linha"
deixaria de significar "a mesma turma", e o `↑ ↓` do teclado perderia o sentido.

---

## 2. Grade e capacidade

### Tipos

Em `web/src/app/agenda/_componentes/dados.tsx` (as funções puras continuam todas num arquivo só,
que é o que hoje mantém régua, fila e resumo concordando no mesmo número):

```ts
/** `${dia}|${equipeId}`. Sem pipe no id do DOM — ver §5. */
export type ChaveCelula = string;

export type Celula = {
  chave: ChaveCelula;
  dia: string;
  equipeId: number;
  itens: ItemAgenda[];
  km: number;
  capacidade: number;
  /** km ÷ capacidade, em porcentagem. Pode passar de 100. */
  ocupacao: number;
  excedida: boolean;
  /** Falso para dia passado e para turma inativa. Célula que não aceita solta
   *  NÃO emite `data-celula`, senão o hit-test a encontraria mesmo assim. */
  aceitaSolta: boolean;
};

export type LinhaEquipe = { equipe: Equipe; celulas: Celula[]; kmSemana: number };

export type Grade = {
  janela: Janela;
  /** dia → itens sem equipe cuja data cai nele. Alimenta a linha de propostas. */
  propostas: Map<string, ItemAgenda[]>;
  linhas: LinhaEquipe[];
  /** Todos os sem equipe, por urgência. Independe da semana visível. */
  fila: ItemAgenda[];
  porDia: ResumoDia[];
};

export function montarGrade(entrada: {
  itens: ItemAgenda[];
  equipes: Equipe[];
  janela: Janela;
  hoje: string;
}): Grade;
```

### A carga de uma célula

Cada serviço deposita `km / diasServico` em cada dia que ocupa, para a turma dele. Uma passada
sobre os itens preenche o `Map`; nada de varrer a grade por célula.

A ocupação de um dia usa **interseção de intervalo**, não igualdade de data:

```ts
/** Serviço ocupa [inicio, inicio + diasServico). Hoje diasServico é sempre 1,
 *  mas a igualdade de data mentiria no dia em que deixar de ser. */
function ocupaDia(item: ItemAgenda, dia: string): boolean {
  const d = diasEntre(item.data, dia);
  return d >= 0 && d < item.diasServico;
}
```

Isso obriga a entrada de `montarGrade` a ser **todos os agendamentos em aberto**, não os já
recortados pela janela: um serviço iniciado antes da segunda-feira e que atravessa a semana
precisa contar na capacidade dos dias em que ele de fato ocupa a turma. A janela recorta a
**exibição**, não o cálculo.

### Prévia da solta

Enquanto o cartão paira sobre uma célula, a barra de capacidade daquela célula mostra o resultado
do movimento antes de soltar. É um delta escalar sobre 2 a 4 células (a origem perde, o destino
ganha), nunca um recálculo da grade:

```ts
export function previaDoMovimento(
  grade: Grade, item: ItemAgenda, destino: ChaveCelula,
): Map<ChaveCelula, { km: number; ocupacao: number; excedida: boolean }>;
```

Um índice reverso `item.id → Fatia[]`, montado junto com a grade, devolve a carga da origem em
O(1). O caso degenerado (origem igual ao destino) devolve o mapa vazio.

E `fatiasEm` recalcula a duração no **destino**, porque a capacidade da turma nova pode mudá-la:

```ts
/** O caso de 1 dia é 100% do tráfego hoje; o laço existe porque a capacidade
 *  do destino pode esticar o serviço para 2 dias. */
export function fatiasEm(item: ItemAgenda, dia: string, equipe: Equipe): Fatia[];
```

Quando `fatias.length > 1`, o cartão ganha um selo `2 d` e a segunda célula recebe uma cópia fina
(`opacity` reduzida, `aria-hidden`). Sem constante de campanha, sem estado de continuação.

### Estourar a capacidade avisa, não bloqueia

Continua o comportamento de hoje: aceita e hachura. `capacidade_km_dia` é média de cadastro, não
restrição física — o gestor sabe de hora extra, de turma emprestada e de mutirão que o sistema não
sabe. Bloquear transformaria um número aproximado em lei.

A hachura vermelha (`HACHURA_EXCESSO`, que sai de `linha-do-tempo.tsx` e passa a viver em
`dados.tsx`) marca a célula, e vem acompanhada de ícone `OctagonAlert` e rótulo — cor de status
nunca aparece sozinha.

### A faixa de 28 dias

Ela existe para responder **quanto trabalho pousou em cada dia e quanto dele ainda não tem
turma** — que é a pergunta que 62 de 97 sem equipe cria.

- Mede **contagem de serviços**, não km. Com capacidade instalada constante (74,5 km/dia somando
  as 10 turmas), `km / capacidade` é km reescalado, e o pico real daria 20,8% de altura numa
  faixa de 36 px: dois terços do canal morrem.
- **Escala local**: o dia mais cheio dos 28 vai a altura cheia.
- Coluna empilhada de dois segmentos: alocado em `--ink-3`, sem equipe em `--surface-3` com
  contorno `--border-strong`. **Nenhuma cor de status na faixa** — assim `--critical` fica
  reservado para o único sinal que é status de verdade: o `OctagonAlert` de 10 px no topo da
  coluna quando alguma turma passou da capacidade naquele dia.
- **Ancorada na segunda-feira da semana visível**, não na de hoje. Navegar seis semanas à frente
  com a faixa parada em agosto apontaria para um intervalo que não contém o quadro.
- Rótulo honesto: `‹ 4 semanas ›`, não "panorama". Os abertos ocupam 17 semanas.

Rodapé: *"A altura é o número de serviços no dia; a parte clara ainda não tem equipe. O ícone
marca dia com turma acima da capacidade."*

---

## 3. O motor de arrasto

**Pointer Events próprios, num hook `usar-arrasto.ts`. Zero dependência nova.**

As alternativas perdem por motivo estrutural, não por gosto:

| | Por que não |
|---|---|
| HTML5 DnD | Sem toque em Android/iOS sem polyfill; a imagem de arrasto é bitmap do navegador e não aceita nossos tokens; em modo protegido o `dataTransfer` é ilegível durante o `dragover`, então não dá para validar `(dia, equipe)` enquanto o cartão paira — que é o feedback central desta tela |
| `drag` do motion | Aplica `transform` no nó original: ele continua filho do container com `overflow`, logo continua recortado, e sair do fluxo faz a coluna refluir sob o ponteiro. Escapar disso exige `dragListener={false}` + `dragControls` + portal + `fixed`, que é Pointer Events com uma camada a mais. Além disso o motion carimba `touch-action` durante todo o ciclo, matando a rolagem vertical no toque |
| `@dnd-kit/core` | ~40 kB numa página que hoje manda zero código de arrasto, para resolver reordenação em lista e colisão genérica — nada disso é o problema: os alvos são uma grade fixa e enumerável de 70 células, e não há reordenação dentro da célula. Some-se que a 6.x é de era React 18 e o sucessor mantido ainda é pré-1.0 |

O `motion` continua no projeto e continua sendo usado — para o monta/desmonta do sobrevoo
(`AnimatePresence`), nunca para a prop `drag`.

### As seis coisas que fazem o motor funcionar

**1. Capturar o ponteiro em `comprometer()`, nunca em `iniciar()`.**
Com captura ativa desde o `pointerdown`, os eventos de mouse de compatibilidade são redirecionados
para quem capturou, e o `click` passa a ter o **quadro** como alvo — o cartão nunca o vê, e abrir
o detalhe por clique deixa de existir. A captura entra só depois do gesto se comprometer (8 px de
deslocamento ou 250 ms de pressão). Para a janela entre `pointerdown` e `comprometer()`,
`pointerup`/`pointercancel` também escutam em `window`, para não perder o fim do gesto.

**2. Alça de arrasto, não o cartão inteiro.**
`GripVertical` de 24×24 com `touch-none` só nela. O trilho tem 62 itens e precisa rolar no dedo;
`touch-action: none` no cartão inteiro mataria essa rolagem. A alça também dá dono claro ao
`aria-roledescription="serviço arrastável"` e é descobrível, o que a pressão longa não é.

**3. O sobrevoo vai para um portal no `<body>`, com `pointer-events: none`.**
O quadro tem `overflow` nos dois eixos (é o que faz o cabeçalho e o trilho grudarem), então
qualquer posicionamento interno seria recortado. É o mesmo padrão que `linha-do-tempo.tsx` já usa
para o balão e `notificacoes.tsx` para a pilha de avisos.

**Dois nós, não um**: um `<div>` externo que só recebe `translate3d` do loop de animação, e dentro
dele o `motion.div` com `initial`/`animate`/`exit`. No mesmo nó, a animação de entrada sobrescreve
o `transform` do loop.

**4. Alvo por `document.elementsFromPoint`** — plural, que devolve a pilha inteira em ordem de
pintura e por isso atravessa o cabeçalho grudado sem tocar em CSS:

```ts
function alvoSob(x: number, y: number): ChaveCelula | null {
  const nos = document.elementsFromPoint(x, y);
  return nos.find((n) => n.closest("[data-celula]"))
    ?.closest<HTMLElement>("[data-celula]")?.dataset.celula ?? null;
}
```

Coordenadas de viewport, então rolagem do quadro e da página são de graça — um cache de
`getBoundingClientRect` por célula ficaria inválido a cada quadro durante a auto-rolagem, que é
justamente quando ele mais seria usado. E `pointerenter` por célula morre na largada: com
`setPointerCapture` ativo o navegador suprime `pointerover/enter/leave` nos demais elementos.

`data-celula` fica **só** nos grupos de equipe. Nunca na coluna do dia, nunca no cabeçalho: um
`data-celula` na coluna faria o ponteiro sobre o cabeçalho resolver para um dia sem equipe,
violando a regra 4 no nível do DOM. Célula que não aceita solta simplesmente não emite o atributo.

**5. Re-testar o alvo no `pointerup`.**
A gravação usa a posição real da solta, não o último alvo realçado. O amortecimento de quadros
serve só para o realce visual — sem isso, todo arrasto curto no toque seria recusado.

**6. Auto-rolagem nos dois eixos, com `scrollBehavior: "auto"` local.**
`globals.css` tem `html { scroll-behavior: smooth }`, e um `scrollBy` posicional herda isso:
cada quadro do loop viraria uma animação que continua depois de o dedo parar. Três roladores
participam: o quadro, o trilho e a janela. As zonas mortas medem contra a **área útil**, descontando
o cabeçalho grudado (`data-obstaculo`), a barra superior e a navegação móvel.

Ordem dentro do `requestAnimationFrame`: **ler primeiro (`elementsFromPoint`), escrever depois
(`style.transform`)** — o inverso é escrita-seguida-de-leitura de layout no mesmo quadro.

### Recusa é um estado desenhado

Alvo `null` renderiza de verdade: borda `--ink-3`, `cursor: not-allowed`, sem realce, e o motivo em
texto no sobrevoo. Nunca "mantém o último alvo válido" — manter faz o gestor soltar numa célula
onde não está.

Motivos possíveis, todos em pt-BR:

| Situação | Texto |
|---|---|
| Dia anterior a hoje | "Esse dia já passou." |
| Linha de propostas | "Escolha uma equipe — um dia só é marcado com turma." |
| Mesma célula de origem | (sem recusa; a solta é ignorada em silêncio) |
| Trilho, item já com equipe | (aceita: devolve para a fila) |

### Desempenho

O quadro tem ~70 células e até ~130 cartões. Isso exige `memo` de verdade — hoje não existe
nenhum `memo(` em `web/src`. Cartão e célula viram `memo` com props escalares, e todos os
handlers saem de `useCallback` com dependências estáveis (o item pego mora num `ref`, não em
estado, senão a dependência recria o callback e o memo cai).

---

## 4. Escrita

### Uma ação, não duas

`acoes.ts` tem `atribuirEquipe` e `remarcarAgendamento` separadas. Duas chamadas dariam dois
`revalidatePath("/", "layout")` e um estado intermediário visível — o serviço no dia certo, sem
equipe, que é exatamente o estado que a regra 4 proíbe.

```ts
export async function alocarAgendamento(
  agendamentoId: number,
  data: string,
  equipeId: number,
): Promise<Resultado>;

/** Solta no trilho: tira a equipe e o serviço volta a ser proposta. */
export async function devolverParaFila(agendamentoId: number): Promise<Resultado>;
```

Validações no servidor, sem confiar no cliente:

- `data` casa com `^\d{4}-\d{2}-\d{2}$`;
- `data >= isoHoje()` — "Não dá para agendar para um dia que já passou.";
- a equipe existe e está ativa;
- o `UPDATE` filtra por `.in("status", ["sugerido", "aprovado"])` e usa `.select("id").maybeSingle()`.

O `maybeSingle` não é detalhe. Sem ele, um id inexistente ou um serviço já executado devolve
`ok: true`, e o cartão fica no lugar novo na tela e no lugar velho no banco. `mudarStatusAgendamento`
já faz assim; `remarcarAgendamento` **não** faz e por isso mente em silêncio hoje — o defeito não
será copiado, e a correção dele entra junto.

### Otimismo

O `Ajuste` de `planejamento.tsx` já aceita `data_sugerida` e `equipe` no mesmo objeto, então o
redutor de `useOptimistic` não muda. O que muda:

- **`pendente` deixa de desabilitar a tela inteira.** Hoje ele desabilita os botões de toda a fila.
  Com 62 cartões para alocar, isso é sentido a cada solta. Passa a marcar só o cartão em voo, com
  `aria-busy` no `<li>`.
- **O toast de sucesso fica silencioso quando a ação vem do quadro.** `executar` ganha um parâmetro
  `silencioso`: o movimento do cartão já é a confirmação, e a região `aria-live` narra o desfecho
  para quem não vê o movimento. Dois canais narrando o mesmo evento é ruído. O erro continua no
  toast, persistente.

### Reversão

Quando a ação falha, o cartão volta. A sequência é explícita:

1. otimista — o cartão entra na célula alvo;
2. erro — o `useOptimistic` reverte no commit seguinte e o cartão salta de volta;
3. o cartão de origem ganha um anel `--critical` de 450 ms;
4. o toast persistente (`duracao: 0`) carrega a mensagem do servidor.

Sob `prefers-reduced-motion` o cartão salta sem transição — e é por isso que o anel e o toast
carregam a explicação, e não a animação.

### Desfazer mora no cartão, não no toast

`ProvedorNotificacoes` tem `MAXIMO = 4`: esvaziar a fila em rajada comeria o botão de desfazer
antes de o gestor alcançá-lo. O botão fica no rodapé do cartão recém-alocado por 8 segundos
(`Undo2` da lucide), sobrevive a qualquer número de soltas simultâneas, e fica onde o olho já
está. O toast volta a ser só confirmação de erro.

O desfazer chama a mesma ação com os valores anteriores. Como o valor anterior pode ser um dia já
passado (26 dos 62 do trilho têm data vencida), a barreira de data passada precisa de uma saída
que **não** seja alcançável pela rede: o miolo vai para uma função **não exportada** no mesmo
arquivo `"use server"` — só exports viram endpoint.

```ts
async function gravar(id: number, data: string, equipeId: number | null,
                      opcoes: { permitirPassado: boolean }): Promise<Resultado>;

export const alocarAgendamento = (id, data, equipeId) =>
  gravar(id, data, equipeId, { permitirPassado: false });
export const desfazerAlocacao = (id, data, equipeId) =>
  gravar(id, data, equipeId, { permitirPassado: true });
```

### Revalidação

Cada solta revalida a página inteira. Com rajadas de 10 soltas em 15 segundos isso é caro, então
`revalidatePath` passa por um debounce de cauda de 1,5 s **com teto de 5 s** — sem o teto, uma
rajada contínua adia a revalidação para sempre. O desenho na tela não espera por isso: quem
desenha é o `useOptimistic`, como já é hoje.

---

## 5. Acessibilidade

### O cartão precisa de papel interativo

O host focável não pode ser um `<li tabIndex>` mudo: sem papel interativo, o modo de navegação do
NVDA/JAWS não faz o auto-switch para modo de foco. O `<li>` é o container; dentro dele, o alvo
de foco tem `role="button"`.

"Abrir detalhe" sai do gesto principal e vira um `<button>` explícito dentro do cartão — que é o
que `fila-decisao.tsx` já faz hoje. Assim nenhum gesto fica inalcançável e `Espaço` fica livre
para pegar.

### O protocolo de teclado

| Tecla | Efeito |
|---|---|
| `Espaço` | pega o cartão / solta se já estiver pego |
| `← →` | muda o dia |
| `↑ ↓` | muda a equipe |
| `Enter` | solta (com `preventDefault`, ou a solta também abriria o detalhe) |
| `Esc` | cancela e devolve o cartão à origem |
| `Shift + ← →` | troca a semana visível durante o movimento |

O cartão pego **vai para o portal** junto com o sobrevoo, e o `<li>` de origem vira vão. É isso que
torna verdadeira a premissa "o elemento focado não desmonta durante a navegação" — inclusive no
`Shift + seta`, que desmonta a coluna de origem.

Roving `tabindex` derivado de estado, com `Map<chaveRegiao, idDoCartão>`: um tab stop por região
(trilho, propostas, quadro), não um no quadro inteiro. Numa semana vazia, o `<h4>` do primeiro
grupo recebe `tabIndex={0}` para o quadro nunca ficar sem tab stop.

### ARIA

- O quadro e o trilho são `region`.
- Cada par `(dia, equipe)` é um `<div role="group" aria-labelledby>`. **Não** `<section>`: 70
  landmarks afogariam o rotor. **Não** `role="grid"`: o eixo transposto (colunas = dias, linhas =
  equipes) não se expressa sem `role="row"` por equipe, que é o oposto da ordem do DOM.
- A carga do dia entra no rótulo `sr-only` do grupo, e a `BarraProgresso` vai `aria-hidden` — 70
  `role="progressbar"` é o mesmo ruído que fez rejeitar `listbox`.
- Chave única do grupo por um helper só, usado no `aria-labelledby`, no `id` e no
  `getElementById`: `idDoGrupo(dia, equipeId) => \`grupo-${dia}-${equipeId}\`` — sem pipe, para
  não precisar de `CSS.escape`.

### Duas regiões `aria-live`

Assertiva para o passo do movimento, polite para o desfecho do servidor. Com debounce de 150 ms —
sem ele, um swipe de um mês no celular enfileira 28 anúncios.

Textos literais:

- ao pegar: *"BR-101 pego. Use as setas para escolher o dia e a equipe, Enter para soltar."*
- a cada passo: *"Quinta, 13 de agosto. Equipe Roçada MG-Sul 01. 4,0 de 6,0 km no dia."*
- na borda: *"Domingo, 16 de agosto. Último dia da semana. Shift e seta para a próxima."*
- ao soltar: *"BR-101 alocado para quinta, 13 de agosto, Equipe Roçada MG-Sul 01."*
- na recusa: *"Esse dia já passou. O cartão continua onde estava."*

### Foco depois do movimento

O cartão remonta em outro pai, então o foco precisa ser restaurado. O `useLayoutEffect` roda
**sem array de dependências** — a guarda é barata e precisa cobrir todo commit, inclusive o da
reversão do `useOptimistic`, que um contador de pedido não alcança:

```ts
useLayoutEffect(() => {
  if (foco.tipo !== "cartao") return;
  if (selecionado != null) return;            // painel aberto: não disputa foco com o portal
  const ativo = document.activeElement;
  const perdido = !ativo || ativo === document.body || !ativo.isConnected;
  if (!perdido) return;                       // isConnected, não refQuadro.contains: portais
  refsCartoes.current.get(foco.id)?.focus({ preventScroll: true });
});
```

`refQuadro.contains(ativo)` seria falso para qualquer portal e roubaria o foco de dentro do
`PainelAgendamento` aberto.

---

## 6. Movimento

Toda animação é `transform` ou `opacity`. `prefers-reduced-motion` já é desligado globalmente em
`globals.css` e não é reimplementado por componente.

**Sem `layoutId` entre colunas.** `layout` é lido uma única vez na criação do nó de projeção, então
`layout={condição}` é inerte — e o `overflow` do rolador (que o trilho grudado exige) recortaria o
voo de qualquer jeito. A continuidade visual é o sobrevoo, não o FLIP.

| Momento | O quê | Duração · curva |
|---|---|---|
| Pegar | Sobrevoo entra em `scale(1.03)` + `shadow-lg`; origem vira vão com `visibility: hidden` reservando a caixa real | 140 ms · `--ease-out-quint` |
| Sobre alvo | Anel `--accent-line` em `opacity`; barra de capacidade anima `scaleX` para o valor projetado | 120 ms · `--ease-out-quint` |
| Soltar | Sobrevoo voa até o retângulo da célula em `translate3d`, some; o cartão real entra com `.rise` | 220 ms · `--ease-spring` |
| Recusar | Sobrevoo volta à origem | 180 ms · `--ease-exit` |
| Erro do servidor | Anel `--critical` no cartão revertido | 450 ms |
| Trocar de semana | Colunas entram com `.fade` escalonado por `--i` | 420 ms |

O vão é `visibility: hidden` reservando a caixa real, não `scaleY`: escalar um `<li>` de altura
fixa não abre espaço nem acerta a altura de um cartão com `line-clamp-2`.

---

## 7. Layout e responsividade

### A coluna de 380 px sai

`planejamento.tsx` hoje monta `xl:grid-cols-[minmax(0,1fr)_380px]` com a régua à esquerda e a fila
à direita. Isso é substituído por um `<QuadroSemana>` de largura cheia, com a fila virando a
primeira coluna dentro dele. Sem isso, "7 colunas de dia" não existe em nenhum viewport.

### O número de colunas não é breakpoint

É consequência de uma única declaração:

```css
.pista-grade {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: max(var(--dia-min), calc((100cqw - 6 * var(--gap)) / 7));
  /* Linhas idênticas nas 7 colunas: é o que faz ler uma turma ao longo da semana.
     Cabeçalho do dia, linha de propostas, e uma linha por equipe. `--linhas` é
     escrito pelo componente: além das 10 ativas, uma turma desativada com serviço
     na semana também ganha linha (é o que `montarRaias` já faz hoje). */
  grid-template-rows: auto auto repeat(var(--linhas, 10), minmax(var(--altura-linha, 4.5rem), auto));
}
.coluna-dia {
  container: dia / inline-size;
  display: grid;
  grid-row: 1 / -1;
  grid-template-rows: subgrid;   /* sem isto as raias não alinham entre dias */
  scroll-snap-align: start;
}
```

Com `--dia-min: 8.5rem`, o quadro degrada continuamente 7 → 6 → 5 → 4 → 3 → 1 coluna, sem nenhuma
media query, com `scroll-snap-type: x proximity` na pista. `subgrid` tem suporte em Chrome 117+,
Safari 16+ e Firefox 71+ — dentro do que este painel já assume (`dvh`, `@container`, `color-mix`,
`env(safe-area-inset-*)`).

A pista reserva `padding-block-end` para a barra de rolagem horizontal, que em Windows/Chrome
comeria a última linha de equipe.

### Densidade por container query

Ordem de sacrifício explícita conforme a coluna encolhe, e o nome da equipe **não** é o primeiro a
sair — ele é a chave de leitura da célula:

1. some o chip de km;
2. some o prazo;
3. o `ChipRisco` vira só ícone.

### O trilho vira doca no estreito

`sticky` não entrega "sempre visível" numa página que empilha cabeçalho, controles e faixa de 28
dias antes do quadro. No estreito o trilho vira **doca `fixed` num portal para `<body>`** — o mesmo
recurso que `painel-lateral.tsx` e `notificacoes.tsx` já usam.

- Um componente só, duas montagens (coluna ou doca). A troca acontece uma vez por mudança de
  faixa, não por quadro.
- Colapsada, a lista recebe `inert` — `transform` sozinho deixaria 62 cartões focáveis fora da tela.
- A escolha da montagem vem de `matchMedia` via `useSyncExternalStore` (o padrão que
  `barra-lateral.tsx` já usa), não de `@container`: só em JS a doca sabe que a `NavegacaoMovel`
  existe e precisa de folga.

### Arrastar no celular

Dois caminhos, ambos disponíveis:

1. **Auto-rolagem horizontal** durante o arrasto, quando o dedo chega à borda da pista.
2. **Pegar e navegar** — o mesmo protocolo do teclado, exposto no toque: pegar pela alça, tocar
   `‹ ›` para andar a semana, tocar a célula para soltar. É o caminho garantido quando o dia de
   destino não está na tela junto com o de origem.

---

## 8. Controles e o resto da página

- Some o `Segmentado` de Semana/Quinzena/Mês. Entra a navegação `‹ 10–16 de ago. de 2026 › [Hoje]`.
- A semana vai para a URL: `?semana=2026-08-17`, com `shallow: true`. Com
  `export const dynamic = "force-dynamic"` no layout, um `shallow: false` refaria `listarTrechos()`
  duas vezes por clique — uma no `Shell`, outra na página.
- `montarJanela` ganha âncora: `montarJanela(ancora: string, dias = 7)`, abrindo na segunda-feira
  da semana de `ancora`.
- **O filtro de equipe deixa de esconder e passa a destacar.** Filtrar removeria células que
  precisam existir como destino de solta. O valor `"sem"` sai do seletor: o trilho já **é** a
  visão de quem não tem equipe.
- O filtro de status continua filtrando (é sobre quais cartões existem, não sobre quais células).
- Os 4 números do resumo viram uma faixa fina no cabeçalho do quadro.
- Os avisos de "roçadas vencidas" e "equipe acima da capacidade" viram sinal dentro do quadro: chip
  no cartão vencido, hachura e ícone na célula estourada. A faixa de avisos separada sai.

---

## 9. Arquivos

```
web/src/app/agenda/_componentes/
  quadro/
    quadro-semana.tsx      novo   orquestra grade + arrasto; dono do estado de movimento
    trilho-fila.tsx        novo   a fila como coluna (ou doca), 62 itens, teto de 25 + "mais"
    coluna-dia.tsx         novo   cabeçalho do dia, linha de propostas, subgrid
    celula-equipe.tsx      novo   memo; emite data-celula; barra de capacidade com prévia
    cartao-servico.tsx     novo   memo; alça, risco, botão de detalhe, desfazer de 8 s
    sobrevoo.tsx           novo   o clone no portal, dois nós
    mini-mapa.tsx          novo   a faixa de 28 dias
    usar-arrasto.ts        novo   o motor: máquina de estados, hit-test, auto-rolagem, teclado
  dados.tsx                altera montarJanela(ancora), montarGrade, fatiasEm, previaDoMovimento,
                                  resumo28, ocupaDia, textoServico, HACHURA_EXCESSO
  planejamento.tsx         altera semana na URL, ação única, pendente por cartão, foco de equipe
  controles.tsx            altera navegação de semana no lugar do período; equipe vira destaque
  resumo.tsx               altera vira faixa fina do cabeçalho do quadro
  painel-agendamento.tsx   altera importa textoServico de dados.tsx
  linha-do-tempo.tsx       sai
  fila-decisao.tsx         sai
web/src/lib/acoes.ts       altera alocarAgendamento, devolverParaFila, desfazerAlocacao;
                                  corrige remarcarAgendamento (maybeSingle)
web/src/app/globals.css    altera estados de arrasto, hachura, keyframe do anel de erro
```

`textoServico` é exportado hoje por `linha-do-tempo.tsx` e consumido por `painel-agendamento.tsx`:
ele muda de casa junto.

## 10. Fora de escopo

- **Trava de concorrência** por `atualizado_em`. O painel hoje não tem nenhuma, e `main.py` também
  escreve em `agendamentos` — um compare-and-swap dispararia falso positivo em desenvolvimento,
  com quem estiver rodando o FastAPI ao lado. Fica registrado como dívida.
- **Paginação de dados.** As ~188 linhas já vêm inteiras do servidor, então navegar entre semanas
  é estado de URL puro, sem ida ao banco.
- **Criar agendamento** arrastando um trecho sem sugestão para dentro do quadro. O quadro só
  redistribui o que a IA propôs.

## 11. Como isto é verificado

- `npm run verificar` (tipos + lint + fumaça + build) precisa passar.
- Testes puros de `dados.tsx`: `fatiasEm` com 5,0 km numa turma de 4,5 km/dia devolve 2 fatias de
  2,5 km; `previaDoMovimento` com origem igual ao destino devolve mapa vazio; `ocupaDia` para um
  serviço iniciado antes da segunda-feira.
- No navegador, em 2560 / 1600 / 1280 / 1024 / 768 / 430 px, e nos três casos que quebram:
  a semana sem nenhum serviço, o trilho com 62, e uma célula acima da capacidade.
- Arrasto exercitado com mouse, com toque emulado e só com teclado, com leitor de tela ligado.
