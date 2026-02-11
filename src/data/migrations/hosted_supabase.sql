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

-- RLS policy for a single-user personal deployment.
-- For production multi-user auth, replace this with auth.uid()-based policies.
alter table public.finance_records enable row level security;

drop policy if exists "public_read_finance_records" on public.finance_records;
create policy "public_read_finance_records"
on public.finance_records for select
to anon
using (true);

drop policy if exists "public_write_finance_records" on public.finance_records;
create policy "public_write_finance_records"
on public.finance_records for all
to anon
using (true)
with check (true);

