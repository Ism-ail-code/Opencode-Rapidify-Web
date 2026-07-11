-- Security tables: used_nonces (replay prevention), audit_logs, asset_cache

-- Used nonces for replay attack prevention
CREATE TABLE IF NOT EXISTS used_nonces (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nonce text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_used_nonces_nonce ON used_nonces(nonce);
CREATE INDEX idx_used_nonces_expires_at ON used_nonces(expires_at);

-- Auto-cleanup expired nonces
CREATE OR REPLACE FUNCTION cleanup_expired_nonces()
RETURNS void AS $$
BEGIN
  DELETE FROM used_nonces WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- Audit logs for security-relevant actions
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource text NOT NULL,
  resource_id text,
  metadata jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Asset cache for optimized model storage
CREATE TABLE IF NOT EXISTS asset_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_url text NOT NULL,
  cached_path text NOT NULL,
  content_type text,
  size_bytes bigint,
  checksum text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_asset_cache_source_url ON asset_cache(source_url);
CREATE INDEX idx_asset_cache_expires_at ON asset_cache(expires_at);

-- RLS policies
ALTER TABLE used_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_cache ENABLE ROW LEVEL SECURITY;

-- Only service role can manage security tables
CREATE POLICY "Service role can manage used_nonces"
  ON used_nonces FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role can manage audit_logs"
  ON audit_logs FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role can manage asset_cache"
  ON asset_cache FOR ALL
  TO service_role
  USING (true);

-- Admin can read audit logs
CREATE POLICY "Admins can read audit_logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );
