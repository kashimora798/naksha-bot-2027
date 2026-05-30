-- ============================================================================
-- Profile system: ensure user_profiles has every editable column + auto-touch
-- of updated_at. Idempotent — safe to run on a fresh or existing database,
-- and safe to re-run. Run this AFTER 20260529_create_user_profiles.sql (or on
-- its own; it will create the table if missing).
-- ============================================================================

-- 1) Table (no-op if it already exists)
create table if not exists public.user_profiles (
  id uuid references auth.users on delete cascade not null primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2) All editable columns (idempotent)
alter table public.user_profiles add column if not exists full_name text;
alter table public.user_profiles add column if not exists profession text;
alter table public.user_profiles add column if not exists mobile text;
alter table public.user_profiles add column if not exists hlb_number text;
alter table public.user_profiles add column if not exists hlb_lat double precision;
alter table public.user_profiles add column if not exists hlb_lng double precision;
alter table public.user_profiles add column if not exists hlb_address text;
alter table public.user_profiles add column if not exists tehsil text;
alter table public.user_profiles add column if not exists town_village text;
alter table public.user_profiles add column if not exists ward_no text;
alter table public.user_profiles add column if not exists eb_no text;
alter table public.user_profiles add column if not exists supervisor_name text;
alter table public.user_profiles add column if not exists is_mobile_verified boolean default false;
alter table public.user_profiles add column if not exists onboarding_completed boolean default false;

-- 3) Row Level Security + policies (drop-then-create so re-runs don't error)
alter table public.user_profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.user_profiles;
create policy "Users can view their own profile"
  on public.user_profiles for select using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.user_profiles;
create policy "Users can insert their own profile"
  on public.user_profiles for insert with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.user_profiles;
create policy "Users can update their own profile"
  on public.user_profiles for update using (auth.uid() = id);

-- 4) Keep updated_at fresh on every UPDATE
create or replace function public.touch_user_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_user_profiles on public.user_profiles;
create trigger trg_touch_user_profiles
  before update on public.user_profiles
  for each row execute procedure public.touch_user_profiles_updated_at();

-- 5) Auto-create a profile row when a new auth user signs up (no-op if present)
create or replace function public.handle_new_user_profile()
returns trigger as $$
begin
  insert into public.user_profiles (id, full_name, created_at, updated_at)
  values (new.id, new.raw_user_meta_data->>'full_name', now(), now())
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_user_profile();
