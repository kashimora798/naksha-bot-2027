-- ============================================================================
-- Live Mode AI map generation: table structures + server-controlled regen counters.
-- ============================================================================

-- 1) Ensure live_exports has regen allowance columns (safe to run)
alter table public.live_exports add column if not exists regen_allowance int not null default 1; -- 1 free preview pre-payment
alter table public.live_exports add column if not exists regen_used      int not null default 0;
alter table public.live_exports add column if not exists payment_id      text;
alter table public.live_exports add column if not exists payment_status  text not null default 'unpaid';

-- 2) History of generated images for live mode sessions (one row per generation)
create table if not exists public.live_image_generations (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null,              -- matches live_exports.session_id
  user_id     uuid not null references auth.users(id) on delete cascade,
  prompt_key  text,                       -- predefined prompt id, or 'custom'
  prompt      text,                       -- the full prompt used
  image_url   text not null,              -- Supabase Storage public URL
  selected    boolean not null default false, -- which one goes into the PDF
  created_at  timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists idx_live_image_generations_session on public.live_image_generations (session_id, created_at desc);

-- 3) Enable RLS for live_image_generations
alter table public.live_image_generations enable row level security;

drop policy if exists "live_image_generations_select_own" on public.live_image_generations;
create policy "live_image_generations_select_own" on public.live_image_generations
  for select using (auth.uid() = user_id);

drop policy if exists "live_image_generations_update_own" on public.live_image_generations;
create policy "live_image_generations_update_own" on public.live_image_generations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4) Column guard for live_exports (only service_role may modify payments and counters)
create or replace function public.guard_live_exports_payment()
returns trigger
language plpgsql
as $$
begin
  if (new.payment_status  is distinct from old.payment_status)
     or (new.payment_id    is distinct from old.payment_id)
     or (new.regen_allowance is distinct from old.regen_allowance)
     or (new.regen_used      is distinct from old.regen_used) then
    if current_user not in ('service_role', 'postgres', 'supabase_admin') then
      raise exception
        'payment/regen fields are server-controlled and cannot be changed by %', current_user
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_live_exports_payment on public.live_exports;
create trigger trg_guard_live_exports_payment
  before update on public.live_exports
  for each row execute procedure public.guard_live_exports_payment();

-- 5) Server-only RPC counters for live exports
create or replace function public.increment_live_regen_used(sess_id uuid)
returns int language plpgsql security definer as $$
declare v int;
begin
  update public.live_exports set regen_used = regen_used + 1 where session_id = sess_id
    returning regen_used into v;
  return v;
end;
$$;

create or replace function public.grant_live_regen_allowance(sess_id uuid, n int)
returns int language plpgsql security definer as $$
declare v int;
begin
  update public.live_exports set regen_allowance = regen_allowance + n where session_id = sess_id
    returning regen_allowance into v;
  return v;
end;
$$;

revoke execute on function public.increment_live_regen_used(uuid) from public, anon, authenticated;
revoke execute on function public.grant_live_regen_allowance(uuid, int) from public, anon, authenticated;
grant execute on function public.increment_live_regen_used(uuid) to service_role;
grant execute on function public.grant_live_regen_allowance(uuid, int) to service_role;
