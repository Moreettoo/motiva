begin;

-- Dados reais do Rodoanel: estrutura. Ver docs/superpowers/specs/2026-09-13-dados-reais-rodoanel-design.md §6.

-- trechos: origem do cadastro, visibilidade, o que a fila de OS precisa, e solo por trecho
alter table ia.trechos
  add column ativo boolean not null default true,
  add column fonte_cadastro text not null default 'demonstracao'
    check (fonte_cadastro in ('demonstracao','levantamento_motiva')),
  add column km_marco_m integer check (km_marco_m >= 0),
  add column metodo_rocada text,
  add column area_rocada_m2 numeric check (area_rocada_m2 >= 0),
  add column fertilidade_solo numeric check (fertilidade_solo between 0 and 1),
  add column capacidade_agua_solo_mm numeric check (capacidade_agua_solo_mm between 0 and 300),
  add column solo_fonte text check (solo_fonte in ('soilgrids','premissa'));
alter table ia.trechos add constraint ux_trechos_rodovia_marco unique (rodovia, km_marco_m);
comment on column ia.trechos.ativo is 'false = oculto do painel e do lote. Nunca se apaga trecho.';
comment on column ia.trechos.km_marco_m is 'Marco da planilha unifilar (0, 500, ..., 29300) que este trecho representa. Null nos trechos de demonstracao.';

alter table ia.concessionarias add column mobilizacao_dias integer not null default 7
  check (mobilizacao_dias between 0 and 60);

-- faixas transversais do formulario RA-ROC-LIMP
create table ia.faixas (
  codigo         text primary key,
  nome           text not null unique,        -- exatamente como na planilha
  linha_planilha integer not null unique,
  lado           text not null check (lado in ('externa','interna')),
  em_escopo      boolean not null,
  ordem          integer not null unique
);
insert into ia.faixas (codigo, nome, linha_planilha, lado, em_escopo, ordem) values
  ('cant_dispositivo_ext',  'CANT. DISPOSITIVO EXT.',  10, 'externa', false, 1),
  ('cant_marginal_externa', 'CANT. MARGINAL EXTERNA',  11, 'externa', false, 2),
  ('marginal_externa',      'MARGINAL EXTERNA',        12, 'externa', false, 3),
  ('cant_lateral_externa',  'CANT. LATERAL EXTERNA',   14, 'externa', true,  4),
  ('pista_externa',         'PISTA EXTERNA',           15, 'externa', false, 5),
  ('cant_central_externa',  'CANT. CENTRAL EXTERNA',   17, 'externa', true,  6),
  ('cant_central_interna',  'CANT. CENTRAL INTERNA',   18, 'interna', true,  7),
  ('pista_interna',         'PISTA INTERNA',           19, 'interna', false, 8),
  ('cant_lateral_interna',  'CANT. LATERAL INTERNA',   21, 'interna', true,  9),
  ('marginal_interna',      'MARGINAL INTERNA',        22, 'interna', false, 10),
  ('cant_marginal_interna', 'CANT. MARGINAL INTERNA',  24, 'interna', false, 11),
  ('cant_dispositivo_int',  'CANT. DISPOSITIVO INT.',  25, 'interna', false, 12);

-- a verdade bruta: uma classe por trecho x faixa x data
create table ia.levantamentos (
  id                 bigserial primary key,
  trecho_id          bigint not null references ia.trechos(id) on delete cascade,
  faixa_codigo       text not null references ia.faixas(codigo),
  data               date not null,
  classe             smallint check (classe between 1 and 3),   -- null = N/A ('X' ou vazio)
  altura_estimada_cm numeric,                                    -- ponto medio 5/20/40; null se classe null
  arquivo_origem     text not null,
  data_no_arquivo    date,                                       -- a BF6, para registrar a divergencia
  importado_em       timestamptz not null default now(),
  unique (trecho_id, faixa_codigo, data)
);
create index idx_levantamentos_trecho_data on ia.levantamentos (trecho_id, data desc);

-- medicoes ganham origem; a derivada do levantamento carrega a classe e a faixa que mandou
alter table ia.medicoes
  add column origem text not null default 'manual'
    check (origem in ('manual','campo_app','levantamento_classe','demonstracao')),
  add column classe smallint check (classe between 1 and 3),
  add column faixa_codigo text references ia.faixas(codigo);
update ia.medicoes set origem = 'demonstracao';   -- tudo que existe hoje e da malha ficticia

alter table ia.execucoes
  add column origem text not null default 'chamado'
    check (origem in ('chamado','encerramento_admin','inferida_levantamento','demonstracao'));
update ia.execucoes set origem = 'encerramento_admin' where observacao like 'Encerrado administrativamente:%';

alter table ia.previsoes add column fator_calibracao numeric not null default 1 check (fator_calibracao > 0);

-- o confronto modelo x campo
create table ia.validacoes (
  id                         bigserial primary key,
  executada_em               timestamptz not null default now(),
  rodovia                    text not null,
  janela_de                  date not null,
  janela_ate                 date not null,
  especie                    text not null,
  ponto_medio_classe3_cm     numeric not null,
  dias_desde_rocada_premissa numeric not null,
  fator_calibracao           numeric not null default 1 check (fator_calibracao > 0),
  n_pares_total              integer not null,
  n_pares_usados             integer not null,
  n_rocados_excluidos        integer not null,
  acuracia_classe            numeric,
  mae_ordinal                numeric,
  transicoes_total           integer,
  transicoes_detectadas      integer,
  estaveis_total             integer,
  alarmes_falsos             integer,
  cobertura_banda            numeric,
  matriz_confusao            jsonb not null,      -- {"1":{"1":n,"2":n,"3":n},"2":{...},"3":{...}} obs -> prev
  parametros                 jsonb not null default '{}'::jsonb,
  commit_git                 text,
  observacoes                text,
  vigente                    boolean not null default false
);
create unique index ux_validacao_vigente on ia.validacoes (rodovia) where vigente;

create table ia.validacao_pares (
  id                       bigserial primary key,
  validacao_id             bigint not null references ia.validacoes(id) on delete cascade,
  trecho_id                bigint not null references ia.trechos(id),
  faixa_codigo             text not null references ia.faixas(codigo),
  classe_inicial           smallint not null,
  classe_final_observada   smallint not null,
  classe_final_prevista    smallint,
  altura_inicial_cm        numeric,
  q10_cm numeric, q50_cm numeric, q90_cm numeric,
  incluido                 boolean not null,
  motivo_exclusao          text
);
create index idx_validacao_pares_validacao on ia.validacao_pares (validacao_id);

create table ia.calibracoes (
  id           bigserial primary key,
  validacao_id bigint references ia.validacoes(id),
  rodovia      text,                 -- null = qualquer
  especie      text,                 -- null = qualquer
  fator        numeric not null check (fator > 0),
  valido_de    date not null default current_date,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now()
);
create unique index ux_calibracao_ativa on ia.calibracoes (coalesce(rodovia,''), coalesce(especie,'')) where ativo;

create table ia.ndvi_observacoes (
  id             bigserial primary key,
  trecho_id      bigint not null references ia.trechos(id) on delete cascade,
  data_imagem    date not null,
  data_alvo      date,
  defasagem_dias integer,
  ndvi_medio     numeric, ndvi_mediana numeric, ndvi_p10 numeric, ndvi_p90 numeric,
  n_pixels       integer,
  nuvem_pct      numeric,
  colecao        text not null default 'COPERNICUS/S2_SR_HARMONIZED',
  mascara        text not null default 'poligonos_kml',
  criado_em      timestamptz not null default now(),
  unique (trecho_id, data_imagem, mascara)
);

create table ia.ndvi_analises (
  id                  bigserial primary key,
  executada_em        timestamptz not null default now(),
  data_alvo           date not null,
  data_imagem         date,
  defasagem_dias      integer,
  nuvem_pct_media     numeric,
  n_classe1           integer, n_classe3 integer,
  ndvi_mediana_c1     numeric, ndvi_mediana_c3 numeric,
  auc                 numeric, p_valor numeric,
  n_rocados           integer, n_nao_rocados integer,
  delta_rocados       numeric, delta_nao_rocados numeric, p_valor_delta numeric,
  parametros          jsonb not null default '{}'::jsonb,
  observacoes         text
);

alter table ia.faixas            enable row level security;
alter table ia.levantamentos     enable row level security;
alter table ia.validacoes        enable row level security;
alter table ia.validacao_pares   enable row level security;
alter table ia.calibracoes       enable row level security;
alter table ia.ndvi_observacoes  enable row level security;
alter table ia.ndvi_analises     enable row level security;
grant all on ia.faixas, ia.levantamentos, ia.validacoes, ia.validacao_pares,
             ia.calibracoes, ia.ndvi_observacoes, ia.ndvi_analises to service_role;
grant all on all sequences in schema ia to service_role;

commit;
