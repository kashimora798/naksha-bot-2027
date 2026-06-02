-- ============================================================================
-- Lock down projects.payment_status so a CLIENT can never mark itself "paid".
--
-- Why: the old policy "Users can manage their own projects" was `FOR ALL`, which
-- let an authenticated user UPDATE *any* column — including payment_status — via
-- the supabase-js client. Combined with the client writing payment_status='paid'
-- on the ?payment=success return URL, anyone could self-unlock for free.
--
-- Fix: keep full owner access for normal columns, but a BEFORE UPDATE trigger
-- rejects any change to payment fields unless the caller is the service role
-- (i.e. our Cashfree webhook / server). Idempotent + safe to re-run.
-- ============================================================================

-- 1) Replace the blanket FOR ALL policy with explicit per-command policies.
--    (Behaviour is the same for owners; we just want UPDATE separated so the
--     column guard below is the only thing protecting payment fields.)
drop policy if exists "Users can manage their own projects" on public.projects;

drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own" on public.projects
  for select using (auth.uid() = user_id);

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own" on public.projects
  for insert with check (auth.uid() = user_id);

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own" on public.projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own" on public.projects
  for delete using (auth.uid() = user_id);

-- 2) Column guard: only the server (service_role) may change payment fields.
--    SECURITY INVOKER (the default) is REQUIRED here — we read current_user to
--    learn the caller's role, which PostgREST sets via SET LOCAL ROLE. A
--    SECURITY DEFINER function would report the owner role instead and defeat it.
create or replace function public.guard_projects_payment()
returns trigger
language plpgsql
as $$
begin
  if (new.payment_status is distinct from old.payment_status)
     or (new.payment_id is distinct from old.payment_id) then
    -- service_role = our edge functions; postgres/supabase_admin = migrations/dashboard.
    if current_user not in ('service_role', 'postgres', 'supabase_admin') then
      raise exception
        'payment fields are server-controlled and cannot be changed by % ', current_user
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_projects_payment on public.projects;
create trigger trg_guard_projects_payment
  before update on public.projects
  for each row execute procedure public.guard_projects_payment();

-- 3) Webhook looks projects up by payment_id (the Cashfree order id) — index it.
create index if not exists idx_projects_payment_id on public.projects (payment_id);
