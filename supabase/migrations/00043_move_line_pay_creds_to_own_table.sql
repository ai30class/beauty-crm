-- ⚠️ 安全修正：shop_profiles 有一條 "public read shop profile by owner"（qual = true）
-- 是給「免登入顧客預約頁」用的公開讀取規則，任何人（連 anon）都能整張表 SELECT *。
-- 上一個 migration（00042）把 LINE Pay 金鑰直接加在 shop_profiles 欄位上是錯的，
-- 會讓所有商家的 Channel Secret 透過這條公開規則被任何人讀到。
-- 改成獨立的 shop_payment_settings 表，只有商家自己（owner_id = auth.uid()）能讀寫，
-- 完全沒有 public / customer 的 SELECT 規則。

CREATE TABLE IF NOT EXISTS public.shop_payment_settings (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  line_pay_channel_id text,
  line_pay_channel_secret text,
  line_pay_env text NOT NULL DEFAULT 'sandbox',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_payment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all_shop_payment_settings" ON public.shop_payment_settings;
CREATE POLICY "owner_all_shop_payment_settings" ON public.shop_payment_settings
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- 搬移任何已填的資料（這個功能還沒上線過，理論上是空的，保險起見還是搬一次）
INSERT INTO public.shop_payment_settings (owner_id, line_pay_channel_id, line_pay_channel_secret, line_pay_env)
SELECT owner_id, line_pay_channel_id, line_pay_channel_secret, line_pay_env
FROM public.shop_profiles
WHERE line_pay_channel_id IS NOT NULL OR line_pay_channel_secret IS NOT NULL
ON CONFLICT (owner_id) DO NOTHING;

ALTER TABLE public.shop_profiles
  DROP COLUMN IF EXISTS line_pay_channel_id,
  DROP COLUMN IF EXISTS line_pay_channel_secret,
  DROP COLUMN IF EXISTS line_pay_env;
