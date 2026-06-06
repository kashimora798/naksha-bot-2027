-- ============================================================================
-- Admin system: is_admin flag on user_profiles, trigger lock, and admin-wide
-- RLS policies so a single admin user can read across all rows.
-- ============================================================================

-- 1) Add is_admin column to user_profiles (default false for all)
alter table public.user_profiles add column if not exists is_admin boolean not null default false;

-- 2) Lock is_admin so clients can never self-promote.
--    Same pattern as guard_projects_payment — SECURITY INVOKER so current_user
--    reflects the PostgREST role, not the function owner.
create or replace function public.guard_user_profiles_admin()
returns trigger
language plpgsql
as $$
begin
  if new.is_admin is distinct from old.is_admin then
    if current_user not in ('service_role', 'postgres', 'supabase_admin') then
      raise exception
        'is_admin is server-controlled and cannot be changed by %', current_user
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_user_profiles_admin on public.user_profiles;
create trigger trg_guard_user_profiles_admin
  before update on public.user_profiles
  for each row execute procedure public.guard_user_profiles_admin();

-- 3) Helper function: is the current caller an admin?
--    Used in RLS policies below.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
as $$
  select coalesce(
    (select is_admin from public.user_profiles where id = auth.uid()),
    false
  );
$$;

-- 4) Admin RLS policies — allow admins to SELECT across ALL rows
--    (admins never need to INSERT/UPDATE/DELETE on behalf of others, only read)

-- user_profiles: admin reads all
drop policy if exists "admin_view_all_profiles" on public.user_profiles;
create policy "admin_view_all_profiles"
  on public.user_profiles
  for select
  using (public.is_admin());

-- projects: admin reads all
drop policy if exists "admin_view_all_projects" on public.projects;
create policy "admin_view_all_projects"
  on public.projects
  for select
  using (public.is_admin());

-- live_exports: admin reads all
drop policy if exists "admin_view_all_live_exports" on public.live_exports;
create policy "admin_view_all_live_exports"
  on public.live_exports
  for select
  using (public.is_admin());

-- feedbacks: admin reads all (and also needs insert for any user)
drop policy if exists "admin_view_all_feedbacks" on public.feedbacks;
create policy "admin_view_all_feedbacks"
  on public.feedbacks
  for select
  using (public.is_admin());

-- 5) To grant admin to your account, run this once in the Supabase SQL editor:
--    UPDATE public.user_profiles SET is_admin = true
--    WHERE id = '<your-auth-user-uuid>';
--    (Only works from the dashboard / service_role, not from the client.)
