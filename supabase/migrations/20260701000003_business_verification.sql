-- ============================================================================
-- Business Verification System (No Scoring Engine)
-- ============================================================================
-- Adds business verification columns to profiles and merchants.
-- is_verified is a simple boolean flag, not a score or tier.
-- Businesses with is_verified = false can still use all platform features.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1.  Add verification columns to profiles
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_name     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS country           text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS business_email    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS seller_id         text DEFAULT '',
  ADD COLUMN IF NOT EXISTS tax_vat_number    text DEFAULT '',
  ADD COLUMN IF NOT EXISTS estimated_monthly_orders integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_verified       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

COMMENT ON COLUMN public.profiles.business_name     IS 'Required: registered business name';
COMMENT ON COLUMN public.profiles.country           IS 'Required: business country';
COMMENT ON COLUMN public.profiles.business_email    IS 'Required: business contact email';
COMMENT ON COLUMN public.profiles.seller_id         IS 'Optional: marketplace seller ID';
COMMENT ON COLUMN public.profiles.tax_vat_number    IS 'Optional: tax / VAT registration';
COMMENT ON COLUMN public.profiles.estimated_monthly_orders IS 'Optional: estimated monthly order volume';
COMMENT ON COLUMN public.profiles.is_verified       IS 'TRUE when onboarding complete + store URL valid + webhook verified (if configured)';
COMMENT ON COLUMN public.profiles.onboarding_completed_at IS 'Timestamp when onboarding was finished';

-- ---------------------------------------------------------------------------
-- 2.  Add marketplace column to merchants
-- ---------------------------------------------------------------------------
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS marketplace text NOT NULL DEFAULT 'other'
    CHECK (marketplace IN ('shopify', 'daraz', 'amazon', 'other'));

COMMENT ON COLUMN public.merchants.marketplace IS 'Primary marketplace platform (shopify, daraz, amazon, other)';

-- ---------------------------------------------------------------------------
-- 3.  Index for verification queries
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_verification ON profiles(is_verified) WHERE is_verified = true;
