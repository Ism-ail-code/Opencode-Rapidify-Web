-- Tighten webhook_events RLS: rows whose merchant could not be resolved
-- (merchant_id IS NULL) are internal audit data — do not expose them to every
-- authenticated user. Only the service role (server-side) may read them.

DROP POLICY IF EXISTS "webhook_events tenant read" ON public.webhook_events;

CREATE POLICY "webhook_events tenant read"
  ON public.webhook_events FOR SELECT
  TO authenticated
  USING (merchant_id IS NOT NULL AND is_merchant_member(merchant_id, auth.uid()));
