# Importar um levantamento novo — manual do operador

Para quem roda a importação semanal do levantamento da Motiva, não para quem programa. Toda
semana (ou quando a Motiva mandar a planilha nova) alguém precisa colocar esse arquivo no
sistema — é esse "alguém" que este documento atende. Se você nunca rodou nada em linha de
comando antes, siga os passos na ordem: o comando de ensaio (seção 2) não tem como dar
errado — ele só lê o arquivo e conta, nunca grava nada.

Por que isso importa: o HighwAI só é confiável na medida em que compara suas previsões contra
o que a equipe da Motiva realmente viu na estrada (é o que a tela **Validação** do painel
mostra). O que este documento ensina — os comandos das seções 2 e 4 — deixa cada levantamento
novo gravado no banco sozinho e sem duplicar, não importa quantas vezes você rode; isso já
funciona hoje, sem passo manual nenhum. **Recalcular a acurácia com esse levantamento novo**,
porém, ainda não acontece sozinho: é um passo manual à parte, descrito na seção 6, que hoje só
um desenvolvedor faz. Enquanto ele não roda, a validação mostrada no painel continua sendo a
do par de levantamentos mais recente que alguém já processou — não necessariamente a do
arquivo que você acabou de importar.

---

## 1 · O arquivo

É o **RA-RET-ROÇ-LIMP**, a planilha "unifilar" de roçada que a Motiva caminha e preenche a
cada levantamento de campo. Dentro dela, só a aba **ROÇADA** importa — é a única que o sistema
lê.

**Não mexa no layout.** O programa que lê a planilha (`pesquisa/rodoanel/planilha.py`) não
"olha" a planilha como uma pessoa: ele lê célula por célula, em posições fixas — a linha 9 tem
que ter os 60 marcos de km, as linhas 10 a 25 têm que ter exatamente os nomes de faixa
esperados, nessa ordem. Adicionar uma linha, renomear uma coluna ou reordenar uma faixa faz o
programa recusar o arquivo (seção 7) ou, pior, ler a faixa errada sem avisar. Se a Motiva
mudar o formato, é conversa para a seção 7, não para editar a planilha à mão.

**Onde deixar:** a pasta `pesquisa/dados/brutos/`, dentro do repositório — o mesmo lugar onde
já estão os dois arquivos já importados (`RA-RET-ROÇ-LIMP-2026-03-13.xlsx` e
`RA-RET-ROÇ-LIMP-2026-03-20.xlsx`).

**O nome do arquivo precisa trazer a data** do levantamento no formato `AAAA-MM-DD`, em
qualquer parte do nome — é dali, e não de dentro da planilha, que o sistema tira a data oficial
do levantamento. Siga o padrão dos dois já existentes:

```
RA-RET-ROÇ-LIMP-AAAA-MM-DD.xlsx
```

(A planilha também tem uma data interna, na célula da aba, mas ela é só registrada para
conferência — nos dois arquivos já importados ela está desatualizada, um template antigo que
a Motiva não trocou. Isso é esperado e não bloqueia nada; veja a seção 2.)

---

## 2 · O ensaio primeiro — sempre, sem exceção

O comando abaixo é o caminho seguro por padrão: **sem a flag `--gravar`, nada é escrito em
lugar nenhum.** Ele só abre o arquivo localmente, conta o que encontrou e imprime na tela. Não
toca o banco de produção, não precisa de senha nem de internet. Rode-o sempre primeiro, mesmo
que você já tenha feito isso mil vezes — é de graça e é a sua rede de segurança.

Na raiz do projeto:

```bash
.venv/bin/python -m pesquisa.importar_levantamento \
  --xlsx pesquisa/dados/brutos/RA-RET-ROÇ-LIMP-AAAA-MM-DD.xlsx \
  --anterior pesquisa/dados/brutos/RA-RET-ROÇ-LIMP-2026-03-20.xlsx
```

`--anterior` aponta para o arquivo do levantamento imediatamente anterior a este (hoje, o mais
recente já importado é o de 2026-03-20). Ele é o que permite ao sistema perceber quando uma
faixa "caiu de classe" entre os dois levantamentos — ou seja, uma roçada que aconteceu no meio
do caminho. Sem `--anterior`, o comando funciona do mesmo jeito, só que sem essa contagem de
"execuções inferidas".

A saída é uma linha no formato abaixo (os números variam por levantamento; o formato não):

```
RA-RET-ROÇ-LIMP-AAAA-MM-DD.xlsx: data AAAA-MM-DD (interna 2025-03-28) · 720 levantamentos · NN medicoes derivadas · MM execucoes inferidas
ensaio: nada gravado. Repita com --gravar.
```

O que conferir nessa linha, antes de pensar em `--gravar`:

- **720 levantamentos.** Esse número é sempre exatamente 720 (60 marcos × 12 faixas do
  formulário) — não "por volta de", exato. Qualquer outro valor quer dizer arquivo incompleto,
  planilha errada ou um problema de leitura.
- **A data batendo** com a que você esperava para este arquivo e com a que está no nome dele.
  A "interna" (entre parênteses) é só informativa, como explicado na seção 1 — pode divergir
  sem problema.
- **Entre 50 e 60 medições derivadas.** É menos que 60 porque alguns marcos não têm nenhuma
  das 4 faixas "em escopo" (as que decidem a medição do trecho) classificada — nos dois
  levantamentos já feitos, são sempre os mesmos 5 marcos (km 7.500, 8.000, 8.500, 11.000 e
  28.500). Se esse número cair fora da faixa 50–60, ou se mudar muito em relação ao
  levantamento anterior sem um motivo óbvio, é sinal de alerta.
- **As execuções inferidas** (só aparecem se você passou `--anterior`): quantos marcos tiveram
  alguma faixa caindo de classe entre os dois levantamentos — ou seja, roçadas que a Motiva fez
  nesse intervalo. Pode ser zero, se ninguém roçou nada; não há um número "certo" fixo aqui,
  mas um valor muito acima do normal (por exemplo, mais da metade dos marcos) vale uma
  conferência antes de gravar.

---

## 3 · Se algum número não bater, pare aqui

O ensaio existe exatamente para isto: é o único ponto do processo pensado para você **parar
e investigar antes de gravar qualquer coisa**, nunca para "gravar e ver o que acontece". Se o
total de levantamentos não for 720, se a data estiver errada, ou se as medições/execuções
saírem muito diferentes do esperado:

1. **Não acrescente `--gravar`.**
2. Confira se o arquivo é mesmo o levantamento certo (nome, data, se não é uma cópia
   duplicada ou um rascunho).
3. Abra a planilha e confira visualmente se o formato está intacto (linha dos marcos de km,
   nomes das faixas) — veja a seção 7 se desconfiar de mudança de layout.
4. Se depois disso a dúvida continuar, pergunte antes de gravar. Uma importação errada em
   produção afeta a validação que sustenta a acurácia mostrada para a Motiva; vale mais
   perder cinco minutos conferindo do que descobrir o erro depois, com o dado já no ar.

---

## 4 · Gravar

Só depois de o ensaio bater exatamente com o esperado, repita o mesmo comando acrescentando
`--gravar`:

```bash
.venv/bin/python -m pesquisa.importar_levantamento \
  --xlsx pesquisa/dados/brutos/RA-RET-ROÇ-LIMP-AAAA-MM-DD.xlsx \
  --anterior pesquisa/dados/brutos/RA-RET-ROÇ-LIMP-2026-03-20.xlsx \
  --gravar
```

Ele imprime a mesma linha de contagem de antes (agora de verdade) e termina com `gravado.`.
Isso grava os levantamentos, recalcula as medições derivadas e (se houver `--anterior`) as
execuções inferidas direto no banco de produção.

---

## 5 · Rodar de novo não duplica nada — e por que isso importa

O importador é **idempotente**: rodar o mesmo comando duas vezes deixa o banco exatamente
igual a como ficaria rodando uma vez só. Isso não é uma promessa solta — foi provado na prática
na Tarefa 13, publicando o Rodoanel inteiro (trechos, os dois levantamentos, medições,
execuções, validação e calibração) duas vezes seguidas: as contagens saíram idênticas nas duas
rodadas (por exemplo, 1.440 levantamentos e 110 medições nas duas vezes, ponto a ponto) — só o
identificador interno da validação mudou, porque ela é recriada a cada publicação por desenho,
não por acidente.

Isso muda o que você deve fazer em dois cenários que costumam gerar dúvida:

- **O comando falhou no meio (caiu a internet, você não tem certeza se terminou, apertou
  Ctrl-C sem querer).** Não tem problema nenhum rodar de novo, com os mesmos argumentos.
  Nada duplica. Ter medo de repetir o comando depois de uma falha é desnecessário — e é
  exatamente esse medo que a idempotência existe para tirar do seu caminho.
- **Você percebeu um erro depois de já ter gravado** (arquivo errado, `--anterior` errado).
  Corrija o arquivo/os argumentos e rode de novo com `--gravar`: o levantamento daquela data
  é substituído pelo novo, não somado a ele.

Um cuidado na direção oposta: a garantia de "não duplica" vale para **a mesma data**. Se você
gravar o mesmo arquivo duas vezes com datas diferentes (por exemplo, esqueceu de atualizar o
nome do arquivo, ou passou `--data` manualmente errado), o sistema entende que são dois
levantamentos diferentes e grava os dois — porque a data faz parte da identidade de cada
levantamento. Por isso a conferência da data no ensaio (seção 2) não é um detalhe menor.

---

## 6 · O que acontece depois de gravar

- **O lote de reanálise, que roda todo dia às 06:00 (horário de Brasília)** — o workflow
  "Reanalise" no GitHub Actions — lê os dados de produção direto do banco. Na rodada seguinte
  ele já enxerga as novas medições/execuções deste levantamento e volta a prever os trechos
  afetados sozinho. Não é preciso nenhum passo manual para isso acontecer.
- **O cartão "Levantamentos importados", na tela `/validacao` do painel**, também aparece
  atualizado sozinho na visita seguinte — ele lê `ia.levantamentos` direto, sem cache que
  precise ser limpo.
- **A validação medida (a acurácia comparada com a linha de base, também em `/validacao`) NÃO
  se atualiza sozinha.** Hoje ela compara sempre o par de levantamentos apontado pelas
  constantes `ARQ_LEV_1`/`ARQ_LEV_2`, em `pesquisa/rodoanel/__init__.py`. Refazer a validação
  com a nova janela (o levantamento novo contra o anterior a ele) é trabalho de
  desenvolvedor, não do dia a dia da importação: atualizar essas duas constantes para o par
  mais recente e, na raiz do projeto, rodar em sequência

  ```bash
  .venv/bin/python -m pesquisa.consolidar
  .venv/bin/python -m pesquisa.validar
  ```

  e, se o resultado mudar de um jeito que valha publicar, `pesquisa.publicar_rodoanel` de novo
  (ensaio primeiro, sem `--gravar`, exatamente como na seção 2; `--gravar` só depois de
  conferir as contagens).

---

## 7 · Se o layout da planilha mudar

O programa não tenta "adivinhar" uma planilha fora do formato esperado — ele **recusa a
importação e para**, informando exatamente a linha da planilha e o nome que ele esperava
encontrar ali, por exemplo:

```
ValueError: RA-RET-ROÇ-LIMP-AAAA-MM-DD.xlsx: linha 14 deveria ser 'CANT. LATERAL EXTERNA', e 'CANT LATERAL EXT.'
```

(Os outros dois jeitos de recusar são parecidos: um marco de km vazio numa das 60 colunas
esperadas, ou menos/mais de 60 marcos de km na linha 9.)

Isso acontece de propósito, mesmo sendo desconfortável: uma linha deslocada em uma célula, sem
essa checagem, faria o sistema atribuir os dados de uma faixa a outra faixa **sem avisar** —
um erro invisível, muito pior que a importação simplesmente parar. Se isso acontecer:

1. **Não edite `pesquisa/rodoanel/planilha.py` para "aceitar" o novo formato** por conta
   própria — é aqui que mora a garantia de que a leitura está certa; mudar isso sem entender
   o resto do parser é como remontar sem o manual.
2. **Não edite a planilha da Motiva** para forçá-la a bater com o formato antigo.
3. Abra um chamado para o desenvolvedor, colando a mensagem de erro completa e anexando o
   arquivo que falhou. Ele decide se o parser precisa aprender o formato novo ou se é o caso
   de pedir para a Motiva devolver ao padrão.
