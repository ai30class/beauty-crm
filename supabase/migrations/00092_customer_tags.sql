-- 顧客標籤（CRM 建議功能第一項）：店家自訂文字標籤，自由新增/移除，用於名單分群與篩選
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_customers_tags ON public.customers USING gin (tags);
