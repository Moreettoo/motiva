-- Volta das DUAS migrações de 2026-08-14 (ver `2026-08-14-agenda-clean-design.md`).
-- Rode na ordem inversa: primeiro a §2b, depois a §2a.
-- Nada foi deletado em nenhuma das duas: só `status`, `equipe_id` e
-- `atualizado_em` mudaram, e `justificativa` — o texto que a OpenAI escreveu —
-- está intacta em todas as linhas.
--
-- ATENÇÃO: reverter os dados sem reverter também `analisar_lote.py` faz a rodada
-- das 06:00 refazer as duas limpezas na manhã seguinte.

-- =====================================================================
-- §2b · `um_agendamento_aberto_por_trecho`
-- 42 agendamentos viraram `descartado` por serem duplicatas do mesmo trecho —
-- o lote criava uma linha NOVA por dia, sem nunca olhar se já havia uma aberta.
-- Sobreviveu o mais recente de cada trecho, que é o mesmo que
-- `ia.vw_trecho_status` já elegia (`criado_em desc, id desc`).
-- 9 sobreviventes herdaram a equipe de um irmão descartado.
-- =====================================================================

begin;

-- Devolve a equipe herdada ao estado anterior (nenhuma).
update ia.agendamentos set equipe_id = null, atualizado_em = now()
where id in (316,319,320,321,322,323,324,325,327);

update ia.agendamentos set status = 'aprovado', atualizado_em = now()
where id in (151,193,196,203,206,207,214,217,219,240,241,287,288,289,294,295,
             296,300,301,305,306,309,312,314);

update ia.agendamentos set status = 'sugerido', atualizado_em = now()
where id in (194,211,290,291,292,293,298,299,302,303,304,307,308,310,311,313,
             315,317);

commit;

-- =====================================================================
-- §2a · `fechar_agendamentos_de_trecho_sem_necessidade`
-- 44 agendamentos viraram `descartado` porque o trecho passou de 55 dias do
-- limite: 31 eram `sugerido`, 13 eram `aprovado` com data já vencida.
-- Cada grupo volta ao status que tinha, e não a um status comum — com um
-- `update` só, os 13 aprovados voltariam como sugeridos e a decisão de quem
-- aprovou sumiria sem aviso.
-- =====================================================================

begin;

update ia.agendamentos set status = 'sugerido', atualizado_em = now()
where id in (4,7,19,20,152,156,161,162,165,169,176,178,179,188,192,199,215,225,
             230,232,235,239,243,250,255,281,282,283,284,285,286);

update ia.agendamentos set status = 'aprovado', atualizado_em = now()
where id in (157,163,166,168,183,189,190,229,249,251,252,254,258);

commit;
