# O APK do app de campo

Como o `campo.apk` é gerado, como ele se atualiza (quase sempre sozinho), onde vive a chave
que não pode ser perdida, e o que exige um APK novo.

> **Estado em 10/09/2026:** o pacote ainda **não foi gerado**. O que existe no repositório é
> tudo o que vem antes disso — a PWA em `/campo`, o manifesto (`web/src/app/manifest.ts`), os
> ícones e o QR (`web/public/icones/`). Ainda **não** existem `web/public/.well-known/assetlinks.json`,
> release no GitHub, nem o cartão "Baixar o app de campo" em `/usuarios`. Este documento é o
> procedimento a seguir; os passos 2 e 3 estão pendentes.

---

## O que é um TWA, em duas frases

Uma **Trusted Web Activity** é um aplicativo Android cujo conteúdo inteiro é o site: o APK
contém uma janela do Chrome em tela cheia, sem barra de endereço, apontada para
`https://motiva-highwai.vercel.app/campo`.

Ele só esconde a barra de endereço se o **site provar que autoriza aquele APK** — e é isso, e
só isso, que o `assetlinks.json` faz. Sem essa prova o Android desconfia e mostra a barra do
Chrome em cima: o app continua funcionando, mas parece "um site aberto no navegador", que é
exatamente a impressão que um app instalável existe para não dar.

Consequência prática que vale entender antes de tudo: **o conteúdo do app é a web**. Corrigir
um texto, uma tela ou uma regra é publicar na Vercel; o aparelho pega na próxima abertura com
sinal, e o service worker serve a versão guardada quando não há sinal. Ninguém reinstala nada.

---

## Gerar o pacote

### 1 · Antes de abrir o PWABuilder

A produção precisa estar no ar e a PWA precisa estar sadia:

- deploy de produção pelo procedimento manual (`git archive` + `vercel --prod --yes`; ver
  `deploy-vercel-motiva`), com `list_deployments` mostrando `READY`;
- `https://motiva-highwai.vercel.app/campo`, logado como líder, abre a lista de chamados;
- Chrome DevTools → **Lighthouse** → categoria PWA / "Instalável": sem erro de manifesto nem
  de service worker.

Se o Lighthouse reclamar, o PWABuilder vai reclamar do mesmo, e mais tarde.

### 2 · PWABuilder → Android

Em <https://www.pwabuilder.com>, informe `https://motiva-highwai.vercel.app/campo` e escolha
**Package for stores → Android**:

| Campo | Valor |
|---|---|
| Package ID | `br.com.highwai.campo` |
| App name | `HighwAI Campo` |
| Launcher name | `Campo` |
| App version / version code | `0.1.0` / `1` |
| Display mode | `standalone` |
| Status bar color | `#0a0d0c` |
| Splash background / ícone | `#0a0d0c` / o 512 |
| Start URL | `/campo` |
| Fallback behavior | `Custom Tabs` |
| Notifications | `enabled` |
| Signing key | **Create new** — alias `highwai-campo`, senhas fortes, organização "HighwAI" |

Duas escolhas merecem explicação. **`#0a0d0c` é o `--bg` do tema escuro**, escrito à mão
porque manifesto e barra de status não leem variável CSS — é a mesma exceção que
`manifest.ts` e o `theme-color` do `layout.tsx` já carregam, comentada nos dois. E
**Notifications `enabled`** não custa nada agora e é o que deixa o Web Push possível depois
sem gerar um APK novo — se um dia as notificações forem ligadas com o campo desmarcado, o
pacote todo precisa ser refeito.

**Anote tudo o que você digitou** (alias e as duas senhas) antes de clicar em gerar. Elas não
aparecem de novo.

### 3 · Guardar a chave e publicar o `assetlinks.json`

O zip traz cinco coisas: `app-release-signed.apk`, `app-release-bundle.aab`,
`signing.keystore`, `signing-key-info.txt` e `assetlinks.json`.

**`signing.keystore` e `signing-key-info.txt` vão para o cofre de senhas.** Não para o
repositório — um keystore commitado é uma chave de assinatura pública — e **não para `E:`**,
que perde escrita em silêncio (ver `disco-e-falhando`). Leia a seção "A keystore" abaixo antes
de decidir onde deixar.

**`assetlinks.json`** é copiado para `web/public/.well-known/assetlinks.json` e vai no
repositório: é dado público por definição, é a declaração de que este site autoriza aquele
APK. Antes de commitar, confira que o `package_name` e o `sha256_cert_fingerprints` dentro do
arquivo batem com o `signing-key-info.txt`. Depois redeploye e verifique:

```bash
curl -si https://motiva-highwai.vercel.app/.well-known/assetlinks.json | head -20
```

Precisa vir `200`, o JSON, e `Content-Type: application/json`. Servido como `text/plain` o
Android ignora e a barra do Chrome volta.

O caminho `/.well-known/` já está **excluído do matcher do proxy** (`web/src/proxy.ts`), junto
de `serwist`, `icones` e `manifest.webmanifest`. Sem essa exclusão o Android pediria o arquivo
sem sessão e receberia um redirecionamento para `/entrar` — a verificação falharia com o
arquivo correto no lugar correto.

### 4 · Distribuir

Renomeie `app-release-signed.apk` para **`campo.apk`**, calcule `sha256sum campo.apk` e crie a
release `campo-v0.1.0` no repositório `Moreettoo/motiva` pela interface web do GitHub (o `gh`
não está instalado nesta máquina), anexando o arquivo e escrevendo o SHA-256 na descrição.

O link fixo passa a ser:

```
https://github.com/Moreettoo/motiva/releases/latest/download/campo.apk
```

É esse endereço que está dentro do QR já gerado (`web/public/icones/qr-apk.svg`, produzido por
`npm run icones`). O link é fixo **por nome de arquivo**: mantenha o nome `campo.apk` em toda
release e o QR nunca precisa ser refeito.

**Se o repositório for privado, o link exige login no GitHub** e o celular da equipe não vai
passar disso. Nesse caso publique o APK num bucket `apk` público no Supabase Storage (só este
arquivo) e troque o endereço em `scripts/gerar-icones.mjs`, rodando `npm run icones` de novo.

No aparelho: abrir o link, baixar, permitir "instalar apps de fontes desconhecidas" para o
Chrome quando o Android pedir, abrir e entrar com o e-mail e a senha do convite. **A primeira
abertura precisa de sinal** — é ela que baixa o snapshot dos chamados para o aparelho. Da
segunda em diante o app abre em modo avião.

---

## Como atualizar

**Na maior parte dos casos: não se atualiza nada.** O conteúdo é a web, e um deploy na Vercel
já é a atualização. Isso vale para toda mudança de tela, texto, regra, API ou service worker.

Um APK novo é necessário só quando muda algo que está **assado no pacote**:

| O que mudou | Precisa de APK novo? | Por quê |
|---|---|---|
| Tela, texto, regra, API, service worker | **Não** | é a web; deploy resolve |
| Ícone do lançador ou splash | **Sim** | o PNG está dentro do APK |
| Nome do app ou do lançador | **Sim** | está no `AndroidManifest` |
| Domínio (sair de `motiva-highwai.vercel.app`) | **Sim**, e `assetlinks.json` novo | ver abaixo |
| Permissões Android (notificação, câmera nativa…) | **Sim** | declaradas no pacote |
| `package_id` | **Sim**, e é app **diferente** | o Android trata como outro app |

Ao gerar o pacote novo, no PWABuilder escolha **"Use existing key"** e informe o
`signing.keystore` guardado, com alias e senhas. **Se você escolher "Create new" por
distração, o Android recusa a atualização** em todo aparelho que já tem o app: a assinatura
não bate, e a única saída é desinstalar e reinstalar em cada celular, perdendo a fila local e
qualquer registro ainda não enviado. Suba também o `version code` (1 → 2 → 3): o Android
recusa instalar um pacote com código igual ou menor.

---

## A keystore

Ela é o único artefato deste projeto que **não pode ser regenerado**. Perdê-la não estraga o
app instalado — ele continua funcionando —, mas fecha para sempre o caminho da atualização
daquele `package_name`.

- Vive no **cofre de senhas**, junto do `signing-key-info.txt` (que tem alias e as duas
  senhas; a keystore sozinha não serve).
- **Não** no repositório, **não** em `E:`, **não** só na máquina que gerou o pacote.
- Vale uma segunda cópia em outro lugar. É um arquivo de poucos KB e um evento irreversível.

Se ela for perdida mesmo assim: gere um pacote com outro `package_id` (por exemplo
`br.com.highwai.campo2`), publique um `assetlinks.json` que declare **as duas** impressões
digitais — o arquivo aceita uma lista — e peça à equipe para desinstalar o antigo e instalar o
novo. Faça isso com a fila do app vazia: desinstalar apaga o IndexedDB e, com ele, qualquer
evento ou foto que ainda não tenha subido.

---

## Trocar de domínio exige APK novo

A `host` do TWA e o `assetlinks.json` são um par, e os dois moram em lugares diferentes: a
`host` está dentro do APK, o `assetlinks.json` está no site. Apontar o domínio novo para a
mesma Vercel **não basta** — o pacote instalado continua abrindo o endereço antigo, e o
`assetlinks.json` do domínio novo não autoriza nada até ser publicado lá.

A ordem que funciona, se um dia o projeto ganhar domínio próprio:

1. domínio novo servindo o painel, com `APP_URL` atualizado (é o que entra nos links de
   convite e de senha);
2. `web/public/.well-known/assetlinks.json` publicado **no domínio novo** — mesmo conteúdo, já
   que a chave é a mesma;
3. APK novo pelo PWABuilder, apontando para o domínio novo, com **"Use existing key"** e
   `version code` maior;
4. release nova, mesmo nome `campo.apk` (o QR continua valendo);
5. equipe instala por cima — a atualização é aceita porque a chave é a mesma.

Enquanto o passo 5 não acontece em cada aparelho, o app antigo continua abrindo o domínio
antigo. **Não desligue o domínio antigo no mesmo dia**: derrubá-lo transforma todos os
celulares em app que não abre, e o service worker serve a casca guardada mas nenhuma
sincronização passa.
