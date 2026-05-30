-- Create user_profiles table
-- This table stores extended profile information for authenticated users,
-- including onboarding status and default survey location.

create table if not exists public.user_profiles (
  id uuid references auth.users on delete cascade not null primary key,
  full_name text,
  profession text,
  mobile text,
  hlb_number text,
  hlb_lat double precision,
  hlb_lng double precision,
  hlb_address text,
  is_mobile_verified boolean default false,
  onboarding_completed boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.user_profiles enable row level security;

-- RLS Policies: users can only read/write their own profile
create policy "Users can view their own profile"
  on public.user_profiles
  for select
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.user_profiles
  for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.user_profiles
  for update
  using (auth.uid() = id);

-- Trigger to auto-create user_profiles row on signup
create or replace function public.handle_new_user_profile()
returns trigger as $$
begin
  insert into public.user_profiles (id, full_name, created_at, updated_at)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    now(),
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Attach trigger to auth.users
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_user_profile();

-- Index for faster lookups
create index if not exists user_profiles_onboarding_completed_idx
  on public.user_profiles(onboarding_completed);
