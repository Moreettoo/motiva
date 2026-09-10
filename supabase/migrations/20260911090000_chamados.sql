-- Fase 2 · Chamados — as tabelas.
--
-- Um chamado por agendamento aprovado com equipe. A EQUIPE NAO E COPIADA para
-- ca: ela mora em ia.agendamentos.equipe_id, e continua morando la. Duplicar
-- criaria duas verdades sobre quem vai rocar.
--
-- ia.chamado_eventos e append-only: nunca update, nunca delete. `evento_id` vem
-- de quem agiu (o aparelho, no campo), e a unicidade dele e o que faz o reenvio
-- de um POST perdido ser inofensivo.

create table ia.contadores (
  chave  text primary key,
  ultimo integer not null default 0
);

create table ia.chamados (
  id                     bigserial primary key,
  numero                 text not null unique,                 -- CH-2026-0001
  agendamento_id         bigint not null unique references ia.agendamentos(id) on delete restrict,
  trecho_id              bigint not null references ia.trechos(id) on delete cascade,
  status                 text not null default 'aberto' check (status in
                           ('aberto','em_andamento','aguardando_aprovacao','devolvido',
                            'adiamento_solicitado','concluido','cancelado')),
  status_anterior        text check (status_anterior in ('aberto','em_andamento','devolvido')),
  altura_inicial_cm      numeric check (altura_inicial_cm between 0 and 300),
  altura_inicial_origem  text not null default 'prevista' check (altura_inicial_origem in ('prevista','informada')),
  altura_final_cm        numeric check (altura_final_cm between 0 and 300),
  km_rocados             numeric check (km_rocados >= 0),
  custo_reais            numeric check (custo_reais >= 0),
  observacao_conclusao   text,
  sem_evidencia          boolean not null default false,
  iniciado_em            timestamptz,
  finalizado_em          timestamptz,
  concluido_em           timestamptz,
  cancelado_em           timestamptz,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);
create index idx_chamados_status on ia.chamados (status, atualizado_em desc);

create table ia.chamado_eventos (
  id             bigserial primary key,
  chamado_id     bigint not null references ia.chamados(id) on delete cascade,
  evento_id      uuid not null unique,                         -- gerado no aparelho: idempotencia
  tipo           text not null check (tipo in
                   ('criado','iniciado','finalizado','aprovado','devolvido',
                    'adiamento_solicitado','adiamento_aceito','adiamento_recusado',
                    'remarcado','equipe_alterada','altura_inicial_alterada',
                    'cancelado','encerrado_admin','fora_de_ordem','comentario')),
  autor_id       uuid references ia.perfis(usuario_id),
  autor_nome     text not null,                                -- copia: sobrevive a desativacao
  origem         text not null check (origem in ('painel','campo','lote','sistema')),
  payload        jsonb not null default '{}'::jsonb,
  ocorrido_em    timestamptz not null,                         -- relogio de quem agiu
  registrado_em  timestamptz not null default now()             -- relogio do servidor
);
create index idx_chamado_eventos_chamado on ia.chamado_eventos (chamado_id, registrado_em);

create table ia.chamado_fotos (
  id            bigserial primary key,
  chamado_id    bigint not null references ia.chamados(id) on delete cascade,
  evento_id     uuid not null,                                 -- o iniciar/finalizar a que pertence
  etapa         text not null check (etapa in ('inicio','fim')),
  papel         text not null check (papel in ('medida','extensao','resultado','extra')),
  caminho       text not null unique,                           -- chamados/<chamado>/<evento>/<uuid>.jpg
  largura_px    integer not null,
  altura_px     integer not null,
  bytes         integer not null,
  latitude      numeric,
  longitude     numeric,
  precisao_m    numeric,
  capturada_em  timestamptz not null,
  enviada_em    timestamptz not null default now(),
  autor_id      uuid references ia.perfis(usuario_id)
);
create index idx_chamado_fotos_chamado on ia.chamado_fotos (chamado_id, etapa);

create table ia.chamado_adiamentos (
  id              bigserial primary key,
  chamado_id      bigint not null references ia.chamados(id) on delete cascade,
  evento_id       uuid not null unique,
  motivo          text not null check (motivo in
                    ('chuva','equipamento','acesso_bloqueado','seguranca_trafego','falta_efetivo','outro')),
  detalhe         text,
  data_sugerida   date,
  solicitado_por  uuid references ia.perfis(usuario_id),
  solicitado_em   timestamptz not null default now(),
  decidido_por    uuid references ia.perfis(usuario_id),
  decidido_em     timestamptz,
  decisao         text check (decisao in ('aceito','recusado')),
  nova_data       date,
  resposta        text
);
create unique index ux_adiamento_pendente_por_chamado
  on ia.chamado_adiamentos (chamado_id) where decisao is null;

create table ia.notificacoes (
  id               bigserial primary key,
  destinatario_id  uuid not null references ia.perfis(usuario_id) on delete cascade,
  tipo             text not null,
  titulo           text not null,
  texto            text,
  href             text,
  chamado_id       bigint references ia.chamados(id) on delete cascade,
  lida_em          timestamptz,
  criado_em        timestamptz not null default now()
);
create index idx_notificacoes_destinatario on ia.notificacoes (destinatario_id, lida_em, criado_em desc);

create trigger tg_chamados_atualizado_em before update on ia.chamados
  for each row execute function ia.carimbar_atualizado_em();

-- Mesmo regime da migracao 20260910091000: RLS ligado, ZERO politicas. So a
-- chave secreta (que ignora RLS) alcanca estas tabelas; painel, lote e API do
-- campo usam essa chave no servidor. Sem isto as tabelas novas nasceriam fora
-- do regime que a Onda 0 estabeleceu e o advisor acusaria `rls_disabled`.
alter table ia.contadores          enable row level security;
alter table ia.chamados            enable row level security;
alter table ia.chamado_eventos     enable row level security;
alter table ia.chamado_fotos       enable row level security;
alter table ia.chamado_adiamentos  enable row level security;
alter table ia.notificacoes        enable row level security;

-- Bucket privado: foto de campo tem placa, rosto e coordenada. So sai por URL
-- assinada de 60 s gerada no servidor (`/api/fotos/[id]`).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chamados', 'chamados', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

comment on table ia.chamados is 'Ordem de servico de rocada: 1 por agendamento aprovado com equipe. Nasce pelo gatilho ia.tg_agendamentos_chamado.';
comment on table ia.chamado_eventos is 'Historico imutavel. evento_id vem de quem agiu (idempotencia). ocorrido_em = relogio de quem agiu; registrado_em = servidor.';
