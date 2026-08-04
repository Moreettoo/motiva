-- ============================================================
-- PASSO 2 (ALTERNATIVO) - Instala num schema separado: "ia"
--
-- Use este arquivo no lugar do schema.sql se voce JA TEM um banco
-- montado e nao quer mexer nele.
--
-- Nada do que ja existe em "public" e tocado.
-- As tabelas novas ficam em ia.trechos, ia.previsoes, etc.
--
-- Cole tudo no SQL Editor do Supabase e clique em RUN.
-- ============================================================

create schema if not exists ia;

-- ------------------------------------------------------------
-- Tabelas
-- ------------------------------------------------------------
create table if not exists ia.trechos (
  id                bigserial primary key,
  rodovia           text    not null,
  km_inicio         numeric not null,
  km_fim            numeric not null,
  sentido           text,
  uf                text    not null check (uf in ('MG','MS','PR','RJ','SP')),
  latitude          numeric not null,
  longitude         numeric not null,
  especie           text    not null check (especie in ('batatais','braquiaria','esmeralda')),
  altura_limite_cm  numeric not null default 40,
  tipo_pista        text,
  observacoes       text,          -- texto livre: e o que a LLM le
  ref_externa       text,          -- <<< guarde aqui o id da SUA tabela em public
  criado_em         timestamptz default now()
);

create table if not exists ia.medicoes (
  id          bigserial primary key,
  trecho_id   bigint references ia.trechos(id) on delete cascade,
  data        date    not null default current_date,
  altura_cm   numeric not null,
  criado_em   timestamptz default now()
);

create table if not exists ia.previsoes (
  id                   bigserial primary key,
  trecho_id            bigint references ia.trechos(id) on delete cascade,
  data_previsao        date    not null default current_date,
  crescimento_cm_dia   numeric not null,
  altura_atual_cm      numeric not null,
  altura_prevista_cm   numeric not null,
  dias_ate_limite      integer,
  temperatura_media_c  numeric,
  chuva_total_mm       numeric,
  criado_em            timestamptz default now()
);

create table if not exists ia.agendamentos (
  id             bigserial primary key,
  trecho_id      bigint references ia.trechos(id) on delete cascade,
  previsao_id    bigint references ia.previsoes(id) on delete set null,
  data_sugerida  date not null,
  prioridade     text not null check (prioridade in ('baixa','media','alta','critica')),
  justificativa  text not null,
  fatores        jsonb,
  status         text not null default 'sugerido'
                 check (status in ('sugerido','aprovado','executado','descartado')),
  modelo_usado   text,
  criado_em      timestamptz default now()
);

create index if not exists idx_ia_medicoes  on ia.medicoes(trecho_id, data desc);
create index if not exists idx_ia_previsoes on ia.previsoes(trecho_id, data_previsao desc);
create index if not exists idx_ia_agend     on ia.agendamentos(prioridade, data_sugerida);


grant usage on schema ia to anon, authenticated, service_role;

-- o servico Python escreve (usa service_role)
grant all on all tables    in schema ia to service_role;
grant all on all sequences in schema ia to service_role;

-- o front-end so le (usa anon)
grant select on all tables in schema ia to anon, authenticated;

-- vale tambem para tabelas criadas no futuro
alter default privileges in schema ia
  grant all on tables to service_role;
alter default privileges in schema ia
  grant all on sequences to service_role;
alter default privileges in schema ia
  grant select on tables to anon, authenticated;

-- ------------------------------------------------------------
-- Dados de exemplo
-- ------------------------------------------------------------
insert into ia.trechos (rodovia, km_inicio, km_fim, sentido, uf, latitude, longitude,
                        especie, altura_limite_cm, tipo_pista, observacoes) values
  ('SP-280 Castello Branco', 145.0, 148.0, 'Interior', 'SP', -23.4180, -47.4820,
   'braquiaria', 35, 'curva',
   'Curva acentuada com visibilidade reduzida. Duas reclamacoes de motoristas em julho sobre vegetacao invadindo o acostamento.'),
  ('SP-280 Castello Branco', 152.0, 155.0, 'Interior', 'SP', -23.4510, -47.5600,
   'braquiaria', 40, 'reta',
   'Trecho reto sem historico de ocorrencia.'),
  ('SP-330 Anhanguera', 88.0, 91.0, 'Capital', 'SP', -22.7420, -47.3300,
   'batatais', 40, 'reta',
   'Area de servidao ampla. Ultima roçada com equipe reduzida.'),
  ('BR-116 Regis Bittencourt', 310.0, 313.0, 'Sul', 'PR', -25.5100, -49.2000,
   'esmeralda', 30, 'curva',
   'Trecho de serra, neblina frequente. Roçada exige janela seca.'),
  ('MG-050', 62.0, 65.0, 'Oeste', 'MG', -20.7500, -45.5900,
   'braquiaria', 40, 'acesso',
   'Acesso a posto de pesagem. Periodo de seca, risco de incendio em vegetacao alta.')
on conflict do nothing;

insert into ia.medicoes (trecho_id, data, altura_cm)
select v.id, current_date - 10, v.alt
from (values (1, 24.0), (2, 12.0), (3, 18.0), (4, 21.0), (5, 29.0)) as v(id, alt)
where exists (select 1 from ia.trechos t where t.id = v.id)
on conflict do nothing;

