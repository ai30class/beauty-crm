ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS no_show_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.shop_profiles ADD COLUMN IF NOT EXISTS no_show_alert_threshold integer NOT NULL DEFAULT 3;
