-- ============================================================================
-- AI image generation: history table + server-controlled regeneration counters.
--
-- Model (per product decision): paying ₹25 unlocks the map AND grants 5 AI
-- (re)generations. Each extra ₹25 grants 5 more. Before payment, 1 free preview
-- generation. Generated images are stored in Supabase Storage (losslessly
-- compressed) and recorded here so the AI API is never hit twice for the same
-- result (cache) and the user can pick which generation goes into the PDF.
--
-- Like payment_status, the regen counters are SERVER-CONTROLLED: only the service
-- role (generate-map endpoint / webhook) may change them. Clients can't grant
-- themselves regenerations. Idempotent + safe to re-run.
-- ============================================================================

-- 1) Regen counters on projects.
alter table public.projects add column if not exists regen_allowance int not null default 1;  -- 1 free preview pre-payment
alter table public.projects add column if not exists regen_used      int not null default 0;

-- 2) Extend the payment guard to also protect the regen counters.
--    (Replaces guard_projects_payment from 20260601; keeps the same trigger name.)
create or replace function public.guard_projects_payment()
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

drop trigger if exists trg_guard_projects_payment on public.projects;
create trigger trg_guard_projects_payment
  before update on public.projects
  for each row execute procedure public.guard_projects_payment();

-- 3) History of generated images (one row per generation; cached in R2).
create table if not exists public.image_generations (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  prompt_key  text,                 -- predefined prompt id, or 'custom'
  prompt      text,                 -- the full prompt used
  image_url   text not null,        -- Supabase Storage public URL
  selected    boolean not null default false,  -- which one goes into the PDF
  created_at  timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists idx_image_generations_project on public.image_generations (project_id, created_at desc);

alter table public.image_generations enable row level security;

-- Owners can read their history and toggle which image is selected. Inserts are
-- done by the server (service role) only — generation is never client-trusted.
drop policy if exists "image_generations_select_own" on public.image_generations;
create policy "image_generations_select_own" on public.image_generations
  for select using (auth.uid() = user_id);

drop policy if exists "image_generations_update_own" on public.image_generations;
create policy "image_generations_update_own" on public.image_generations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4) Server-only counters. SECURITY DEFINER → run as owner (postgres), so they pass
--    the guard trigger; EXECUTE is revoked from clients so only the service role
--    (our endpoints/webhook) can call them. A client cannot grant itself regens.
create or replace function public.increment_regen_used(proj_id uuid)
returns int language plpgsql security definer as $$
declare v int;
begin
  update public.projects set regen_used = regen_used + 1 where id = proj_id
    returning regen_used into v;
  return v;
end;
$$;

create or replace function public.grant_regen_allowance(proj_id uuid, n int)
returns int language plpgsql security definer as $$
declare v int;
begin
  update public.projects set regen_allowance = regen_allowance + n where id = proj_id
    returning regen_allowance into v;
  return v;
end;
$$;

revoke execute on function public.increment_regen_used(uuid) from public, anon, authenticated;
revoke execute on function public.grant_regen_allowance(uuid, int) from public, anon, authenticated;
grant execute on function public.increment_regen_used(uuid) to service_role;
grant execute on function public.grant_regen_allowance(uuid, int) to service_role;
