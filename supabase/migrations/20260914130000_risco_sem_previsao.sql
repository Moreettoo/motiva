begin;

-- Corrige `risco_sem_dados` (20260914120000): aquela migracao trocou
-- `p.dias_ate_limite is null then 'baixa'` por `then 'sem_dados'` sem
-- distinguir as DUAS causas que colapsam no mesmo `dias_ate_limite is null`:
--
--   1. NENHUMA previsao existe para o trecho (`p.id is null`, o LEFT JOIN nao
--      achou linha) -- medicao vencida ha mais de 120 dias, ou nenhuma
--      medicao ainda. Isto E "nao sei nada": `sem_dados` esta certo aqui.
--
--   2. Uma previsao EXISTE (`p.id` preenchido), mas o crescimento e
--      desprezivel e o modelo nunca cruza o limite dentro do horizonte
--      (`ml/modelo.py::cruzamento` devolve `None` para "nao cresce", e o
--      comentario la e explicito: "devolver nulo aqui faria o trecho folgado
--      ser lido como sem previsao nenhuma"). Isto e "sei que esta bem", o
--      caso mais tranquilizador que o sistema pode responder -- e a migracao
--      anterior o pintava como `sem_dados`, o espelho invertido do bug
--      original (antes: "nao sei" virava "esta tudo bem"; depois: "sei que
--      esta bem" virava "nao sei").
--
-- Medido em producao antes desta migracao: 205 das 2.584 previsoes
-- existentes (~8%) tem `dias_ate_limite is null`; a distincao nao e
-- hipotetica. A `ultima_previsao` CTE ja seleciona `previsoes.id`, entao
-- `p.id is null` (linha 1 do CASE, checada ANTES de `p.dias_ate_limite`) e o
-- unico teste que separa as duas causas. NAO dobre os dois `when` de volta
-- num so por brevidade -- e exatamente essa fusao que este comentario existe
-- para impedir.
--
-- Definicao da view copiada de `pg_get_viewdef('ia.vw_trecho_status', true)`
-- rodado contra a producao (identica, coluna a coluna, ao que
-- `20260914120000_risco_sem_dados.sql` tinha aplicado); a unica mudanca e o
-- CASE de risco abaixo.
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
       -- `p.id is null` primeiro: so essa checagem distingue "nenhuma previsao"
       -- (sem_dados) de "previsao real sem cruzamento" (baixa). Ver o
       -- comentario desta migracao no topo do arquivo antes de tocar aqui.
       case when p.id is null then 'sem_dados' when p.dias_ate_limite is null then 'baixa'
            when p.dias_ate_limite <= 7 then 'critica' when p.dias_ate_limite <= 20 then 'alta'
            when p.dias_ate_limite <= 45 then 'media' else 'baixa' end as risco,
       a.origem as agendamento_origem,
       c.id as chamado_id, c.numero as chamado_numero, c.status as chamado_status,
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
