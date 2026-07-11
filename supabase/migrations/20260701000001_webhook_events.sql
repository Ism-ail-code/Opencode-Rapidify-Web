-- ============================================================================
-- Feature 2: Webhook Events Log — durable record of incoming vendor webhooks
-- ============================================================================
-- Every incoming webhook from Shopify / Amazon / Daraz is logged here so we
-- can replay, audit, and debug synchronisation issues.
-- ============================================================================

CREATE TABLE public.webhook_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   uuid REFERENCES public.merchants(id) ON DELETE CASCADE,
  platform      text NOT NULL CHECK (platform IN ('shopify', 'amazon', 'daraz')),
  event_type    text NOT NULL DEFAULT 'unknown',
  topic         text DEFAULT '',               -- e.g. "products/create"
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  headers       jsonb DEFAULT '{}'::jsonb,
  signature     text DEFAULT '',
  verified      boolean NOT NULL DEFAULT false,
  processed     boolean NOT NULL DEFAULT false,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.webhook_events IS 'Durable log of incoming vendor webhooks for auditing and replay.';
COMMENT ON COLUMN public.webhook_events.verified IS 'TRUE when HMAC signature was validated successfully.';
COMMENT ON COLUMN public.webhook_events.processed IS 'TRUE after the handler finished (success or permanent failure).';

CREATE INDEX idx_webhook_events_merchant   ON webhook_events(merchant_id, created_at DESC);
CREATE INDEX idx_webhook_events_platform   ON webhook_events(platform, created_at DESC);
CREATE INDEX idx_webhook_events_unprocessed ON webhook_events(processed, created_at) WHERE processed = false;

-- RLS: merchants and members can view their own webhook events
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_events tenant read"
  ON webhook_events FOR SELECT
  TO authenticated
  USING (merchant_id IS NULL OR is_merchant_member(merchant_id, auth.uid()));

-- Service role can write (webhooks arrive server-side before auth context is resolved)
CREATE POLICY "webhook_events service all"
  ON webhook_events FOR ALL
  TO service_role
  USING (true);

GRANT SELECT ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;
