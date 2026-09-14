begin;

-- Higiene do banco e nova view: RodoAnel entra como concessionaria, a malha
-- ficticia fica oculta, e ia.vw_trecho_status passa a mostrar so trecho ativo
-- e expor as colunas novas da Tarefa 11. Ver
-- docs/superpowers/specs/2026-09-13-dados-reais-rodoanel-design.md §6.2.

-- 1. concessionaria e zona climatica do SP-021
-- A versao original da spec calculava o id a mao (`coalesce(max(id),0)+1 ... from
-- ia.concessionarias where not exists(...)`) e isso e bugado: o `where not exists`
-- nao e correlacionado, entao filtra as LINHAS agregadas, nao a existencia da
-- consulta inteira; uma agregacao sem `group by` sempre devolve uma linha mesmo
-- filtrando tudo, entao o guard virava inerte e o insert era tentado de qualquer
-- jeito. Em producao ha um `RodoAnel` desde a semente original (id=5,
-- extensao_km_oficial=29.3 -- exatamente o que este insert queria criar), e o
-- insert batia na pkey (id calculado = 1, ja e Motiva Autoban). Alem disso
-- ia.concessionarias.id e IDENTITY: nunca deveria ser calculado a mao. Correcao:
-- sem `from`, sem id a mao; o guard agora so insere quando realmente nao existe.
insert into ia.concessionarias (nome, extensao_km_oficial)
select 'RodoAnel', 29.3
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

commit;
