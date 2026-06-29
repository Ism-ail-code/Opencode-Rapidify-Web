-- Credit / Wallet system
-- merchant_credits: one row per merchant, tracks current balance
-- credit_transactions: immutable ledger of all credit mutations

CREATE TABLE IF NOT EXISTS public.merchant_credits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   UUID NOT NULL UNIQUE REFERENCES public.merchants(id) ON DELETE CASCADE,
  balance       INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.merchant_credits IS 'Per-merchant credit balance (wallet).';
COMMENT ON COLUMN public.merchant_credits.balance IS 'Current credit count. Never negative due to CHECK constraint.';

CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  amount        INTEGER NOT NULL, -- positive = top-up, negative = deduction
  reason        TEXT NOT NULL,    -- e.g. 'processing_job', 'marketplace_sync', 'admin_topup', 'refund'
  ref_id        UUID,             -- optional FK to processing_jobs / external_catalog_items / etc.
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.credit_transactions IS 'Append-only ledger of credit mutations.';
COMMENT ON COLUMN public.credit_transactions.amount IS 'Positive = credit added, negative = credit deducted.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credit_tx_merchant ON public.credit_transactions (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_tx_ref      ON public.credit_transactions (ref_id) WHERE ref_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_merchant_credits_merchant ON public.merchant_credits (merchant_id);

-- RLS: merchants can only see their own credits
ALTER TABLE public.merchant_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- Read: owner via merchants.owner_id
CREATE POLICY "merchants_read_credits"
  ON public.merchant_credits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.merchants m
      WHERE m.id = merchant_credits.merchant_id
        AND m.owner_id = auth.uid()
    )
  );

CREATE POLICY "merchants_read_credit_tx"
  ON public.credit_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.merchants m
      WHERE m.id = credit_transactions.merchant_id
        AND m.owner_id = auth.uid()
    )
  );

-- Service-role can do everything (the server functions use supabaseAdmin)
CREATE POLICY "service_all_credits"
  ON public.merchant_credits FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_all_credit_tx"
  ON public.credit_transactions FOR ALL
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_merchant_credits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_merchant_credits_updated ON public.merchant_credits;
CREATE TRIGGER on_merchant_credits_updated
  BEFORE UPDATE ON public.merchant_credits
  FOR EACH ROW EXECUTE FUNCTION public.handle_merchant_credits_updated_at();

-- Seed: give new merchants 10 free credits on merchant creation
CREATE OR REPLACE FUNCTION public.seed_merchant_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.merchant_credits (merchant_id, balance)
  VALUES (NEW.id, 10)
  ON CONFLICT (merchant_id) DO NOTHING;

  INSERT INTO public.credit_transactions (merchant_id, amount, reason, metadata)
  VALUES (NEW.id, 10, 'welcome_bonus', jsonb_build_object('note', 'Free credits for new merchant'));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_merchant_created_seed_credits ON public.merchants;
CREATE TRIGGER on_merchant_created_seed_credits
  AFTER INSERT ON public.merchants
  FOR EACH ROW EXECUTE FUNCTION public.seed_merchant_credits();

-- Helper: atomic deduct (prevents race conditions)
CREATE OR REPLACE FUNCTION public.deduct_credits(
  _merchant_id UUID,
  _amount INTEGER,
  _reason TEXT,
  _ref_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  _ok BOOLEAN;
BEGIN
  UPDATE public.merchant_credits
  SET balance = balance - _amount
  WHERE merchant_id = _merchant_id AND balance >= _amount;

  GET DIAGNOSTICS _ok = ROW_COUNT;
  IF NOT _ok OR _ok = 0 THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.credit_transactions (merchant_id, amount, reason, ref_id)
  VALUES (_merchant_id, -_amount, _reason, _ref_id);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper: add credits (top-up)
CREATE OR REPLACE FUNCTION public.add_credits(
  _merchant_id UUID,
  _amount INTEGER,
  _reason TEXT,
  _ref_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.merchant_credits (merchant_id, balance)
  VALUES (_merchant_id, _amount)
  ON CONFLICT (merchant_id) DO UPDATE
    SET balance = merchant_credits.balance + _amount;

  INSERT INTO public.credit_transactions (merchant_id, amount, reason, ref_id)
  VALUES (_merchant_id, _amount, _reason, _ref_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
