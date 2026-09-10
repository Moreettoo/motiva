-- Fase 2 · Chamados — as funcoes.
--
-- TUDO OU NADA. Cada transicao e uma funcao `security definer` que faz o
-- conjunto inteiro de escritas ou nenhuma: nenhuma action faz
-- `update chamados set status`. A maquina de estados vive DUAS vezes de
-- proposito — aqui e em web/src/lib/chamados/maquina.ts — e quem manda e
-- `ia.registrar_evento_chamado`. As duas precisam concordar transicao por
-- transicao.
--
-- Um `evento_id` repetido devolve o chamado como esta, sem gravar nada: e o que
-- torna inofensivo o reenvio de um POST que o aparelho achou que perdeu.

-- ---------------------------------------------------------------------------
-- Numeracao e apoio
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- A transicao, num lugar so
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Aprovacao, encerramento e adiamento
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- O gatilho do agendamento: o chamado nasce e se sincroniza venha a escrita de
-- onde vier (painel, lote, SQL na mao).
-- ---------------------------------------------------------------------------

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

-- Sem isto o `revoke ... from public` acima derruba o painel: medido em
-- 10/09/2026, nenhuma funcao de `ia` tinha grant explicito para `service_role`
-- (a ACL era so `=X/postgres`), e `service_role` NAO e superusuario — ela
-- ignora RLS, nao a checagem de EXECUTE. O spec pede as duas coisas na mesma
-- frase: "revoke execute de anon, authenticated e public" e "o painel as chama
-- por db.rpc(...) com a chave secreta". As duas so coexistem com este grant.
grant execute on function ia.proximo_numero_chamado(date)                      to service_role;
grant execute on function ia.admins_ativos()                                   to service_role;
grant execute on function ia.lider_do_chamado(bigint)                          to service_role;
grant execute on function ia.nome_do_autor(uuid)                               to service_role;
grant execute on function ia.notificar(uuid[], text, text, text, text, bigint) to service_role;
grant execute on function ia.registrar_evento_chamado(bigint, uuid, text, uuid, text, jsonb, timestamptz) to service_role;
grant execute on function ia.aprovar_chamado(bigint, uuid, numeric, numeric, text)         to service_role;
grant execute on function ia.encerrar_chamado_admin(bigint, uuid, date, numeric, text)     to service_role;
grant execute on function ia.decidir_adiamento(bigint, uuid, boolean, date, text)          to service_role;
