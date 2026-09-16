begin;

-- Estado da vegetacao no INICIO do servico: a equipe mede e digita, no mesmo
-- fluxo que ja faz a mesma coisa no fim (`altura_final_cm`, ver
-- fluxo-finalizar.tsx e o comentario de `aprovar_chamado` abaixo).
--
-- NAO SUBSTITUI `altura_inicial_cm`. Aquela coluna e o que o modelo (ou o
-- gestor, via `informarAlturaInicial`) disse ANTES de a equipe chegar --
-- `altura_inicial_origem` conta qual dos dois. `altura_inicial_medida_cm` e o
-- que a equipe MEDIU na chegada, num campo proprio: as duas convivem para que
-- o gestor compare previsto x medido no mesmo chamado (e o ponto do pedido --
-- "nao pode substituir essa altura, ela deve ser comparada"). Sobrescrever
-- `altura_inicial_cm` apagaria essa comparacao no proprio chamado que a gerou.
--
-- E dado de treino, nao so de tela: `ia.medicoes` e o historico de altura REAL
-- de cada trecho (ver `aprovar_chamado`, que grava `altura_final_cm` la na
-- aprovacao), e uma medicao no inicio do servico e tao real quanto uma no fim
-- -- fica de fora do historico, faltaria ao modelo justamente a leitura mais
-- recente antes da rocada.
alter table ia.chamados
  add column altura_inicial_medida_cm numeric check (altura_inicial_medida_cm between 0 and 300);

comment on column ia.chamados.altura_inicial_medida_cm is
  'Altura que a equipe MEDIU ao iniciar o servico (evento "iniciado"). Nao mexe em altura_inicial_cm/altura_inicial_origem -- e para comparar com o que foi previsto/informado antes, nao para substituir.';

-- Repete `ia.registrar_evento_chamado` (20260911091000) com duas mudancas, as
-- duas so no ramo `iniciado`:
--   1. Exige `altura_inicial_medida_cm` no payload (0 a 300), mesma regra de
--      `finalizado`/`altura_final_cm` logo abaixo.
--   2. Grava a coluna nova e insere em `ia.medicoes`, para a IA usar depois.
-- O resto da funcao e identico; nao pule esta funcao pensando que e so a
-- coluna que muda -- a maquina de estados e as exigencias por tipo vivem aqui.
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
  if p_tipo = 'iniciado' then
    if (p_payload->>'altura_inicial_medida_cm') is null or (p_payload->>'altura_inicial_medida_cm')::numeric not between 0 and 300 then
      raise exception 'altura_inicial_medida_cm obrigatoria (0 a 300)' using errcode = 'P0004';
    end if;
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
    altura_inicial_medida_cm = case when p_tipo = 'iniciado' then (p_payload->>'altura_inicial_medida_cm')::numeric else altura_inicial_medida_cm end,
    altura_final_cm = case when p_tipo = 'finalizado' then (p_payload->>'altura_final_cm')::numeric else altura_final_cm end,
    altura_inicial_cm = case when p_tipo = 'altura_inicial_alterada' then (p_payload->>'altura_inicial_cm')::numeric else altura_inicial_cm end,
    altura_inicial_origem = case when p_tipo = 'altura_inicial_alterada' then 'informada' else altura_inicial_origem end,
    cancelado_em    = case when p_tipo = 'cancelado' then now() else cancelado_em end
  where id = p_chamado_id returning * into c;

  insert into ia.chamado_eventos (chamado_id, evento_id, tipo, autor_id, autor_nome, origem, payload, ocorrido_em)
  values (p_chamado_id, p_evento_id, p_tipo, p_autor, ia.nome_do_autor(p_autor), p_origem, coalesce(p_payload, '{}'::jsonb), p_ocorrido_em);

  -- Medicao real no inicio do servico: mesma logica de `aprovar_chamado` para
  -- `altura_final_cm`, so que aqui dentro da propria transacao do evento (nao
  -- ha uma "aprovacao" separada para o inicio).
  if p_tipo = 'iniciado' then
    insert into ia.medicoes (trecho_id, data, altura_cm)
    values (c.trecho_id, (p_ocorrido_em at time zone 'America/Sao_Paulo')::date, (p_payload->>'altura_inicial_medida_cm')::numeric);
  end if;

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

commit;
