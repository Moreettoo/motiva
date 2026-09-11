# Publicar o painel na Vercel

Como uma versão nova do `web/` chega a `https://motiva-highwai.vercel.app`, quais variáveis
precisam existir antes, e por que o caminho é manual.

> **Estado em 11/09/2026:** produção serve o commit `336d9db` (fim da Onda 3), publicado pelo
> procedimento abaixo. As 13 variáveis estão cadastradas em Production e Preview. Antes desta
> data o endereço público servia um build de 20/08 — sem login, sem chamados, sem app de campo.

---

## A primeira coisa a saber: o gatilho do Git está mudo

**Um `git push` NÃO publica nada neste projeto.** A integração Git→Vercel parou de disparar em
agosto de 2026 e não foi religada. O último deploy criado por commit é de 17/08
(`feat(modelo): gerador v3.2…`); tudo depois disso saiu do CLI, à mão.

Isso já custou 24 horas de investigação de um problema que não existia: o push tinha
funcionado, o commit estava no GitHub, e a produção continuava mostrando a versão velha.
**Push bem-sucedido não é sinônimo de produção atualizada.** A única prova é o `state: READY`
de um deployment novo — ver "Confirmar" abaixo.

Religar o gatilho é trabalho para depois da demonstração. Enquanto não for feito, quem
publicar segue o procedimento manual.

---

## Publicar

O deploy sai de uma cópia limpa do commit, fora da árvore de trabalho. Os dois "não faça" do
começo são o motivo de existir esta seção:

- **Não rode `vercel` da raiz do repositório.** O diretório de trabalho carrega os CSV do
  gerador de dataset — centenas de MB que não estão no Git e que o CLI enviaria mesmo assim,
  porque ele empacota o diretório, não o commit.
- **Não use a ferramenta `deploy_to_vercel` do MCP.** Ela não dá conta do
  `web/src/lib/modelo/modelo.json`, que tem 6 MB.

```bash
cd /e/motiva-ondas/a-producao          # ou o worktree que carrega o commit a publicar

rm -rf /c/Users/enzom/AppData/Local/Temp/motiva-deploy
mkdir -p /c/Users/enzom/AppData/Local/Temp/motiva-deploy
git archive HEAD | tar -x -C /c/Users/enzom/AppData/Local/Temp/motiva-deploy

mkdir -p /c/Users/enzom/AppData/Local/Temp/motiva-deploy/.vercel
cp /e/motiva/.vercel/project.json /c/Users/enzom/AppData/Local/Temp/motiva-deploy/.vercel/

cd /c/Users/enzom/AppData/Local/Temp/motiva-deploy && vercel --prod --yes
```

`git archive HEAD` é o que garante que sobe **exatamente o commit**, sem arquivo não
versionado e sem alteração pendente. O staging fica em ~16 MB; se ele passar disso, alguma
coisa não versionada entrou no archive e vale olhar antes de enviar:

```bash
du -sh /c/Users/enzom/AppData/Local/Temp/motiva-deploy
find /c/Users/enzom/AppData/Local/Temp/motiva-deploy -type f -size +2M -printf '%s %p\n' | sort -rn
```

Os dois únicos arquivos acima de 2 MB que devem aparecer são `web/src/lib/modelo/modelo.json`
(6,3 MB, as 1.200 árvores) e `modelo_gramas.pkl` (5,5 MB).

O `project.json` copiado de `/e/motiva/.vercel/` é o que liga o diretório ao projeto certo:

| campo | valor |
|---|---|
| `projectId` | `prj_KPYfRF46NaX33VWEBhYSY85fweVG` |
| `orgId` | `team_4N1tIFzC7A2S4wKzmp3WkTih` |
| `projectName` | `motiva` |

### Antes de publicar

`cd web && npm run verificar` — tipos, lint, testes, fumaça e build. O build da Vercel roda o
mesmo `next build`, então um erro aqui é um deploy perdido de cinco minutos. Depois de um
merge que mova rotas, `rm -rf .next && npx next typegen` antes, pelo motivo que o `CLAUDE.md`
explica.

### Confirmar

O CLI imprime `readyState` no fim, mas confirme pela API — é a diferença entre "o comando não
deu erro" e "a produção mudou":

```
list_deployments(projectId=prj_KPYfRF46NaX33VWEBhYSY85fweVG,
                 teamId=team_4N1tIFzC7A2S4wKzmp3WkTih)
```

O deployment novo tem que estar no topo, com `"state": "READY"` e `"target": "production"`.
Um `vercel --prod` bem-sucedido também escreve o alias `motiva-highwai.vercel.app`; sem essa
linha, o deploy existe mas o endereço público continua no anterior.

Prova de 10 segundos, sem navegador:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://motiva-highwai.vercel.app/
```

Tem que responder `307` para `/entrar`. Um `200` na raiz é o build de agosto, anterior ao
login — ou seja, o deploy não pegou.

---

## As variáveis de ambiente

Treze, todas em **Production e Preview**. A fonte da verdade é `web/.env.example` mais todo
`process.env.` do código; esta tabela é a mesma lista com o que quebra sem cada uma.

| variável | o que quebra sem ela |
|---|---|
| `SUPABASE_URL` | tudo: nenhuma leitura de dado |
| `SUPABASE_SERVICE_KEY` | idem — é a chave que ignora o RLS. Vale até o fim de 2026 |
| `SUPABASE_SECRET_KEY` | nada hoje: é a chave nova (`sb_secret_…`) e **tem precedência** sobre a de cima. Cadastrada para quando a antiga expirar |
| `NEXT_PUBLIC_SUPABASE_URL` | **a sessão não existe.** `configPublica()` levanta dizendo qual falta |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | idem |
| `OPENAI_API_KEY` | o copiloto não responde e o lote não escreve justificativa |
| `OPENAI_MODEL` | opcional; sem ela vale `gpt-5.4-mini` |
| `GITHUB_TOKEN` | a reanálise de um trecho não dispara |
| `GITHUB_REPO` | idem (`Moreettoo/motiva`) |
| `RESEND_API_KEY` | o e-mail de convite e o de redefinição não saem |
| `EMAIL_REMETENTE` | idem — ver a ressalva do Resend abaixo |
| `APP_URL` | **os links de convite e de redefinição apontam para `localhost:3000`.** O default de `src/lib/auth/links.ts` é o localhost, e ele não falha: entrega um link quebrado com cara de link bom |
| `CONVITE_VALIDADE_DIAS` | opcional; 7 |

`APP_URL` é `https://motiva-highwai.vercel.app`, **sem barra no fim** (`links.ts` tira, mas
não conte com isso em outro lugar).

### Conferir e cadastrar

```bash
cd /c/Users/enzom/AppData/Local/Temp/motiva-deploy   # ou outro diretório com o .vercel/
vercel env ls production
vercel env ls preview
vercel env add NOME production,preview --no-sensitive --value "…" --yes
```

Três armadilhas do CLI, todas medidas:

1. **`vercel env add` marca como `Sensitive` por padrão.** Variável sensível funciona no build
   e em runtime, mas **não pode ser lida de volta** — nem pelo painel da Vercel, nem por
   `vercel env pull`, que devolve a string `[SENSITIVE]`. Para o que não é segredo
   (`APP_URL`, `NEXT_PUBLIC_*`, `CONVITE_VALIDADE_DIAS`, `EMAIL_REMETENTE`) passe
   `--no-sensitive`: o valor cadastrado errado só aparece em runtime, e poder conferir é a
   diferença entre achar o erro em 10 segundos e achá-lo na frente de quem assiste.
2. **`--force` trava.** `vercel env add … --force`, para sobrescrever, fica pendurado num
   prompt interativo mesmo com `--yes` e `--non-interactive`. Para trocar o valor ou a
   sensibilidade de uma variável que já existe, use `vercel env rm NOME production --yes`
   seguido de `vercel env add`, e **confira a lista depois** — a janela entre os dois comandos
   é uma janela em que a variável não existe, e um build disparado nela sai sem ela.
3. **`vercel env ls production` lista as de Preview também**, com a coluna `environments`
   dizendo quais alvos cada uma cobre. Rode os dois `ls` e compare; uma variável cadastrada só
   em Production passa despercebida até o primeiro deploy de preview.

Como `Sensitive` esconde o valor, a conferência de uma chave secreta é funcional, não visual —
o teste da seção seguinte diz qual das treze está errada.

### Ressalva do Resend

`EMAIL_REMETENTE` é `HighwAI <onboarding@resend.dev>`, o remetente de sandbox do Resend.
**Sem um domínio verificado, o Resend só entrega para o e-mail da própria conta.** Um convite
para qualquer outro endereço é aceito pela API e não chega a lugar nenhum.

Isso não bloqueia a demonstração porque a tela de convite mostra o **link copiável** de
qualquer jeito — é por ele que a conta nova é criada. Mas quem demonstra precisa saber que
"não chegou o e-mail" é o comportamento esperado, e não uma falha ao vivo.

A chave em uso é restrita a envio: `GET https://api.resend.com/domains` responde `401` com
`"This API key is restricted to only send emails"`. Isso é a chave **válida** e bem escopada,
não uma chave quebrada.

---

## Sete testes que só quebram em produção

Rodar localmente não cobre nenhum destes — cada um depende de HTTPS, de um host público ou de
uma variável que só existe na Vercel. Cada teste isola **uma** variável, então uma falha já diz
onde olhar.

| # | teste | o que ele prova | quem quebra |
|---|---|---|---|
| 1 | entrar e recarregar a página | o cookie de sessão sobrevive; em HTTPS o `Secure`/`SameSite` vale de verdade, ao contrário do localhost | as duas `NEXT_PUBLIC_*` |
| 2 | `/entrar` com sessão vai ao painel; `/agenda` sem sessão volta para `/entrar?proximo=…` | o proxy e `exigirCargo` | idem |
| 3 | `/chamados` mostra as fotos | a URL assinada de 60 s é gerada com o host de produção | `SUPABASE_SERVICE_KEY` / `SUPABASE_SECRET_KEY` |
| 4 | `/campo` abre e o service worker registra | só registra em HTTPS (ou localhost); é o que faz o app abrir sem sinal | o build, não uma variável |
| 5 | convite enviado de produção traz link de produção | o link não é `localhost:3000` | `APP_URL` |
| 6 | o copiloto responde | a chave alcança o modelo | `OPENAI_API_KEY`, `OPENAI_MODEL` |
| 7 | reanálise de um trecho dispara o GitHub Actions | `workflow_dispatch` autorizado no repositório | `GITHUB_TOKEN`, `GITHUB_REPO` |

O teste 4 exige `npm run build && npm run start` para valer localmente — em `next dev` o
service worker não representa produção. Em produção basta abrir `/campo` logado e conferir em
DevTools → Application → Service Workers.

Dois testes que dá para fazer sem navegador, e valem como triagem antes de abrir a tela:

```bash
# o modelo do copiloto responde a esta chave?
curl -s -X POST https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.4-mini","messages":[{"role":"user","content":"ok"}],"max_completion_tokens":16}'

# a publishável continua sem ler o banco? (tem que dar 401)
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" -H "Accept-Profile: ia" \
  "$SUPABASE_URL/rest/v1/trechos?select=id&limit=1"
```

A segunda é a mesma invariante que `scripts/fumaca.mjs` prende em duas checagens: se ela passar
a responder `200`, alguém criou uma política permissiva ou desligou o RLS.

---

## O Supabase Auth também precisa estar certo

Fora da Vercel, e fácil de esquecer porque não está em nenhum arquivo do repositório. Em
**Project Settings → Authentication**:

- **Allow new users to sign up: desligado.** Ligado, qualquer pessoa cria conta pelo endpoint
  público de signup — o painel nunca oferece isso, mas a API do Supabase oferece. Toda conta
  deste sistema nasce por convite (`ia.convites`), que é um fluxo nosso.
- **Allow anonymous sign-ins: desligado**, pelo mesmo motivo.
- **Site URL:** `https://motiva-highwai.vercel.app`.
- **Redirect URLs:** o mesmo endereço. Este projeto não usa nenhum e-mail do Supabase — convite
  e redefinição saem pelo Resend, com token nosso —, então a lista é curta de propósito.

---

## O que esta página não cobre

- **O lote das 06:00** roda no GitHub Actions (`.github/workflows/main.yml`), não na Vercel.
  Publicar o painel não muda o lote, e um deploy não interrompe uma execução em voo.
- **O APK** é empacotado à parte, do site já publicado: `docs/operacao/apk.md`.
- **O `main.py`** é ferramenta local, **não tem autenticação nenhuma** e escreve no mesmo
  banco. Ele não vai para a Vercel e não pode ser publicado em lugar nenhum.
