-- ============================================================================
-- admin_dashboard_stats(p_days int, p_tz text)
-- Single Postgres RPC → one round trip, all dashboard data, correct timezone.
-- SECURITY DEFINER so it bypasses RLS on reads; is_admin() guard inside.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats(
  p_days int     DEFAULT 30,
  p_tz   text    DEFAULT 'Asia/Kolkata'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_users       bigint := 0;
  v_paid_or_donated   bigint := 0;
  v_active_this_week  bigint := 0;
  v_total_revenue     bigint := 0;
  v_onboarding        bigint := 0;
  v_first_map         bigint := 0;
BEGIN
  -- ── Admin gate ────────────────────────────────────────────────────────────
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Scalar KPIs ───────────────────────────────────────────────────────────
  SELECT COUNT(*)             INTO v_total_users  FROM user_profiles;
  SELECT COUNT(*)             INTO v_onboarding   FROM user_profiles WHERE onboarding_completed = true;
  SELECT COUNT(DISTINCT user_id) INTO v_first_map FROM projects WHERE user_id IS NOT NULL;
  SELECT COALESCE(SUM(amount_paise), 0) INTO v_total_revenue FROM payment_events;

  -- Active this week: any project updated OR profile updated OR user_events row (fallback-safe)
  SELECT COUNT(DISTINCT uid) INTO v_active_this_week FROM (
    SELECT user_id::text AS uid FROM projects WHERE updated_at >= NOW() - INTERVAL '7 days' AND user_id IS NOT NULL
    UNION ALL
    SELECT id::text      AS uid FROM user_profiles WHERE updated_at >= NOW() - INTERVAL '7 days'
    UNION ALL
    SELECT user_id::text AS uid FROM user_events WHERE created_at >= NOW() - INTERVAL '7 days' AND user_id IS NOT NULL
  ) act;

  -- Paid or donated users
  SELECT COUNT(DISTINCT uid) INTO v_paid_or_donated FROM (
    SELECT user_id::text AS uid FROM projects     WHERE payment_status = 'paid'                          AND user_id IS NOT NULL
    UNION ALL
    SELECT user_id::text AS uid FROM live_exports WHERE payment_status = 'paid'                          AND user_id IS NOT NULL
    UNION ALL
    SELECT user_id::text AS uid FROM donations    WHERE (is_paid = true OR payment_status = 'paid')      AND user_id IS NOT NULL
  ) pu;

  RETURN jsonb_build_object(

    -- ── KPIs ─────────────────────────────────────────────────────────────────
    'kpis', jsonb_build_object(
      'total_users',         v_total_users,
      'paid_conversion_pct', CASE WHEN v_total_users > 0
        THEN ROUND((v_paid_or_donated::numeric / v_total_users) * 100, 1) ELSE 0 END,
      'total_revenue_paise', v_total_revenue,
      'active_this_week',    v_active_this_week
    ),

    -- ── Timeline (daily, IST-bucketed) ────────────────────────────────────────
    'timeline', COALESCE((
      SELECT jsonb_agg(row_j ORDER BY day_ts)
      FROM (
        SELECT
          d.day_ts,
          jsonb_build_object(
            'day',           to_char(d.day_ts, 'YYYY-MM-DD'),
            'new_users',     COALESCE(u.cnt, 0),
            'new_projects',  COALESCE(pr.cnt, 0),
            'revenue_paise', COALESCE(rev.amt, 0)
          ) AS row_j
        FROM (
          SELECT generate_series(
            date_trunc('day', (NOW() AT TIME ZONE p_tz)) - ((p_days - 1) || ' days')::interval,
            date_trunc('day', (NOW() AT TIME ZONE p_tz)),
            '1 day'::interval
          ) AS day_ts
        ) d
        LEFT JOIN (
          SELECT date_trunc('day', created_at AT TIME ZONE p_tz) AS day_ts, COUNT(*) AS cnt
          FROM user_profiles WHERE created_at >= NOW() - (p_days || ' days')::interval
          GROUP BY 1
        ) u  ON u.day_ts = d.day_ts
        LEFT JOIN (
          SELECT date_trunc('day', created_at AT TIME ZONE p_tz) AS day_ts, COUNT(*) AS cnt
          FROM projects    WHERE created_at >= NOW() - (p_days || ' days')::interval
          GROUP BY 1
        ) pr ON pr.day_ts = d.day_ts
        LEFT JOIN (
          SELECT date_trunc('day', created_at AT TIME ZONE p_tz) AS day_ts, SUM(amount_paise) AS amt
          FROM payment_events WHERE created_at >= NOW() - (p_days || ' days')::interval
          GROUP BY 1
        ) rev ON rev.day_ts = d.day_ts
      ) tl
    ), '[]'::jsonb),

    -- ── Conversion funnel ─────────────────────────────────────────────────────
    'funnel', jsonb_build_object(
      'signups',         v_total_users,
      'onboarding_done', v_onboarding,
      'first_map',       v_first_map,
      'paid_or_donated', v_paid_or_donated
    ),

    -- ── Revenue breakdown ─────────────────────────────────────────────────────
    'revenue_breakdown', (
      SELECT jsonb_build_object(
        'maps_paise',      COALESCE(SUM(amount_paise) FILTER (WHERE source_type = 'map'),          0),
        'sessions_paise',  COALESCE(SUM(amount_paise) FILTER (WHERE source_type = 'live_session'), 0),
        'donations_paise', COALESCE(SUM(amount_paise) FILTER (WHERE source_type = 'donation'),     0),
        'upi_paise',       COALESCE(SUM(amount_paise) FILTER (WHERE source_type = 'upi'),          0)
      ) FROM payment_events
    ),

    -- ── Cohort retention (D1 / D7 / D30) ─────────────────────────────────────
    -- Uses user_events to detect return visits. Graceful: if no user_events yet,
    -- falls back to project/profile update activity as a proxy.
    'cohort_retention', (
      WITH activity AS (
        SELECT user_id::text AS user_id, created_at AS ts FROM user_events WHERE user_id IS NOT NULL
        UNION ALL
        SELECT user_id::text AS user_id, updated_at AS ts FROM projects WHERE user_id IS NOT NULL
        UNION ALL
        SELECT id::text      AS user_id, updated_at AS ts FROM user_profiles
      ),
      cohort AS (
        SELECT
          up.id,
          up.created_at AS signup_ts,
          BOOL_OR(a.ts >= up.created_at + INTERVAL '20 hours'  AND a.ts < up.created_at + INTERVAL '48 hours') AS ret_d1,
          BOOL_OR(a.ts >= up.created_at + INTERVAL '6 days'    AND a.ts < up.created_at + INTERVAL '8 days')   AS ret_d7,
          BOOL_OR(a.ts >= up.created_at + INTERVAL '28 days'   AND a.ts < up.created_at + INTERVAL '32 days')  AS ret_d30
        FROM user_profiles up
        LEFT JOIN activity a ON a.user_id = up.id::text
        GROUP BY up.id, up.created_at
      )
      SELECT jsonb_build_object(
        'd1_pct',  CASE WHEN COUNT(*) FILTER (WHERE signup_ts <= NOW() - INTERVAL '1 day')  > 0 THEN
          ROUND(COUNT(*) FILTER (WHERE ret_d1  AND signup_ts <= NOW() - INTERVAL '1 day' )::numeric /
                COUNT(*) FILTER (WHERE          signup_ts <= NOW() - INTERVAL '1 day' ) * 100, 1) ELSE 0 END,
        'd7_pct',  CASE WHEN COUNT(*) FILTER (WHERE signup_ts <= NOW() - INTERVAL '7 days') > 0 THEN
          ROUND(COUNT(*) FILTER (WHERE ret_d7  AND signup_ts <= NOW() - INTERVAL '7 days')::numeric /
                COUNT(*) FILTER (WHERE          signup_ts <= NOW() - INTERVAL '7 days') * 100, 1) ELSE 0 END,
        'd30_pct', CASE WHEN COUNT(*) FILTER (WHERE signup_ts <= NOW() - INTERVAL '30 days') > 0 THEN
          ROUND(COUNT(*) FILTER (WHERE ret_d30 AND signup_ts <= NOW() - INTERVAL '30 days')::numeric /
                COUNT(*) FILTER (WHERE          signup_ts <= NOW() - INTERVAL '30 days') * 100, 1) ELSE 0 END
      ) FROM cohort
    ),

    -- ── Geographic distribution (top 50 tehsil+village combos) ───────────────
    'geo', COALESCE((
      SELECT jsonb_agg(g ORDER BY g->>'user_count' DESC)
      FROM (
        SELECT jsonb_build_object(
          'tehsil',      COALESCE(tehsil, 'Unknown'),
          'town_village',COALESCE(town_village, 'Unknown'),
          'user_count',  COUNT(*),
          'pct',         ROUND(COUNT(*)::numeric / NULLIF(v_total_users, 0) * 100, 1)
        )
        FROM user_profiles
        GROUP BY COALESCE(tehsil,'Unknown'), COALESCE(town_village,'Unknown')
        ORDER BY COUNT(*) DESC
        LIMIT 50
      ) geo_sub(g)
    ), '[]'::jsonb),

    -- ── Live session funnel ───────────────────────────────────────────────────
    'live_funnel', (
      SELECT jsonb_build_object(
        'started',    COUNT(*),
        'regen_used', COUNT(*) FILTER (WHERE regen_used > 0),
        'paid',       COUNT(*) FILTER (WHERE payment_status = 'paid')
      ) FROM live_exports
    )

  );
END;
$$;

-- Authenticated users (admin-gated inside the function) can call it
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats(int, text) TO authenticated;
