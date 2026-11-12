-- Obiettivi collegati ai movimenti, valuta originale, tipi di budget, categorie detraibili (730)
alter table public.transactions
  add column if not exists goal_id uuid references public.goals(id) on delete set null,
  add column if not exists original_amount numeric,
  add column if not exists original_currency text;
alter table public.budgets
  add column if not exists kind text not null default 'fixed' check (kind in ('fixed','flex','annual'));
alter table public.categories
  add column if not exists deductible boolean not null default false;
create index if not exists transactions_goal_idx on public.transactions(goal_id) where goal_id is not null;
