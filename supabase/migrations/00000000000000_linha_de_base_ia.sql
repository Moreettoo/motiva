-- LINHA DE BASE, JA APLICADA. Nao rode este arquivo.
-- Retrato do schema `ia` em 2026-09-10, gerado a partir do banco, para o repositorio
-- voltar a ser a fonte do DDL. As 10 migracoes anteriores viviam so no historico do Supabase.
--
-- Historico do Supabase em 2026-09-10 (versao, nome):
--   20260809040758 painel_solo_estrutura_operacional
--   20260809043506 seed_tmp_helpers
--   20260809043658 seed_tmp_clima
--   20260809044753 drop_seed_tmp_scratch
--   20260809051323 backlog_operacional_e_desempate_da_view
--   20260814190222 concessionarias_oficiais_motiva
--   20260814195240 fechar_agendamentos_de_trecho_sem_necessidade
--   20260814202824 um_agendamento_aberto_por_trecho
--   20260814211053 agendamento_manual_origem_e_invariante
--   20260814212817 vw_trecho_status_expoe_origem_do_agendamento
--
-- Uma linha por objeto, na ordem em que a consulta do plano os devolveu:
-- tabelas, constraints (com a tabela e o nome no comentario), indices, views.

-- Tabelas
create table ia.trechos (id bigint not null default nextval('ia.trechos_id_seq'::regclass), rodovia text not null, km_inicio numeric not null, km_fim numeric not null, sentido text, uf text not null, latitude numeric not null, longitude numeric not null, especie text not null, altura_limite_cm numeric not null default 40, tipo_pista text, observacoes text, ref_externa text, criado_em timestamp with time zone default now(), concessionaria_id bigint);
create table ia.medicoes (id bigint not null default nextval('ia.medicoes_id_seq'::regclass), trecho_id bigint, data date not null default CURRENT_DATE, altura_cm numeric not null, criado_em timestamp with time zone default now());
create table ia.previsoes (id bigint not null default nextval('ia.previsoes_id_seq'::regclass), trecho_id bigint, data_previsao date not null default CURRENT_DATE, crescimento_cm_dia numeric not null, altura_atual_cm numeric not null, altura_prevista_cm numeric not null, dias_ate_limite integer, temperatura_media_c numeric, chuva_total_mm numeric, criado_em timestamp with time zone default now());
create table ia.agendamentos (id bigint not null default nextval('ia.agendamentos_id_seq'::regclass), trecho_id bigint, previsao_id bigint, data_sugerida date not null, prioridade text not null, justificativa text not null, fatores jsonb, status text not null default 'sugerido'::text, modelo_usado text, criado_em timestamp with time zone default now(), equipe_id bigint, atualizado_em timestamp with time zone default now(), origem text not null default 'ia'::text);
create table ia.zonas_clima (id bigint not null default nextval('ia.zonas_clima_id_seq'::regclass), rodovia text not null, km_inicio numeric not null, km_fim numeric not null, latitude numeric not null, longitude numeric not null, nome text, altitude_m numeric, observacao text, criado_em timestamp with time zone default now(), extensao_km numeric default (km_fim - km_inicio));
create table ia.equipes (id bigint not null default nextval('ia.equipes_id_seq'::regclass), nome text not null, base_uf text not null, base_cidade text, capacidade_km_dia numeric not null default 6, ativo boolean not null default true, criado_em timestamp with time zone default now());
create table ia.execucoes (id bigint not null default nextval('ia.execucoes_id_seq'::regclass), agendamento_id bigint, trecho_id bigint not null, equipe_id bigint, data_execucao date not null, km_rocados numeric not null, altura_antes_cm numeric, altura_depois_cm numeric, custo_reais numeric, observacao text, criado_em timestamp with time zone default now());
create table ia.concessionarias (id bigint not null, nome text not null, extensao_km_oficial numeric, criado_em timestamp with time zone not null default now());

-- Constraints
FOREIGN KEY (equipe_id) REFERENCES ia.equipes(id) ON DELETE SET NULL -- ia.agendamentos.agendamentos_equipe_id_fkey
CHECK ((especie = ANY (ARRAY['batatais'::text, 'braquiaria'::text, 'esmeralda'::text]))) -- ia.trechos.trechos_especie_check
PRIMARY KEY (id) -- ia.trechos.trechos_pkey
PRIMARY KEY (id) -- ia.medicoes.medicoes_pkey
FOREIGN KEY (trecho_id) REFERENCES ia.trechos(id) ON DELETE CASCADE -- ia.medicoes.medicoes_trecho_id_fkey
PRIMARY KEY (id) -- ia.previsoes.previsoes_pkey
FOREIGN KEY (trecho_id) REFERENCES ia.trechos(id) ON DELETE CASCADE -- ia.previsoes.previsoes_trecho_id_fkey
CHECK ((prioridade = ANY (ARRAY['baixa'::text, 'media'::text, 'alta'::text, 'critica'::text]))) -- ia.agendamentos.agendamentos_prioridade_check
CHECK ((status = ANY (ARRAY['sugerido'::text, 'aprovado'::text, 'executado'::text, 'descartado'::text]))) -- ia.agendamentos.agendamentos_status_check
PRIMARY KEY (id) -- ia.agendamentos.agendamentos_pkey
FOREIGN KEY (trecho_id) REFERENCES ia.trechos(id) ON DELETE CASCADE -- ia.agendamentos.agendamentos_trecho_id_fkey
FOREIGN KEY (previsao_id) REFERENCES ia.previsoes(id) ON DELETE SET NULL -- ia.agendamentos.agendamentos_previsao_id_fkey
CHECK ((km_fim > km_inicio)) -- ia.zonas_clima.zonas_km_coerente
PRIMARY KEY (id) -- ia.zonas_clima.zonas_clima_pkey
EXCLUDE USING gist (rodovia WITH =, numrange(km_inicio, km_fim) WITH &&) -- ia.zonas_clima.zonas_sem_sobreposicao
PRIMARY KEY (id) -- ia.equipes.equipes_pkey
PRIMARY KEY (id) -- ia.execucoes.execucoes_pkey
FOREIGN KEY (agendamento_id) REFERENCES ia.agendamentos(id) ON DELETE SET NULL -- ia.execucoes.execucoes_agendamento_id_fkey
FOREIGN KEY (trecho_id) REFERENCES ia.trechos(id) ON DELETE CASCADE -- ia.execucoes.execucoes_trecho_id_fkey
FOREIGN KEY (equipe_id) REFERENCES ia.equipes(id) ON DELETE SET NULL -- ia.execucoes.execucoes_equipe_id_fkey
PRIMARY KEY (id) -- ia.concessionarias.concessionarias_pkey
UNIQUE (nome) -- ia.concessionarias.concessionarias_nome_key
FOREIGN KEY (concessionaria_id) REFERENCES ia.concessionarias(id) -- ia.trechos.trechos_concessionaria_id_fkey
CHECK ((uf = ANY (ARRAY['MG'::text, 'MS'::text, 'PR'::text, 'RJ'::text, 'RS'::text, 'SC'::text, 'SP'::text]))) -- ia.trechos.trechos_uf_check
CHECK ((base_uf = ANY (ARRAY['MG'::text, 'MS'::text, 'PR'::text, 'RJ'::text, 'RS'::text, 'SC'::text, 'SP'::text]))) -- ia.equipes.equipes_base_uf_check
CHECK ((origem = ANY (ARRAY['ia'::text, 'manual'::text]))) -- ia.agendamentos.agendamentos_origem_check

-- Indices
CREATE UNIQUE INDEX execucoes_pkey ON ia.execucoes USING btree (id);
CREATE INDEX idx_ia_execucoes_trecho ON ia.execucoes USING btree (trecho_id, data_execucao DESC);
CREATE UNIQUE INDEX concessionarias_pkey ON ia.concessionarias USING btree (id);
CREATE UNIQUE INDEX concessionarias_nome_key ON ia.concessionarias USING btree (nome);
CREATE UNIQUE INDEX equipes_pkey ON ia.equipes USING btree (id);
CREATE UNIQUE INDEX medicoes_pkey ON ia.medicoes USING btree (id);
CREATE INDEX idx_ia_medicoes ON ia.medicoes USING btree (trecho_id, data DESC);
CREATE UNIQUE INDEX previsoes_pkey ON ia.previsoes USING btree (id);
CREATE INDEX idx_ia_previsoes ON ia.previsoes USING btree (trecho_id, data_previsao DESC);
CREATE UNIQUE INDEX trechos_pkey ON ia.trechos USING btree (id);
CREATE INDEX idx_ia_trechos_rodovia ON ia.trechos USING btree (rodovia, km_inicio);
CREATE UNIQUE INDEX agendamentos_pkey ON ia.agendamentos USING btree (id);
CREATE INDEX idx_ia_agend ON ia.agendamentos USING btree (prioridade, data_sugerida);
CREATE INDEX idx_ia_agend_status ON ia.agendamentos USING btree (status, data_sugerida);
CREATE UNIQUE INDEX ux_agendamento_aberto_por_trecho ON ia.agendamentos USING btree (trecho_id) WHERE (status = ANY (ARRAY['sugerido'::text, 'aprovado'::text]));
CREATE UNIQUE INDEX zonas_clima_pkey ON ia.zonas_clima USING btree (id);
CREATE INDEX zonas_sem_sobreposicao ON ia.zonas_clima USING gist (rodovia, numrange(km_inicio, km_fim));
CREATE INDEX idx_zonas_rodovia ON ia.zonas_clima USING btree (rodovia, km_inicio);

-- Views
create or replace view ia.vw_trecho_status as  WITH ultima_previsao AS (
         SELECT DISTINCT ON (previsoes.trecho_id) previsoes.id,
            previsoes.trecho_id,
            previsoes.data_previsao,
            previsoes.crescimento_cm_dia,
            previsoes.altura_atual_cm,
            previsoes.altura_prevista_cm,
            previsoes.dias_ate_limite,
            previsoes.temperatura_media_c,
            previsoes.chuva_total_mm,
            previsoes.criado_em
           FROM ia.previsoes
          ORDER BY previsoes.trecho_id, previsoes.data_previsao DESC, previsoes.criado_em DESC, previsoes.id DESC
        ), ultima_medicao AS (
         SELECT DISTINCT ON (medicoes.trecho_id) medicoes.trecho_id,
            medicoes.data AS medido_em,
            medicoes.altura_cm AS altura_medida_cm
           FROM ia.medicoes
          ORDER BY medicoes.trecho_id, medicoes.data DESC, medicoes.id DESC
        ), ultimo_agendamento AS (
         SELECT DISTINCT ON (agendamentos.trecho_id) agendamentos.id,
            agendamentos.trecho_id,
            agendamentos.previsao_id,
            agendamentos.data_sugerida,
            agendamentos.prioridade,
            agendamentos.justificativa,
            agendamentos.fatores,
            agendamentos.status,
            agendamentos.origem,
            agendamentos.modelo_usado,
            agendamentos.criado_em,
            agendamentos.equipe_id,
            agendamentos.atualizado_em
           FROM ia.agendamentos
          WHERE (agendamentos.status = ANY (ARRAY['sugerido'::text, 'aprovado'::text]))
          ORDER BY agendamentos.trecho_id, agendamentos.criado_em DESC, agendamentos.id DESC
        ), ultima_execucao AS (
         SELECT DISTINCT ON (execucoes.trecho_id) execucoes.trecho_id,
            execucoes.data_execucao AS rocado_em
           FROM ia.execucoes
          ORDER BY execucoes.trecho_id, execucoes.data_execucao DESC, execucoes.id DESC
        )
 SELECT t.id,
    t.rodovia,
    t.km_inicio,
    t.km_fim,
    (t.km_fim - t.km_inicio) AS extensao_km,
    t.sentido,
    t.uf,
    t.latitude,
    t.longitude,
    t.especie,
    t.altura_limite_cm,
    t.tipo_pista,
    t.observacoes,
    p.altura_atual_cm,
    p.crescimento_cm_dia,
    p.dias_ate_limite,
    p.temperatura_media_c,
    p.chuva_total_mm,
    p.criado_em AS previsto_em,
    m.medido_em,
    m.altura_medida_cm,
    e.rocado_em,
    a.id AS agendamento_id,
    a.data_sugerida,
    a.prioridade,
    a.justificativa,
    a.fatores,
    a.status AS agendamento_status,
    a.equipe_id,
    q.nome AS equipe_nome,
        CASE
            WHEN (t.altura_limite_cm > (0)::numeric) THEN round((((100)::numeric * COALESCE(p.altura_atual_cm, m.altura_medida_cm, (0)::numeric)) / t.altura_limite_cm), 1)
            ELSE NULL::numeric
        END AS ocupacao_pct,
        CASE
            WHEN (p.dias_ate_limite IS NULL) THEN 'baixa'::text
            WHEN (p.dias_ate_limite <= 7) THEN 'critica'::text
            WHEN (p.dias_ate_limite <= 20) THEN 'alta'::text
            WHEN (p.dias_ate_limite <= 45) THEN 'media'::text
            ELSE 'baixa'::text
        END AS risco,
    a.origem AS agendamento_origem
   FROM (((((ia.trechos t
     LEFT JOIN ultima_previsao p ON ((p.trecho_id = t.id)))
     LEFT JOIN ultima_medicao m ON ((m.trecho_id = t.id)))
     LEFT JOIN ultimo_agendamento a ON ((a.trecho_id = t.id)))
     LEFT JOIN ultima_execucao e ON ((e.trecho_id = t.id)))
     LEFT JOIN ia.equipes q ON ((q.id = a.equipe_id)));
create or replace view ia.trechos_por_zona as  SELECT t.id AS trecho_id,
    t.rodovia,
    ((t.km_inicio || ' a '::text) || t.km_fim) AS trecho_faixa,
    z.id AS zona_id,
    z.nome AS zona_nome,
    ((z.km_inicio || ' a '::text) || z.km_fim) AS zona_faixa,
    z.latitude AS zona_latitude,
    z.longitude AS zona_longitude
   FROM (ia.trechos t
     LEFT JOIN ia.zonas_clima z ON (((z.rodovia = t.rodovia) AND (((t.km_inicio + t.km_fim) / (2)::numeric) >= z.km_inicio) AND (((t.km_inicio + t.km_fim) / (2)::numeric) < z.km_fim))))
  ORDER BY t.rodovia, t.km_inicio;
