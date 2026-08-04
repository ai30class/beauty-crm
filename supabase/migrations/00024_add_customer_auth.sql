-- 顧客帳號綁定表（顧客 Supabase 帳號 → 顧客資料）
-- 顧客用自己的 Email 或手機登入，登入後將 auth.uid 與 customers.id 綁定
CREATE TABLE IF NOT EXISTS public.customer_accounts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id  uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  owner_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;

-- 顧客只能看到自己的綁定記錄
CREATE POLICY "customer can view own account"
  ON public.customer_accounts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 顧客可新增自己的綁定（初次登入時）
CREATE POLICY "customer can insert own account"
  ON public.customer_accounts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 商家可看到自己店的所有顧客帳號
CREATE POLICY "owner can view customer accounts"
  ON public.customer_accounts FOR SELECT TO authenticated
  USING (owner_id = auth.uid());
