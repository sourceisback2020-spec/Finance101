-- Secure hosted bank-feed storage for server-side integrations (Plaid).
-- Run this after hosted_supabase.sql.

create table if not exists public.bank_feed_connections (
  owner_id text not null,
  connection_id text not null,
  provider text not null default 'plaid',
  item_id text not null,
  institution_name text not null default '',
  access_token_cipher text not null,
  access_token_iv text not null,
  sync_cursor text,
  status text not null default 'active',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, connection_id)
);

alter table public.bank_feed_connections
  add column if not exists access_token_cipher text,
  add column if not exists access_token_iv text,
  add column if not exists sync_cursor text,
  add column if not exists status text not null default 'active',
  add column if not exists last_synced_at timestamptz;

create unique index if not exists idx_bank_feed_connections_owner_item
  on public.bank_feed_connections (owner_id, item_id);

create table if not exists public.bank_feed_accounts (
  owner_id text not null,
  connection_id text not null,
  provider_account_id text not null,
  app_account_id text not null,
  name text not null default '',
  mask text,
  account_type text,
  account_subtype text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, connection_id, provider_account_id),
  foreign key (owner_id, connection_id)
    references public.bank_feed_connections (owner_id, connection_id)
    on delete cascade
);

create index if not exists idx_bank_feed_accounts_owner_app
  on public.bank_feed_accounts (owner_id, app_account_id);

create or replace function public.set_updated_at_generic()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bank_feed_connections_updated_at on public.bank_feed_connections;
create trigger trg_bank_feed_connections_updated_at
before update on public.bank_feed_connections
for each row execute function public.set_updated_at_generic();

drop trigger if exists trg_bank_feed_accounts_updated_at on public.bank_feed_accounts;
create trigger trg_bank_feed_accounts_updated_at
before update on public.bank_feed_accounts
for each row execute function public.set_updated_at_generic();

alter table public.bank_feed_connections enable row level security;
alter table public.bank_feed_accounts enable row level security;

drop policy if exists "authenticated_read_own_bank_feed_connections" on public.bank_feed_connections;
drop policy if exists "authenticated_write_own_bank_feed_connections" on public.bank_feed_connections;
drop policy if exists "authenticated_read_own_bank_feed_accounts" on public.bank_feed_accounts;
drop policy if exists "authenticated_write_own_bank_feed_accounts" on public.bank_feed_accounts;

create policy "authenticated_read_own_bank_feed_connections"
on public.bank_feed_connections for select
to authenticated
using (auth.uid()::text = owner_id);

create policy "authenticated_write_own_bank_feed_connections"
on public.bank_feed_connections for all
to authenticated
using (auth.uid()::text = owner_id)
with check (auth.uid()::text = owner_id);

create policy "authenticated_read_own_bank_feed_accounts"
on public.bank_feed_accounts for select
to authenticated
using (auth.uid()::text = owner_id);

create policy "authenticated_write_own_bank_feed_accounts"
on public.bank_feed_accounts for all
to authenticated
using (auth.uid()::text = owner_id)
with check (auth.uid()::text = owner_id);
