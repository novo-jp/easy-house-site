-- ════════════════════════════════════════════════════════════════════════
-- Ficha de crédito do corretor no painel de acompanhamento
-- (ficha do cliente, co-devedor, limite por banco e 資金計画書)
--
-- Rodar UMA vez no SQL Editor do projeto igtqdhesorahhdyvsjrl, depois de
-- acompanhamento.sql. Pode rodar de novo sem estragar nada.
--
-- Mesma regra das outras acomp_*: RLS ligado e NENHUMA política. Quem lê e
-- grava é só api/painel.mjs, com a service key; a chave pública do site não
-- enxerga nada daqui. A ficha guarda renda, dívidas, visto e família.
--
-- Quem vê o quê é decidido no servidor: cada corretor só as fichas dele
-- (corretor_id), o administrador todas. Cliente não vê ficha nenhuma.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.acomp_ficha (
  id             uuid primary key default gen_random_uuid(),
  -- Dono da ficha. Se o corretor sair da equipe, a ficha fica sem dono e só
  -- o administrador a enxerga, até passar para outra pessoa.
  corretor_id    uuid references public.acomp_usuario(user_id) on delete set null,
  nome           text not null default '',
  status         text not null default 'lead'
                 check (status in ('lead', 'ficha', 'pre', 'aprovado', 'contrato', 'honshinsa', 'entregue', 'perdido')),
  ficha          jsonb not null default '{}'::jsonb,   -- 申込人
  codevedor      jsonb not null default '{}'::jsonb,   -- 連帯・収入合算
  credito        jsonb not null default '{}'::jsonb,   -- parâmetros do limite
  simulacao      jsonb not null default '{}'::jsonb,   -- 資金計画書
  -- Processo criado a partir desta ficha (botão "Criar processo").
  processo_id    uuid references public.acomp_processo(id) on delete set null,
  -- Sobe a cada gravação: duas telas na mesma ficha não se sobrescrevem.
  versao         integer not null default 1,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index if not exists acomp_ficha_corretor_idx on public.acomp_ficha (corretor_id, atualizado_em desc);

-- Configurações do painel. Hoje, uma linha: 'bancos_credito' (bancos e
-- taxas, editados pelo administrador em Crédito → Bancos e taxas). Sem a
-- linha, valem os padrões de lib/acompanhamento-credito.mjs.
create table if not exists public.acomp_config (
  chave           text primary key,
  valor           jsonb not null,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  text
);

alter table public.acomp_ficha  enable row level security;
alter table public.acomp_config enable row level security;
