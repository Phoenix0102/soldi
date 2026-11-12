-- Regole con azione: categoria, giroconto o rata verso un conto debito
alter table public.rules
  add column if not exists action text not null default 'category' check (action in ('category','transfer','debt')),
  add column if not exists target_account_id uuid references public.accounts(id) on delete cascade;
