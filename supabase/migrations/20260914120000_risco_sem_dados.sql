begin;

-- Risco `sem_dados`, distinto de `baixa`, quando nao ha previsao para classificar.
--
-- Hoje os 60 trechos reais do Rodoanel tem `dias_ate_limite is null` para
-- TODOS: o levantamento de marco/2026 esta vencido (178 dias, acima do limiar
-- de 120 dias de `analisar_lote.py`), entao o lote nunca gerou previsao
-- nenhuma. A view antiga carimbava `baixa` neste caso -- a mesma regra que
-- `dispensaAgendamento` em dominio.ts ja tratava como armadilha do lado do
-- painel ("nao sei nada" lido como "esta tudo bem") -- e o resultado e
-- sessenta trechos verdes sobre um sistema que nao sabe nada sobre nenhum
-- deles. Esta migracao recria a view IDENTICA, trocando so o `then 'baixa'`
-- do primeiro `when` do CASE por `then 'sem_dados'`. Nenhuma outra coluna,
-- join ou filtro muda -- copiado de `20260913101000_rodoanel_higiene_e_view.sql`.
--
-- Ver `web/src/lib/types.ts` (`Risco`, agora desacoplado de `Prioridade`) e
-- `web/src/lib/dominio.ts` (`RISCO.sem_dados`, `TOM_BARRA_POR_RISCO.sem_dados`).
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
       case when p.dias_ate_limite is null then 'sem_dados' when p.dias_ate_limite <= 7 then 'critica'
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
