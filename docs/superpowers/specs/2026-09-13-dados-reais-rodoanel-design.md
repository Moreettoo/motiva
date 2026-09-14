# Dados reais do Rodoanel — design

Data: 2026-09-13 · Apresentação: 16/09/2026 · Escopo: `ml/` (o pipeline Python, hoje na raiz),
`pesquisa/` (novo), `supabase/migrations/`, `web/`, `.github/workflows/main.yml`, `docs/`.

Este documento registra o que foi decidido na sessão de 13/09 e o que os arquivos da Motiva
responderam quando lidos por código. O plano de implementação
(`docs/superpowers/plans/2026-09-13-dados-reais-rodoanel.md`) argumenta a partir daqui. Quem
executa lê os dois, e lê também `docs/PLANO_MOTIVA.md` §4, que cataloga as armadilhas dos
arquivos e não é repetido aqui.

---

## 0. Em uma frase

O dataset sintético deixa de ser "a base de dados" e vira o **prior**: as 248 observações reais
do Rodoanel calibram o modelo e julgam o resultado, o produto passa a operar sobre a malha real
do SP-021, e todo número na tela carrega a origem. A acurácia deixa de ser alegação e vira número
medido, com um mecanismo permanente de reconferência a cada levantamento semanal da Motiva.

---

## 1. O que existe hoje, medido em 13/09/2026

- **Modelo.** `modelo_gramas.pkl`: três `HistGradientBoostingRegressor` (q10/q50/q90) treinados
  em ~1,8 milhão de janelas **simuladas** pelo `gerador_v3_1_rebrota.py` com clima real
  Open-Meteo. Alvo: `crescimento_total_cm` do período. 20 features. Aviso gravado no próprio
  `.pkl`: "Não validado contra medições de campo". Único registro de campo
  (`validacao_campo.json`): uma touceira de pasto em Juiz de Fora, que o código já classifica
  como **não comparável**.
- **Produto.** Painel Next.js 16 em `web/`, banco Supabase (schema `ia`), lote diário no GitHub
  Actions (`analisar_lote.py`), app de campo offline, chamados com foto. A malha em produção são
  **50 trechos fictícios** (BR-101, SP-280, MG-050…) semeados para demonstração. A "precisão"
  exibida é o R² do modelo em cidades sintéticas nunca vistas.
- **Feedback da Motiva** (íntegra em `docs/PLANO_MOTIVA.md` §1): fila de ordens de serviço;
  predição bem-vinda mas precisa da base de dados; base estruturada e ampla; variabilidade de
  solo e espécie; outras formas de captura.
- **Ambiente desta máquina (macOS).** Python 3.14.6 do sistema **não** instala `pydantic-core==2.27.2`
  (sem wheel para 3.14, exige Rust); o venv usa o **Python 3.12 do Homebrew**, o mesmo do GitHub Actions,
  que instala todas as versões fixadas prontas. `psql`/`pg_dump`
  18.4 (libpq). Docker Desktop instalado, **daemon parado**. Supabase CLI 2.114. Node 24.
  `vercel` CLI **ausente**. `web/node_modules` **ausente**. `web/.env.local` **ausente**. O MCP do
  Supabase desta sessão está autenticado numa organização que **não** contém o projeto
  `mbkcygsqfcxxcmvkuqyt`. A árvore de trabalho tem os arquivos Python **movidos para `docs/` sem
  commit**; o workflow espera `requirements.txt` e `analisar_lote.py` na raiz.

---

## 2. O que a Motiva entregou, verificado por código em 13/09

| Fato | Valor verificado |
|---|---|
| Planilhas RA-RET-ROÇ-LIMP, aba `ROÇADA`, datas dos nomes | 2026-03-13 e 2026-03-20 |
| Data interna "LEVANTAMENTO DE CAMPO" (célula BF6) | 2025-03-28 **nas duas** — logo não pode ser a data das duas caminhadas; é template desatualizado. Adotam-se as datas dos nomes |
| Marcos de km na linha 9, colunas F..BM | 60: 0, 500, …, 29.000, 29.300 |
| Faixas transversais (linhas 10–25) | 12, das quais 4 concentram 209 dos 248 pares |
| Pares válidos nas duas datas | **248** |
| Matriz de transição 13/03 → 20/03 | 1→1 130 · 1→2 30 · 1→3 3 · 2→1 27 · 2→2 22 · 3→1 22 · 3→2 4 · 3→3 10 |
| Leitura da matriz | cresceram **33** · roçados **53** · estáveis **162** |
| `Marco km_rodoanel 2.kmz` | zip com `doc.kml`, 30 placemarks só com coordenada |
| Ordem correta dos marcos | `[0..7] + [29] + [8, 9] + [28] + [10..27]`; eixo = **29.025 m**; na ordem original do arquivo daria 48 km com um salto de 16,7 km |
| Lacuna real no eixo | um passo de 2.042 m (entre os índices originais 22 e 23) |
| Escala eixo → km da planilha | 29.300 / 29.025 = **1,0095** |
| `classificacao_rocada.kmz` | XML puro (não é zip), **642** polígonos; `<name>` = método, `<description>` = km inteiro |
| Campos do `<Schema>` deslocados | `classe` = latitude · `KM` = longitude · `Latitude` = área m² |
| Área total | **981.817 m²** (98,2 ha): Spider/Giro-Zero/trincheira 66,4 ha (180) · Apenas manual 27,4 ha (342) · Trator com braço 4,1 ha (106) · Spider com ancoragem 0,2 ha (14) |
| Polígono ↔ marco | projetando o centróide no eixo reordenado, **642 de 642** caem no km da descrição (±1). Distância ao eixo: mediana 56 m, p90 204 m, máximo 930 m |
| Obrigação contratual aplicável | **Artesp, Anexo 06, p. 22, item b.1.1**: poda quando a vegetação atingir **30 cm** em qualquer local da faixa de domínio, **10 cm** no entorno de instalações operacionais. O PER da ANTT (item 6, 30 cm) é a mesma fronteira, mas não rege o Rodoanel |

Coordenadas de referência do eixo (km da planilha → lat, lon): 0 → (−23,416207, −46,736768);
15.000 → (−23,515647, −46,817408); 29.300 → (−23,632539, −46,831841).

---

## 3. Decisões da sessão de 13/09

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Entrega | Tudo: painel real + validação com erro medido + NDVI. Prazo de 3 dias, dedicação integral, **registros escritos** de cada fase |
| 2 | Malha fictícia | **Ocultar** (`trechos.ativo = false`) e limpar o seed. Nada apagado. O produto foca só no Rodoanel real |
| 3 | Sentinel-2 / GEE | **Prioridade hoje**, em trilha paralela à validação |
| 4 | Espécie | Braquiária predominante, declarada como premissa; sensibilidade às 3 espécies do modelo. A longo prazo a espécie não importa: mede-se o comportamento de crescimento de cada ponto pela série temporal |
| 5 | Banco de pesquisa | **SQLite** em `pesquisa/rodoanel.sqlite` + CSV/JSON versionados em `pesquisa/dados/derivados/`. Zero instalação. Supabase só para o produto |
| 6 | Limite de altura do Rodoanel | **30 cm** (Artesp b.1.1). Parâmetro por trecho como já é (`altura_limite_cm`) |
| 7 | Granularidade | **60 trechos** de 500 m, um por marco da planilha. `km_inicio = m/1000`, `km_fim = (m+500)/1000`; os dois últimos dividem os 300 m finais: 29,0–29,15 e 29,15–29,3 |
| 8 | Faixas em escopo | CANT. LATERAL EXTERNA, CANT. CENTRAL EXTERNA, CANT. CENTRAL INTERNA, CANT. LATERAL INTERNA. As outras 8 são gravadas mas não entram na medição derivada |
| 9 | Classe → altura | ponto médio 5 / 20 / **40** cm; sensibilidade 35 e 50 para a classe 3 |
| 10 | Dias desde a roçada | desconhecido → **200** (fase rápida, conservador, mesmo padrão do lote); sensibilidade 30 e 60 |
| 11 | Calibração | um **fator escalar** sobre o crescimento previsto (os três quantis), ajustado nos km pares e testado nos km ímpares; depois reajustado em todos e gravado como vigente só se melhorar o critério |
| 12 | Tempo de mobilização | `concessionarias.mobilizacao_dias`, padrão **7**. `dia_ideal = data_de_cruzar_30cm − mobilizacao_dias` |
| 13 | Medição vencida | mais de **120 dias** (o horizonte do modelo) sem leitura → **sem previsão**, lacuna explícita. Nunca número inventado |
| 14 | Layout do repositório | pipeline Python vai para **`ml/`**; workflow aponta para lá |
| 15 | Ordem obrigatória | a regra de medição vencida chega ao `main` **antes** de o Rodoanel entrar no banco, porque o lote das 06:00 roda em cima do banco alterado |
| 16 | Backup | `pg_dump` (libpq 18.4, sem Docker) do schema `ia` e `public`, esquema e dados, **antes** da primeira migração |

---

## 4. Princípios que valem em todo o trabalho

1. **Origem em todo número.** Medição tem `origem`; trecho tem `fonte_cadastro`; previsão tem
   `fator_calibracao`; solo tem `solo_fonte`. A tela diz de onde veio, sempre.
2. **Sem número inventado.** Medição com mais de 120 dias não vira previsão. Relatório é
   renderizado por código a partir de JSON produzido por código; ninguém digita resultado.
3. **Nada de produção é apagado.** Ocultar é `ativo = false`; fechar é `status = 'descartado'`.
4. **Produção só muda depois do backup** e só por migração versionada em `supabase/migrations/`.
5. **Duas cópias deliberadas continuam deliberadas.** Features em Python e em TypeScript,
   máquina de estados em SQL e em TypeScript: o fator de calibração entra **fora** das árvores,
   para os testes de paridade continuarem provando o que provam.
6. **Fase fechada é fase escrita.** Não se avança sem o relatório da anterior em `docs/pesquisa/`.
7. **RLS ligado, zero políticas** em toda tabela nova, como no resto do schema `ia`.
8. **Convenções do repositório:** código, identificadores, comentários e textos em português do
   Brasil; código Python sem acentos (como o existente); datas e números do painel por `Intl`
   via `src/lib/format.ts`; "hoje" por `isoHoje()`/`hoje_brasilia()`; nenhum hex fora de
   `globals.css`; toda Server Action começa por `permitir(...)`, toda página por `exigirCargo(...)`;
   `npm run verificar` verde ao fim de cada tarefa que toque em `web/`.

---

## 5. Arquitetura

### 5.1 Pastas

```
ml/                      pipeline Python de produção (era a raiz): analise.py, clima.py, solo.py,
                         modelo.py, analisar_lote.py, main.py, treinar_modelo.py, gerador_v3_1_rebrota.py,
                         exportar_modelo.py, gerar_fixture_features.py, validar_campo.py,
                         validacao_campo.json, requirements.txt, modelo_gramas.pkl,
                         previsao_gramas_colab.ipynb, comandos.txt
                         + calibracao.py (novo)
pesquisa/                o trabalho com os dados da Motiva
  requirements.txt
  dados/brutos/          cópia dos 2 xlsx e dos 2 kmz (PDFs ficam em docs/)
  dados/derivados/       CSV/JSON gerados e VERSIONADOS: são o registro
  rodoanel.sqlite        gerado, gitignored, regenerável por `python -m pesquisa.consolidar`
  rodoanel/              módulos: planilha, marcos, poligonos, segmentos, banco, clima_janela,
                         solo_km, validacao, relatorio, supabase_io
  ndvi/                  gee_check, geometrias, ndvi_datas, analisar_ndvi, ndvi_serie, analisar_serie
  tests/                 pytest
  consolidar.py · validar.py · publicar_rodoanel.py · importar_levantamento.py   (CLIs)
docs/pesquisa/           00-diario.md, 01-consolidacao.md, 02-validacao.md, 03-ndvi.md, 04-producao.md
docs/relatorio-motiva.md
docs/operacao/preparacao-dados-reais.md   (a lista manual)
supabase/migrations/20260913100000_rodoanel_base_real.sql
supabase/migrations/20260913101000_rodoanel_higiene_e_view.sql
web/src/lib/{calibracao.ts, validacao/queries.ts, levantamentos/queries.ts}
web/src/app/(painel)/validacao/…
web/src/app/(painel)/trechos/_componentes/levantamento-campo.tsx
```

### 5.2 Fluxo de dados

```
xlsx (2 datas) ─┐
KML marcos ─────┼─► pesquisa/consolidar ─► segmentos.csv, faixas.csv, observacoes.csv, pares.csv, SQLite
KML polígonos ──┘                                   │
Open-Meteo ERA5 (arquivo, +120 d) ─► clima_janela ──┤
SoilGrids (30 marcos) ─► solo_km ───────────────────┤
                                                    ▼
                               pesquisa/validar ─► validacao.json ─► 02-validacao.md
                                                    │
                     pesquisa/publicar_rodoanel ────┼─► Supabase: trechos, levantamentos, medicoes,
                     (usa importar_levantamento)    │             execucoes inferidas, validacoes, pares, calibracoes
                                                    │
GEE Sentinel-2 ─► pesquisa/ndvi ─► ndvi_datas.csv ──┴─► ndvi_observacoes, ndvi_analises ─► 03-ndvi.md

Supabase ─► lote diário (ml/analisar_lote.py: fator, solo por trecho, medição vencida) ─► previsoes/agendamentos
Supabase ─► painel: /malha, /trechos/[id] (cartão do levantamento), /validacao, /simulador (fator)
RA-RET semanal futuro ─► importar_levantamento ─► levantamentos + medicoes + execucoes inferidas ─► próximo par de validação
```

---

## 6. Banco de dados

### 6.1 Migração 1 — `20260913100000_rodoanel_base_real.sql` (estrutura)

```sql
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
```

### 6.2 Migração 2 — `20260913101000_rodoanel_higiene_e_view.sql` (dados e view)

Pré-condição manual: `npm run semear:demonstracao -- --limpar` já rodou.

```sql
-- 1. concessionaria e zona climatica do SP-021
insert into ia.concessionarias (id, nome, extensao_km_oficial)
select coalesce(max(id), 0) + 1, 'RodoAnel', 29.3 from ia.concessionarias
where not exists (select 1 from ia.concessionarias where nome = 'RodoAnel');

insert into ia.zonas_clima (rodovia, km_inicio, km_fim, latitude, longitude, nome)
select 'SP-021 Rodoanel Oeste', 0, 29.3, -23.515647, -46.817408, 'Rodoanel Oeste, eixo no km 15'
where not exists (select 1 from ia.zonas_clima where rodovia = 'SP-021 Rodoanel Oeste');

-- 2. equipes: as 10 turmas abstratas saem de cena; uma turma real do Rodoanel entra
update ia.equipes set ativo = false;
insert into ia.equipes (nome, base_uf, base_cidade, capacidade_km_dia, ativo)
select 'Equipe Roçada RodoAnel 01', 'SP', 'Barueri', 6, true
where not exists (select 1 from ia.equipes where nome = 'Equipe Roçada RodoAnel 01');

-- 3. a malha ficticia fica oculta e sem trabalho aberto. O gatilho cancela os chamados.
update ia.trechos set ativo = false where fonte_cadastro = 'demonstracao';
update ia.agendamentos a set status = 'descartado', atualizado_em = now()
where a.status in ('sugerido','aprovado')
  and a.trecho_id in (select id from ia.trechos where not ativo);

-- 4. a view so mostra trecho ativo e expoe o que o painel novo precisa (colunas novas SO no fim)
create or replace view ia.vw_trecho_status as
with ultima_previsao as (
  select distinct on (trecho_id) id, trecho_id, data_previsao, crescimento_cm_dia, altura_atual_cm, altura_prevista_cm,
         dias_ate_limite, temperatura_media_c, chuva_total_mm, criado_em, fator_calibracao
  from ia.previsoes order by trecho_id, data_previsao desc, criado_em desc, id desc
), ultima_medicao as (
  select distinct on (trecho_id) trecho_id, data as medido_em, altura_cm as altura_medida_cm, origem, classe
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
       c.id as chamado_id, c.numero as chamado_numero, c.status as chamado_status,
       -- novas
       t.fonte_cadastro, t.km_marco_m, t.metodo_rocada, t.area_rocada_m2,
       t.fertilidade_solo, t.capacidade_agua_solo_mm, t.solo_fonte,
       m.origem as medicao_origem, m.classe as classe_medida,
       p.fator_calibracao
from ia.trechos t
left join ultima_previsao p on p.trecho_id = t.id
left join ultima_medicao m on m.trecho_id = t.id
left join ultimo_agendamento a on a.trecho_id = t.id
left join ultima_execucao e on e.trecho_id = t.id
left join ia.equipes q on q.id = a.equipe_id
left join ia.chamados c on c.agendamento_id = a.id
where t.ativo;

alter view ia.vw_trecho_status set (security_invoker = on);
```

Rollback registrado no plano: `update ia.trechos set ativo = true`, `update ia.equipes set ativo = true`
e a definição anterior da view (a de `20260911092000_chamados_retroativos_e_view.sql`). Os
agendamentos descartados voltam por lista de ids salva antes do `update`.

### 6.3 Dados que entram por código, não por migração

Os 60 trechos, os 1.440 levantamentos (60 × 12 × 2), as medições derivadas, as execuções
inferidas, o solo por trecho, a validação e a calibração entram por
`pesquisa/publicar_rodoanel.py`, que usa o mesmo caminho do importador semanal. Motivo: são
dados derivados do pipeline e podem ser regravados de forma idempotente quando o pipeline
mudar; uma migração congelaria um resultado intermediário.

Chaves de idempotência: `trechos (rodovia, km_marco_m)`; `levantamentos (trecho_id, faixa_codigo, data)`;
`medicoes` derivadas são apagadas e regravadas por `(trecho_id, data, origem='levantamento_classe')`;
`execucoes` inferidas idem por `(trecho_id, data_execucao, origem='inferida_levantamento')`;
`ndvi_observacoes (trecho_id, data_imagem, mascara)`.

---

## 7. Pipeline de pesquisa

### 7.1 Definições

- **Segmento / trecho.** Marco `m ∈ {0, 500, …, 29000, 29300}`. `km_inicio = m/1000`; `km_fim =
  (m+500)/1000`, exceto `29000 → 29,0–29,15` e `29300 → 29,15–29,3`. Posição = ponto do eixo
  reordenado no *chainage* `m / 1,0095`. `rodovia = 'SP-021 Rodoanel Oeste'`, `uf = 'SP'`,
  `sentido = null`, `tipo_pista = 'faixa de dominio'`, `especie = 'braquiaria'`,
  `altura_limite_cm = 30`, `fonte_cadastro = 'levantamento_motiva'`, `concessionaria = RodoAnel`.
  `observacoes` (texto que a LLM lê): "Segmento do levantamento unifilar da Motiva (RA-ROÇ-LIMP).
  Método de roçada predominante: {metodo} ({area} m² roçáveis). Espécie assumida: braquiária
  (premissa, não medida). Limite contratual Artesp Anexo 06 b.1.1: 30 cm."
- **Atribuição polígono → segmento.** Centróide (lat/lon do `SimpleData`) projetado no eixo →
  `km_planilha = chainage × 1,0095` → `m = 29300 se km_planilha ≥ 29150, senão min(29000,
  floor(km_planilha/500)×500)`. `metodo_rocada` = classe com maior área no segmento;
  `area_rocada_m2` = soma das áreas.
- **Classe → altura.** 1 → 5 cm, 2 → 20 cm, 3 → 40 cm. Classificação inversa: `< 10 → 1`,
  `10 ≤ h ≤ 30 → 2`, `> 30 → 3`.
- **Medição derivada.** Por trecho e data: a **pior** classe entre as faixas em escopo que têm
  classe. `altura_cm` = ponto médio; `origem = 'levantamento_classe'`; `classe`; `faixa_codigo`
  = a faixa que deu a pior (empate: menor `ordem`). Sem faixa em escopo com classe → sem medição.
- **Execução inferida.** Por trecho e intervalo entre dois levantamentos consecutivos: se alguma
  faixa (qualquer) caiu de classe, uma execução em `data = início + metade do intervalo, arredondado para baixo` (13→20/03: 16/03),
  `km_rocados = extensao`, `altura_antes_cm` = ponto médio da maior classe inicial entre as faixas
  que caíram, `altura_depois_cm` = ponto médio da classe final dessa faixa, `origem =
  'inferida_levantamento'`, `observacao` = "Inferida do levantamento: {faixas} caíram de classe
  entre {d1} e {d2}. Data incerta em ±3 dias."
- **Par de validação.** `(trecho, faixa)` com classe nas duas datas: 248. `transicao`: `cresceu`
  se `c2 > c1`, `rocado` se `c2 < c1`, `estavel` se igual. Os 53 `rocado` são excluídos da
  validação de crescimento (`motivo_exclusao = 'rocada_inferida'`); 195 seguem.

### 7.2 Clima e solo da janela

- Clima: **arquivo ERA5** do Open-Meteo (`archive-api`), porque a série de previsão só alcança
  ~63 dias para trás. `ml/clima.py` ganha `buscar_serie_arquivo(lat, lon, inicio, fim,
  aquecimento=120)`. Duas zonas para os 29 km: **norte** (eixo em 7.300 m) e **sul** (22.000 m),
  divisor em 14.650 m. Janela: 2025-11-13 → 2026-03-20. Cache em
  `pesquisa/dados/derivados/clima_{zona}_2025-11-13_2026-03-20.json`, versionado.
- Solo: `ml/solo.buscar(lat, lon)` (SoilGrids, regime `faixa`) em cada um dos 60 marcos, com
  pausa de 1 s entre chamadas. Cache `solo_por_marco.json`, versionado. Quem cai na premissa fica
  marcado `solo_fonte = 'premissa'`.

### 7.3 Validação

Para cada par usado, a linha de features vem de `ml/clima.montar_features` com `especie`,
`dias_periodo = 7`, `altura_cm` = ponto médio de `c1`, `dias_desde_rocada = 200`, latitude do
segmento, série da zona, balanço de solo por par (a altura inicial muda o Kc), fertilidade e
capacidade do marco. `ml/modelo.prever` devolve `(q10, q50, q90)` em cm; `altura_final_q =
inicial + q × fator`; `classe_prevista = classe(altura_final_q50)`.

Métricas, todas sobre os 195:

| Métrica | Definição |
|---|---|
| `acuracia_classe` | média de `classe_prevista == c2` |
| `mae_ordinal` | média de `abs(classe_prevista − c2)` |
| `transicoes_total` / `transicoes_detectadas` | pares com `c2 > c1` (33) / destes, quantos tiveram `classe_prevista > c1` |
| `estaveis_total` / `alarmes_falsos` | pares com `c2 == c1` (162) / destes, quantos tiveram `classe_prevista > c1` |
| `J` | `transicoes_detectadas/transicoes_total − alarmes_falsos/estaveis_total` (Youden) |
| `cobertura_banda` | fração de pares em que a faixa de altura da classe observada intersecta `[inicial + q10·f, inicial + q90·f]` |
| linha de base "nada muda" | `acuracia = 162/195`, `J = 0`. **É contra ela que o modelo é julgado**, não contra zero |

Calibração: `fator ∈ {0,25; 0,30; …; 4,00}`. Ajuste = maximizar `J` nos pares de segmentos com
`(m/500)` **par**; teste = `J` nos **ímpares**; empate → fator mais próximo de 1. Depois,
reajuste em todos. O fator vira `calibracoes` vigente **só se** `J_todos(fator) > J_todos(1,0)`;
senão grava-se `1,0` com a observação "calibração não melhorou o critério". Registra-se sempre a
linha sem calibração.

Sensibilidade (cada combinação é uma linha em `validacoes`, `vigente = false`, com os parâmetros
em `parametros`): espécie × {braquiaria, batatais, esmeralda}; ponto médio da classe 3 × {35,
40, 50}; dias desde a roçada × {30, 60, 200}. A combinação padrão (braquiária, 40, 200) é a
vigente.

Fila retrospectiva (vai para o relatório, não para o banco): em 13/03, quais trechos o sistema
teria marcado como "cruza 30 cm em ≤ 7 dias" e quantos deles de fato apareceram em classe 3 em
20/03.

### 7.4 Relatórios

`pesquisa/rodoanel/relatorio.py` renderiza markdown a partir dos JSON: `01-consolidacao.md`
(contagens, matriz, mapa de métodos por km, decisões de parsing), `02-validacao.md` (tabela de
métricas com a linha de base, matriz de confusão, sensibilidade, calibração ajuste/teste, fila
retrospectiva, limitações), `03-ndvi.md`. `docs/pesquisa/00-diario.md` é append-only: data, hora,
o que rodou, comando, resultado em uma linha, hash do commit.

### 7.5 Importador

`pesquisa/importar_levantamento.py --xlsx <arquivo> [--data AAAA-MM-DD] [--anterior <arquivo>] [--gravar]`.
Sem `--gravar` é ensaio: imprime contagens (levantamentos, medições derivadas, execuções
inferidas) e não toca o banco. Data vem do nome do arquivo; `--data` sobrepõe; a data interna vai
para `data_no_arquivo`. Mapeia marco → `trechos.id` por `(rodovia, km_marco_m)`. Idempotente.
`--anterior` (ou o levantamento anterior existente no banco) habilita as execuções inferidas.

---

## 8. Modelo em produção

### 8.1 `ml/analise.py`

- `VALIDADE_MEDICAO_DIAS = 120`. Em `analisar_trecho`, depois de escolher a base (medição ou
  roçada): `if decorridos > VALIDADE_MEDICAO_DIAS: raise LookupError(f"medicao vencida ({decorridos} d)")`.
  O lote já trata `LookupError` como "sem dados" e imprime o motivo; passa a contar `vencida` à parte.
- Assinatura: `analisar_trecho(sb, t, serie, terra, hoje, calib=calibracao.SEM, mobilizacao_dias=7)`.
  `Q = modelo.curva(montar) * calib.fator` (os três quantis), `crescido *= calib.fator`.
  Resultado ganha `fator`, `calibracao` (namedtuple), `mobilizacao_dias`, `data_ideal`
  (`hoje + dias − mobilizacao_dias` quando `dias` existe; nunca antes de hoje).
- `linha_de_previsao` grava `fator_calibracao`.
- `contexto_para_llm` ganha: `metodo_rocada`, `area_rocada_m2`, `origem_da_medicao` (texto),
  `classe_medida`, `calibracao {fator, n_pares_reais, validada_em, origem}`, `dia_ideal_rocada`,
  `tempo_mobilizacao_dias`. As instruções da LLM passam a dizer: "`data_sugerida` é
  `dia_ideal_rocada`, salvo impedimento operacional que você deve nomear".
- Solo por trecho: quando `t.fertilidade_solo` e `t.capacidade_agua_solo_mm` existem, o lote monta
  `solo.Solo(fert, cap, t.solo_fonte)` e usa em vez do solo da zona.

### 8.2 `ml/calibracao.py` (novo)

`Calibracao(fator, origem, validacao_id, n_pares, validada_em)`; `SEM = Calibracao(1.0,
"sem_calibracao", None, None, None)`; `carregar(sb)` lê `calibracoes` ativas com
`validacoes(n_pares_usados, executada_em)`; `escolher(lista, rodovia, especie)` pela
especificidade: `(rodovia, especie)` > `(rodovia, null)` > `(null, especie)` > `(null, null)` > `SEM`.

### 8.3 `ml/analisar_lote.py`

Lê só `trechos.ativo = true`, com `concessionarias(mobilizacao_dias)` embutido; carrega as
calibrações uma vez; passa `calib` e `mobilizacao_dias` por trecho; solo por trecho quando
houver; resumo final separa `medicao vencida` de `sem medicao`.

### 8.4 TypeScript

`web/src/lib/calibracao.ts` (`server-only`): `fatorVigente(rodovia, especie)` com a mesma
regra de especificidade. `simulacao.ts`: `simular(pedido, janela, fator = 1)` multiplica q10/q50/q90
de cada ponto; `Simulacao.fator`. O simulador exibe "Calibração: fator {k} medido em {n} pares
reais do Rodoanel em {data}" ou "Sem calibração medida". Os testes de paridade não mudam.

---

## 9. Painel

- **Filtros de `ativo`.** A view já filtra. `listarAgendamentos` e as consultas de chamados
  passam a selecionar `trechos.ativo` no embed e a descartar `ativo === false` em memória.
- **`/validacao`** (Operação; super_admin, admin e analista). Blocos: resumo da validação vigente
  (janela, n, espécie, fator, acurácia, transições detectadas de 33, alarmes falsos de 162,
  cobertura, e a linha de base "nada muda" ao lado); matriz de confusão 3×3; sensibilidade
  (tabela das linhas `vigente = false`); NDVI (`ndvi_analises`: mediana por classe, AUC, p, ΔNDVI
  roçados × não roçados); limitações declaradas (§15); links para `docs/pesquisa/`.
- **Trecho.** Cartão "Levantamento de campo": faixas × datas com chips de classe
  (`CLASSE_ALTURA` em `dominio.ts`), método e área roçável, frase de origem.
- **Ficha do modelo** (copiloto): seção "Precisão medida" lendo a validação vigente; a limitação
  "medição velha deixa a previsão andar sozinha" passa a dizer que acima de 120 dias não há previsão.
- **Tipos e vocabulário.** `types.ts`: `OrigemMedicao`, `FonteCadastro`, `Faixa`, `Levantamento`,
  `Validacao`, `ValidacaoPar`, `Calibracao`, `NdviAnalise`; `TrechoStatus` e `Medicao` com as
  colunas novas. `dominio.ts`: `CLASSE_ALTURA`, `ORIGEM_MEDICAO`, `METODO_ROCADA`.
- **Navegação e permissões.** Item "Validação" em `navegacao.ts`; rota em `permissoes.ts` para os
  três cargos de painel; testes atualizados.
- **Fumaça.** `scripts/fumaca.mjs` cobre as 7 tabelas novas (a publishável não lê nenhuma).

---

## 10. Sensoriamento remoto

- **Acesso.** Registro no Google Earth Engine (tier Community, "Academia & Research", conta
  pessoal ou FIAP, **não** a corporativa), `earthengine authenticate`, `GEE_PROJECT` no `.env`.
- **Geometria por segmento.** União dos polígonos do KML atribuídos ao segmento (§7.1). É a área
  roçável sem asfalto: ataca o pixel misto do PLANO §4.6 sem inventar buffer.
- **Coleção e máscara.** `COPERNICUS/S2_SR_HARMONIZED`; pixel válido se `SCL ∉ {3, 8, 9, 10, 11}`
  e `MSK_CLDPRB < 40`. `NDVI = (B8 − B4)/(B8 + B4)`. Estatísticas por segmento a 10 m: média,
  mediana, p10, p90, contagem de pixels válidos, `nuvem_pct = 1 − válidos/total`.
- **Datas-alvo.** 2026-03-13, 2026-03-20 e 2025-03-28 (esta só como verificação de sanidade da
  hipótese de data). Janela ±3 dias; se nenhuma imagem tiver `nuvem_pct` média < 50% sobre o eixo,
  ±7 dias, e a defasagem fica registrada. Sem imagem utilizável = **resultado registrado** em
  `03-ndvi.md`, não falha.
- **Testes-chave.** (1) Separação: NDVI dos segmentos em classe 3 vs classe 1 (classe do trecho =
  pior faixa em escopo), Mann-Whitney U e AUC, por data. (2) Corte: ΔNDVI (20/03 − 13/03) dos
  segmentos com execução inferida vs sem, Mann-Whitney. Resultados em `ndvi_analises`.
- **Bônus (dia 3).** Série 2019-01-01 → hoje por segmento (observações com `nuvem_pct < 20%`),
  por ano em chamadas separadas; detector de corte: queda de NDVI ≥ 0,15 entre observações
  consecutivas a ≤ 12 dias com valor anterior ≥ 0,45; medida contra as execuções inferidas de
  março/2026 (evento entre 06/03 e 27/03) e contagem de eventos por ano por segmento.

---

## 11. Ordem de entrega e registros

| Dia | Trilha A: dados e produto | Trilha B: satélite | Registro |
|---|---|---|---|
| 1 · 13/09 | repositório em `ml/`; `pesquisa/` com testes; consolidação; clima e solo; **validação v1 com o número de erro**; regra de medição vencida no `main`; backup; migrações 1 e 2; Rodoanel no banco | GEE autenticado; geometrias; NDVI das 3 datas; primeira leitura da separação | `00-diario.md`, `01-consolidacao.md`, `02-validacao.md` |
| 2 · 14/09 | calibração e solo por trecho no lote; `calibracao.ts` e simulador; `/validacao`; cartão do trecho; ficha; fumaça; deploy manual | análise estatística; `ndvi_analises`; bloco NDVI em `/validacao` | `03-ndvi.md`, `04-producao.md` |
| 3 · 15/09 | importador via painel (stretch); `docs/relatorio-motiva.md`; docs de operação; deploy final; tag `dados-reais-2026-09-15` | série 2019–2026 e detector de corte (bônus) | `relatorio-motiva.md`, diário fechado |

Regra: a trilha B nunca bloqueia a A. Se a validação v1 não fechar no dia 1, o dia 2 começa por
ela, e o satélite espera.

---

## 12. Testes e critérios de aceitação

| Componente | Teste | Critério |
|---|---|---|
| Parser da planilha | pytest sobre os 2 xlsx | 60 marcos; 12 faixas; contagens por linha iguais às medidas (ex.: 13/03, CANT. LATERAL EXTERNA: 30×1, 10×2, 15×3, 5×X); data interna 2025-03-28 |
| Marcos | pytest | 30 pontos; comprimento 29.025 ± 50 m; maior passo ≤ 2.100 m; `posicao(0)` = 1º ponto; `posicao(29300)` = último |
| Polígonos | pytest | 642; classes 342/180/106/14; área total 981.817 ± 1 m²; ≥ 95% no km da descrição (±1) |
| Consolidação | pytest de aceitação | 248 pares; matriz **exatamente** 130/30/3/27/22/22/4/10; 209 pares nas 4 faixas em escopo; 60 segmentos com lat/lon dentro da bbox (−23,64…−23,40; −46,84…−46,72) |
| Validação | pytest com preditor falso | matriz, `J`, cobertura e calibração corretos em casos construídos; com preditor "cresce 0" a saída reproduz a linha de base 162/195 |
| Importador | pytest em ensaio (sem rede) | 1.440 levantamentos por par de arquivos; execuções inferidas só onde houve queda; rodar duas vezes não duplica |
| Migrações | SQL após aplicar | 7 tabelas novas com RLS; `select count(*) from ia.vw_trecho_status` = 60 depois do publish; 0 agendamentos abertos em trecho inativo |
| Lote | teste Python com `sb` falso | medição de 121 dias levanta `LookupError`; fator 1,3 multiplica os quantis; solo do trecho vence o da zona |
| Web | `npm run verificar` | tipos, lint, 329+ testes (com os novos), fumaça com 7 tabelas, build |
| Produção | curl e navegador | `/` → 307 `/entrar`; `/validacao` renderiza a validação vigente; `/malha` só SP-021 |
| NDVI | pytest das geometrias; análise em dados sintéticos | cada polígono em exatamente um segmento; AUC de dados separáveis = 1,0 |

---

## 13. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| O lote das 06:00 (09:00 UTC) roda em cima de 60 trechos com medição de março | a regra de medição vencida vai para o `main` antes do `publicar_rodoanel.py` (decisão 15) |
| Nuvem em março sobre São Paulo | janela ±3 → ±7 dias; sem imagem é resultado declarado; a série longa mostra a sazonalidade mesmo assim |
| SoilGrids mascara mancha urbana | `solo.buscar` já sonda 4 vizinhos a 2 km e cai na premissa marcada |
| Open-Meteo 429 no arquivo | 2 zonas = 2 chamadas; cache versionado; pausa de 6 s entre chamadas |
| `supabase db push` desalinhado com o histórico remoto | migrações aplicadas pelo MCP (`apply_migration`) ou pelo SQL Editor, como as anteriores; os arquivos ficam versionados de todo modo |
| Deploy da Vercel a partir da árvore suja | procedimento de `git archive HEAD` (docs/operacao/deploy.md), adaptado a `/tmp` |
| Fator de calibração sobreajustado a 33 transições | ajuste em km pares, teste em ímpares; vigente só se melhora `J` em todos; sem calibração fica registrado ao lado |
| Um bug no parser contamina tudo | a matriz de transição é teste de aceitação; qualquer divergência para o pipeline |

---

## 14. Fora de escopo, declarado como próximo passo

Retreinar o modelo sintético; `taxa_base` por segmento (depende da série NDVI longa);
krigagem; SAR (Sentinel-1) — só se a nuvem inviabilizar o óptico; classificação de espécie;
detector de roçada treinado (53 eventos com janela de 7 dias não dão rótulo de data);
políticas RLS por cargo; upload do RA-RET pelo painel se o dia 3 não alcançar.

---

## 15. Limitações a declarar na apresentação

- Duas datas apenas, ambas em março: a calibração vale para o fim da estação chuvosa em SP.
- Classes ordinais, não altura contínua; o ponto médio é aproximação (sensibilidade medida).
- Pixel de 10 m; faixas estreitas (dispositivo, marginal) ficam fora do NDVI por segmento.
- Calibração local ao Rodoanel; o método transfere, o número não.
- Corte anterior, pisoteio, herbicida e queimada permanecem não observados.
- 53 roçadas inferidas é amostra pequena para um detector automático.
- A acurácia não é prometida: é medida, e a linha de base "nada muda em 7 dias" acerta 83%.
