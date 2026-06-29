-- Profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  corporate_title text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles own read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles own insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles own update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- Merchant members (role-based access per merchant)
CREATE TYPE public.merchant_role AS ENUM ('owner', 'admin', 'member');

CREATE TABLE public.merchant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.merchant_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, user_id)
);
CREATE INDEX merchant_members_user_idx ON public.merchant_members(user_id);
CREATE INDEX merchant_members_merchant_idx ON public.merchant_members(merchant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_members TO authenticated;
GRANT ALL ON public.merchant_members TO service_role;
ALTER TABLE public.merchant_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members own read" ON public.merchant_members FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "members owner manage" ON public.merchant_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.merchant_members mm WHERE mm.merchant_id = merchant_id AND mm.user_id = auth.uid() AND mm.role = 'owner'));

-- Add store_domain to merchants
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS store_domain text DEFAULT '';

-- Function to get merchant_id for a user
CREATE OR REPLACE FUNCTION public.get_user_merchant_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT merchant_id FROM public.merchant_members WHERE user_id = _user_id LIMIT 1
$$;

-- updated_at trigger for profiles
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
