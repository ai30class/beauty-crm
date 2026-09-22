-- 顧客轉介紹來源（CRM 建議功能第 5 項）：新增顧客時記錄「怎麼知道我們的」，供日後行銷歸因
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS referral_source text;
