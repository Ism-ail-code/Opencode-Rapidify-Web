-- Add slug column to products table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'products'
    AND column_name = 'slug'
  ) THEN
    ALTER TABLE public.products ADD COLUMN slug text NOT NULL DEFAULT '';
    ALTER TABLE public.products ADD CONSTRAINT products_slug_unique UNIQUE (slug);

    -- Backfill existing rows with a generated slug from title
    UPDATE public.products
    SET slug = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(title, '[^a-z0-9]+', '-', 'gi'), '^-|-$', '', 'g')) || '-' || SUBSTR(id::text, 1, 8)
    WHERE slug = '' OR slug IS NULL;

    CREATE INDEX IF NOT EXISTS products_slug_idx ON public.products(slug);
  END IF;
END $$;
