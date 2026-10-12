-- ════════════════════════════════════════════════════════════════════════
-- Agenda própria da equipe (Alan, Luciana…) no painel de acompanhamento
--
-- Rodar UMA vez no SQL Editor do projeto igtqdhesorahhdyvsjrl, depois de
-- acompanhamento.sql. Pode rodar de novo sem estragar nada.
--
-- Compromissos que não são de nenhum cliente: reunião, visita a imobiliária,
-- curso. Aparecem só na agenda da tela de processos — cliente nenhum vê.
-- Mesma regra das outras acomp_*: RLS ligado e nenhuma política; quem lê e
-- grava é só api/painel.mjs, com a service key.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.acomp_evento_equipe (
  id          uuid primary key default gen_random_uuid(),
  dono_id     uuid not null references public.acomp_usuario(user_id) on delete cascade,
  titulo      text not null check (char_length(titulo) between 1 and 120),
  data        timestamptz not null,
  criado_por  text,
  criado_em   timestamptz not null default now()
);

create index if not exists acomp_evento_equipe_data_idx on public.acomp_evento_equipe (data);

alter table public.acomp_evento_equipe enable row level security;
