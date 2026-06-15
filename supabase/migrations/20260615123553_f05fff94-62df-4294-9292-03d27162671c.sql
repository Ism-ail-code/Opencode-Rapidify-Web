
DROP POLICY IF EXISTS "analytics public insert" ON public.analytics_events;
CREATE POLICY "analytics public insert" ON public.analytics_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (event_type IS NOT NULL AND length(event_type) BETWEEN 1 AND 64);
