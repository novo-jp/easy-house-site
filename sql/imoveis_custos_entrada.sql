-- ============================================================
-- EASY HOUSE — Aluguel: campos que faltavam para calcular a entrada
-- Executar no SQL Editor do Supabase. Pode reexecutar sem risco.
--
-- Por que: a "entrada estimada" mostrada no site ignorava 敷金 e 礼金.
-- O portal informa esses valores em MESES de aluguel (ex.: 2 = dois
-- meses); o scraper já converte para ienes antes de gravar.
--
-- O campo de pet vem da página de detalhe de cada imóvel, que é lenta
-- de abrir. Guardamos a data da última verificação para conferir os
-- imóveis aos poucos, sem repetir o que já foi visto.
-- ============================================================

alter table imoveis_aichi
  add column if not exists deposito          integer     default 0,
  add column if not exists luva              integer     default 0,
  add column if not exists pet_verificado_em timestamptz;

comment on column imoveis_aichi.deposito is
  '敷金 em ienes. Convertido de meses de aluguel pelo scraper.';
comment on column imoveis_aichi.luva is
  '礼金 em ienes. Convertido de meses de aluguel pelo scraper.';
comment on column imoveis_aichi.pet_verificado_em is
  'Quando a página de detalhe foi lida para saber se aceita pet. Nulo = ainda não verificado.';

-- Fila da verificação de pet: os mais novos primeiro.
create index if not exists imoveis_aichi_pet_pendente_idx
  on imoveis_aichi (pet_verificado_em nulls first, updated_at desc);
