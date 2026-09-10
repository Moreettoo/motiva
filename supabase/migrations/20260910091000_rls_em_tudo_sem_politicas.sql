-- Fecha o buraco medido em 09/09: anon tinha SELECT/INSERT/UPDATE/DELETE em quatro tabelas de `ia`.
-- Nenhuma politica: so a chave secreta (que ignora RLS) chega as tabelas. Painel, lote e API do
-- campo usam a chave secreta no servidor; nada quebra neles.
do $$
declare t record;
begin
  for t in select schemaname, tablename from pg_tables where schemaname in ('ia','public') loop
    execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
  end loop;
end $$;

revoke all on all tables in schema ia from anon, authenticated;
revoke all on all sequences in schema ia from anon, authenticated;
revoke all on all functions in schema ia from anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema ia revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- As views eram SECURITY DEFINER (advisor ERROR): leitura pela view ignorava o RLS das tabelas.
alter view ia.vw_trecho_status set (security_invoker = on);
alter view ia.trechos_por_zona set (security_invoker = on);

-- advisor WARN: search_path mutavel.
alter function ia.gerar_zonas set search_path = '';
