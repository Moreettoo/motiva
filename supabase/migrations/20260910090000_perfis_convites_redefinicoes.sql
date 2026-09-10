-- Fase 1 (acesso): perfis, lider de equipe, convites e redefinicoes de senha.
-- Ver docs/superpowers/specs/2026-09-09-acesso-e-chamados-design.md, "DDL da Fase 1".
-- Nenhuma destas tabelas tem politica RLS: so a chave secreta as alcanca.

create table ia.perfis (
  usuario_id        uuid primary key references auth.users(id) on delete cascade,
  nome              text not null check (length(nome) between 2 and 120),
  email             text not null unique check (email = lower(email)),
  cargo             text not null check (cargo in ('super_admin','admin','analista','rocador')),
  ativo             boolean not null default true,
  senha_provisoria  boolean not null default false,
  convidado_por     uuid references ia.perfis(usuario_id),
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  ultimo_acesso_em  timestamptz,
  desativado_em     timestamptz,
  desativado_por    uuid references ia.perfis(usuario_id)
);

alter table ia.equipes
  add column lider_id uuid unique references ia.perfis(usuario_id) on delete set null;

create table ia.convites (
  id           uuid primary key default gen_random_uuid(),
  email        text not null check (email = lower(email)),
  cargo        text not null check (cargo in ('super_admin','admin','analista','rocador')),
  equipe_id    bigint references ia.equipes(id) on delete set null,
  token_hash   text not null unique,
  expira_em    timestamptz not null,
  criado_por   uuid not null references ia.perfis(usuario_id),
  criado_em    timestamptz not null default now(),
  enviado_em   timestamptz,
  aceito_em    timestamptz,
  revogado_em  timestamptz,
  usuario_id   uuid references auth.users(id) on delete set null
);
create unique index ux_convite_pendente_por_email
  on ia.convites (email) where aceito_em is null and revogado_em is null;

create table ia.redefinicoes_senha (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  token_hash  text not null unique,
  expira_em   timestamptz not null,
  criado_em   timestamptz not null default now(),
  usada_em    timestamptz
);

comment on table ia.perfis is 'Uma linha por usuario do Auth. `cargo` e a verdade; app_metadata.cargo e copia para o proxy e para RLS futura.';
comment on column ia.equipes.lider_id is 'Exatamente um lider por equipe (unique). NULL = equipe sem lider; ninguem ve os chamados dela no app ate um Rocador ser convidado.';
create or replace function ia.carimbar_atualizado_em() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
-- Mesmo motivo do `alter function ia.gerar_zonas` na migracao seguinte: sem isto o
-- advisor `function_search_path_mutable` acusa esta funcao. `now()` e de pg_catalog,
-- que esta sempre no caminho, entao search_path vazio nao quebra o corpo.
alter function ia.carimbar_atualizado_em() set search_path = '';
create trigger tg_perfis_atualizado_em before update on ia.perfis
  for each row execute function ia.carimbar_atualizado_em();
