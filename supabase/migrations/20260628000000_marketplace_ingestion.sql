-- Multi-Vendor Marketplace Ingestion Tables

-- Marketplace connections (vendor OAuth credentials)
CREATE TABLE public.marketplace_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('daraz', 'amazon', 'shopify')),
  store_name text NOT NULL DEFAULT '',
  store_url text DEFAULT '',
  oauth_token_hash text NOT NULL DEFAULT '',
  oauth_refresh_hash text DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'error')),
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketplace_merchant_idx ON public.marketplace_connections(merchant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_connections TO authenticated;
GRANT ALL ON public.marketplace_connections TO service_role;
ALTER TABLE public.marketplace_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "connections owner read" ON public.marketplace_connections FOR SELECT TO authenticated
  USING (merchant_id IN (SELECT m.id FROM public.merchants m WHERE m.owner_id = auth.uid()));
CREATE POLICY "connections owner manage" ON public.marketplace_connections FOR ALL TO authenticated
  USING (merchant_id IN (SELECT m.id FROM public.merchants m WHERE m.owner_id = auth.uid()));

-- External catalog items (synced from vendor platforms)
CREATE TABLE public.external_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.marketplace_connections(id) ON DELETE CASCADE,
  external_sku text NOT NULL,
  title text NOT NULL DEFAULT '',
  description text DEFAULT '',
  price_cents integer DEFAULT 0,
  currency text DEFAULT 'USD',
  image_urls text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'unprocessed' CHECK (status IN ('unprocessed', 'approved', 'rejected', 'processing', 'synced')),
  mapped_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_sku)
);
CREATE INDEX catalog_connection_idx ON public.external_catalog_items(connection_id);
CREATE INDEX catalog_status_idx ON public.external_catalog_items(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_catalog_items TO authenticated;
GRANT ALL ON public.external_catalog_items TO service_role;
ALTER TABLE public.external_catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog owner read" ON public.external_catalog_items FOR SELECT TO authenticated
  USING (connection_id IN (
    SELECT mc.id FROM public.marketplace_connections mc
    JOIN public.merchants m ON m.id = mc.merchant_id
    WHERE m.owner_id = auth.uid()
  ));
CREATE POLICY "catalog owner manage" ON public.external_catalog_items FOR ALL TO authenticated
  USING (connection_id IN (
    SELECT mc.id FROM public.marketplace_connections mc
    JOIN public.merchants m ON m.id = mc.merchant_id
    WHERE m.owner_id = auth.uid()
  ));

-- updated_at triggers
CREATE TRIGGER marketplace_connections_touch BEFORE UPDATE ON public.marketplace_connections FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER catalog_items_touch BEFORE UPDATE ON public.external_catalog_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
