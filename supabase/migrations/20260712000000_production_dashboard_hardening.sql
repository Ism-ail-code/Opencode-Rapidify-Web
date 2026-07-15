-- Rapidify production hardening
-- Canonical business profile, strict tenant ownership, product sync support,
-- and durable webhook logging. This migration is intentionally additive so it
-- can be applied safely to workspaces created with the earlier merchant schema.

BEGIN;

-- ---------------------------------------------------------------------------
-- Canonical auth-owned business profile
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  representative_name text NOT NULL DEFAULT '',
  business_name text NOT NULL DEFAULT '',
  marketplace text NOT NULL DEFAULT 'other'
    CHECK (marketplace IN ('shopify', 'daraz', 'amazon', 'other')),
  store_url text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  business_email text NOT NULL DEFAULT '',
  seller_id text,
  onboarding_completed_at timestamptz,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.touch_business_profile_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_profiles_touch ON public.business_profiles;
CREATE TRIGGER business_profiles_touch
  BEFORE UPDATE ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_business_profile_updated_at();

-- Creating this row in a database trigger covers email-confirmation and OAuth
-- sign-ups, where the browser may not receive a session immediately.
CREATE OR REPLACE FUNCTION public.create_business_profile_for_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.business_profiles (id, business_email)
  VALUES (NEW.id, COALESCE(NEW.email, ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Rapidify business profile bootstrap failed for auth user %: %', NEW.id, SQLERRM;
  RAISE;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_business_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_business_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_business_profile_for_auth_user();

-- Backfill every existing authenticated user. Legacy profile data is copied
-- when available, but it is not treated as completed unless it was completed
-- in the legacy flow.
INSERT INTO public.business_profiles (
  id, representative_name, business_name, country, business_email,
  seller_id, onboarding_completed_at, is_verified
)
SELECT
  u.id,
  COALESCE(p.full_name, ''),
  COALESCE(p.business_name, p.corporate_title, ''),
  COALESCE(p.country, ''),
  COALESCE(NULLIF(p.business_email, ''), u.email, ''),
  NULLIF(p.seller_id, ''),
  p.onboarding_completed_at,
  COALESCE(p.is_verified, false)
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
ON CONFLICT (id) DO NOTHING;

UPDATE public.business_profiles bp
SET
  store_url = COALESCE(NULLIF(bp.store_url, ''), m.store_domain, ''),
  marketplace = COALESCE(m.marketplace, bp.marketplace),
  business_name = COALESCE(NULLIF(bp.business_name, ''), m.name, '')
FROM public.merchants m
WHERE m.owner_id = bp.id;

-- ---------------------------------------------------------------------------
-- Tenant keys required by the production dashboard and public asset resolver
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS external_sku text,
  ADD COLUMN IF NOT EXISTS external_product_id text;

ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.processing_jobs
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.marketplace_connections
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.asset_cache
  ADD COLUMN IF NOT EXISTS source_hash text,
  ADD COLUMN IF NOT EXISTS optimized_url text;

UPDATE public.products p
SET business_id = m.owner_id,
    image_url = COALESCE(p.image_url, p.thumbnail_url)
FROM public.merchants m
WHERE p.merchant_id = m.id AND p.business_id IS NULL;

UPDATE public.analytics_events ae
SET business_id = p.business_id
FROM public.products p
WHERE ae.product_id = p.id AND ae.business_id IS NULL;

UPDATE public.processing_jobs pj
SET business_id = p.business_id
FROM public.products p
WHERE pj.product_id = p.id AND pj.business_id IS NULL;

UPDATE public.marketplace_connections mc
SET business_id = m.owner_id
FROM public.merchants m
WHERE mc.merchant_id = m.id AND mc.business_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_business_external_sku_key') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_business_external_sku_key UNIQUE (business_id, external_sku);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_business_external_product_key') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_business_external_product_key UNIQUE (business_id, external_product_id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS products_business_idx ON public.products (business_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS analytics_business_idx ON public.analytics_events (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_business_idx ON public.processing_jobs (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS connections_business_idx ON public.marketplace_connections (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  model_url text,
  usdz_url text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'models_business_product_key') THEN
    ALTER TABLE public.models ADD CONSTRAINT models_business_product_key UNIQUE (business_id, product_id);
  END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS models_business_product_idx ON public.models (business_id, product_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.store_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('shopify', 'daraz', 'amazon', 'other')),
  store_url text NOT NULL,
  external_store_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'error')),
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, platform, store_url)
);
CREATE INDEX IF NOT EXISTS store_integrations_lookup_idx ON public.store_integrations (platform, store_url);

INSERT INTO public.store_integrations (business_id, platform, store_url, status, last_sync_at)
SELECT business_id, platform, store_url, CASE WHEN status = 'active' THEN 'active' ELSE 'error' END, last_sync_at
FROM public.marketplace_connections
WHERE business_id IS NOT NULL AND store_url IS NOT NULL AND store_url <> ''
ON CONFLICT (business_id, platform, store_url) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  platform text NOT NULL DEFAULT 'shopify',
  topic text NOT NULL DEFAULT 'unknown',
  signature_valid boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_logs_business_idx ON public.webhook_logs (business_id, created_at DESC);

-- Existing model URLs are already ready-to-render assets. Creating canonical
-- model rows keeps existing merchants compatible with the new asset-meta API.
INSERT INTO public.models (business_id, product_id, model_url, usdz_url, status)
SELECT p.business_id, p.id, p.model_glb_url, p.model_usdz_url, 'ready'
FROM public.products p
WHERE p.business_id IS NOT NULL
  AND (p.model_glb_url IS NOT NULL OR p.model_usdz_url IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM public.models m WHERE m.product_id = p.id);

-- ---------------------------------------------------------------------------
-- RLS: every private row is bound to auth.uid() through business_id (or the
-- profile primary key). Existing merchant membership remains supported for
-- legacy data, but never grants access across unrelated tenants.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_business_owner(_business_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _business_id = _user_id
$$;

ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_profiles select own" ON public.business_profiles;
DROP POLICY IF EXISTS "business_profiles insert own" ON public.business_profiles;
DROP POLICY IF EXISTS "business_profiles update own" ON public.business_profiles;
DROP POLICY IF EXISTS "business_profiles delete own" ON public.business_profiles;
CREATE POLICY "business_profiles select own" ON public.business_profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "business_profiles insert own" ON public.business_profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "business_profiles update own" ON public.business_profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "business_profiles delete own" ON public.business_profiles FOR DELETE TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "products public read" ON public.products;
DROP POLICY IF EXISTS "products owner write" ON public.products;
DROP POLICY IF EXISTS "products tenant all" ON public.products;
DROP POLICY IF EXISTS "products tenant select" ON public.products;
DROP POLICY IF EXISTS "products tenant insert" ON public.products;
DROP POLICY IF EXISTS "products tenant update" ON public.products;
DROP POLICY IF EXISTS "products tenant delete" ON public.products;
CREATE POLICY "products tenant select" ON public.products FOR SELECT TO authenticated
  USING (business_id = auth.uid() OR is_merchant_member(merchant_id, auth.uid()));
CREATE POLICY "products tenant insert" ON public.products FOR INSERT TO authenticated
  WITH CHECK (business_id = auth.uid() AND EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = merchant_id AND m.owner_id = auth.uid()));
CREATE POLICY "products tenant update" ON public.products FOR UPDATE TO authenticated
  USING (business_id = auth.uid() OR is_merchant_member(merchant_id, auth.uid()))
  WITH CHECK (business_id = auth.uid());
CREATE POLICY "products tenant delete" ON public.products FOR DELETE TO authenticated
  USING (business_id = auth.uid() OR is_merchant_member(merchant_id, auth.uid()));

DROP POLICY IF EXISTS "models tenant select" ON public.models;
DROP POLICY IF EXISTS "models tenant insert" ON public.models;
DROP POLICY IF EXISTS "models tenant update" ON public.models;
DROP POLICY IF EXISTS "models tenant delete" ON public.models;
CREATE POLICY "models tenant select" ON public.models FOR SELECT TO authenticated USING (business_id = auth.uid());
CREATE POLICY "models tenant insert" ON public.models FOR INSERT TO authenticated WITH CHECK (business_id = auth.uid());
CREATE POLICY "models tenant update" ON public.models FOR UPDATE TO authenticated USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());
CREATE POLICY "models tenant delete" ON public.models FOR DELETE TO authenticated USING (business_id = auth.uid());

DROP POLICY IF EXISTS "analytics public insert" ON public.analytics_events;
DROP POLICY IF EXISTS "analytics merchant read" ON public.analytics_events;
DROP POLICY IF EXISTS "analytics tenant select" ON public.analytics_events;
DROP POLICY IF EXISTS "analytics tenant insert" ON public.analytics_events;
DROP POLICY IF EXISTS "analytics tenant update" ON public.analytics_events;
DROP POLICY IF EXISTS "analytics tenant delete" ON public.analytics_events;
DROP POLICY IF EXISTS "analytics public product insert" ON public.analytics_events;
CREATE POLICY "analytics tenant select" ON public.analytics_events FOR SELECT TO authenticated USING (business_id = auth.uid());
CREATE POLICY "analytics tenant insert" ON public.analytics_events FOR INSERT TO authenticated WITH CHECK (business_id = auth.uid());
CREATE POLICY "analytics tenant update" ON public.analytics_events FOR UPDATE TO authenticated USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());
CREATE POLICY "analytics tenant delete" ON public.analytics_events FOR DELETE TO authenticated USING (business_id = auth.uid());
CREATE POLICY "analytics public product insert" ON public.analytics_events FOR INSERT TO anon
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_id AND p.business_id = analytics_events.business_id AND p.status = 'active'
  ));

DROP POLICY IF EXISTS "jobs owner all" ON public.processing_jobs;
DROP POLICY IF EXISTS "jobs tenant all" ON public.processing_jobs;
DROP POLICY IF EXISTS "jobs tenant select" ON public.processing_jobs;
DROP POLICY IF EXISTS "jobs tenant insert" ON public.processing_jobs;
DROP POLICY IF EXISTS "jobs tenant update" ON public.processing_jobs;
DROP POLICY IF EXISTS "jobs tenant delete" ON public.processing_jobs;
CREATE POLICY "jobs tenant select" ON public.processing_jobs FOR SELECT TO authenticated USING (business_id = auth.uid());
CREATE POLICY "jobs tenant insert" ON public.processing_jobs FOR INSERT TO authenticated WITH CHECK (business_id = auth.uid());
CREATE POLICY "jobs tenant update" ON public.processing_jobs FOR UPDATE TO authenticated USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());
CREATE POLICY "jobs tenant delete" ON public.processing_jobs FOR DELETE TO authenticated USING (business_id = auth.uid());

DROP POLICY IF EXISTS "store_integrations tenant select" ON public.store_integrations;
DROP POLICY IF EXISTS "store_integrations tenant insert" ON public.store_integrations;
DROP POLICY IF EXISTS "store_integrations tenant update" ON public.store_integrations;
DROP POLICY IF EXISTS "store_integrations tenant delete" ON public.store_integrations;
CREATE POLICY "store_integrations tenant select" ON public.store_integrations FOR SELECT TO authenticated USING (business_id = auth.uid());
CREATE POLICY "store_integrations tenant insert" ON public.store_integrations FOR INSERT TO authenticated WITH CHECK (business_id = auth.uid());
CREATE POLICY "store_integrations tenant update" ON public.store_integrations FOR UPDATE TO authenticated USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());
CREATE POLICY "store_integrations tenant delete" ON public.store_integrations FOR DELETE TO authenticated USING (business_id = auth.uid());

DROP POLICY IF EXISTS "webhook_logs tenant select" ON public.webhook_logs;
DROP POLICY IF EXISTS "webhook_logs tenant insert" ON public.webhook_logs;
DROP POLICY IF EXISTS "webhook_logs tenant update" ON public.webhook_logs;
DROP POLICY IF EXISTS "webhook_logs tenant delete" ON public.webhook_logs;
CREATE POLICY "webhook_logs tenant select" ON public.webhook_logs FOR SELECT TO authenticated USING (business_id = auth.uid());
CREATE POLICY "webhook_logs tenant insert" ON public.webhook_logs FOR INSERT TO authenticated WITH CHECK (business_id = auth.uid());
CREATE POLICY "webhook_logs tenant update" ON public.webhook_logs FOR UPDATE TO authenticated USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());
CREATE POLICY "webhook_logs tenant delete" ON public.webhook_logs FOR DELETE TO authenticated USING (business_id = auth.uid());

-- Permit the initial owner membership insert during onboarding. The preceding
-- policy required an existing owner row, which made the first insert impossible.
DROP POLICY IF EXISTS "members bootstrap owner" ON public.merchant_members;
CREATE POLICY "members bootstrap owner" ON public.merchant_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = merchant_id AND m.owner_id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.models TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_integrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_events TO authenticated;
GRANT INSERT ON public.analytics_events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.processing_jobs TO authenticated;
GRANT ALL ON public.business_profiles, public.models, public.store_integrations, public.webhook_logs TO service_role;

COMMIT;
