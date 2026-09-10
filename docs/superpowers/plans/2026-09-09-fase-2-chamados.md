# Fase 2 · Chamados — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar cada agendamento aprovado com equipe numa ordem de serviço rastreável (chamado) com estados, histórico imutável, fotos, adiamento, aprovação que grava execução e medição, e uma tela de fila para Admin e Super Admin; integrar com agenda, trecho, lote e sino.

**Architecture:** Tabelas novas em `ia` (`chamados`, `chamado_eventos`, `chamado_fotos`, `chamado_adiamentos`, `notificacoes`, `contadores`). Um gatilho em `ia.agendamentos` cria e sincroniza o chamado, venha a escrita de onde vier. Toda transição passa por funções SQL `security definer` que executam tudo ou nada e são chamadas por `db.rpc` a partir de Server Actions guardadas por `permitir`. A máquina de estados existe também como função pura em TypeScript, testada, para a UI mostrar só os botões válidos. A tela `/chamados` segue o padrão da agenda: Server Component lê, cliente filtra pela URL, gaveta em `PainelLateral`.

**Tech Stack:** os mesmos da Fase 1, mais Supabase Storage (bucket privado `chamados`) e Python 3.12 no lote (`analisar_lote.py`).

**Spec:** `docs/superpowers/specs/2026-09-09-acesso-e-chamados-design.md`, "§2 · Chamados". Pré-requisito: Fase 1 concluída (sessão, cargos, `permitir`).

## Global Constraints

- Tudo da Fase 1 continua valendo (português, `Intl`, `Resultado`, `permitir` em toda action, hex só em `globals.css`, `nuqs`, `npm run verificar` verde por tarefa, conferência byte a byte em E:).
- **A equipe do chamado é `agendamentos.equipe_id`.** Nenhuma coluna copia isso.
- **Risco vem do prazo, não de opinião**: a prioridade do chamado é a do agendamento, que já segue `riscoPorPrazo`.
- **Uma transição só acontece dentro de `ia.registrar_evento_chamado`** ou das outras três funções SQL. Nenhuma action faz `update chamados set status`.
- `chamado_eventos` é só `insert`. Nunca `update` nem `delete`.
- Todo `evento_id` é UUID gerado por quem age (painel: `crypto.randomUUID()` no servidor; campo: no aparelho). Repetir o mesmo `evento_id` é inofensivo.
- Fotos são lidas só por URL assinada de 60 s gerada no servidor (`/api/fotos/[id]`), nunca por URL pública.
- O lote (`analisar_lote.py`) mantém `hoje_brasilia()` para toda comparação de data.

---

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/20260911090000_chamados.sql` | criar | Tabelas, índices, contador, bucket |
| `supabase/migrations/20260911091000_chamados_funcoes.sql` | criar | Numeração, gatilho, `registrar_evento_chamado`, `aprovar_chamado`, `encerrar_chamado_admin`, `decidir_adiamento`, notificações |
| `supabase/migrations/20260911092000_chamados_retroativos_e_view.sql` | criar | Chamado para os aprovados atuais; view com `chamado_*` |
| `web/src/lib/types.ts` | alterar | `StatusChamado`, `TipoEventoChamado`, `MotivoAdiamento`, `Chamado`, `ChamadoEvento`, `ChamadoFoto`, `ChamadoAdiamento`, `Notificacao`; `TrechoStatus.chamado_*` |
| `web/src/lib/dominio.ts` | alterar | `STATUS_CHAMADO`, `MOTIVO_ADIAMENTO`, `TIPO_EVENTO` |
| `web/src/lib/chamados/maquina.ts` + `.test.ts` | criar | Transições puras e quem pode |
| `web/src/lib/chamados/numero.ts` + `.test.ts` | criar | Formato `CH-AAAA-NNNN` e atraso em dias |
| `web/src/lib/chamados/queries.ts` | criar | `listarChamados`, `obterChamado`, `filaDeDecisao`, `contarNaoLidas`, `listarNotificacoes` |
| `web/src/lib/chamados/acoes.ts` | criar | `aprovarChamado`, `devolverChamado`, `decidirAdiamento`, `encerrarAdministrativamente`, `cancelarChamado`, `informarAlturaInicial`, `marcarNotificacoesLidas` |
| `web/src/lib/chamados/fotos.ts` | criar | `urlAssinadaDaFoto` |
| `web/src/app/api/fotos/[id]/route.ts` | criar | 302 para a URL assinada, com cargo |
| `web/src/app/(painel)/chamados/page.tsx`, `loading.tsx`, `error.tsx` | criar | Tela |
| `web/src/app/(painel)/chamados/_componentes/fila-decisao.tsx`, `lista-chamados.tsx`, `filtros.tsx`, `painel-chamado.tsx`, `linha-do-tempo.tsx`, `fotos-antes-depois.tsx`, `formularios-decisao.tsx`, `gestao-chamados.tsx` | criar | Componentes |
| `web/src/app/(painel)/agenda/_componentes/painel-nova-rocada.tsx`, `planejamento.tsx`, `painel-agendamento.tsx`, `quadro/cartao-servico.tsx`, `dados.tsx` | alterar | Altura inicial opcional; chip do chamado; "Encerrar administrativamente" |
| `web/src/lib/acoes.ts` | alterar | `criarRocadaManual` aceita `alturaInicialCm`; `mudarStatusAgendamento` deixa de aceitar `executado` |
| `web/src/app/(painel)/trechos/[id]/page.tsx` e `_componentes/decisao-ia.tsx` | alterar | Mostra o chamado atual |
| `web/src/components/shell/sino.tsx`, `barra-superior.tsx`, `shell.tsx` | criar/alterar | Contagem e lista de notificações |
| `analisar_lote.py` | alterar | `fechar_obsoletos` respeita chamados |
| `web/scripts/fumaca.mjs` | alterar | Tabelas novas e bucket |
| `web/scripts/semear-demonstracao.mjs` + `web/scripts/fixtures/foto-*.jpg` | criar | Seed |

---

### Task 1: Migração das tabelas e do bucket

**Files:**
- Create: `supabase/migrations/20260911090000_chamados.sql`
- Modify: `web/scripts/fumaca.mjs`

- [ ] **Step 1: Escrever a migração**

Conteúdo: exatamente o bloco "Modelo" de §2 do spec (as seis tabelas e índices), seguido de:
```sql
create trigger tg_chamados_atualizado_em before update on ia.chamados
  for each row execute function ia.carimbar_atualizado_em();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chamados', 'chamados', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

comment on table ia.chamados is 'Ordem de servico de rocada: 1 por agendamento aprovado com equipe. Nasce pelo gatilho ia.tg_agendamentos_chamado.';
comment on table ia.chamado_eventos is 'Historico imutavel. evento_id vem de quem agiu (idempotencia). ocorrido_em = relogio de quem agiu; registrado_em = servidor.';
```
Aplique com `apply_migration(name: "chamados", ...)`. Verifique com `list_tables(schemas: ["ia"])` que as seis tabelas existem e com `execute_sql("select id, public, file_size_limit from storage.buckets")` que o bucket é privado.

- [ ] **Step 2: Fumaça**

Acrescente a `fumaca.mjs` checagens `chamados`, `chamado_eventos`, `chamado_fotos`, `chamado_adiamentos`, `notificacoes` (aceitando lista vazia) e:
```js
await checar("bucket chamados privado", async () => {
  const { data, error } = await db.storage.getBucket("chamados");
  return { data: data ? [data] : null, error };
}, (d) => (d?.[0] && d[0].public === false ? null : "bucket ausente ou publico"));
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(banco): tabelas de chamados, eventos, fotos, adiamentos e notificacoes; bucket privado" && git push origin main
```

---

### Task 2: Funções SQL — numeração, gatilho, transições, aprovação

**Files:**
- Create: `supabase/migrations/20260911091000_chamados_funcoes.sql`

**Interfaces:**
- Produces (todas em `ia`, `security definer`, `set search_path = ''`, `revoke execute ... from anon, authenticated, public`):
  ```sql
  ia.proximo_numero_chamado(p_data date) returns text
  ia.notificar(p_destinatarios uuid[], p_tipo text, p_titulo text, p_texto text, p_href text, p_chamado_id bigint) returns void
  ia.admins_ativos() returns uuid[]
  ia.lider_do_chamado(p_chamado_id bigint) returns uuid
  ia.registrar_evento_chamado(p_chamado_id bigint, p_evento_id uuid, p_tipo text, p_autor uuid, p_origem text, p_payload jsonb, p_ocorrido_em timestamptz) returns ia.chamados
  ia.aprovar_chamado(p_chamado_id bigint, p_autor uuid, p_km_rocados numeric, p_custo_reais numeric, p_observacao text) returns bigint
  ia.encerrar_chamado_admin(p_chamado_id bigint, p_autor uuid, p_data_execucao date, p_altura_depois_cm numeric, p_observacao text) returns bigint
  ia.decidir_adiamento(p_adiamento_id bigint, p_autor uuid, p_aceito boolean, p_nova_data date, p_resposta text) returns ia.chamados
  ia.tg_agendamentos_chamado() returns trigger
  ```

- [ ] **Step 1: Numeração e apoio**

```sql
create or replace function ia.proximo_numero_chamado(p_data date default (now() at time zone 'America/Sao_Paulo')::date)
returns text language plpgsql security definer set search_path = '' as $$
declare v_ano text := to_char(p_data, 'YYYY'); v_n integer;
begin
  insert into ia.contadores (chave, ultimo) values ('CH-' || v_ano, 1)
  on conflict (chave) do update set ultimo = ia.contadores.ultimo + 1
  returning ultimo into v_n;
  return 'CH-' || v_ano || '-' || lpad(v_n::text, 4, '0');
end $$;

create or replace function ia.tg_chamados_numero() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.numero is null or new.numero = '' then new.numero := ia.proximo_numero_chamado(); end if;
  return new;
end $$;
create trigger tg_chamados_numero before insert on ia.chamados for each row execute function ia.tg_chamados_numero();

create or replace function ia.admins_ativos() returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(usuario_id), '{}') from ia.perfis where ativo and cargo in ('super_admin','admin');
$$;

create or replace function ia.lider_do_chamado(p_chamado_id bigint) returns uuid language sql stable security definer set search_path = '' as $$
  select e.lider_id from ia.chamados c join ia.agendamentos a on a.id = c.agendamento_id
  left join ia.equipes e on e.id = a.equipe_id where c.id = p_chamado_id;
$$;

create or replace function ia.notificar(p_destinatarios uuid[], p_tipo text, p_titulo text, p_texto text, p_href text, p_chamado_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into ia.notificacoes (destinatario_id, tipo, titulo, texto, href, chamado_id)
  select distinct d, p_tipo, p_titulo, p_texto, p_href, p_chamado_id from unnest(p_destinatarios) as d where d is not null;
end $$;

/* Nome de quem age, para o historico sobreviver a desativacao. 'sistema' quando nao ha pessoa. */
create or replace function ia.nome_do_autor(p_autor uuid) returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select nome from ia.perfis where usuario_id = p_autor), 'sistema');
$$;
```

- [ ] **Step 2: A transição, num lugar só**

```sql
create or replace function ia.registrar_evento_chamado(
  p_chamado_id bigint, p_evento_id uuid, p_tipo text, p_autor uuid, p_origem text, p_payload jsonb, p_ocorrido_em timestamptz
) returns ia.chamados language plpgsql security definer set search_path = '' as $$
declare
  c ia.chamados;
  v_novo text;
  v_fotos integer;
  v_numero text;
begin
  -- Idempotencia: o mesmo evento_id devolve o chamado como esta, sem gravar nada.
  if exists (select 1 from ia.chamado_eventos where evento_id = p_evento_id) then
    select * into c from ia.chamados where id = p_chamado_id; return c;
  end if;

  select * into c from ia.chamados where id = p_chamado_id for update;
  if not found then raise exception 'chamado % nao existe', p_chamado_id using errcode = 'P0002'; end if;
  v_numero := c.numero;

  -- Chamado terminal: nada muda, mas o evento fica registrado como fora de ordem e os admins sabem.
  if c.status in ('concluido','cancelado') then
    insert into ia.chamado_eventos (chamado_id, evento_id, tipo, autor_id, autor_nome, origem, payload, ocorrido_em)
    values (p_chamado_id, p_evento_id, 'fora_de_ordem', p_autor, ia.nome_do_autor(p_autor), p_origem,
            jsonb_build_object('tipo_original', p_tipo, 'payload', p_payload, 'status_no_momento', c.status), p_ocorrido_em);
    perform ia.notificar(ia.admins_ativos(), 'fora_de_ordem', v_numero || ': evento recebido depois do fim',
      'A equipe registrou "' || p_tipo || '" num chamado ' || c.status || '. Veja o histórico.', '/chamados?chamado=' || p_chamado_id, p_chamado_id);
    raise exception 'fora_de_ordem' using errcode = 'P0003', detail = c.status;
  end if;

  -- A maquina. Espelha web/src/lib/chamados/maquina.ts; quem manda e esta.
  v_novo := case
    when p_tipo = 'iniciado'              and c.status = 'aberto'                       then 'em_andamento'
    when p_tipo = 'finalizado'            and c.status in ('em_andamento','devolvido')  then 'aguardando_aprovacao'
    when p_tipo = 'devolvido'             and c.status = 'aguardando_aprovacao'         then 'devolvido'
    when p_tipo = 'adiamento_solicitado'  and c.status in ('aberto','em_andamento')     then 'adiamento_solicitado'
    when p_tipo = 'cancelado'             and c.status not in ('concluido','cancelado') then 'cancelado'
    when p_tipo in ('remarcado','equipe_alterada','altura_inicial_alterada','comentario') then c.status
    else null end;
  if v_novo is null then
    raise exception 'transicao invalida: % em %', p_tipo, c.status using errcode = 'P0001';
  end if;

  -- Exigencias por tipo.
  if p_tipo in ('iniciado','finalizado') then
    select count(distinct papel) into v_fotos from ia.chamado_fotos
      where chamado_id = p_chamado_id and evento_id = p_evento_id
        and papel in (case when p_tipo = 'iniciado' then 'medida' else 'resultado' end, 'extensao');
    if v_fotos < 2 then raise exception 'faltam fotos obrigatorias para %', p_tipo using errcode = 'P0004'; end if;
  end if;
  if p_tipo = 'finalizado' then
    if (p_payload->>'altura_final_cm') is null or (p_payload->>'altura_final_cm')::numeric not between 0 and 300 then
      raise exception 'altura_final_cm obrigatoria (0 a 300)' using errcode = 'P0004';
    end if;
  end if;
  if p_tipo = 'devolvido' and coalesce(trim(p_payload->>'comentario'), '') = '' then
    raise exception 'devolver exige comentario' using errcode = 'P0004';
  end if;

  update ia.chamados set
    status = v_novo,
    status_anterior = case when p_tipo = 'adiamento_solicitado' then c.status else status_anterior end,
    iniciado_em     = case when p_tipo = 'iniciado'   then coalesce(iniciado_em, p_ocorrido_em) else iniciado_em end,
    finalizado_em   = case when p_tipo = 'finalizado' then p_ocorrido_em else finalizado_em end,
    altura_final_cm = case when p_tipo = 'finalizado' then (p_payload->>'altura_final_cm')::numeric else altura_final_cm end,
    altura_inicial_cm = case when p_tipo = 'altura_inicial_alterada' then (p_payload->>'altura_inicial_cm')::numeric else altura_inicial_cm end,
    altura_inicial_origem = case when p_tipo = 'altura_inicial_alterada' then 'informada' else altura_inicial_origem end,
    cancelado_em    = case when p_tipo = 'cancelado' then now() else cancelado_em end
  where id = p_chamado_id returning * into c;

  insert into ia.chamado_eventos (chamado_id, evento_id, tipo, autor_id, autor_nome, origem, payload, ocorrido_em)
  values (p_chamado_id, p_evento_id, p_tipo, p_autor, ia.nome_do_autor(p_autor), p_origem, coalesce(p_payload, '{}'::jsonb), p_ocorrido_em);

  if p_tipo = 'adiamento_solicitado' then
    insert into ia.chamado_adiamentos (chamado_id, evento_id, motivo, detalhe, data_sugerida, solicitado_por)
    values (p_chamado_id, p_evento_id, p_payload->>'motivo', p_payload->>'detalhe', nullif(p_payload->>'data_sugerida','')::date, p_autor);
  end if;

  -- Quem e avisado.
  if p_tipo in ('finalizado','adiamento_solicitado') then
    perform ia.notificar(ia.admins_ativos(), p_tipo,
      v_numero || case when p_tipo = 'finalizado' then ' aguarda sua aprovação' else ' pede adiamento' end,
      null, '/chamados?chamado=' || p_chamado_id, p_chamado_id);
  elsif p_tipo in ('devolvido','remarcado','equipe_alterada','cancelado') then
    perform ia.notificar(array[ia.lider_do_chamado(p_chamado_id)], p_tipo,
      v_numero || case p_tipo when 'devolvido' then ' foi devolvido pelo gestor' when 'remarcado' then ' mudou de data'
                              when 'equipe_alterada' then ' mudou de equipe' else ' foi cancelado' end,
      p_payload->>'comentario', '/campo', p_chamado_id);
  end if;

  return c;
end $$;
```

- [ ] **Step 3: Aprovação, encerramento e adiamento**

```sql
create or replace function ia.aprovar_chamado(p_chamado_id bigint, p_autor uuid, p_km_rocados numeric, p_custo_reais numeric, p_observacao text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare c ia.chamados; a ia.agendamentos; v_exec bigint; v_data date;
begin
  select * into c from ia.chamados where id = p_chamado_id for update;
  if c.status <> 'aguardando_aprovacao' then raise exception 'so se aprova chamado aguardando aprovacao (esta %)', c.status using errcode = 'P0001'; end if;
  if c.altura_final_cm is null then raise exception 'chamado sem altura final' using errcode = 'P0004'; end if;
  if p_km_rocados is null or p_km_rocados <= 0 then raise exception 'km rocados obrigatorio' using errcode = 'P0004'; end if;
  select * into a from ia.agendamentos where id = c.agendamento_id;

  -- Data da execucao = dia (em Brasilia) em que a equipe finalizou. Nunca o relogio do servidor em UTC.
  v_data := (coalesce(c.finalizado_em, now()) at time zone 'America/Sao_Paulo')::date;

  insert into ia.execucoes (agendamento_id, trecho_id, equipe_id, data_execucao, km_rocados, altura_antes_cm, altura_depois_cm, custo_reais, observacao)
  values (a.id, c.trecho_id, a.equipe_id, v_data, p_km_rocados, c.altura_inicial_cm, c.altura_final_cm, p_custo_reais, p_observacao)
  returning id into v_exec;

  insert into ia.medicoes (trecho_id, data, altura_cm) values (c.trecho_id, v_data, c.altura_final_cm);

  -- O chamado vira concluido ANTES do agendamento virar executado: o gatilho do
  -- agendamento ve `concluido` e nao mexe.
  update ia.chamados set status = 'concluido', concluido_em = now(), km_rocados = p_km_rocados, custo_reais = p_custo_reais,
    observacao_conclusao = p_observacao where id = p_chamado_id;
  update ia.agendamentos set status = 'executado', atualizado_em = now() where id = a.id;

  insert into ia.chamado_eventos (chamado_id, evento_id, tipo, autor_id, autor_nome, origem, payload, ocorrido_em)
  values (p_chamado_id, gen_random_uuid(), 'aprovado', p_autor, ia.nome_do_autor(p_autor), 'painel',
          jsonb_build_object('execucao_id', v_exec, 'km_rocados', p_km_rocados, 'custo_reais', p_custo_reais, 'data_execucao', v_data), now());
  perform ia.notificar(array[ia.lider_do_chamado(p_chamado_id)], 'aprovado', c.numero || ' foi aprovado', null, '/campo', p_chamado_id);
  return v_exec;
end $$;

create or replace function ia.encerrar_chamado_admin(p_chamado_id bigint, p_autor uuid, p_data_execucao date, p_altura_depois_cm numeric, p_observacao text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare c ia.chamados; a ia.agendamentos; v_exec bigint;
begin
  select * into c from ia.chamados where id = p_chamado_id for update;
  if c.status in ('concluido','cancelado') then raise exception 'chamado ja terminou (%)', c.status using errcode = 'P0001'; end if;
  if coalesce(trim(p_observacao), '') = '' then raise exception 'observacao obrigatoria' using errcode = 'P0004'; end if;
  select * into a from ia.agendamentos where id = c.agendamento_id;

  insert into ia.execucoes (agendamento_id, trecho_id, equipe_id, data_execucao, km_rocados, altura_antes_cm, altura_depois_cm, custo_reais, observacao)
  values (a.id, c.trecho_id, a.equipe_id, p_data_execucao,
          (select km_fim - km_inicio from ia.trechos where id = c.trecho_id), c.altura_inicial_cm, p_altura_depois_cm, null,
          'Encerrado administrativamente: ' || p_observacao)
  returning id into v_exec;
  if p_altura_depois_cm is not null then
    insert into ia.medicoes (trecho_id, data, altura_cm) values (c.trecho_id, p_data_execucao, p_altura_depois_cm);
  end if;

  update ia.chamados set status = 'concluido', concluido_em = now(), sem_evidencia = true, altura_final_cm = p_altura_depois_cm,
    observacao_conclusao = p_observacao where id = p_chamado_id;
  update ia.agendamentos set status = 'executado', atualizado_em = now() where id = a.id;

  insert into ia.chamado_eventos (chamado_id, evento_id, tipo, autor_id, autor_nome, origem, payload, ocorrido_em)
  values (p_chamado_id, gen_random_uuid(), 'encerrado_admin', p_autor, ia.nome_do_autor(p_autor), 'painel',
          jsonb_build_object('execucao_id', v_exec, 'data_execucao', p_data_execucao, 'observacao', p_observacao), now());
  perform ia.notificar(array[ia.lider_do_chamado(p_chamado_id)], 'encerrado_admin', c.numero || ' foi encerrado pelo gestor', p_observacao, '/campo', p_chamado_id);
  return v_exec;
end $$;

create or replace function ia.decidir_adiamento(p_adiamento_id bigint, p_autor uuid, p_aceito boolean, p_nova_data date, p_resposta text)
returns ia.chamados language plpgsql security definer set search_path = '' as $$
declare ad ia.chamado_adiamentos; c ia.chamados; v_anterior date;
begin
  select * into ad from ia.chamado_adiamentos where id = p_adiamento_id for update;
  if ad.decisao is not null then raise exception 'adiamento ja decidido' using errcode = 'P0001'; end if;
  select * into c from ia.chamados where id = ad.chamado_id for update;
  if c.status <> 'adiamento_solicitado' then raise exception 'chamado nao esta com adiamento pendente' using errcode = 'P0001'; end if;
  if p_aceito and p_nova_data is null then raise exception 'aceitar exige nova data' using errcode = 'P0004'; end if;

  update ia.chamado_adiamentos set decidido_por = p_autor, decidido_em = now(),
    decisao = case when p_aceito then 'aceito' else 'recusado' end, nova_data = p_nova_data, resposta = p_resposta
  where id = p_adiamento_id;

  update ia.chamados set status = coalesce(status_anterior, 'aberto'), status_anterior = null where id = c.id returning * into c;

  insert into ia.chamado_eventos (chamado_id, evento_id, tipo, autor_id, autor_nome, origem, payload, ocorrido_em)
  values (c.id, gen_random_uuid(), case when p_aceito then 'adiamento_aceito' else 'adiamento_recusado' end, p_autor, ia.nome_do_autor(p_autor), 'painel',
          jsonb_build_object('nova_data', p_nova_data, 'resposta', p_resposta), now());

  if p_aceito then
    select data_sugerida into v_anterior from ia.agendamentos where id = c.agendamento_id;
    -- O gatilho do agendamento registra o evento `remarcado` e avisa o lider.
    update ia.agendamentos set data_sugerida = p_nova_data, atualizado_em = now() where id = c.agendamento_id;
  else
    perform ia.notificar(array[ia.lider_do_chamado(c.id)], 'adiamento_recusado', c.numero || ': adiamento recusado', p_resposta, '/campo', c.id);
  end if;
  return c;
end $$;
```

- [ ] **Step 4: O gatilho do agendamento**

```sql
create or replace function ia.tg_agendamentos_chamado() returns trigger language plpgsql security definer set search_path = '' as $$
declare c ia.chamados; v_altura numeric; v_autor uuid;
begin
  v_autor := nullif(current_setting('app.autor', true), '')::uuid;
  select * into c from ia.chamados where agendamento_id = new.id;

  -- Nasce: aprovado com equipe, e ainda sem chamado.
  if new.status = 'aprovado' and new.equipe_id is not null and c.id is null then
    select p.altura_atual_cm into v_altura from ia.previsoes p where p.trecho_id = new.trecho_id
      order by p.data_previsao desc, p.criado_em desc, p.id desc limit 1;
    if v_altura is null then
      select m.altura_cm into v_altura from ia.medicoes m where m.trecho_id = new.trecho_id order by m.data desc, m.id desc limit 1;
    end if;
    insert into ia.chamados (agendamento_id, trecho_id, altura_inicial_cm, altura_inicial_origem)
    values (new.id, new.trecho_id, v_altura, 'prevista') returning * into c;
    insert into ia.chamado_eventos (chamado_id, evento_id, tipo, autor_id, autor_nome, origem, payload, ocorrido_em)
    values (c.id, gen_random_uuid(), 'criado', v_autor, ia.nome_do_autor(v_autor), case when v_autor is null then 'sistema' else 'painel' end,
            jsonb_build_object('data_sugerida', new.data_sugerida, 'equipe_id', new.equipe_id, 'altura_inicial_cm', v_altura), now());
    perform ia.notificar(array[(select lider_id from ia.equipes where id = new.equipe_id)], 'criado', c.numero || ' foi atribuído à sua equipe',
      'Roçada prevista para ' || to_char(new.data_sugerida, 'DD/MM'), '/campo', c.id);
    return new;
  end if;

  if c.id is null or c.status in ('concluido','cancelado') then return new; end if;

  if tg_op = 'UPDATE' then
    if new.status in ('descartado','sugerido') then
      perform ia.registrar_evento_chamado(c.id, gen_random_uuid(), 'cancelado', v_autor, case when v_autor is null then 'lote' else 'painel' end,
        jsonb_build_object('motivo', case when new.status = 'descartado' then 'agendamento descartado' else 'reaberto como sugestão' end), now());
    elsif new.status = 'executado' then
      -- Caminho legado (status trocado por fora das funcoes): conclui sem evidencia.
      update ia.chamados set status = 'concluido', concluido_em = now(), sem_evidencia = true where id = c.id;
      insert into ia.chamado_eventos (chamado_id, evento_id, tipo, autor_id, autor_nome, origem, payload, ocorrido_em)
      values (c.id, gen_random_uuid(), 'encerrado_admin', v_autor, ia.nome_do_autor(v_autor), 'sistema', '{"legado": true}'::jsonb, now());
    else
      if new.data_sugerida <> old.data_sugerida then
        perform ia.registrar_evento_chamado(c.id, gen_random_uuid(), 'remarcado', v_autor, case when v_autor is null then 'sistema' else 'painel' end,
          jsonb_build_object('de', old.data_sugerida, 'para', new.data_sugerida), now());
      end if;
      if new.equipe_id is distinct from old.equipe_id then
        perform ia.registrar_evento_chamado(c.id, gen_random_uuid(), 'equipe_alterada', v_autor, case when v_autor is null then 'sistema' else 'painel' end,
          jsonb_build_object('de', old.equipe_id, 'para', new.equipe_id), now());
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger tg_agendamentos_chamado after insert or update of status, equipe_id, data_sugerida on ia.agendamentos
  for each row execute function ia.tg_agendamentos_chamado();

revoke execute on all functions in schema ia from anon, authenticated, public;
```
Aplique com `apply_migration(name: "chamados_funcoes", ...)`. Teste no MCP com `execute_sql`, dentro de uma transação que termina em `rollback`:
```sql
begin;
update ia.agendamentos set status = 'aprovado' where id = (select id from ia.agendamentos where status = 'aprovado' limit 1); -- no-op, nao cria
select count(*) from ia.chamados; -- 0 ainda: os retroativos vem na Task 3
rollback;
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(banco): funcoes de transicao, aprovacao, encerramento e adiamento de chamados; gatilho do agendamento" && git push origin main
```

---

### Task 3: Chamados retroativos e a view com o chamado aberto

**Files:**
- Create: `supabase/migrations/20260911092000_chamados_retroativos_e_view.sql`
- Modify: `web/scripts/fumaca.mjs` (colunas novas da view)

- [ ] **Step 1: Migração**

```sql
-- Um chamado para cada aprovado com equipe que ja existe. `UPDATE OF status` dispara o gatilho
-- mesmo com o valor igual: e isso que se quer aqui.
update ia.agendamentos set status = 'aprovado' where status = 'aprovado' and equipe_id is not null;

-- A view ganha o chamado do agendamento aberto. CREATE OR REPLACE so aceita colunas novas
-- no FIM, e e onde elas estao.
create or replace view ia.vw_trecho_status as
with ultima_previsao as (
  select distinct on (trecho_id) id, trecho_id, data_previsao, crescimento_cm_dia, altura_atual_cm, altura_prevista_cm,
         dias_ate_limite, temperatura_media_c, chuva_total_mm, criado_em
  from ia.previsoes order by trecho_id, data_previsao desc, criado_em desc, id desc
), ultima_medicao as (
  select distinct on (trecho_id) trecho_id, data as medido_em, altura_cm as altura_medida_cm
  from ia.medicoes order by trecho_id, data desc, id desc
), ultimo_agendamento as (
  select distinct on (trecho_id) id, trecho_id, previsao_id, data_sugerida, prioridade, justificativa, fatores, status, origem,
         modelo_usado, criado_em, equipe_id, atualizado_em
  from ia.agendamentos where status = any (array['sugerido','aprovado'])
  order by trecho_id, criado_em desc, id desc
), ultima_execucao as (
  select distinct on (trecho_id) trecho_id, data_execucao as rocado_em
  from ia.execucoes order by trecho_id, data_execucao desc, id desc
)
select t.id, t.rodovia, t.km_inicio, t.km_fim, t.km_fim - t.km_inicio as extensao_km, t.sentido, t.uf, t.latitude, t.longitude,
       t.especie, t.altura_limite_cm, t.tipo_pista, t.observacoes,
       p.altura_atual_cm, p.crescimento_cm_dia, p.dias_ate_limite, p.temperatura_media_c, p.chuva_total_mm, p.criado_em as previsto_em,
       m.medido_em, m.altura_medida_cm, e.rocado_em,
       a.id as agendamento_id, a.data_sugerida, a.prioridade, a.justificativa, a.fatores, a.status as agendamento_status,
       a.equipe_id, q.nome as equipe_nome,
       case when t.altura_limite_cm > 0 then round(100 * coalesce(p.altura_atual_cm, m.altura_medida_cm, 0) / t.altura_limite_cm, 1) end as ocupacao_pct,
       case when p.dias_ate_limite is null then 'baixa' when p.dias_ate_limite <= 7 then 'critica'
            when p.dias_ate_limite <= 20 then 'alta' when p.dias_ate_limite <= 45 then 'media' else 'baixa' end as risco,
       a.origem as agendamento_origem,
       c.id as chamado_id, c.numero as chamado_numero, c.status as chamado_status
from ia.trechos t
left join ultima_previsao p on p.trecho_id = t.id
left join ultima_medicao m on m.trecho_id = t.id
left join ultimo_agendamento a on a.trecho_id = t.id
left join ultima_execucao e on e.trecho_id = t.id
left join ia.equipes q on q.id = a.equipe_id
left join ia.chamados c on c.agendamento_id = a.id;

alter view ia.vw_trecho_status set (security_invoker = on);
```
Aplique (`apply_migration`, nome `chamados_retroativos_e_view`). Confira: `select count(*) from ia.chamados` = número de aprovados com equipe (12 em 09/09), todos `aberto`, numerados `CH-2026-0001` em diante, cada um com um evento `criado`.

- [ ] **Step 2: Fumaça e commit**

Em `fumaca.mjs`, na checagem de `vw_trecho_status`, acrescente `"chamado_id", "chamado_numero", "chamado_status"` à lista de campos exigidos.
```bash
cd /e/motiva/web && npm run fumaca && cd .. && git add -A && git commit -m "feat(banco): chamados retroativos e view com o chamado aberto" && git push origin main
```

---

### Task 4: Tipos, vocabulário e a máquina de estados pura

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/dominio.ts`
- Create: `web/src/lib/chamados/maquina.ts`, `maquina.test.ts`
- Create: `web/src/lib/chamados/numero.ts`, `numero.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const STATUS_CHAMADO = ["aberto","em_andamento","aguardando_aprovacao","devolvido","adiamento_solicitado","concluido","cancelado"] as const;
  export type StatusChamado = (typeof STATUS_CHAMADO)[number];
  export const TIPOS_EVENTO_CHAMADO = ["criado","iniciado","finalizado","aprovado","devolvido","adiamento_solicitado","adiamento_aceito","adiamento_recusado","remarcado","equipe_alterada","altura_inicial_alterada","cancelado","encerrado_admin","fora_de_ordem","comentario"] as const;
  export type TipoEventoChamado = (typeof TIPOS_EVENTO_CHAMADO)[number];
  export const MOTIVOS_ADIAMENTO = ["chuva","equipamento","acesso_bloqueado","seguranca_trafego","falta_efetivo","outro"] as const;
  export type MotivoAdiamento = (typeof MOTIVOS_ADIAMENTO)[number];
  export type Chamado = { id: number; numero: string; agendamento_id: number; trecho_id: number; status: StatusChamado; status_anterior: StatusChamado | null;
    altura_inicial_cm: number | null; altura_inicial_origem: "prevista" | "informada"; altura_final_cm: number | null; km_rocados: number | null;
    custo_reais: number | null; observacao_conclusao: string | null; sem_evidencia: boolean; iniciado_em: string | null; finalizado_em: string | null;
    concluido_em: string | null; cancelado_em: string | null; criado_em: string; atualizado_em: string };
  export type ChamadoEvento = { id: number; chamado_id: number; evento_id: string; tipo: TipoEventoChamado; autor_id: string | null; autor_nome: string;
    origem: "painel" | "campo" | "lote" | "sistema"; payload: Record<string, unknown>; ocorrido_em: string; registrado_em: string };
  export type ChamadoFoto = { id: number; chamado_id: number; evento_id: string; etapa: "inicio" | "fim"; papel: "medida" | "extensao" | "resultado" | "extra";
    caminho: string; largura_px: number; altura_px: number; bytes: number; latitude: number | null; longitude: number | null; precisao_m: number | null;
    capturada_em: string; enviada_em: string; autor_id: string | null };
  export type ChamadoAdiamento = { id: number; chamado_id: number; evento_id: string; motivo: MotivoAdiamento; detalhe: string | null; data_sugerida: string | null;
    solicitado_por: string | null; solicitado_em: string; decidido_por: string | null; decidido_em: string | null; decisao: "aceito" | "recusado" | null;
    nova_data: string | null; resposta: string | null };
  export type Notificacao = { id: number; destinatario_id: string; tipo: string; titulo: string; texto: string | null; href: string | null; chamado_id: number | null; lida_em: string | null; criado_em: string };
  export type ChamadoDetalhado = Chamado & {
    agendamento: { id: number; data_sugerida: string; prioridade: Prioridade; justificativa: string; origem: Origem; equipe_id: number | null;
      equipe: { id: number; nome: string; lider_nome: string | null } | null };
    trecho: Pick<Trecho, "id" | "rodovia" | "km_inicio" | "km_fim" | "uf" | "sentido" | "latitude" | "longitude" | "altura_limite_cm" | "observacoes">;
  };
  // dominio.ts
  export const STATUS_CHAMADO_TOKEN: Record<StatusChamado, { rotulo: string; icone: string; tinta: string; fundo: string; descricao: string }>;
  export const MOTIVO_ADIAMENTO: Record<MotivoAdiamento, string>;
  export const TIPO_EVENTO: Record<TipoEventoChamado, { rotulo: string; icone: string }>;
  // maquina.ts
  export function proximoStatus(atual: StatusChamado, tipo: TipoEventoChamado, statusAnterior: StatusChamado | null): StatusChamado | null;
  export function terminal(status: StatusChamado): boolean;
  export type Acao = "iniciar" | "finalizar" | "pedir_adiamento" | "aprovar" | "devolver" | "decidir_adiamento" | "encerrar_admin" | "cancelar" | "informar_altura";
  export function acoesDisponiveis(status: StatusChamado, cargo: Cargo, lideraEstaEquipe: boolean): Acao[];
  // numero.ts
  export function formatarNumero(ano: number, sequencia: number): string;   // "CH-2026-0007"
  export function diasDeAtraso(dataSugerida: string, hoje: string): number;   // >0 = atrasado
  export function estaAtrasado(status: StatusChamado, dataSugerida: string, hoje: string): boolean;
  ```

- [ ] **Step 1: Tipos e vocabulário**

Acrescente a `types.ts` os blocos acima e, em `TrechoStatus`, `chamado_id: number | null; chamado_numero: string | null; chamado_status: StatusChamado | null;`. Em `dominio.ts`:
```ts
export const STATUS_CHAMADO_TOKEN: Record<StatusChamado, { rotulo: string; icone: string; tinta: string; fundo: string; descricao: string }> = {
  aberto:               { rotulo: "Aberto",                icone: "Clock",         tinta: "var(--ink-2)",         fundo: "var(--surface-3)",   descricao: "Aguardando a equipe iniciar" },
  em_andamento:         { rotulo: "Em andamento",          icone: "Play",          tinta: "var(--accent)",        fundo: "var(--accent-soft)", descricao: "Equipe em campo" },
  aguardando_aprovacao: { rotulo: "Aguardando aprovação",  icone: "Hourglass",     tinta: "var(--warning-ink)",   fundo: "var(--warning-soft)", descricao: "Fechado pela equipe; falta o gestor conferir" },
  devolvido:            { rotulo: "Devolvido",             icone: "Undo2",         tinta: "var(--serious-ink)",   fundo: "var(--serious-soft)", descricao: "Gestor recusou o fechamento; equipe refaz" },
  adiamento_solicitado: { rotulo: "Adiamento pedido",      icone: "CalendarClock", tinta: "var(--warning-ink)",   fundo: "var(--warning-soft)", descricao: "Equipe pediu nova data; gestor decide" },
  concluido:            { rotulo: "Concluído",             icone: "CircleCheck",   tinta: "var(--good-ink)",      fundo: "var(--good-soft)",    descricao: "Aprovado e registrado como execução" },
  cancelado:            { rotulo: "Cancelado",             icone: "CircleSlash",   tinta: "var(--ink-3)",         fundo: "var(--surface-3)",   descricao: "Não vai acontecer" },
};

export const MOTIVO_ADIAMENTO: Record<MotivoAdiamento, string> = {
  chuva: "Chuva", equipamento: "Equipamento quebrado", acesso_bloqueado: "Acesso bloqueado",
  seguranca_trafego: "Segurança ou tráfego", falta_efetivo: "Falta de efetivo", outro: "Outro motivo",
};

export const TIPO_EVENTO: Record<TipoEventoChamado, { rotulo: string; icone: string }> = {
  criado: { rotulo: "Chamado criado", icone: "Plus" }, iniciado: { rotulo: "Roçada iniciada", icone: "Play" },
  finalizado: { rotulo: "Roçada finalizada", icone: "Flag" }, aprovado: { rotulo: "Aprovado pelo gestor", icone: "CircleCheck" },
  devolvido: { rotulo: "Devolvido pelo gestor", icone: "Undo2" }, adiamento_solicitado: { rotulo: "Adiamento pedido", icone: "CalendarClock" },
  adiamento_aceito: { rotulo: "Adiamento aceito", icone: "CalendarCheck" }, adiamento_recusado: { rotulo: "Adiamento recusado", icone: "CalendarX" },
  remarcado: { rotulo: "Data alterada", icone: "CalendarRange" }, equipe_alterada: { rotulo: "Equipe alterada", icone: "Users" },
  altura_inicial_alterada: { rotulo: "Altura inicial informada", icone: "Ruler" }, cancelado: { rotulo: "Cancelado", icone: "CircleSlash" },
  encerrado_admin: { rotulo: "Encerrado administrativamente", icone: "ShieldCheck" }, fora_de_ordem: { rotulo: "Recebido fora de ordem", icone: "TriangleAlert" },
  comentario: { rotulo: "Comentário", icone: "MessageSquare" },
};
```
Todos os ícones existem no lucide-react 1.30; `IconeDominio` (`components/viz/legenda.tsx`) resolve pelo nome. Se algum faltar no mapa dele, acrescente lá.

- [ ] **Step 2: Testes da máquina**

Crie `web/src/lib/chamados/maquina.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { acoesDisponiveis, proximoStatus, terminal } from "./maquina";

describe("proximoStatus", () => {
  it("segue o caminho feliz", () => {
    expect(proximoStatus("aberto", "iniciado", null)).toBe("em_andamento");
    expect(proximoStatus("em_andamento", "finalizado", null)).toBe("aguardando_aprovacao");
    expect(proximoStatus("devolvido", "finalizado", null)).toBe("aguardando_aprovacao");
    expect(proximoStatus("aguardando_aprovacao", "aprovado", null)).toBe("concluido");
    expect(proximoStatus("aguardando_aprovacao", "devolvido", null)).toBe("devolvido");
  });
  it("adiamento volta ao estado anterior", () => {
    expect(proximoStatus("aberto", "adiamento_solicitado", null)).toBe("adiamento_solicitado");
    expect(proximoStatus("em_andamento", "adiamento_solicitado", null)).toBe("adiamento_solicitado");
    expect(proximoStatus("adiamento_solicitado", "adiamento_aceito", "em_andamento")).toBe("em_andamento");
    expect(proximoStatus("adiamento_solicitado", "adiamento_recusado", null)).toBe("aberto");
  });
  it("recusa o que não pode", () => {
    expect(proximoStatus("aberto", "finalizado", null)).toBeNull();
    expect(proximoStatus("aguardando_aprovacao", "iniciado", null)).toBeNull();
    expect(proximoStatus("devolvido", "adiamento_solicitado", null)).toBeNull();
    expect(proximoStatus("concluido", "cancelado", null)).toBeNull();
    expect(proximoStatus("cancelado", "iniciado", null)).toBeNull();
  });
  it("eventos informativos não mudam o estado", () => {
    for (const tipo of ["remarcado", "equipe_alterada", "altura_inicial_alterada", "comentario"] as const) {
      expect(proximoStatus("em_andamento", tipo, null)).toBe("em_andamento");
    }
  });
  it("encerramento administrativo conclui qualquer não terminal", () => {
    for (const s of ["aberto", "em_andamento", "devolvido", "adiamento_solicitado", "aguardando_aprovacao"] as const) {
      expect(proximoStatus(s, "encerrado_admin", null)).toBe("concluido");
    }
  });
});

describe("terminal", () => {
  it("só concluído e cancelado", () => {
    expect(terminal("concluido")).toBe(true);
    expect(terminal("cancelado")).toBe(true);
    expect(terminal("aberto")).toBe(false);
  });
});

describe("acoesDisponiveis", () => {
  it("líder da equipe inicia, finaliza e pede adiamento; não aprova", () => {
    expect(acoesDisponiveis("aberto", "rocador", true)).toEqual(["iniciar", "pedir_adiamento"]);
    expect(acoesDisponiveis("em_andamento", "rocador", true)).toEqual(["finalizar", "pedir_adiamento"]);
    expect(acoesDisponiveis("devolvido", "rocador", true)).toEqual(["finalizar"]);
    expect(acoesDisponiveis("aguardando_aprovacao", "rocador", true)).toEqual([]);
  });
  it("roçador de outra equipe não faz nada", () => {
    expect(acoesDisponiveis("aberto", "rocador", false)).toEqual([]);
  });
  it("admin aprova, devolve, decide adiamento, encerra e cancela", () => {
    expect(acoesDisponiveis("aguardando_aprovacao", "admin", false)).toEqual(["aprovar", "devolver", "encerrar_admin", "cancelar"]);
    expect(acoesDisponiveis("adiamento_solicitado", "admin", false)).toEqual(["decidir_adiamento", "encerrar_admin", "cancelar"]);
    expect(acoesDisponiveis("aberto", "super_admin", false)).toEqual(["informar_altura", "encerrar_admin", "cancelar"]);
    expect(acoesDisponiveis("concluido", "admin", false)).toEqual([]);
  });
  it("analista não age", () => {
    expect(acoesDisponiveis("aguardando_aprovacao", "analista", false)).toEqual([]);
  });
});
```

- [ ] **Step 3: Máquina**

Crie `web/src/lib/chamados/maquina.ts`:
```ts
import type { Cargo, StatusChamado, TipoEventoChamado } from "../types";

/**
 * A maquina de estados do chamado, em TypeScript, para a tela mostrar so os
 * botoes validos. QUEM MANDA e `ia.registrar_evento_chamado`: as duas precisam
 * continuar iguais, e este arquivo tem o teste que prende a copia daqui.
 */

const TERMINAIS: readonly StatusChamado[] = ["concluido", "cancelado"];

export function terminal(status: StatusChamado): boolean {
  return TERMINAIS.includes(status);
}

export function proximoStatus(
  atual: StatusChamado,
  tipo: TipoEventoChamado,
  statusAnterior: StatusChamado | null,
): StatusChamado | null {
  if (terminal(atual)) return null;
  switch (tipo) {
    case "iniciado":
      return atual === "aberto" ? "em_andamento" : null;
    case "finalizado":
      return atual === "em_andamento" || atual === "devolvido" ? "aguardando_aprovacao" : null;
    case "aprovado":
      return atual === "aguardando_aprovacao" ? "concluido" : null;
    case "devolvido":
      return atual === "aguardando_aprovacao" ? "devolvido" : null;
    case "adiamento_solicitado":
      return atual === "aberto" || atual === "em_andamento" ? "adiamento_solicitado" : null;
    case "adiamento_aceito":
    case "adiamento_recusado":
      return atual === "adiamento_solicitado" ? (statusAnterior ?? "aberto") : null;
    case "encerrado_admin":
      return "concluido";
    case "cancelado":
      return "cancelado";
    case "remarcado":
    case "equipe_alterada":
    case "altura_inicial_alterada":
    case "comentario":
      return atual;
    case "criado":
    case "fora_de_ordem":
      return null;
  }
}

export type Acao =
  | "iniciar" | "finalizar" | "pedir_adiamento"
  | "aprovar" | "devolver" | "decidir_adiamento" | "encerrar_admin" | "cancelar" | "informar_altura";

/** Ordem = ordem dos botoes na tela: o passo principal primeiro. */
export function acoesDisponiveis(status: StatusChamado, cargo: Cargo, lideraEstaEquipe: boolean): Acao[] {
  if (terminal(status)) return [];

  if (cargo === "rocador") {
    if (!lideraEstaEquipe) return [];
    if (status === "aberto") return ["iniciar", "pedir_adiamento"];
    if (status === "em_andamento") return ["finalizar", "pedir_adiamento"];
    if (status === "devolvido") return ["finalizar"];
    return [];
  }

  if (cargo === "admin" || cargo === "super_admin") {
    const gestao: Acao[] = [];
    if (status === "aberto") gestao.push("informar_altura");
    if (status === "aguardando_aprovacao") gestao.push("aprovar", "devolver");
    if (status === "adiamento_solicitado") gestao.push("decidir_adiamento");
    gestao.push("encerrar_admin", "cancelar");
    return gestao;
  }

  return [];
}
```

- [ ] **Step 4: Número e atraso**

Crie `web/src/lib/chamados/numero.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { diasDeAtraso, estaAtrasado, formatarNumero } from "./numero";

describe("formatarNumero", () => {
  it("quatro dígitos com zeros à esquerda", () => {
    expect(formatarNumero(2026, 7)).toBe("CH-2026-0007");
    expect(formatarNumero(2026, 12345)).toBe("CH-2026-12345");
  });
});

describe("atraso", () => {
  it("conta dias corridos depois da data prevista", () => {
    expect(diasDeAtraso("2026-09-10", "2026-09-13")).toBe(3);
    expect(diasDeAtraso("2026-09-13", "2026-09-13")).toBe(0);
    expect(diasDeAtraso("2026-09-20", "2026-09-13")).toBe(-7);
  });
  it("só aberto vencido é atrasado", () => {
    expect(estaAtrasado("aberto", "2026-09-10", "2026-09-13")).toBe(true);
    expect(estaAtrasado("aberto", "2026-09-13", "2026-09-13")).toBe(false);
    expect(estaAtrasado("em_andamento", "2026-09-10", "2026-09-13")).toBe(false);
    expect(estaAtrasado("concluido", "2026-09-10", "2026-09-13")).toBe(false);
  });
});
```
Crie `web/src/lib/chamados/numero.ts`:
```ts
import { diasEntre } from "../format";
import type { StatusChamado } from "../types";

/** Espelha `ia.proximo_numero_chamado`: o banco numera; a tela so formata para previa e testes. */
export function formatarNumero(ano: number, sequencia: number): string {
  return `CH-${ano}-${String(sequencia).padStart(4, "0")}`;
}

/** Positivo = dias alem da data prevista. Datas `AAAA-MM-DD`, `hoje` vem de `isoHoje()`. */
export function diasDeAtraso(dataSugerida: string, hoje: string): number {
  return diasEntre(dataSugerida, hoje);
}

/** "Atrasado" e so o chamado que a equipe ainda nem comecou depois da data. Em andamento nao e atraso, e trabalho. */
export function estaAtrasado(status: StatusChamado, dataSugerida: string, hoje: string): boolean {
  return status === "aberto" && diasDeAtraso(dataSugerida, hoje) > 0;
}
```

- [ ] **Step 5: Rodar e commitar**

Run: `npx vitest run src/lib/chamados` → PASS.
```bash
git add -A && git commit -m "feat(chamados): tipos, vocabulario e maquina de estados pura com testes" && git push origin main
```

---

### Task 5: Consultas, actions e a rota das fotos

**Files:**
- Create: `web/src/lib/chamados/queries.ts`
- Create: `web/src/lib/chamados/acoes.ts`
- Create: `web/src/lib/chamados/fotos.ts`
- Create: `web/src/app/api/fotos/[id]/route.ts`

**Interfaces:**
- Produces:
  ```ts
  export const listarChamados: (f?: { status?: StatusChamado[]; equipeId?: number; rodovia?: string; de?: string; ate?: string; busca?: string }) => Promise<ChamadoDetalhado[]>;
  export const obterChamado: (id: number) => Promise<(ChamadoDetalhado & { eventos: ChamadoEvento[]; fotos: ChamadoFoto[]; adiamento_pendente: ChamadoAdiamento | null }) | null>;
  export const filaDeDecisao: (hoje: string) => Promise<{ aguardando: ChamadoDetalhado[]; adiamentos: (ChamadoDetalhado & { adiamento: ChamadoAdiamento })[]; atrasados: ChamadoDetalhado[] }>;
  export const contarNaoLidas: (usuarioId: string) => Promise<number>;
  export const listarNotificacoes: (usuarioId: string, limite?: number) => Promise<Notificacao[]>;
  export async function aprovarChamado(e: { chamadoId: number; kmRocados: number; custoReais: number | null; observacao: string; reanalisar: boolean }): Promise<Resultado<{ execucaoId: number; reanalise: string | null }>>;
  export async function devolverChamado(e: { chamadoId: number; comentario: string }): Promise<Resultado>;
  export async function decidirAdiamento(e: { adiamentoId: number; aceito: boolean; novaData: string | null; resposta: string }): Promise<Resultado>;
  export async function encerrarAdministrativamente(e: { chamadoId: number; dataExecucao: string; alturaDepoisCm: number | null; observacao: string }): Promise<Resultado>;
  export async function cancelarChamado(e: { chamadoId: number; motivo: string }): Promise<Resultado>;
  export async function informarAlturaInicial(e: { chamadoId: number; alturaCm: number }): Promise<Resultado>;
  export async function marcarNotificacoesLidas(ids: number[]): Promise<Resultado>;
  export async function urlAssinadaDaFoto(caminho: string): Promise<string | null>;
  ```

- [ ] **Step 1: Consultas**

Crie `web/src/lib/chamados/queries.ts`:
```ts
import "server-only";

import { cache } from "react";

import { ordemRisco } from "../dominio";
import { db } from "../supabase";
import type { ChamadoAdiamento, ChamadoDetalhado, ChamadoEvento, ChamadoFoto, Notificacao, StatusChamado } from "../types";

function erro(contexto: string, e: { message: string } | null): never {
  throw new Error(`Falha ao ler ${contexto}: ${e?.message ?? "erro desconhecido"}`);
}

/* Uma consulta so, com os embeds resolvidos: a tela de chamados nunca faz N+1. */
const SELECT_CHAMADO = `
  *,
  agendamento:agendamentos!inner ( id, data_sugerida, prioridade, justificativa, origem, equipe_id,
    equipe:equipes ( id, nome, lider:perfis!equipes_lider_id_fkey ( nome ) ) ),
  trecho:trechos!inner ( id, rodovia, km_inicio, km_fim, uf, sentido, latitude, longitude, altura_limite_cm, observacoes )
`;

type Bruto = Omit<ChamadoDetalhado, "agendamento"> & {
  agendamento: ChamadoDetalhado["agendamento"] & { equipe: { id: number; nome: string; lider: { nome: string } | { nome: string }[] | null } | null };
};

function normalizar(linha: Bruto): ChamadoDetalhado {
  const eq = linha.agendamento.equipe;
  const lider = eq ? (Array.isArray(eq.lider) ? eq.lider[0]?.nome : eq.lider?.nome) : null;
  return { ...linha, agendamento: { ...linha.agendamento, equipe: eq ? { id: eq.id, nome: eq.nome, lider_nome: lider ?? null } : null } };
}

const ORDEM_STATUS: StatusChamado[] = ["aguardando_aprovacao", "adiamento_solicitado", "devolvido", "em_andamento", "aberto", "concluido", "cancelado"];

export const listarChamados = cache(
  async (f?: { status?: StatusChamado[]; equipeId?: number; rodovia?: string; de?: string; ate?: string; busca?: string }): Promise<ChamadoDetalhado[]> => {
    let q = db.from("chamados").select(SELECT_CHAMADO);
    if (f?.status?.length) q = q.in("status", f.status);
    if (f?.equipeId) q = q.eq("agendamento.equipe_id", f.equipeId);
    if (f?.rodovia) q = q.eq("trecho.rodovia", f.rodovia);
    if (f?.de) q = q.gte("agendamento.data_sugerida", f.de);
    if (f?.ate) q = q.lte("agendamento.data_sugerida", f.ate);
    if (f?.busca) q = q.ilike("numero", `%${f.busca.trim()}%`);
    const { data, error } = await q.order("atualizado_em", { ascending: false });
    if (error) erro("os chamados", error);
    return (data as unknown as Bruto[]).map(normalizar).sort(
      (a, b) =>
        ORDEM_STATUS.indexOf(a.status) - ORDEM_STATUS.indexOf(b.status) ||
        ordemRisco(a.agendamento.prioridade) - ordemRisco(b.agendamento.prioridade) ||
        a.agendamento.data_sugerida.localeCompare(b.agendamento.data_sugerida),
    );
  },
);

export const obterChamado = cache(async (id: number) => {
  const [{ data, error }, eventos, fotos, adiamento] = await Promise.all([
    db.from("chamados").select(SELECT_CHAMADO).eq("id", id).maybeSingle(),
    db.from("chamado_eventos").select("*").eq("chamado_id", id).order("registrado_em"),
    db.from("chamado_fotos").select("*").eq("chamado_id", id).order("capturada_em"),
    db.from("chamado_adiamentos").select("*").eq("chamado_id", id).is("decisao", null).maybeSingle(),
  ]);
  if (error) erro(`o chamado ${id}`, error);
  if (!data) return null;
  if (eventos.error) erro(`os eventos do chamado ${id}`, eventos.error);
  if (fotos.error) erro(`as fotos do chamado ${id}`, fotos.error);
  return {
    ...normalizar(data as unknown as Bruto),
    eventos: (eventos.data ?? []) as ChamadoEvento[],
    fotos: (fotos.data ?? []) as ChamadoFoto[],
    adiamento_pendente: (adiamento.data as ChamadoAdiamento | null) ?? null,
  };
});

export const filaDeDecisao = cache(async (hoje: string) => {
  const abertos = await listarChamados({ status: ["aguardando_aprovacao", "adiamento_solicitado", "aberto"] });
  const { data: pendentes } = await db.from("chamado_adiamentos").select("*").is("decisao", null);
  const porChamado = new Map((pendentes ?? []).map((a) => [a.chamado_id as number, a as ChamadoAdiamento]));
  return {
    aguardando: abertos.filter((c) => c.status === "aguardando_aprovacao").sort((a, b) => (a.finalizado_em ?? "").localeCompare(b.finalizado_em ?? "")),
    adiamentos: abertos
      .filter((c) => c.status === "adiamento_solicitado" && porChamado.has(c.id))
      .map((c) => ({ ...c, adiamento: porChamado.get(c.id)! })),
    atrasados: abertos
      .filter((c) => c.status === "aberto" && c.agendamento.data_sugerida < hoje)
      .sort((a, b) => a.agendamento.data_sugerida.localeCompare(b.agendamento.data_sugerida)),
  };
});

export const contarNaoLidas = cache(async (usuarioId: string): Promise<number> => {
  const { count } = await db.from("notificacoes").select("id", { count: "exact", head: true }).eq("destinatario_id", usuarioId).is("lida_em", null);
  return count ?? 0;
});

export const listarNotificacoes = cache(async (usuarioId: string, limite = 20): Promise<Notificacao[]> => {
  const { data, error } = await db.from("notificacoes").select("*").eq("destinatario_id", usuarioId).order("criado_em", { ascending: false }).limit(limite);
  if (error) erro("as notificações", error);
  return (data ?? []) as Notificacao[];
});
```

- [ ] **Step 2: Actions**

Crie `web/src/lib/chamados/acoes.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";

import { permitir } from "../auth/sessao";
import { enfileirarAnalise } from "../github";
import type { Resultado } from "../resultado";
import { db } from "../supabase";

function revalidar() {
  revalidatePath("/", "layout");
}

/** Os `errcode` das funcoes SQL viram frase. Qualquer outro erro passa a mensagem crua. */
function mensagemDoBanco(e: { code?: string; message: string; details?: string | null }): string {
  switch (e.code) {
    case "P0001": return "Este chamado não está num estado que permita essa ação. Recarregue a página.";
    case "P0002": return "Chamado não encontrado. Recarregue a página.";
    case "P0003": return "O chamado já terminou; o evento ficou registrado como fora de ordem.";
    case "P0004": return `Faltou algo obrigatório: ${e.message.replace(/^.*?: /, "")}`;
    default: return `O banco recusou: ${e.message}`;
  }
}

async function registrar(chamadoId: number, tipo: string, autor: string, payload: Record<string, unknown>): Promise<Resultado> {
  const { error } = await db.rpc("registrar_evento_chamado", {
    p_chamado_id: chamadoId, p_evento_id: crypto.randomUUID(), p_tipo: tipo, p_autor: autor,
    p_origem: "painel", p_payload: payload, p_ocorrido_em: new Date().toISOString(),
  });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar();
  return { ok: true, dados: undefined };
}

export async function aprovarChamado(e: {
  chamadoId: number; kmRocados: number; custoReais: number | null; observacao: string; reanalisar: boolean;
}): Promise<Resultado<{ execucaoId: number; reanalise: string | null }>> {
  const s = await permitir("super_admin", "admin");
  if (!s.ok) return s;
  if (!Number.isFinite(e.kmRocados) || e.kmRocados <= 0 || e.kmRocados > 500) return { ok: false, erro: "Informe os km roçados (entre 0 e 500)." };
  if (e.custoReais != null && (!Number.isFinite(e.custoReais) || e.custoReais < 0)) return { ok: false, erro: "Custo inválido." };

  const { data: chamado } = await db.from("chamados").select("trecho_id").eq("id", e.chamadoId).maybeSingle();
  if (!chamado) return { ok: false, erro: "Chamado não encontrado. Recarregue a página." };

  const { data, error } = await db.rpc("aprovar_chamado", {
    p_chamado_id: e.chamadoId, p_autor: s.dados.usuarioId, p_km_rocados: e.kmRocados,
    p_custo_reais: e.custoReais, p_observacao: e.observacao.trim() || null,
  });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar();

  // A rocada muda `dias_desde_rocada_inicio`, feature do modelo: reanalisar e o padrao.
  // Se o GitHub recusar (ja ha execucao em voo), o chamado continua aprovado e a tela avisa.
  let reanalise: string | null = null;
  if (e.reanalisar) {
    const r = await enfileirarAnalise(chamado.trecho_id as number);
    reanalise = r.ok ? `Reanálise do trecho enfileirada (${r.dados.nome}).` : `Chamado aprovado; a reanálise não foi disparada: ${r.erro}`;
  }
  return { ok: true, dados: { execucaoId: data as number, reanalise } };
}

export async function devolverChamado(e: { chamadoId: number; comentario: string }): Promise<Resultado> {
  const s = await permitir("super_admin", "admin");
  if (!s.ok) return s;
  const comentario = e.comentario.trim();
  if (comentario.length < 3) return { ok: false, erro: "Diga à equipe o que precisa ser refeito." };
  return registrar(e.chamadoId, "devolvido", s.dados.usuarioId, { comentario });
}

export async function decidirAdiamento(e: { adiamentoId: number; aceito: boolean; novaData: string | null; resposta: string }): Promise<Resultado> {
  const s = await permitir("super_admin", "admin");
  if (!s.ok) return s;
  if (e.aceito && !(e.novaData && /^\d{4}-\d{2}-\d{2}$/.test(e.novaData))) return { ok: false, erro: "Escolha a nova data." };
  const { error } = await db.rpc("decidir_adiamento", {
    p_adiamento_id: e.adiamentoId, p_autor: s.dados.usuarioId, p_aceito: e.aceito,
    p_nova_data: e.aceito ? e.novaData : null, p_resposta: e.resposta.trim() || null,
  });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar();
  return { ok: true, dados: undefined };
}

export async function encerrarAdministrativamente(e: {
  chamadoId: number; dataExecucao: string; alturaDepoisCm: number | null; observacao: string;
}): Promise<Resultado> {
  const s = await permitir("super_admin", "admin");
  if (!s.ok) return s;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.dataExecucao)) return { ok: false, erro: "Informe a data em que a roçada aconteceu." };
  if (e.observacao.trim().length < 5) return { ok: false, erro: "A observação é obrigatória: por que está encerrando sem a evidência de campo?" };
  if (e.alturaDepoisCm != null && (e.alturaDepoisCm < 0 || e.alturaDepoisCm > 300)) return { ok: false, erro: "Altura fora da faixa (0 a 300 cm)." };
  const { error } = await db.rpc("encerrar_chamado_admin", {
    p_chamado_id: e.chamadoId, p_autor: s.dados.usuarioId, p_data_execucao: e.dataExecucao,
    p_altura_depois_cm: e.alturaDepoisCm, p_observacao: e.observacao.trim(),
  });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar();
  return { ok: true, dados: undefined };
}

/** Cancelar = descartar o agendamento. O gatilho cancela o chamado; o motivo entra antes, como comentario. */
export async function cancelarChamado(e: { chamadoId: number; motivo: string }): Promise<Resultado> {
  const s = await permitir("super_admin", "admin");
  if (!s.ok) return s;
  const motivo = e.motivo.trim();
  if (motivo.length < 3) return { ok: false, erro: "Escreva por que o chamado está sendo cancelado." };
  const { data: chamado } = await db.from("chamados").select("agendamento_id").eq("id", e.chamadoId).maybeSingle();
  if (!chamado) return { ok: false, erro: "Chamado não encontrado. Recarregue a página." };
  const comentario = await registrar(e.chamadoId, "comentario", s.dados.usuarioId, { texto: `Cancelamento: ${motivo}` });
  if (!comentario.ok) return comentario;
  const { error } = await db.from("agendamentos").update({ status: "descartado", atualizado_em: new Date().toISOString() }).eq("id", chamado.agendamento_id);
  if (error) return { ok: false, erro: `Não foi possível descartar o agendamento: ${error.message}` };
  revalidar();
  return { ok: true, dados: undefined };
}

export async function informarAlturaInicial(e: { chamadoId: number; alturaCm: number }): Promise<Resultado> {
  const s = await permitir("super_admin", "admin");
  if (!s.ok) return s;
  if (!Number.isFinite(e.alturaCm) || e.alturaCm < 0 || e.alturaCm > 300) return { ok: false, erro: "Altura fora da faixa (0 a 300 cm)." };
  return registrar(e.chamadoId, "altura_inicial_alterada", s.dados.usuarioId, { altura_inicial_cm: e.alturaCm });
}

export async function marcarNotificacoesLidas(ids: number[]): Promise<Resultado> {
  const s = await permitir("super_admin", "admin", "analista", "rocador");
  if (!s.ok) return s;
  if (ids.length === 0) return { ok: true, dados: undefined };
  const { error } = await db.from("notificacoes").update({ lida_em: new Date().toISOString() }).in("id", ids).eq("destinatario_id", s.dados.usuarioId);
  if (error) return { ok: false, erro: `Não foi possível marcar: ${error.message}` };
  revalidatePath("/", "layout");
  return { ok: true, dados: undefined };
}
```

- [ ] **Step 3: Fotos**

Crie `web/src/lib/chamados/fotos.ts`:
```ts
import "server-only";

import { db } from "../supabase";

/** URL de 60 s: o suficiente para o navegador carregar a imagem, nao para o link circular. */
export async function urlAssinadaDaFoto(caminho: string): Promise<string | null> {
  const { data, error } = await db.storage.from("chamados").createSignedUrl(caminho, 60);
  return error ? null : data.signedUrl;
}
```
Crie `web/src/app/api/fotos/[id]/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";

import { obterSessao } from "@/lib/auth/sessao";
import { urlAssinadaDaFoto } from "@/lib/chamados/fotos";
import { db } from "@/lib/supabase";

/** `<img src="/api/fotos/123">` no painel e no app. Quem pode ver: gestao, ou o lider da equipe do chamado. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/fotos/[id]">) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ erro: "Sessão necessária." }, { status: 401 });

  const { id } = await ctx.params;
  const fotoId = Number(id);
  if (!Number.isInteger(fotoId) || fotoId <= 0) return NextResponse.json({ erro: "Foto inválida." }, { status: 400 });

  const { data: foto } = await db
    .from("chamado_fotos")
    .select("caminho, chamado:chamados!inner ( agendamento:agendamentos!inner ( equipe:equipes ( lider_id ) ) )")
    .eq("id", fotoId)
    .maybeSingle();
  if (!foto) return NextResponse.json({ erro: "Foto não encontrada." }, { status: 404 });

  if (sessao.cargo === "rocador") {
    const equipe = (foto.chamado as unknown as { agendamento: { equipe: { lider_id: string | null } | null } }).agendamento.equipe;
    if (equipe?.lider_id !== sessao.usuarioId) return NextResponse.json({ erro: "Sem acesso a esta foto." }, { status: 403 });
  } else if (sessao.cargo === "analista") {
    return NextResponse.json({ erro: "Sem acesso a esta foto." }, { status: 403 });
  }

  const url = await urlAssinadaDaFoto(foto.caminho as string);
  if (!url) return NextResponse.json({ erro: "Não foi possível assinar a foto." }, { status: 502 });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
}
```
`RouteContext<"/api/fotos/[id]">` é o tipo global gerado pelo Next 16 (`next typegen` roda no `dev` e no `build`).

- [ ] **Step 4: Tipos e commit**

```bash
npm run tipos && npm run lint && git add -A && git commit -m "feat(chamados): consultas, actions e rota de fotos assinadas" && git push origin main
```

---

### Task 6: A tela `/chamados`

**Files:**
- Create: `web/src/app/(painel)/chamados/page.tsx`, `loading.tsx`, `error.tsx`
- Create: `web/src/app/(painel)/chamados/_componentes/gestao-chamados.tsx`, `filtros.tsx`, `fila-decisao.tsx`, `lista-chamados.tsx`, `painel-chamado.tsx`, `linha-do-tempo.tsx`, `fotos-antes-depois.tsx`, `formularios-decisao.tsx`, `cartao-chamado.tsx`

**Interfaces:**
- Consumes: Tasks 4–5; `PainelLateral`, `Tabela*`, `Chip`, `ChipRisco`, `Campo`, `Entrada`, `AreaTexto`, `Selecao`, `Botao`, `Aviso`, `EstadoVazio`, `useNotificacao`, `IconeDominio`; `PainelNovaRocada` (Task 7 acrescenta o campo de altura); `distanciaKm` de `@/lib/utils`.

- [ ] **Step 1: Página**

```tsx
import type { Metadata } from "next";

import { CabecalhoPagina, MetricaCabecalho } from "@/components/shell/cabecalho-pagina";
import { exigirCargo } from "@/lib/auth/sessao";
import { filaDeDecisao, listarChamados, obterChamado } from "@/lib/chamados/queries";
import { fmt, isoHoje } from "@/lib/format";
import { listarEquipes, listarTrechos } from "@/lib/queries";

import { GestaoChamados } from "./_componentes/gestao-chamados";

export const metadata: Metadata = { title: "Chamados", description: "Ordens de roçada: o que a equipe executou, o que espera aprovação e o que pediu adiamento." };

export default async function PaginaChamados({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sessao = await exigirCargo("super_admin", "admin");
  const params = await searchParams;
  const hoje = isoHoje();
  const chamadoAberto = typeof params.chamado === "string" ? Number(params.chamado) : null;

  const [chamados, fila, equipes, trechos, detalhe] = await Promise.all([
    listarChamados(),
    filaDeDecisao(hoje),
    listarEquipes(),
    listarTrechos(),
    chamadoAberto && Number.isInteger(chamadoAberto) ? obterChamado(chamadoAberto) : Promise.resolve(null),
  ]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Chamados"
        destaque
        metricas={
          <>
            <MetricaCabecalho rotulo="Aguardando você" valor={fmt.n(fila.aguardando.length + fila.adiamentos.length)} />
            <MetricaCabecalho rotulo="Atrasados" valor={fmt.n(fila.atrasados.length)} />
          </>
        }
      />
      <GestaoChamados chamados={chamados} fila={fila} equipes={equipes} trechos={trechos} detalhe={detalhe} hoje={hoje} cargo={sessao.cargo} />
    </div>
  );
}
```
A gaveta lê o chamado no **servidor** (`detalhe`), pelo `?chamado=`: eventos e fotos chegam prontos e o link é compartilhável. Filtros da lista (`?status=`, `?equipe=`, `?rodovia=`, `?de=`, `?ate=`, `?busca=`) são aplicados no cliente sobre a lista completa (poucas centenas de linhas), com os parsers de `nuqs` em `filtros.tsx` no molde de `malha/_componentes/filtros.tsx`.

- [ ] **Step 2: Orquestrador**

`gestao-chamados.tsx` (`"use client"`): `useQueryStates` com os filtros; `useQueryState("chamado", parseAsInteger)`; `useQueryState("nova", parseAsBoolean)`. Renderiza, nesta ordem: `<FilaDecisao fila hoje aoAbrir={(id) => setChamado(id)} />`; barra com `<Filtros>` e o botão primário "Novo chamado" (abre `PainelNovaRocada`, Task 7); `<ListaChamados chamados={filtrados} hoje aoAbrir />`; `<PainelChamado detalhe aberto={chamado != null} aoFechar={() => setChamado(null)} cargo hoje />`. Toda action passa por `executar(fn)`: `useTransition` + `useNotificacao` (`good`; `critical` com `duracao: 0`) + `router.refresh()`.

- [ ] **Step 3: Fila de decisão**

`fila-decisao.tsx`: três `Cartao` lado a lado (`grid md:grid-cols-3`), títulos "Aguardando aprovação", "Adiamento pedido", "Atrasados", cada um com a contagem em `text-2xl tnum` e até 4 `CartaoChamado` compactos (número em mono, rodovia e faixa, equipe, e o dado que importa no bloco: "finalizado há 2 h", "pede 15/09 · chuva", "3 dias de atraso"). Bloco vazio mostra "Nada esperando você" em `text-ink-3`, nunca some. "Ver todos" filtra a lista pelo status.

- [ ] **Step 4: Lista**

`lista-chamados.tsx`: `Tabela rotulo="Chamados"` com colunas Número (`font-mono`), Trecho (rodovia + `fmt.faixaKm`), Equipe (nome; líder em `text-xs text-ink-3`; sem líder → `Chip tom="warning"` "sem líder"), Data prevista (`fmt.dataCurta` + `relativoEmDias`; atrasado em `text-critical-ink` com ícone), Estado (`Chip` com ícone e rótulo de `STATUS_CHAMADO_TOKEN`), Prioridade (`ChipRisco`), Última atividade (`fmt.dataCurta`/`fmt.horaMin` de `atualizado_em`). Linha clicável abre a gaveta. Lista vazia após filtro: `EstadoVazio` "Nenhum chamado com esses filtros" com ação "Limpar filtros".

- [ ] **Step 5: Gaveta**

`painel-chamado.tsx`: `PainelLateral largura="lg"`, título `numero`, descrição `rodovia · faixa de km · UF`. Corpo em seções:
1. **Estado e prazo**: chip do estado, `ChipRisco`, data prevista, equipe e líder, badge "atrasado há N dias" quando `estaAtrasado`.
2. **Alturas**: inicial com a frase "prevista pelo modelo" ou "informada pelo gestor" (`altura_inicial_origem`), final quando houver, limite do trecho; em `aberto`, botão "Informar altura" abre um campo inline (`informarAlturaInicial`).
3. **Fotos**: `<FotosAntesDepois fotos trecho />`: duas colunas "Antes" (etapa `inicio`) e "Depois" (etapa `fim`), cada foto como `<img src={`/api/fotos/${id}`} loading="lazy">` com legenda: papel, `fmt.horaMin(capturada_em)`, e, quando há GPS, "a 0,3 km do meio do trecho · ±12 m" (`distanciaKm` entre a foto e o ponto médio de latitude/longitude do trecho). Clique abre em tamanho cheio num `Modal`.
4. **Adiamento pendente** (quando `adiamento_pendente`): motivo (`MOTIVO_ADIAMENTO`), detalhe, data sugerida, quem pediu e quando.
5. **Ações**: `acoesDisponiveis(status, cargo, false)` decide o que aparece; cada ação abre seu formulário de `formularios-decisao.tsx` no rodapé:
   - `aprovar`: km roçados (`Entrada type="number"` pré-preenchido com `km_fim - km_inicio`), custo em R$ (opcional), observação, checkbox "Reanalisar o trecho depois de aprovar" (ligado) → `aprovarChamado`; sucesso mostra `reanalise` no toast.
   - `devolver`: `AreaTexto` "O que a equipe precisa refazer" → `devolverChamado`.
   - `decidir_adiamento`: dois botões: "Aceitar" com `Entrada type="date"` pré-preenchida com `data_sugerida` do pedido, e "Recusar" com resposta opcional → `decidirAdiamento`.
   - `encerrar_admin`: data (`type="date"`, máx. hoje), altura depois (opcional), observação obrigatória → `encerrarAdministrativamente`; texto de apoio: "Use quando a roçada aconteceu sem passar pelo app. Fica marcado como sem evidência."
   - `cancelar`: motivo → `cancelarChamado`, com confirmação em dois passos.
6. **Linha do tempo**: `<LinhaDoTempo eventos />`: lista vertical com ícone de `TIPO_EVENTO`, rótulo, `autor_nome` e origem ("pelo app", "pelo painel", "pelo lote", "pelo sistema"), `fmt.dataCurta` + `fmt.horaMin(registrado_em)`; quando `ocorrido_em` e `registrado_em` divergem em mais de 5 minutos, uma segunda linha "no aparelho: hh:mm (enviado às hh:mm)". Payload relevante em texto: comentário, de/para de data e equipe, motivo, altura.

- [ ] **Step 6: Verificar no navegador e commitar**

Com os 12 chamados retroativos: abrir `/chamados`, ver a fila (todos `aberto`; alguns atrasados porque as datas de agosto já passaram), abrir uma gaveta, informar altura, cancelar um com motivo e ver o agendamento virar descartado na agenda. Tema claro e escuro, 390 px (a tabela rola dentro do próprio contêiner; a página não).
```bash
npm run verificar && git add -A && git commit -m "feat(chamados): tela com fila de decisao, lista filtravel e gaveta" && git push origin main
```

---

### Task 7: Agenda, trecho e "Nova roçada" enxergam o chamado

**Files:**
- Modify: `web/src/lib/acoes.ts` (`criarRocadaManual`, `mudarStatusAgendamento`)
- Modify: `web/src/app/(painel)/agenda/_componentes/painel-nova-rocada.tsx`, `planejamento.tsx`, `painel-agendamento.tsx`, `dados.tsx`, `quadro/cartao-servico.tsx`
- Modify: `web/src/app/(painel)/trechos/[id]/page.tsx`, `web/src/app/(painel)/trechos/_componentes/decisao-ia.tsx`
- Modify: `web/src/app/(painel)/agenda/page.tsx` (passa a lista de chamados abertos)

- [ ] **Step 1: Altura inicial opcional na roçada manual**

Em `acoes.ts`, `criarRocadaManual` ganha `alturaInicialCm?: number | null` em `entrada`. Validação: quando informada, `0 ≤ altura ≤ 300`. Depois do `insert` bem-sucedido (o gatilho já criou o chamado):
```ts
  if (entrada.alturaInicialCm != null) {
    const { data: chamado } = await db.from("chamados").select("id").eq("agendamento_id", linha.id).maybeSingle();
    if (chamado) {
      await db.rpc("registrar_evento_chamado", {
        p_chamado_id: chamado.id, p_evento_id: crypto.randomUUID(), p_tipo: "altura_inicial_alterada", p_autor: sessao.dados.usuarioId,
        p_origem: "painel", p_payload: { altura_inicial_cm: entrada.alturaInicialCm }, p_ocorrido_em: new Date().toISOString(),
      });
    }
  }
```
Em `painel-nova-rocada.tsx`: campo opcional "Altura atual do mato (cm)" (`Entrada type="number" step="0.5"`, aceita vírgula como `registrar-medicao.tsx`), com dica "Se deixar vazio, entra a altura prevista pelo modelo: {fmt.cm(trechoEscolhido?.altura_atual_cm)}". `EntradaNovaRocada` ganha `alturaInicialCm: number | null`. O título da gaveta passa a depender de onde ela abre: prop `titulo` com padrão "Nova roçada"; em `/chamados`, "Novo chamado".

- [ ] **Step 2: "Marcar como executada" vira encerramento administrativo**

Em `acoes.ts`, `mudarStatusAgendamento` recusa `status === "executado"` com `"Conclua pelo chamado (aprovação) ou encerre administrativamente."` — o caminho legado deixa de existir pela UI. Em `painel-agendamento.tsx`, o botão "Marcar como executada" vira "Encerrar administrativamente" e abre o mesmo formulário de `formularios-decisao.tsx` (data, altura depois opcional, observação obrigatória), chamando `encerrarAdministrativamente({ chamadoId })`; para isso a gaveta precisa do `chamado_id` do agendamento, que vem no Step 3.

- [ ] **Step 3: Chamado no cartão e na gaveta da agenda**

`agenda/page.tsx` passa a ler também `listarChamados({ status: ["aberto","em_andamento","aguardando_aprovacao","devolvido","adiamento_solicitado"] })` e entrega a `PlanejamentoAgenda` um `Map<agendamentoId, { id, numero, status }>` (serializado como array de pares). `dados.tsx`: `ItemAgenda` ganha `chamado: { id: number; numero: string; status: StatusChamado } | null`, preenchido em `montarItens`. `cartao-servico.tsx`: abaixo do nome do trecho, `Chip tamanho="sm"` com ícone e rótulo de `STATUS_CHAMADO_TOKEN[status]` e o número em `font-mono`. `painel-agendamento.tsx`: seção "Chamado" com número, estado e link "Abrir em Chamados" (`/chamados?chamado=<id>`).

- [ ] **Step 4: Página do trecho**

`trechos/[id]/page.tsx` já tem `agendamentoAtual`; leia `obterChamado` quando `trecho.chamado_id` existir e passe a `DecisaoIa` (ou a um novo `CartaoChamadoDoTrecho` ao lado dele): número, estado, equipe, data, altura inicial, link para `/chamados?chamado=`. `HistoricoTrecho` continua lendo `execucoes`: uma aprovação da Task 5 aparece ali sem mudança.

- [ ] **Step 5: Verificar e commitar**

Criar uma roçada manual com altura informada em `/agenda`: o chamado nasce com `altura_inicial_origem = informada` e o evento `altura_inicial_alterada` na linha do tempo. Encerrar administrativamente pela agenda: execução aparece na página do trecho.
```bash
npm run verificar && git add -A && git commit -m "feat(chamados): agenda, trecho e nova rocada integrados ao chamado" && git push origin main
```

---

### Task 8: O lote respeita chamados ativos

**Files:**
- Modify: `analisar_lote.py` (`fechar_obsoletos`)

- [ ] **Step 1: Alterar `fechar_obsoletos`**

Substitua a função por:
```python
ATIVOS = ("em_andamento", "aguardando_aprovacao", "devolvido", "adiamento_solicitado")
DIAS_DE_GRACA = 7


def fechar_obsoletos(trecho_id, hoje):
    """Descarta os agendamentos em aberto de um trecho que nao precisa mais.

    `sugerido` e do lote: fecha sempre. `aprovado` tem um CHAMADO desde a Fase 2, e o
    lote respeita o trabalho da equipe:
      - chamado em andamento, aguardando aprovacao, devolvido ou com adiamento pendente:
        nao toca (imprime [chamado ativo]);
      - chamado `aberto` sem nenhum evento alem de `criado` e vencido ha mais de
        DIAS_DE_GRACA: descarta o agendamento; o gatilho cancela o chamado e o
        historico registra a origem `lote`;
      - chamado `aberto` vencido ha menos de 7 dias: fica, e o painel mostra "atrasado".
    Devolve quantos fechou.
    """
    abertos = (sb.table("agendamentos")
               .select("id,status,data_sugerida,chamados(id,status)")
               .eq("trecho_id", trecho_id)
               .in_("status", ["sugerido", "aprovado"])
               .execute().data)

    limite_graca = (hoje - timedelta(days=DIAS_DE_GRACA)).isoformat()
    ids = []
    for a in abertos:
        if a["status"] == "sugerido":
            ids.append(a["id"])
            continue
        chamado = (a.get("chamados") or [None])[0] if isinstance(a.get("chamados"), list) else a.get("chamados")
        if chamado and chamado["status"] in ATIVOS:
            print(f"      [chamado ativo] agendamento {a['id']} ({chamado['status']}): mantido")
            continue
        if a["data_sugerida"] >= limite_graca:
            continue
        if chamado:
            eventos = (sb.table("chamado_eventos").select("tipo").eq("chamado_id", chamado["id"])
                       .neq("tipo", "criado").limit(1).execute().data)
            if eventos:
                print(f"      [chamado com atividade] agendamento {a['id']}: mantido")
                continue
        ids.append(a["id"])

    if not ids:
        return 0

    (sb.table("agendamentos")
     .update({"status": "descartado",
              "atualizado_em": datetime.now(timezone.utc).isoformat()})
     .in_("id", ids)
     .execute())
    return len(ids)
```
`timedelta` já está importado no arquivo (`FUSO_BR`). O embed `chamados(id,status)` funciona porque `chamados.agendamento_id` é FK única para `agendamentos`.

- [ ] **Step 2: Testar localmente contra o banco e commitar**

```bash
cd /e/motiva && TRECHO_ID=3 ./venv/Scripts/python.exe analisar_lote.py
```
Expected: o trecho 3 (aprovado desde agosto, chamado `aberto` sem atividade, vencido há mais de 7 dias) é descartado e o chamado aparece `cancelado` com evento de origem `lote`; se antes disso você iniciou o chamado dele pela Fase 3, a saída é `[chamado ativo]`.
```bash
git add -A && git commit -m "feat(lote): fechar_obsoletos respeita chamados ativos e da 7 dias de graca" && git push origin main
```

---

### Task 9: Sino

**Files:**
- Create: `web/src/components/shell/sino.tsx`
- Modify: `web/src/components/shell/shell.tsx`, `barra-superior.tsx`

- [ ] **Step 1: Componente**

`sino.tsx` (`"use client"`): recebe `naoLidas: number` e `notificacoes: Notificacao[]`; ícone `Bell` com badge numérico (`bg-critical text-white` só quando > 0, com `aria-label="N notificações não lidas"`); clique abre um painel ancorado (`Menu` de `components/ui/menu.tsx`, ou um `PainelLateral largura="sm"` no celular) listando título, texto, `relativoEmDias`; item com `href` é `Link`; ao abrir, `marcarNotificacoesLidas(ids das não lidas)` via `useTransition`. Vazio: "Nada por enquanto".

- [ ] **Step 2: Ligar**

`shell.tsx` lê `contarNaoLidas(sessao.usuarioId)` e `listarNotificacoes(sessao.usuarioId)` no `Promise.all` de `carregarCasco` (dentro do mesmo `try`) e passa a `BarraSuperior`, que renderiza `<Sino>` antes de `<MenuUsuario>`.

- [ ] **Step 3: Commit**

```bash
npm run verificar && git add -A && git commit -m "feat(sino): notificacoes nao lidas no painel" && git push origin main
```

---

### Task 10: Seed de demonstração

**Files:**
- Create: `web/scripts/semear-demonstracao.mjs`
- Create: `web/scripts/fixtures/foto-medida.jpg`, `foto-extensao.jpg`, `foto-resultado.jpg`, `foto-extensao-fim.jpg` (fotos reais suas de beira de estrada ou de qualquer gramado, redimensionadas para 1600 px, cada uma abaixo de 500 KB)
- Modify: `web/package.json` (`"semear:demonstracao": "node scripts/semear-demonstracao.mjs"`)

- [ ] **Step 1: O que o script faz, nesta ordem, idempotente**

1. Lê `.env.local` como `fumaca.mjs`; senha única de `SEED_SENHA` ou `Demo-2026-solo`.
2. Usuários (cria se o e-mail não existe em `ia.perfis`; `email_confirm: true`, `app_metadata.cargo`, `user_metadata.nome`, `perfis.senha_provisoria = false`): `super.demo@demo.highwai.com.br` (Super Demo, super_admin), `admin.demo@…` (Admin Demo), `analista.demo@…` (Analista Demo) e, para cada `ia.equipes` ativa, `lider.<id>.demo@…` (nome "Líder <nome curto da equipe>", rocador) definindo `equipes.lider_id` quando ainda vazio.
3. Chamados (só se não existir chamado com `payload.demo = true` no evento `criado` do trecho): escolhe 7 trechos sem agendamento aberto e, para cada estado, cria um agendamento `aprovado` com equipe e `origem = 'manual'`, justificativa "Demonstração: <estado>", e leva o chamado ao estado com as funções SQL, usando `evento_id` fixos derivados do trecho (idempotência):
   - `aberto` com data amanhã; `aberto` com data 4 dias atrás (atrasado);
   - `em_andamento`: sobe `foto-medida.jpg` e `foto-extensao.jpg` para `chamados/<id>/<evento>/…` (`db.storage.from("chamados").upload`), insere `chamado_fotos` (etapa `inicio`, papéis `medida` e `extensao`, GPS = coordenadas do trecho ± 0,001, `capturada_em` 2 h atrás) e chama `registrar_evento_chamado('iniciado')`;
   - `aguardando_aprovacao`: o anterior mais as fotos de fim e `finalizado` com `altura_final_cm: 6`;
   - `devolvido`: o anterior mais `devolvido` com comentário "Foto do resultado escura; refazer";
   - `adiamento_solicitado`: `adiamento_solicitado` com motivo `chuva`, detalhe "Chuva forte desde as 9 h", data sugerida +3 dias;
   - `concluido`: o de aguardando mais `aprovar_chamado` (km = extensão, custo 4200, observação "Demonstração");
   - `cancelado`: `aberto` e depois `update agendamentos set status = 'descartado'`.
4. Marca todo agendamento e evento criado com `payload.demo = true` (no `criado`, via `set_config` não disponível: grave em `justificativa` o prefixo "Demonstração:" e filtre por ele).
5. `--limpar`: descarta os agendamentos com justificativa "Demonstração:%" (o gatilho cancela os chamados), apaga fotos do bucket desses chamados, remove os chamados e desativa (não exclui) os usuários `@demo.highwai.com.br`.
6. Imprime a tabela: e-mail, cargo, senha; e por chamado: número, estado, trecho.

- [ ] **Step 2: Rodar e conferir**

```bash
npm run semear:demonstracao
```
Expected: `/chamados` mostra a fila com 1 aguardando, 1 adiamento, 1 atrasado; a gaveta do concluído mostra antes e depois; `/usuarios` lista os líderes; entrar como `lider.1.demo@…` em uma aba anônima redireciona para `/campo` (404 até a Fase 3).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(demo): seed idempotente de usuarios e chamados nos sete estados" && git push origin main
```

---

## Auto-revisão do plano

- **Cobertura do spec §2:** modelo e bucket (T1), numeração, gatilho, transições, aprovação, encerramento, adiamento, notificações (T2), retroativos e view (T3), tipos e vocabulário e máquina (T4), consultas, actions e fotos assinadas (T5), tela (T6), agenda, trecho e nova roçada (T7), lote (T8), sino (T9), seed (T10).
- **Consistência:** os nomes das funções SQL (`registrar_evento_chamado`, `aprovar_chamado`, `encerrar_chamado_admin`, `decidir_adiamento`) são os mesmos em T2 e nas actions de T5/T7; os `errcode` `P0001–P0004` são os que `mensagemDoBanco` traduz; `STATUS_CHAMADO_TOKEN` e `TIPO_EVENTO` (T4) são os lidos por T6 e T7; a máquina TypeScript (T4) e a SQL (T2) têm as mesmas transições, inclusive `devolvido → finalizado` e adiamento só de `aberto`/`em_andamento`.
- **Limitação conhecida:** eventos que o gatilho gera a partir de escritas das actions antigas (`remarcarAgendamento`, `atribuirEquipe`, `aprovarAgendamento`) saem com `autor_nome = 'sistema'` e origem `painel`, porque o PostgREST não compartilha transação para `set_config('app.autor')`. Depois da demonstração: trocar essas três actions por uma função SQL `ia.atualizar_agendamento(p_id, p_autor, p_campos jsonb)` que define `app.autor` antes do `update`.
- **Cortes para domingo, se apertar:** T7 pode entregar só o Step 1 e o Step 3 (altura opcional e chip no cartão); T9 pode virar só o contador no ícone, sem lista; em T6 a linha do tempo pode omitir a linha "no aparelho/enviado às".
