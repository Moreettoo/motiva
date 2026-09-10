# Fase 4 · Polimento e demonstração — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chegar ao domingo 13/09 com o roteiro da demonstração ensaiado de ponta a ponta, os dados do seed no lugar, a documentação do projeto atualizada e uma lista escrita do que ficou para depois.

**Architecture:** Nenhuma peça nova. Esta fase fecha pontas das três anteriores, roda o roteiro do spec (§4) duas vezes e grava o que aprendeu no `CLAUDE.md` e nos documentos de operação.

**Spec:** `docs/superpowers/specs/2026-09-09-acesso-e-chamados-design.md`, "§4 · Sino, roteiro e verificação".

## Global Constraints

- As das fases anteriores.
- Nenhuma funcionalidade nova entra nesta fase. O que não está pronto vai para a lista "depois da demonstração", não para o código.

---

### Task 1: Ensaio 1 do roteiro e correções

- [ ] **Step 1: Reset dos dados de demonstração**

```bash
cd /e/motiva/web && npm run semear:demonstracao -- --limpar && npm run semear:demonstracao
```
Conferir em `/chamados`: fila com 1 aguardando aprovação, 1 adiamento, 1 atrasado; `/usuarios` com os usuários demo e os 10 líderes.

- [ ] **Step 2: Rodar os 9 passos do roteiro (spec §4) cronometrando**

Anotar, por passo, o que falhou, o que demorou mais de 10 segundos e o que exigiu explicação. Cada achado vira um `fix(...)` commitado nesta tarefa. Metas: roteiro inteiro em menos de 12 minutos; nenhuma página de erro; nenhum toast vermelho fora do passo que o provoca de propósito.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "fix(demo): achados do primeiro ensaio" && git push origin main
```

---

### Task 2: Documentação

**Files:**
- Modify: `CLAUDE.md` (gitignored: copiar também para `C:\Users\enzom\motiva-recuperado\CLAUDE.md`)
- Modify: `web/.env.example`, `.github/workflows/main.yml` (comentário sobre chamados)
- Create: `docs/operacao/contas-e-cargos.md`

- [ ] **Step 1: `CLAUDE.md`**

Acrescentar, no bloco "O painel", uma seção **"Acesso e cargos"** (sessão por cookie, `permitir`/`exigirCargo`, matriz, convite por token, RLS ligado sem políticas, chaves novas) e uma **"Chamados e campo"** (1 chamado por agendamento aprovado com equipe, gatilho, funções SQL como única porta de transição, máquina duplicada e testada, fila offline com `evento_id`, fora de ordem). Em "Armadilhas conhecidas", cinco entradas novas: layout raiz sem `force-dynamic` (está no grupo `(painel)`); `/campo` não pode ler cookie; `mudarStatusAgendamento` não aceita mais `executado`; o lote respeita chamados ativos e dá 7 dias de graça; o `assetlinks.json` e a keystore fora do repo. Atualizar a tabela de tabelas do banco com as novas.

- [ ] **Step 2: Contas e cargos para quem opera**

`docs/operacao/contas-e-cargos.md`: como convidar, o que cada cargo vê e faz, como trocar líder de equipe, como desativar, o que fazer quando alguém esquece a senha e o Resend está em modo de teste (Admin reenvia o convite ou o Super Admin roda o script de senha provisória), e os limites conhecidos.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "docs: acesso, chamados e campo no CLAUDE.md e guia de operacao" && git push origin main
```

---

### Task 3: Ensaio 2, deploy final e congelamento

- [ ] **Step 1: Deploy**

Procedimento de deploy manual (Fase 1, Task 12, Step 4). Conferir `list_deployments` → `READY`; abrir produção em aba anônima → `/entrar`.

- [ ] **Step 2: Ensaio 2 em produção, com o Android**

Repetir o roteiro completo em produção, com o APK instalado e o seed em produção (rodar `semear:demonstracao` apontando `.env.local` para a chave de produção; é o mesmo banco). Sem correções de código depois deste passo, exceto bloqueio total.

- [ ] **Step 3: Lista do depois**

Criar `docs/superpowers/specs/2026-09-13-depois-da-demonstracao.md` com, no mínimo: MFA TOTP; e-mail de aviso e Web Push (VAPID, tabela de inscrições); políticas RLS por cargo e leitura direta do Supabase pelo app; `ia.atualizar_agendamento` com `app.autor` para o gatilho registrar quem remarcou; CSP com nonce; migração de `unstable_cache` para `use cache`; domínio próprio e Resend fora do modo de teste; Play Store; iPhone; retenção de fotos; autenticação ou remoção do `main.py`; o que o ensaio mostrou que incomoda.

- [ ] **Step 4: Commit e tag**

```bash
git add -A && git commit -m "docs: lista do depois da demonstracao" && git tag demo-2026-09-13 && git push origin main --tags
```
