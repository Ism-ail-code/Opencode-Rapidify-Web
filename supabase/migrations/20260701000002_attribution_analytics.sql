-- ============================================================================
-- Feature 3: Revenue Attribution Analytics
-- ============================================================================
-- Tracks AR → purchase funnel with session-based attribution so we can
-- measure exactly how much revenue AR experiences influence.
-- ============================================================================

-- -------------------------------------------------------------------------
-- 1.  Add new event types to the analytics_events constraint.
--     The existing table is unconstrained on event_type text, so we just
--     add an index for the new attribution queries.
-- -------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_session
  ON analytics_events(event_type, session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created
  ON analytics_events(event_type, created_at DESC);

-- -------------------------------------------------------------------------
-- 2.  Materialised session-attribution table
--     Pre-computed per-session: did the user launch AR? did they purchase?
--     This makes the dashboard queries fast even at scale.
-- -------------------------------------------------------------------------
CREATE TABLE public.attribution_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      text NOT NULL,
  merchant_id     uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  product_id      uuid REFERENCES public.products(id) ON DELETE SET NULL,

  -- Funnel flags
  had_page_view   boolean NOT NULL DEFAULT false,
  had_ar_widget   boolean NOT NULL DEFAULT false,
  had_ar_launch   boolean NOT NULL DEFAULT false,
  had_add_to_cart boolean NOT NULL DEFAULT false,
  had_purchase    boolean NOT NULL DEFAULT false,

  -- Revenue (in cents, from purchase_completed events)
  revenue_cents   integer NOT NULL DEFAULT 0,

  -- AR session duration (seconds)
  ar_session_duration_seconds integer DEFAULT 0,

  -- First and last event timestamps
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_attribution_session ON attribution_sessions(session_id, merchant_id);
CREATE INDEX idx_attribution_merchant ON attribution_sessions(merchant_id, last_seen_at DESC);

-- RLS: merchants and members can view their own attribution data
ALTER TABLE public.attribution_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attribution tenant read"
  ON attribution_sessions FOR SELECT
  TO authenticated
  USING (is_merchant_member(merchant_id, auth.uid()));

-- Service role can manage all
CREATE POLICY "attribution service all"
  ON attribution_sessions FOR ALL
  TO service_role
  USING (true);

GRANT SELECT ON public.attribution_sessions TO authenticated;
GRANT ALL ON public.attribution_sessions TO service_role;

-- -------------------------------------------------------------------------
-- 3.  Function: upsert attribution session (called by collectEvents)
--     Merges event data into session rows for fast aggregate queries.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_attribution_session(
  _session_id         text,
  _merchant_id        uuid,
  _product_id         uuid DEFAULT NULL,
  _event_type         text DEFAULT NULL,
  _has_page_view      boolean DEFAULT false,
  _has_ar_widget      boolean DEFAULT false,
  _has_ar_launch      boolean DEFAULT false,
  _has_add_to_cart    boolean DEFAULT false,
  _has_purchase       boolean DEFAULT false,
  _revenue_cents      integer DEFAULT 0,
  _ar_session_seconds integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO attribution_sessions (
    session_id, merchant_id, product_id,
    had_page_view, had_ar_widget, had_ar_launch,
    had_add_to_cart, had_purchase,
    revenue_cents, ar_session_duration_seconds,
    first_seen_at, last_seen_at
  ) VALUES (
    _session_id, _merchant_id, _product_id,
    _has_page_view, _has_ar_widget, _has_ar_launch,
    _has_add_to_cart, _has_purchase,
    _revenue_cents, _ar_session_seconds,
    now(), now()
  )
  ON CONFLICT (session_id, merchant_id) DO UPDATE SET
    had_page_view   = attribution_sessions.had_page_view   OR _has_page_view,
    had_ar_widget   = attribution_sessions.had_ar_widget   OR _has_ar_widget,
    had_ar_launch   = attribution_sessions.had_ar_launch   OR _has_ar_launch,
    had_add_to_cart = attribution_sessions.had_add_to_cart OR _has_add_to_cart,
    had_purchase    = attribution_sessions.had_purchase    OR _has_purchase,
    revenue_cents   = attribution_sessions.revenue_cents   + _revenue_cents,
    ar_session_duration_seconds = CASE
      WHEN _ar_session_seconds > 0 THEN _ar_session_seconds
      ELSE attribution_sessions.ar_session_duration_seconds
    END,
    last_seen_at    = now(),
    product_id      = COALESCE(_product_id, attribution_sessions.product_id);
END;
$$;

-- -------------------------------------------------------------------------
-- 4.  Trigger: automatically update attribution_sessions when an event
--     is inserted into analytics_events with a session_id.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_event_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _revenue integer := 0;
  _ar_seconds integer := 0;
BEGIN
  -- Extract revenue from purchase_completed metadata
  IF NEW.event_type = 'purchase_completed' AND NEW.metadata ? 'revenue_cents' THEN
    _revenue := (NEW.metadata->>'revenue_cents')::integer;
  END IF;

  -- Extract AR session duration from ar_session_end metadata
  IF NEW.event_type = 'ar_session_end' AND NEW.metadata ? 'duration_seconds' THEN
    _ar_seconds := (NEW.metadata->>'duration_seconds')::integer;
  END IF;

  PERFORM public.upsert_attribution_session(
    _session_id    := NEW.session_id,
    _merchant_id   := NEW.merchant_id,
    _product_id    := NEW.product_id,
    _event_type    := NEW.event_type,
    _has_page_view      := NEW.event_type = 'page_view',
    _has_ar_widget      := NEW.event_type = 'ar_widget_visible',
    _has_ar_launch      := NEW.event_type = 'ar_launch',
    _has_add_to_cart    := NEW.event_type = 'add_to_cart',
    _has_purchase       := NEW.event_type = 'purchase_completed',
    _revenue_cents      := _revenue,
    _ar_session_seconds := _ar_seconds
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_event_insert_attribution
  AFTER INSERT ON public.analytics_events
  FOR EACH ROW
  WHEN (NEW.session_id IS NOT NULL AND NEW.merchant_id IS NOT NULL)
  EXECUTE FUNCTION public.handle_event_attribution();

-- -------------------------------------------------------------------------
-- 5.  Backfill existing analytics_events into attribution_sessions
--     (safe to run on empty tables — no-op if no data yet)
-- -------------------------------------------------------------------------
INSERT INTO attribution_sessions (
  session_id, merchant_id, product_id,
  had_page_view, had_ar_widget, had_ar_launch,
  had_add_to_cart, had_purchase,
  first_seen_at, last_seen_at
)
SELECT
  ae.session_id,
  ae.merchant_id,
  ae.product_id,
  bool_or(ae.event_type = 'page_view'),
  bool_or(ae.event_type = 'ar_widget_visible'),
  bool_or(ae.event_type = 'ar_launch'),
  bool_or(ae.event_type = 'add_to_cart'),
  bool_or(ae.event_type = 'purchase_completed'),
  min(ae.created_at),
  max(ae.created_at)
FROM analytics_events ae
WHERE ae.session_id IS NOT NULL
  AND ae.merchant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM attribution_sessions a2
    WHERE a2.session_id = ae.session_id AND a2.merchant_id = ae.merchant_id
  )
GROUP BY ae.session_id, ae.merchant_id, ae.product_id
ON CONFLICT (session_id, merchant_id) DO NOTHING;
