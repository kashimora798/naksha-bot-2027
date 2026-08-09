-- ============================================================================
-- user_events: fingerprint-based activity tracking
-- Tracks page views, logins, project creation, map exports, etc.
-- IP is resolved server-side (Vercel edge fn reads x-forwarded-for).
-- Geolocation from ip-api.com (free, server-side).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  fingerprint_id text,
  event_type     text NOT NULL,  -- 'login' | 'page_view' | 'project_created' | 'map_export' | 'session_started' | 'donation_attempted'
  ip_address     text,
  country        text,
  region         text,
  city           text,
  lat            double precision,
  lng            double precision,
  page_path      text,
  metadata       jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_events_user    ON public.user_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_fp      ON public.user_events (fingerprint_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_type    ON public.user_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_created ON public.user_events (created_at DESC);

ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

-- Admins can read all events
DROP POLICY IF EXISTS "user_events_admin_select" ON public.user_events;
CREATE POLICY "user_events_admin_select"
  ON public.user_events FOR SELECT
  USING (public.is_admin());

-- Authenticated users can insert their own events
DROP POLICY IF EXISTS "user_events_insert_own" ON public.user_events;
CREATE POLICY "user_events_insert_own"
  ON public.user_events FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Anon can insert (for pre-login page views)
DROP POLICY IF EXISTS "user_events_insert_anon" ON public.user_events;
CREATE POLICY "user_events_insert_anon"
  ON public.user_events FOR INSERT
  WITH CHECK (user_id IS NULL);
