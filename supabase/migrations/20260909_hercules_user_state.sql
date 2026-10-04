-- Hercules Hub v0.14.0 — optional Supabase persistence layer.
-- Idempotent. Safe to rerun.
create table if not exists public.hercules_user_state (
  owner_key text primary key,
  profile jsonb,
  plan jsonb,
  state jsonb not null default '{}'::jsonb,
  chat jsonb not null default '[]'::jsonb,
  cycle_number integer not null default 1 check (cycle_number > 0),
  updated_at timestamptz not null default now()
);

alter table public.hercules_user_state enable row level security;

-- Future direct authenticated-client access can use the auth user UUID as owner_key.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='hercules_user_state' and policyname='hercules_state_select_own') then
    create policy hercules_state_select_own on public.hercules_user_state for select to authenticated using (owner_key = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='hercules_user_state' and policyname='hercules_state_insert_own') then
    create policy hercules_state_insert_own on public.hercules_user_state for insert to authenticated with check (owner_key = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='hercules_user_state' and policyname='hercules_state_update_own') then
    create policy hercules_state_update_own on public.hercules_user_state for update to authenticated using (owner_key = auth.uid()::text) with check (owner_key = auth.uid()::text);
  end if;
end $$;

revoke all on table public.hercules_user_state from anon;
grant select, insert, update, delete on table public.hercules_user_state to authenticated;
-- Netlify server uses SUPABASE_SECRET_KEY/SERVICE_ROLE server-side only; service_role bypasses RLS.
