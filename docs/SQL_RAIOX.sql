-- Tabela do Raio-X — rodar uma vez no SQL Editor do Supabase.
--
-- Guarda o questionário concluído de quem NÃO deixou contato. É isso que
-- permite ao consultor abrir o caso pelo código quando a mensagem chega no
-- WhatsApp, em vez de repetir as treze perguntas que a pessoa acabou de
-- responder.
--
-- Fica separada de `lead` de propósito: aqui não há nome nem telefone, e
-- misturar os dois estragaria a contagem de leads reais no painel.

create table if not exists public.raiox (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  engine_version text,
  template       text,

  -- Respostas do questionário. `sensitivity` diz o que cada campo é
  -- ('normal', 'financial', 'residency') para quem for exportar ou apagar
  -- saber o que está manuseando.
  answers        jsonb not null default '{}'::jsonb,
  sensitivity    jsonb not null default '{}'::jsonb,

  -- Plano entregue à pessoa: ids das regras, para reproduzir o que ela viu.
  plan           jsonb not null default '{}'::jsonb,

  -- Ordem da fila. Vem de prazo e momento — nunca de renda ou residência.
  priority       int not null default 0,

  source         jsonb not null default '{}'::jsonb,
  status         text not null default 'aguardando_contato',

  -- Preenchido à mão quando a conversa acontece.
  lead_id        uuid references public.lead(id) on delete set null,
  notes          text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists raiox_code_idx       on public.raiox (code);
create index if not exists raiox_created_at_idx on public.raiox (created_at desc);
create index if not exists raiox_priority_idx   on public.raiox (priority desc, created_at desc);

-- RLS ligada e sem policy: só a service_role (o endpoint no servidor) entra.
-- A chave anon do navegador não lê nem escreve nada aqui.
alter table public.raiox enable row level security;

create or replace function public.raiox_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists raiox_updated_at on public.raiox;
create trigger raiox_updated_at
  before update on public.raiox
  for each row execute function public.raiox_touch_updated_at();
