-- ============================================================================
-- Feature 1: Multi-Tenant Security — Unified RLS via merchant_members
-- ============================================================================
-- Every business table already has merchant_id as the tenant FK. This
-- migration creates a single helper function that checks BOTH the merchant
-- owner AND merchant_members, then recreates all RLS policies to use it.
-- This ensures team members (not just the owner) can access records.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1.  Unified tenant-check helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_merchant_member(
  _merchant_id uuid,
  _user_id     uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM merchants
    WHERE id = _merchant_id AND owner_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM merchant_members
    WHERE merchant_id = _merchant_id AND user_id = _user_id
  )
$$;

COMMENT ON FUNCTION public.is_merchant_member IS
  'Returns TRUE if _user_id owns or is a member of _merchant_id. Used in all tenant RLS policies.';

-- ---------------------------------------------------------------------------
-- 2.  Products
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "products public read" ON products;
DROP POLICY IF EXISTS "products owner write" ON products;

CREATE POLICY "products public read"
  ON products FOR SELECT
  USING (status = 'active' OR is_merchant_member(merchant_id, auth.uid()));

CREATE POLICY "products tenant all"
  ON products FOR ALL
  TO authenticated
  USING (is_merchant_member(merchant_id, auth.uid()))
  WITH CHECK (is_merchant_member(merchant_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- 3.  Product variants
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "variants public read" ON product_variants;
DROP POLICY IF EXISTS "variants owner write" ON product_variants;

CREATE POLICY "variants public read"
  ON product_variants FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = product_id
      AND (p.status = 'active' OR is_merchant_member(p.merchant_id, auth.uid()))
  ));

CREATE POLICY "variants tenant all"
  ON product_variants FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM products p WHERE p.id = product_id AND is_merchant_member(p.merchant_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM products p WHERE p.id = product_id AND is_merchant_member(p.merchant_id, auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- 4.  Analytics events (public insert allowed, read restricted to tenant)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "analytics public insert" ON analytics_events;
DROP POLICY IF EXISTS "analytics merchant read" ON analytics_events;

CREATE POLICY "analytics public insert"
  ON analytics_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "analytics merchant read"
  ON analytics_events FOR SELECT
  TO authenticated
  USING (is_merchant_member(merchant_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- 5.  Processing jobs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "jobs owner all" ON processing_jobs;

CREATE POLICY "jobs tenant all"
  ON processing_jobs FOR ALL
  TO authenticated
  USING (is_merchant_member(merchant_id, auth.uid()))
  WITH CHECK (is_merchant_member(merchant_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- 6.  Marketplace connections
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "connections owner read" ON marketplace_connections;
DROP POLICY IF EXISTS "connections owner manage" ON marketplace_connections;

CREATE POLICY "connections tenant read"
  ON marketplace_connections FOR SELECT
  TO authenticated
  USING (is_merchant_member(merchant_id, auth.uid()));

CREATE POLICY "connections tenant all"
  ON marketplace_connections FOR ALL
  TO authenticated
  USING (is_merchant_member(merchant_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- 7.  External catalog items (via connection → merchant)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "catalog owner read" ON external_catalog_items;
DROP POLICY IF EXISTS "catalog owner manage" ON external_catalog_items;

CREATE POLICY "catalog tenant read"
  ON external_catalog_items FOR SELECT
  TO authenticated
  USING (connection_id IN (
    SELECT mc.id FROM marketplace_connections mc
    WHERE is_merchant_member(mc.merchant_id, auth.uid())
  ));

CREATE POLICY "catalog tenant all"
  ON external_catalog_items FOR ALL
  TO authenticated
  USING (connection_id IN (
    SELECT mc.id FROM marketplace_connections mc
    WHERE is_merchant_member(mc.merchant_id, auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- 8.  Credit tables
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "merchants_read_credits" ON merchant_credits;
DROP POLICY IF EXISTS "merchants_read_credit_tx" ON credit_transactions;

CREATE POLICY "credits tenant read"
  ON merchant_credits FOR SELECT
  TO authenticated
  USING (is_merchant_member(merchant_id, auth.uid()));

CREATE POLICY "credit_tx tenant read"
  ON credit_transactions FOR SELECT
  TO authenticated
  USING (is_merchant_member(merchant_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- 9.  Security tables — add merchant_id for optional tenant scoping
-- ---------------------------------------------------------------------------
ALTER TABLE used_nonces
  ADD COLUMN IF NOT EXISTS merchant_id uuid REFERENCES merchants(id) ON DELETE CASCADE;

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS merchant_id uuid REFERENCES merchants(id) ON DELETE CASCADE;

ALTER TABLE asset_cache
  ADD COLUMN IF NOT EXISTS merchant_id uuid REFERENCES merchants(id) ON DELETE CASCADE;

-- Admin can read audit logs; tenant members can read their own
DROP POLICY IF EXISTS "Admins can read audit_logs" ON audit_logs;

CREATE POLICY "admins read audit_logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'))
    OR
    is_merchant_member(merchant_id, auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 10.  Indexes on new columns
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_used_nonces_merchant ON used_nonces(merchant_id) WHERE merchant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_merchant ON audit_logs(merchant_id) WHERE merchant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_cache_merchant ON asset_cache(merchant_id) WHERE merchant_id IS NOT NULL;
