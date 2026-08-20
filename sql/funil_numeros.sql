-- ============================================================
-- Quantas pessoas viram a página e fizeram a simulação
-- Executar no SQL Editor do Supabase. Pode salvar e reexecutar.
--
-- Conta PESSOAS (sessões únicas), não cliques. Quem recarrega a
-- página três vezes conta uma vez só.
-- ============================================================

with etapas as (
  select
    count(distinct session_id) filter (where event = 'landing_view')                as viram_a_pagina,
    count(distinct session_id) filter (where event = 'simulation_started')          as comecaram,
    count(distinct session_id) filter (where event = 'quick_simulation_completed')  as terminaram_as_6_perguntas,
    count(distinct session_id) filter (where event = 'preliminary_result_viewed')   as viram_o_resultado,
    count(distinct session_id) filter (where event = 'full_simulation_started')     as foram_para_a_etapa_2,
    count(distinct session_id) filter (where event = 'lead_submitted')              as deixaram_contato,
    count(distinct session_id) filter (where event = 'whatsapp_clicked')            as clicaram_no_whatsapp
  from funnel_event
  where created_at >= now() - interval '30 days'
)
select
  viram_a_pagina                                                                   as "1. Viram a página",
  comecaram                                                                        as "2. Começaram",
  terminaram_as_6_perguntas                                                        as "3. Terminaram as 6 perguntas",
  viram_o_resultado                                                                as "4. Viram o resultado",
  deixaram_contato                                                                 as "5. Deixaram contato",
  clicaram_no_whatsapp                                                             as "6. Foram para o WhatsApp",
  -- percentuais que realmente importam
  round(100.0 * nullif(comecaram,0)                / nullif(viram_a_pagina,0), 1)   as "% começou",
  round(100.0 * nullif(terminaram_as_6_perguntas,0)/ nullif(comecaram,0), 1)        as "% terminou a simulação",
  round(100.0 * nullif(deixaram_contato,0)         / nullif(viram_o_resultado,0),1) as "% virou lead"
from etapas;


-- ============================================================
-- Por dia — para ver se a campanha está trazendo gente
-- ============================================================
select
  date_trunc('day', created_at)::date                                              as dia,
  count(distinct session_id) filter (where event = 'landing_view')                 as viram,
  count(distinct session_id) filter (where event = 'quick_simulation_completed')   as simularam,
  count(distinct session_id) filter (where event = 'lead_submitted')               as leads
from funnel_event
where created_at >= now() - interval '14 days'
group by 1
order by 1 desc;


-- ============================================================
-- De onde veio a gente (separa a campanha paga do resto)
-- ============================================================
select
  coalesce(source->>'utm_campaign', '(sem campanha / orgânico)')                   as campanha,
  coalesce(source->>'utm_source', '(direto)')                                      as origem,
  count(distinct session_id) filter (where event = 'landing_view')                 as viram,
  count(distinct session_id) filter (where event = 'quick_simulation_completed')   as simularam,
  count(distinct session_id) filter (where event = 'lead_submitted')               as leads
from funnel_event
where created_at >= now() - interval '30 days'
group by 1, 2
order by viram desc;


-- ============================================================
-- Onde as pessoas desistem — a pergunta que mais perde gente
-- ============================================================
select
  step                                                                             as etapa,
  count(distinct session_id)                                                       as chegaram_ate_aqui
from funnel_event
where created_at >= now() - interval '30 days'
  and event = 'quick_question_completed'
group by 1
order by chegaram_ate_aqui desc;


-- ============================================================
-- Qualidade do clique por posicionamento
--
-- Requer utm_content={{placement}} nos Parametros de URL do anuncio
-- (adicionado em 19/08/2026). So vale para cliques a partir dai.
--
-- A pergunta que isto responde: Reels traz gente que age, ou gente
-- que escorregou o dedo? Se a taxa de inicio do Reels for muito
-- menor que a do Feed, o caminho e desligar Reels.
-- ============================================================
select
  coalesce(source->>'utm_content', '(sem posicionamento)')                        as posicionamento,
  count(distinct session_id) filter (where event = 'landing_view')                as chegaram,
  count(distinct session_id) filter (where event = 'simulation_started')          as comecaram,
  round(100.0 * count(distinct session_id) filter (where event = 'simulation_started')
      / nullif(count(distinct session_id) filter (where event = 'landing_view'), 0), 1) as pct_inicio,
  count(distinct session_id) filter (where event = 'quick_simulation_completed')  as simularam,
  count(distinct session_id) filter (where event = 'lead_submitted')              as leads,
  count(distinct session_id) filter (where event = 'whatsapp_clicked')            as whatsapp
from funnel_event
where created_at >= '2026-08-19'
group by 1
order by chegaram desc;
