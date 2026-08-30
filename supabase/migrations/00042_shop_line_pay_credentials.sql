-- 每家店自己的 LINE Pay 商家金鑰（多商家各自收款，平台不經手金流）
ALTER TABLE public.shop_profiles
  ADD COLUMN IF NOT EXISTS line_pay_channel_id text,
  ADD COLUMN IF NOT EXISTS line_pay_channel_secret text,
  ADD COLUMN IF NOT EXISTS line_pay_env text NOT NULL DEFAULT 'sandbox';
