-- Fix credit RPCs:
--   1. deduct_credits had a PL/pgSQL type-cast bug (GET DIAGNOSTICS ROW_COUNT
--      assigned to a BOOLEAN, then compared with an INTEGER) that raised an
--      error on every call. Replace with the FOUND flag.
--   2. Both RPCs were SECURITY DEFINER with EXECUTE granted to PUBLIC, letting
--      any client mint/drain credits for any merchant. Add ownership checks
--      inside the functions and revoke the PUBLIC grant.

-- ---------------------------------------------------------------------------
-- deduct_credits — atomic deduction with owner/member/admin authorization
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_credits(
  _merchant_id UUID,
  _amount INTEGER,
  _reason TEXT,
  _ref_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  _is_authorized BOOLEAN;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN FALSE;
  END IF;

  -- Service role (server-side admin client) is always authorized.
  -- Otherwise: merchant owner, workspace member, or platform admin.
  SELECT
    auth.role() = 'service_role'
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.merchants m
      WHERE m.id = _merchant_id AND m.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.merchant_members mm
      WHERE mm.merchant_id = _merchant_id AND mm.user_id = auth.uid()
    )
  INTO _is_authorized;

  IF NOT COALESCE(_is_authorized, FALSE) THEN
    RAISE EXCEPTION 'Not authorized to deduct credits for this merchant'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.merchant_credits
  SET balance = balance - _amount
  WHERE merchant_id = _merchant_id AND balance >= _amount;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.credit_transactions (merchant_id, amount, reason, ref_id)
  VALUES (_merchant_id, -_amount, _reason, _ref_id);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- add_credits — top-ups restricted to platform admins and the service role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_credits(
  _merchant_id UUID,
  _amount INTEGER,
  _reason TEXT,
  _ref_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive' USING ERRCODE = '2201X';
  END IF;

  IF NOT (
    auth.role() = 'service_role'
    OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized to add credits' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.merchant_credits (merchant_id, balance)
  VALUES (_merchant_id, _amount)
  ON CONFLICT (merchant_id) DO UPDATE
    SET balance = merchant_credits.balance + _amount;

  INSERT INTO public.credit_transactions (merchant_id, amount, reason, ref_id)
  VALUES (_merchant_id, _amount, _reason, _ref_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Revoke the dangerous PUBLIC grant; re-grant only to authenticated (RLS-free
-- path for owner checks) and service_role (server-side admin client).
REVOKE EXECUTE ON FUNCTION public.deduct_credits(UUID, INTEGER, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_credits(UUID, INTEGER, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_credits(UUID, INTEGER, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_credits(UUID, INTEGER, TEXT, UUID) TO authenticated, service_role;
