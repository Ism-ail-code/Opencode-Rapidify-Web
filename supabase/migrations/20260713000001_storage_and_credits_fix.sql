-- ============================================================================
-- 1. Storage RLS policies — allow authenticated users to upload to app buckets
-- ============================================================================

-- Enable RLS on storage.objects if not already
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to upload files to the thumbnails bucket
DROP POLICY IF EXISTS "authenticated upload thumbnails" ON storage.objects;
CREATE POLICY "authenticated upload thumbnails"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'thumbnails');

-- Allow authenticated users to upload files to the models bucket
DROP POLICY IF EXISTS "authenticated upload models" ON storage.objects;
CREATE POLICY "authenticated upload models"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'models');

-- Allow authenticated users to update their own files in thumbnails bucket
DROP POLICY IF EXISTS "authenticated update thumbnails" ON storage.objects;
CREATE POLICY "authenticated update thumbnails"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'thumbnails' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'thumbnails' AND owner = auth.uid());

-- Allow authenticated users to update their own files in models bucket
DROP POLICY IF EXISTS "authenticated update models" ON storage.objects;
CREATE POLICY "authenticated update models"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'models' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'models' AND owner = auth.uid());

-- Allow authenticated users to delete their own files
DROP POLICY IF EXISTS "authenticated delete own" ON storage.objects;
CREATE POLICY "authenticated delete own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (owner = auth.uid());

-- Allow authenticated users to read files in app buckets
DROP POLICY IF EXISTS "authenticated read app buckets" ON storage.objects;
CREATE POLICY "authenticated read app buckets"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id IN ('thumbnails', 'models'));

-- ============================================================================
-- 2. Backfill merchant_credits for merchants created before the trigger fix
-- ============================================================================
INSERT INTO public.merchant_credits (merchant_id, balance)
SELECT m.id, 10
FROM public.merchants m
WHERE NOT EXISTS (
  SELECT 1 FROM public.merchant_credits mc WHERE mc.merchant_id = m.id
)
ON CONFLICT (merchant_id) DO NOTHING;

-- Also insert credit_transactions for the backfill
INSERT INTO public.credit_transactions (merchant_id, amount, reason, metadata)
SELECT m.id, 10, 'welcome_bonus', jsonb_build_object('note', 'Backfilled credits for existing merchant')
FROM public.merchants m
WHERE NOT EXISTS (
  SELECT 1 FROM public.credit_transactions ct
  WHERE ct.merchant_id = m.id AND ct.reason = 'welcome_bonus'
);
