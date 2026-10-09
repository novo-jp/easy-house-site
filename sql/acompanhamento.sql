-- ════════════════════════════════════════════════════════════════════════
-- Acompanhamento do processo de compra (depois da pré-avaliação aprovada)
--
-- Rodar UMA vez no SQL Editor do projeto igtqdhesorahhdyvsjrl
-- (o mesmo de casas_venda_aichi e lead — não o wmoxvdczaahegqxbyoaa).
-- Pode rodar de novo sem estragar nada: tudo é "if not exists".
--
-- Segurança: RLS ligado em todas as tabelas e NENHUMA política criada.
-- Quem lê e grava é só o servidor (api/painel.mjs, com a service key).
-- A chave pública que aparece no front (admin-taxas.html) devolve vazio
-- aqui, igual já acontece com lead e lead_answer.
-- ════════════════════════════════════════════════════════════════════════

-- Quem pode entrar no painel. A senha fica no Supabase Auth (auth.users);
-- aqui fica o nome de usuário que a pessoa digita e o papel dela.
create table if not exists public.acomp_usuario (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  usuario        text not null unique,
  nome           text not null,
  papel          text not null check (papel in ('admin', 'corretor', 'cliente')),
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  ultimo_acesso  timestamptz
);

-- Um processo = um cliente (ou casal) comprando uma casa por um banco.
create table if not exists public.acomp_processo (
  id              uuid primary key default gen_random_uuid(),
  cliente_nome    text not null,
  banco           text not null check (banco in ('flat35', 'rokin', 'docomo', 'aeon')),
  lead_code       text,                 -- EH-XXXXXX do simulador, quando houver
  corretor_id     uuid references auth.users(id) on delete set null,
  casa_titulo     text,
  casa_endereco   text,
  casa_preco_yen  bigint,
  casa_url        text,                 -- link do portal, quando a casa está lá
  casa_foto_path  text,                 -- caminho no bucket privado "acompanhamento"
  extras          jsonb not null default '{}'::jsonb,   -- dados do banco (ex.: usuário do MyPage Rokin)
  arquivado       boolean not null default false,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

-- Quais logins de cliente enxergam qual processo. Tabela à parte porque um
-- casal pode querer dois acessos ao mesmo processo.
create table if not exists public.acomp_processo_cliente (
  processo_id  uuid not null references public.acomp_processo(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  primary key (processo_id, user_id)
);

-- As 7 etapas, copiadas do modelo do banco quando o processo é criado.
-- A ordem muda conforme o banco (no FLAT35 a análise vem antes da compra e
-- venda), por isso cada etapa tem uma chave estável além da posição.
create table if not exists public.acomp_etapa (
  id             uuid primary key default gen_random_uuid(),
  processo_id    uuid not null references public.acomp_processo(id) on delete cascade,
  ordem          int  not null,
  chave          text not null,
  titulo         text not null,
  descricao      text,
  data_prevista  timestamptz,           -- ex.: data e horário da vistoria
  concluida_em   timestamptz,
  unique (processo_id, ordem),
  unique (processo_id, chave)
);

-- Lista de documentos. "grupo" é a chave da etapa a que o documento
-- pertence, ou 'ter_em_maos' (pré-avaliação), ou 'outros' (pedidos pelo
-- banco, sempre presente).
create table if not exists public.acomp_documento (
  id              uuid primary key default gen_random_uuid(),
  processo_id     uuid not null references public.acomp_processo(id) on delete cascade,
  grupo           text not null,
  ordem           int  not null default 0,
  nome            text not null,
  detalhe         text,
  status          text not null default 'pendente'
                  check (status in ('pendente', 'pronto', 'entregue')),
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid references auth.users(id) on delete set null
);

-- Atualizações do corretor. "interna" não aparece para o cliente.
create table if not exists public.acomp_nota (
  id           uuid primary key default gen_random_uuid(),
  processo_id  uuid not null references public.acomp_processo(id) on delete cascade,
  autor_id     uuid references auth.users(id) on delete set null,
  etapa_chave  text,
  texto        text not null,
  interna      boolean not null default false,
  criado_em    timestamptz not null default now()
);

-- Tentativas de login erradas, para travar adivinhação de senha. O limite
-- de taxa do próprio Supabase Auth não serve aqui: todas as tentativas
-- chegam a ele pelo IP do servidor da Vercel, nunca pelo IP de quem digita.
create table if not exists public.acomp_login_falha (
  usuario  text not null,
  em       timestamptz not null default now()
);

create index if not exists acomp_login_falha_idx       on public.acomp_login_falha (usuario, em);
create index if not exists acomp_etapa_processo_idx     on public.acomp_etapa (processo_id, ordem);
create index if not exists acomp_documento_processo_idx on public.acomp_documento (processo_id, grupo, ordem);
create index if not exists acomp_nota_processo_idx      on public.acomp_nota (processo_id, criado_em desc);
create index if not exists acomp_cliente_user_idx       on public.acomp_processo_cliente (user_id);

alter table public.acomp_usuario          enable row level security;
alter table public.acomp_processo         enable row level security;
alter table public.acomp_processo_cliente enable row level security;
alter table public.acomp_etapa            enable row level security;
alter table public.acomp_documento        enable row level security;
alter table public.acomp_nota             enable row level security;
alter table public.acomp_login_falha      enable row level security;

-- WhatsApp do consultor, mostrado ao cliente ("Consultor: ___ WhatsApp: ___"
-- do material impresso). Em ALTER à parte para funcionar também se a tabela
-- já tiver sido criada por uma versão anterior deste arquivo.
alter table public.acomp_usuario add column if not exists whatsapp text;
