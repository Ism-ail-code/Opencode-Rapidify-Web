
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'merchant');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Merchants (multi-tenant)
CREATE TABLE public.merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  logo_url text,
  brand_color text DEFAULT '#7c3aed',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.merchants TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.merchants TO authenticated;
GRANT ALL ON public.merchants TO service_role;
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "merchants public read" ON public.merchants FOR SELECT USING (true);
CREATE POLICY "merchants insert own" ON public.merchants FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "merchants update own" ON public.merchants FOR UPDATE TO authenticated USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "merchants delete own" ON public.merchants FOR DELETE TO authenticated USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Products
CREATE TYPE public.product_status AS ENUM ('draft', 'active', 'archived');

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  thumbnail_url text,
  model_glb_url text,
  model_usdz_url text,
  buy_url text,
  status public.product_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_merchant_idx ON public.products(merchant_id);
GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products public read" ON public.products FOR SELECT USING (true);
CREATE POLICY "products owner write" ON public.products FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = merchant_id AND (m.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = merchant_id AND (m.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- Product variants
CREATE TABLE public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  color_hex text,
  model_glb_url text,
  model_usdz_url text,
  thumbnail_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX variants_product_idx ON public.product_variants(product_id);
GRANT SELECT ON public.product_variants TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "variants public read" ON public.product_variants FOR SELECT USING (true);
CREATE POLICY "variants owner write" ON public.product_variants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p JOIN public.merchants m ON m.id = p.merchant_id WHERE p.id = product_id AND (m.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p JOIN public.merchants m ON m.id = p.merchant_id WHERE p.id = product_id AND (m.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- Analytics events
CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  merchant_id uuid REFERENCES public.merchants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  session_id text,
  variant_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_merchant_idx ON public.analytics_events(merchant_id, created_at DESC);
CREATE INDEX analytics_product_idx ON public.analytics_events(product_id, created_at DESC);
GRANT INSERT ON public.analytics_events TO anon, authenticated;
GRANT SELECT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics public insert" ON public.analytics_events FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "analytics merchant read" ON public.analytics_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = merchant_id AND (m.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- Processing jobs (AI pipeline scaffold)
CREATE TYPE public.job_status AS ENUM ('queued','processing','optimizing','ready','failed');

CREATE TABLE public.processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  merchant_id uuid REFERENCES public.merchants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'meshy',
  status public.job_status NOT NULL DEFAULT 'queued',
  input jsonb DEFAULT '{}'::jsonb,
  output jsonb DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_merchant_idx ON public.processing_jobs(merchant_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.processing_jobs TO authenticated;
GRANT ALL ON public.processing_jobs TO service_role;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs owner all" ON public.processing_jobs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = merchant_id AND (m.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = merchant_id AND (m.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER products_touch BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER jobs_touch BEFORE UPDATE ON public.processing_jobs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed demo merchant + products (owner_id NULL = unclaimed demo data)
INSERT INTO public.merchants (id, slug, name, logo_url, brand_color) VALUES
  ('11111111-1111-1111-1111-111111111111', 'rapidify-demo', 'Rapidify Demo Store', NULL, '#7c3aed');

INSERT INTO public.products (merchant_id, slug, title, description, price_cents, thumbnail_url, model_glb_url, model_usdz_url, buy_url) VALUES
  ('11111111-1111-1111-1111-111111111111', 'astronaut', 'Modular Astronaut', 'A high-fidelity 3D astronaut figure. View it in your space with AR and see how it looks at real scale.', 12900,
    'https://modelviewer.dev/shared-assets/models/Astronaut.glb',
    'https://modelviewer.dev/shared-assets/models/Astronaut.glb',
    'https://developer.apple.com/augmented-reality/quick-look/models/teapot/teapot.usdz',
    '#'),
  ('11111111-1111-1111-1111-111111111111', 'neil-armstrong-helmet', 'Apollo Helmet Replica', 'Museum-grade replica of the iconic space helmet. Rotate, zoom, and project it into your room.', 24900,
    'https://modelviewer.dev/shared-assets/models/NeilArmstrong.glb',
    'https://modelviewer.dev/shared-assets/models/NeilArmstrong.glb',
    'https://developer.apple.com/augmented-reality/quick-look/models/teapot/teapot.usdz',
    '#'),
  ('11111111-1111-1111-1111-111111111111', 'horse', 'Studio Horse Sculpture', 'Hand-detailed designer horse sculpture. Try it on your shelf with AR before you buy.', 8900,
    'https://modelviewer.dev/shared-assets/models/Horse.glb',
    'https://modelviewer.dev/shared-assets/models/Horse.glb',
    'https://developer.apple.com/augmented-reality/quick-look/models/teapot/teapot.usdz',
    '#');
