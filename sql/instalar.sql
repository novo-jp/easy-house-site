-- ============================================================
-- EASY HOUSE — Funil de simulação
-- Executar no SQL Editor do Supabase.
--
-- Princípio: dados sensíveis (renda, dívidas, visto) só entram pelo
-- servidor (Netlify Function com service key). O browser nunca escreve
-- diretamente nestas tabelas.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Configuração financeira versionada
-- Uma simulação antiga permanece ligada à configuração usada na época.
-- ------------------------------------------------------------
create table if not exists financing_configuration (
  id            uuid primary key default gen_random_uuid(),
  version       integer not null,
  config        jsonb   not null,
  valid_from    date    not null default current_date,
  is_active     boolean not null default false,
  note          text,
  updated_by    text,
  created_at    timestamptz not null default now()
);

create unique index if not exists financing_configuration_version_idx
  on financing_configuration (version);

-- Só uma configuração ativa por vez
create unique index if not exists financing_configuration_active_idx
  on financing_configuration (is_active) where is_active;

-- ------------------------------------------------------------
-- Lead
-- ------------------------------------------------------------
create table if not exists lead (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,           -- EH-XXXXXX, usado no WhatsApp
  first_name     text not null,
  phone          text not null,                  -- normalizado E.164 quando possível
  phone_raw      text,
  email          text,
  language       text not null default 'pt-BR',
  preferred_time text,
  cities         text[] default '{}',
  status         text not null default 'simulation_completed',
  internal_score integer,                        -- uso comercial interno, nunca exibido
  owner          text,                           -- corretor responsável
  source         jsonb default '{}'::jsonb,      -- utm, gclid, fbclid, variante
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists lead_phone_idx  on lead (phone);
create index if not exists lead_status_idx on lead (status);
create index if not exists lead_created_idx on lead (created_at desc);

-- ------------------------------------------------------------
-- Respostas do formulário
-- sensitivity: 'normal' | 'financial' | 'residency'
-- ------------------------------------------------------------
create table if not exists lead_answer (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid references lead(id) on delete cascade,
  question    text not null,
  answer      jsonb,
  sensitivity text not null default 'normal',
  created_at  timestamptz not null default now()
);

create index if not exists lead_answer_lead_idx on lead_answer (lead_id);

-- ------------------------------------------------------------
-- Simulação (pode existir antes do lead, ligada à sessão anônima)
-- ------------------------------------------------------------
create table if not exists simulation (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid references lead(id) on delete set null,
  session_id        text,
  config_version    integer not null,
  engine_version    text not null,
  inputs            jsonb not null,
  result            jsonb not null,
  scenario          text,
  status            text,                        -- calculated | manual_review
  requires_review    boolean default false,
  created_at        timestamptz not null default now()
);

create index if not exists simulation_lead_idx    on simulation (lead_id);
create index if not exists simulation_session_idx on simulation (session_id);

-- ------------------------------------------------------------
-- Imóveis à VENDA
-- Observação: a tabela imoveis_aichi existente é de ALUGUEL e continua
-- sendo usada pela página /imoveis. Esta tabela é para o funil de compra.
-- ------------------------------------------------------------
create table if not exists property (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text unique not null,
  status                text not null default 'available',  -- available | reserved | sold | hidden
  title                 text not null,
  city                  text not null,
  neighborhood          text,
  address               text,
  price                 bigint not null,
  monthly_extra_costs   integer default 0,   -- condomínio, fundo, estacionamento
  property_type         text,                -- casa | apartamento | terreno
  bedrooms              integer,
  land_area             numeric,
  built_area            numeric,
  built_year            integer,
  parking_spaces        integer,
  photos                jsonb default '[]'::jsonb,
  floor_plan_url        text,
  latitude              numeric,
  longitude             numeric,
  highlights            jsonb default '[]'::jsonb,
  published_at          timestamptz,
  updated_at            timestamptz not null default now(),
  created_at            timestamptz not null default now()
);

create index if not exists property_status_city_idx on property (status, city);
create index if not exists property_price_idx       on property (price);

-- ------------------------------------------------------------
-- Correspondência entre simulação e imóvel
-- ------------------------------------------------------------
create table if not exists property_match (
  id                 uuid primary key default gen_random_uuid(),
  simulation_id      uuid references simulation(id) on delete cascade,
  property_id        uuid references property(id) on delete cascade,
  fit                text not null,        -- within_range | slightly_above
  estimated_payment  integer,
  reason             text,
  created_at         timestamptz not null default now()
);

create index if not exists property_match_sim_idx on property_match (simulation_id);

-- ------------------------------------------------------------
-- Consentimento (versionado)
-- ------------------------------------------------------------
create table if not exists consent (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid references lead(id) on delete cascade,
  consent_type    text not null,          -- data_processing | marketing
  accepted        boolean not null,
  policy_version  text not null,
  text_accepted   text not null,
  source          text,                   -- url de origem
  created_at      timestamptz not null default now()
);

create index if not exists consent_lead_idx on consent (lead_id);

-- ------------------------------------------------------------
-- Eventos do funil (sem dados sensíveis)
-- ------------------------------------------------------------
create table if not exists funnel_event (
  id          bigserial primary key,
  session_id  text not null,
  lead_id     uuid references lead(id) on delete set null,
  event       text not null,
  step        text,
  variant     text,
  source      jsonb default '{}'::jsonb,
  payload     jsonb default '{}'::jsonb,   -- apenas dados não sensíveis
  created_at  timestamptz not null default now()
);

create index if not exists funnel_event_session_idx on funnel_event (session_id);
create index if not exists funnel_event_event_idx   on funnel_event (event, created_at desc);

-- ============================================================
-- Row Level Security
-- O browser usa a chave publishable e só pode LER imóveis publicados.
-- Escrita acontece apenas pelo servidor (service key ignora RLS).
-- ============================================================

alter table lead              enable row level security;
alter table lead_answer       enable row level security;
alter table simulation        enable row level security;
alter table consent           enable row level security;
alter table funnel_event      enable row level security;
alter table property          enable row level security;
alter table property_match    enable row level security;
alter table financing_configuration enable row level security;

-- Leitura pública apenas de imóveis disponíveis
drop policy if exists property_public_read on property;
create policy property_public_read on property
  for select using (status = 'available');

-- Leitura pública da configuração ativa (taxas são informação pública da simulação)
drop policy if exists financing_config_public_read on financing_configuration;
create policy financing_config_public_read on financing_configuration
  for select using (is_active = true);

-- Nenhuma policy para lead, simulation, consent, lead_answer:
-- sem policy + RLS ativo = browser não acessa. Só a service key entra.

-- ------------------------------------------------------------
-- Gatilho de updated_at
-- ------------------------------------------------------------
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists lead_touch on lead;
create trigger lead_touch before update on lead
  for each row execute function touch_updated_at();

drop trigger if exists property_touch on property;
create trigger property_touch before update on property
  for each row execute function touch_updated_at();

-- ------------------------------------------------------------
-- Retenção: apagar eventos de funil com mais de 18 meses
-- Agendar no cron do Supabase, se disponível.
-- ------------------------------------------------------------
create or replace function purge_old_funnel_events() returns void as $$
begin
  delete from funnel_event where created_at < now() - interval '18 months';
end;
$$ language plpgsql;


-- ============================================================
-- Configuração inicial do simulador (versão 2)
-- Flat 35 a 2.9% ao ano, prazo máximo de 35 anos.
-- ============================================================

update financing_configuration set is_active = false where is_active;

insert into financing_configuration (version, config, valid_from, is_active, note, updated_by)
values (
  2,
  '{
  "id": "easyhouse-default",
  "version": 2,
  "validFrom": "2026-08-05",
  "updatedAt": "2026-08-05",
  "updatedBy": "easy-house",
  "note": "Valores informados pela Easy House. Flat 35 com taxa de 2,9% e prazo máximo de 35 anos. Precisam de revisão periódica. Toda alteração deve gerar nova versão.",
  "acquisitionFeeRate": 0.1,
  "propertyRangeMargin": 0.07,
  "flat35": {
    "enabled": true,
    "label": "Flat 35",
    "referenceAnnualRate": 0.029,
    "rateDisplayLabel": "2,9% ao ano (taxa fixa de referência)",
    "maximumTermYears": 35,
    "minimumTermYears": 15,
    "minimumTermForApplicantsOver60": 10,
    "payoffAgeLimit": 80,
    "incomeThreshold": 4000000,
    "lowerIncomeRepaymentRatio": 0.3,
    "higherIncomeRepaymentRatio": 0.35,
    "residencyStatusesAccepted": [
      "japanese",
      "permanent_resident",
      "special_permanent_resident"
    ],
    "residencyStatusesManualReview": [
      "spouse_of_japanese",
      "long_term_resident",
      "work_visa",
      "other",
      "unknown"
    ]
  },
  "bank": {
    "enabled": true,
    "label": "Cenário bancário",
    "referenceAnnualRate": 0.014,
    "rateDisplayLabel": "1,4% ao ano (taxa de referência)",
    "maximumTermYears": 50,
    "minimumTermYears": 10,
    "payoffAgeLimit": 80,
    "repaymentRatioRulesConfigured": false,
    "lowerIncomeRepaymentRatio": null,
    "higherIncomeRepaymentRatio": null,
    "incomeThreshold": 4000000
  },
  "matomeToku": {
    "enabled": true,
    "label": "Análise conjunta de dívidas",
    "maximumRefinanceAmount": 5000000,
    "maximumTermYears": 50,
    "manualReviewRequired": true,
    "excludesBusinessDebt": true
  },
  "incomeCombination": {
    "secondApplicantIncomeRate": 0.5,
    "requiresInstitutionValidation": true
  }
}'::jsonb,
  '2026-08-05',
  true,
  'Configuracao inicial publicada na implantacao do funil',
  'easy-house'
)
on conflict (version) do update
  set config = excluded.config,
      is_active = true,
      valid_from = excluded.valid_from;

-- Conferência
select version, valid_from, is_active,
       (config->'flat35'->>'referenceAnnualRate')::numeric * 100 as flat35_taxa_pct,
       (config->'flat35'->>'maximumTermYears')::int              as flat35_prazo_anos
from financing_configuration
order by version desc;
