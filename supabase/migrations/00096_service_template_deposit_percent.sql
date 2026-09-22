-- 訂金比例可自訂（原本寫死 50%，見 src/app/online-booking/index.tsx 的 totalAmount * 0.5）
ALTER TABLE public.service_templates
  ADD COLUMN IF NOT EXISTS deposit_percent smallint NOT NULL DEFAULT 50
  CHECK (deposit_percent BETWEEN 1 AND 100);
