-- ============================================================================
-- payment_events ledger
-- Records the ACTUAL charged amount at payment confirmation time.
-- This makes revenue correct forever — no hardcoded rate anywhere.
-- source_type: 'map' | 'live_session' | 'donation' | 'upi'
-- source_id: FK to originating row (nullable for manual UPI entries)
-- amount_paise: integer paise to avoid float arithmetic (₹25 = 2500)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payment_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type    text NOT NULL CHECK (source_type IN ('map', 'live_session', 'donation', 'upi')),
  source_id      uuid,
  amount_paise   integer NOT NULL CHECK (amount_paise > 0),
  payment_id     text,
  payment_method text DEFAULT 'cashfree' CHECK (payment_method IN ('cashfree', 'upi', 'other')),
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_source ON public.payment_events (source_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_created ON public.payment_events (created_at DESC);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- Only admins can read; service_role can insert via record_payment_event
DROP POLICY IF EXISTS "payment_events_admin_select" ON public.payment_events;
CREATE POLICY "payment_events_admin_select"
  ON public.payment_events FOR SELECT
  USING (public.is_admin());

-- ─── Server-side insert (called from webhook / edge function) ─────────────────
CREATE OR REPLACE FUNCTION public.record_payment_event(
  p_source_type    text,
  p_source_id      uuid,
  p_amount_paise   integer,
  p_payment_id     text DEFAULT NULL,
  p_payment_method text DEFAULT 'cashfree',
  p_note           text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO payment_events (source_type, source_id, amount_paise, payment_id, payment_method, note)
  VALUES (p_source_type, p_source_id, p_amount_paise, p_payment_id, p_payment_method, p_note)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
-- Only service_role can call this from edge functions / webhooks
REVOKE EXECUTE ON FUNCTION public.record_payment_event(text, uuid, integer, text, text, text) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.record_payment_event(text, uuid, integer, text, text, text) TO service_role;

-- ─── Admin-callable UPI manual log ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_log_upi_payment(
  p_amount_rupees  numeric,
  p_upi_ref        text DEFAULT NULL,
  p_note           text DEFAULT NULL,
  p_source_id      uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO payment_events (source_type, source_id, amount_paise, payment_id, payment_method, note)
  VALUES ('upi', p_source_id, ROUND(p_amount_rupees * 100)::integer, p_upi_ref, 'upi', p_note)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_log_upi_payment(numeric, text, text, uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.admin_log_upi_payment(numeric, text, text, uuid) TO authenticated;

-- ─── Historical backfill ──────────────────────────────────────────────────────
-- Seeds existing paid rows at ₹25 (2500 paise) each as a one-time starting point.
-- Going forward, record_payment_event() should be called with actual order_amount.

INSERT INTO public.payment_events (source_type, source_id, amount_paise, payment_id, payment_method, note, created_at)
SELECT 'map', id, 2500, payment_id, 'cashfree', 'backfill-seed', updated_at
FROM public.projects
WHERE payment_status = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_events pe
    WHERE pe.source_type = 'map' AND pe.source_id = projects.id
  )
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_events (source_type, source_id, amount_paise, payment_id, payment_method, note, created_at)
SELECT 'live_session', session_id, 2500, payment_id, 'cashfree', 'backfill-seed', created_at
FROM public.live_exports
WHERE payment_status = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_events pe
    WHERE pe.source_type = 'live_session' AND pe.source_id = live_exports.session_id
  )
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_events (source_type, source_id, amount_paise, payment_id, payment_method, note, created_at)
SELECT 'donation', id, (amount * 100)::integer, payment_id, 'cashfree', 'backfill-seed', created_at
FROM public.donations
WHERE (is_paid = true OR payment_status = 'paid') AND amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_events pe
    WHERE pe.source_type = 'donation' AND pe.source_id = donations.id
  )
ON CONFLICT DO NOTHING;
