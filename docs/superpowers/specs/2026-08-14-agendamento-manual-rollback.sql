-- Rollback da migração `agendamento_manual_origem_e_invariante`.
--
-- Aplique NA ORDEM. Antes de rodar, saiba o que se perde:
--
--  1. `origem` guarda a única distinção entre uma roçada que a IA propôs e uma
--     que um gestor marcou na mão. Derrubar a coluna apaga essa informação de
--     forma irreversível — os dois tipos de linha voltam a ser indistinguíveis.
--     A consulta de conferência abaixo diz quantas linhas manuais existem hoje;
--     se o número for maior que zero, exporte antes.
--
--  2. Sem o índice, dois escritores (o painel e o `analisar_lote.py`) voltam a
--     poder criar dois agendamentos abertos para o mesmo trecho numa corrida —
--     e o quadro desenha os dois, lado a lado, como cartões idênticos.

-- Conferência: quantas linhas manuais seriam despromovidas a "indistinguíveis".
select count(*) filter (where origem = 'manual') as manuais,
       count(*) filter (where origem = 'ia')     as da_ia
from ia.agendamentos;

-- Exportação, se o número acima for > 0. Guarde o resultado fora do banco.
select id, trecho_id, data_sugerida, equipe_id, prioridade, justificativa, status, criado_em
from ia.agendamentos
where origem = 'manual'
order by id;

-- 1. A trava de invariante.
drop index if exists ia.ux_agendamento_aberto_por_trecho;

-- 2. A view, que passou a expor `agendamento_origem` e portanto DEPENDE da
--    coluna. Sem este passo, o `drop column` abaixo falha com
--    "cannot drop column origem because other objects depend on it" — e resolver
--    isso com `cascade` derrubaria a view inteira, que é o objeto de que o
--    painel inteiro depende. Rodar a migração
--    `vw_trecho_status_expoe_origem_do_agendamento` de trás para frente:
--    reponha aqui a definição ANTERIOR da view (a mesma, sem
--    `agendamentos.origem` na CTE `ultimo_agendamento` e sem a coluna final
--    `agendamento_origem`), com `create or replace view ia.vw_trecho_status as …`.
--
--    Recupere aquela definição da lista de migrações do projeto, ou da própria
--    view atual antes de derrubar nada:
--        select pg_get_viewdef('ia.vw_trecho_status'::regclass, true);
--    e remova as duas linhas de `origem`. `create or replace` não aceita
--    REMOVER coluna, então este passo é um `drop view` seguido de `create` —
--    e por isso vale conferir antes que nada mais dependa dela:
--        select dependent_ns.nspname, dependent_view.relname
--        from pg_depend d
--        join pg_rewrite r on r.oid = d.objid
--        join pg_class dependent_view on dependent_view.oid = r.ev_class
--        join pg_namespace dependent_ns on dependent_ns.oid = dependent_view.relnamespace
--        join pg_class source on source.oid = d.refobjid
--        where source.relname = 'vw_trecho_status' and dependent_view.relname <> 'vw_trecho_status';

-- 3. A coluna. O CHECK e o COMMENT caem junto com ela.
alter table ia.agendamentos drop column if exists origem;
