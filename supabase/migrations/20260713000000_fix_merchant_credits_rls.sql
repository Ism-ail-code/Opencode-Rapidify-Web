-- Fix: seed_merchant_credits() trigger runs with invoker permissions,
-- but authenticated users lack GRANTs on merchant_credits/credit_transactions.
-- Make it SECURITY DEFINER (like deduct_credits and add_credits) to bypass RLS,
-- and grant base table permissions for SELECT (RLS still controls access).

-- 1. Recreate seed function as SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.seed_merchant_credits()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.merchant_credits (merchant_id, balance)
  VALUES (NEW.id, 10)
  ON CONFLICT (merchant_id) DO NOTHING;

  INSERT INTO public.credit_transactions (merchant_id, amount, reason, metadata)
  VALUES (NEW.id, 10, 'welcome_bonus', jsonb_build_object('note', 'Free credits for new merchant'));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Grant base table access (RLS policies still restrict reads/writes)
GRANT SELECT, INSERT, UPDATE ON public.merchant_credits TO authenticated;
GRANT SELECT, INSERT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.merchant_credits, public.credit_transactions TO service_role;
