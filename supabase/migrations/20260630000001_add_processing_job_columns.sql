-- Add missing columns to processing_jobs for retry logic and job lifecycle tracking

ALTER TABLE processing_jobs
  ADD COLUMN IF NOT EXISTS retries integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS max_retries integer DEFAULT 5 NOT NULL,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS result jsonb;

-- Update existing jobs to have sane defaults
UPDATE processing_jobs SET retries = 0 WHERE retries IS NULL;
UPDATE processing_jobs SET max_retries = 5 WHERE max_retries IS NULL;
