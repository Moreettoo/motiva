# 04 · Deploy em producao e estado dos dados reais

Deploy manual em 14/09/2026, 14:34 (Brasilia), do commit **d05672b** (`main`, sincronizado com
`origin/main`), a partir de uma copia limpa via `git archive HEAD` — nao da arvore de trabalho,
que carrega arquivos deliberadamente fora do Git (o plano, a spec, `docs/PLANO_MOTIVA.md`, os
9,6 MB de arquivos originais do desafio Motiva).

## Deployment

| campo | valor |
|---|---|
| id | `dpl_62vNNkKz8TeobKGir2PJ6BS9zYMa` |
| target | production |
| readyState | READY |
| criado em | 14/09/2026 14:34:49 (Brasilia) |
| commit publicado | `d05672b` |
| aliases | `www.highwai.pro`, `motiva-highwai.vercel.app`, `highwai.pro` |

O archive (`git archive HEAD | tar -x`) ficou com **19 MB**. Os unicos dois arquivos acima de
2 MB foram exatamente os esperados — nada nao versionado entrou:

| arquivo | tamanho |
|---|---|
| `web/src/lib/modelo/modelo.json` | 6.337.763 bytes (6,34 MB) |
| `ml/modelo_gramas.pkl` | 5.463.102 bytes (5,46 MB) |

A primeira tentativa de `vercel --prod --yes` falhou com `"Not authorized"` (erro transitorio
do CLI — `vercel whoami` e `vercel project inspect motiva` confirmaram a mesma sessao e o mesmo
`projectId` do `.vercel/project.json`, sem mismatch de escopo). A repeticao **identica** do
mesmo comando, sem trocar nada, funcionou e produziu o deployment acima. **Vale saber antes do
proximo deploy manual (Tarefa 22): se `vercel --prod --yes` responder "Not authorized" sem
motivo aparente, repetir o mesmo comando antes de investigar mais fundo.**

## Os cinco cheques

### Cheque 1 — a raiz redireciona para `/entrar` — verificado por maquina

```
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://motiva-highwai.vercel.app/
307 https://motiva-highwai.vercel.app/entrar
```

Cabecalhos confirmando que e o deployment novo (nao um cache de agosto sem login):

```
HTTP/2 307
cache-control: public, max-age=0, must-revalidate
location: /entrar
server: Vercel
strict-transport-security: max-age=31536000; includeSubDomains
x-vercel-id: gru1::4cfjt-1789413226605-7a280d1ce10e
```

### Cheques 2 a 5 — confirmados visualmente pelo dono do projeto no navegador

- `/malha` mostra so o SP-021 com 60 trechos
- `/validacao` mostra a validacao vigente e o bloco de NDVI
- um trecho do Rodoanel mostra o cartao do levantamento; `/agenda` nao tem cartao de trecho
  ficticio
- `/simulador` mostra a frase da calibracao; o copiloto mostra "Precisao medida"

Estes quatro cheques **nao foram automatizados por este agente** — foram **confirmados
visualmente pelo dono do projeto**, logado no site em producao, em 14/09/2026, apos o deploy.
A palavra dele: "conferi o deploy e ta aprovado". Essa e a evidencia registrada aqui — uma
pessoa olhando o painel rodando — e nao um resultado automatizado disfarcado de tal.

**Por que nao foram automatizados:** este agente nao tinha credencial de admin valida para logar
no site. As duas contas de demonstracao documentadas em `docs/operacao/contas-e-cargos.md`
(`super.demo@demo.highwai.com.br` e `admin.demo@demo.highwai.com.br`) foram tentadas, uma vez
cada, com a senha atual de `SEED_SENHA` em `web/.env.local` — as duas falharam com "E-mail ou
senha nao conferem". O agente decidiu deliberadamente **nao** ir alem disso: nao tentou mais
combinacoes de senha (seria forca bruta contra autenticacao de producao), nao consultou a
tabela de contas por e-mail, e nao criou nem alterou nenhuma conta em producao so para se
autoverificar. Dois dias antes da apresentacao nao e hora de mexer em dados de autenticacao de
producao para satisfazer um cheque — por isso o cheque ficou para o unico humano que ja tinha
acesso.

### Evidencia indireta reunida (nao substitui os cheques acima, mas reforça o quadro)

- **Rotas protegidas redirecionam limpo (307), nunca 500**, sem sessao: `/malha`, `/validacao`,
  `/agenda`, `/simulador`, `/copiloto` — confirma que o middleware nao quebra, embora ele rode
  antes do componente que busca o dado real.
- **Vercel `get_runtime_errors`** (janela de 2h no projeto): "No runtime errors found in the
  selected time range."
- **Vercel `get_runtime_logs`** agrupado por `statusCode` (janela de 30 min): so `200` (6) e
  `307` (5) — nenhum `4xx`/`5xx` de servidor em nenhuma chamada real feita ao deployment,
  incluindo uma sonda de bot a `/wp-admin/install.php` que tambem recebeu 307, nao 500.
- **A chave publicavel (anon) continua recebendo 401** ao tentar ler `ia.trechos`:
  ```
  curl -H "apikey: sb_publishable_..." -H "Accept-Profile: ia" \
    "https://mbkcygsqfcxxcmvkuqyt.supabase.co/rest/v1/trechos?select=id&limit=1"
  -> 401
  ```
  Prova que este deploy esta de fato ligado ao projeto Supabase real de producao (nao um
  projeto vazio ou mock) e que o RLS continua de pe.

## Estado do banco em producao (consulta ao vivo, no momento deste registro)

```
select 'vw_trecho_status', count(*) from vw_trecho_status
union all select 'levantamentos', count(*) from levantamentos
union all select 'validacoes vigente', count(*) from validacoes where vigente
union all select 'calibracoes ativo', count(*) from calibracoes where ativo
union all select 'ndvi_analises', count(*) from ndvi_analises
union all select 'medicoes origem=levantamento_classe', count(*) from medicoes where origem='levantamento_classe'
union all select 'execucoes origem=inferida_levantamento', count(*) from execucoes where origem='inferida_levantamento';
```

| tabela / filtro | contagem |
|---|---|
| `vw_trecho_status` | 60 |
| `levantamentos` | 1.440 |
| `validacoes` where `vigente` | 1 |
| `calibracoes` where `ativo` | 1 |
| `ndvi_analises` | 3 |
| `medicoes` where `origem='levantamento_classe'` | 110 |
| `execucoes` where `origem='inferida_levantamento'` | 38 |

Consistente com o estado documentado desde a Tarefa 13: 60 segmentos reais do Rodoanel (os 50
ficticios ocultos com `ativo = false`), 1.440 observacoes de campo, 1 validacao vigente
(n = 195, acuracia 0,605), 1 calibracao ativa (fator 1,0 — a candidata 1,15 rejeitada fica
`ativo = false`), 3 analises NDVI.

## O lote das 06:00 — nota honesta, rodada pendente

**A primeira rodada do lote das 06:00 depois do ingest dos dados reais do Rodoanel ainda nao
aconteceu.** O lote de hoje (14/09) rodou as 06:00, antes da ingestao — que so terminou as
10:36. A primeira rodada pos-ingest esta prevista para **15/09/2026, 06:00 (horario de
Brasilia)** — depois deste deploy e antes da apresentacao de 16/09.

O esperado dessa rodada: os 60 trechos reportados como "medicao vencida" (a regra de vencimento
recusa prever sobre medicao com mais de 120 dias, e todos os 60 trechos tem medicao de marco),
**zero previsao escrita, zero erro**. Este registro nao inventa esse resultado — ele ainda nao
existe no momento em que este documento foi escrito.

Conferir a aba **Actions** do GitHub depois das 06:00 de 15/09 e item de handoff para o humano:
o `gh` CLI nao esta instalado nesta maquina, entao a leitura do log do lote e pela interface web
do GitHub, nao por linha de comando.

## Duas observacoes para quem for fazer o proximo deploy manual (Tarefa 22)

1. **`docs/operacao/deploy.md` esta desatualizado sobre o alias primario.** O documento (escrito
   em 11/09) registra `motiva-highwai.vercel.app` como o alias que a saida do CLI mostra. Hoje o
   CLI imprime `▲ Aliased https://www.highwai.pro` — o projeto ganhou o dominio proprio
   `highwai.pro`/`www.highwai.pro` como alias primario desde entao. Os dois enderecos continuam
   funcionando (mesmo deployment, `vercel inspect` lista os quatro aliases), mas quem seguir o
   documento sem saber disso pode estranhar um alias diferente do esperado na saida do CLI.
2. **A primeira tentativa de deploy falhou com `"Not authorized"`**, e uma repeticao identica do
   mesmo comando funcionou sem nenhuma mudanca. Provavelmente uma falha transitoria de
   sessao/token do CLI — vale repetir o comando uma vez antes de investigar mais fundo se
   acontecer de novo.
