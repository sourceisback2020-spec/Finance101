-- Hosted web storage schema for PostgREST/Supabase.
-- This table stores each record as JSON by collection + id.

create table if not exists public.finance_records (
  owner_id text not null,
  collection text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, collection, id)
);

create index if not exists idx_finance_records_owner_collection
  on public.finance_records (owner_id, collection);

-- Keep updated_at current on writes.
create or replace function public.set_finance_records_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_finance_records_updated_at on public.finance_records;
create trigger trg_finance_records_updated_at
before update on public.finance_records
for each row execute function public.set_finance_records_updated_at();

-- RLS policies for authenticated users only.
-- owner_id must be set to auth.uid()::text by the app.
alter table public.finance_records enable row level security;

drop policy if exists "public_read_finance_records" on public.finance_records;
drop policy if exists "public_write_finance_records" on public.finance_records;
drop policy if exists "deny_anon_reads" on public.finance_records;
drop policy if exists "deny_anon_writes" on public.finance_records;

create policy "authenticated_read_own_finance_records"
on public.finance_records for select
to authenticated
using (auth.uid()::text = owner_id);

create policy "authenticated_write_own_finance_records"
on public.finance_records for all
to authenticated
using (auth.uid()::text = owner_id)
with check (auth.uid()::text = owner_id);

