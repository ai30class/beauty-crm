ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS merchant_terms_accepted_version text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS merchant_terms_accepted_at timestamptz;
