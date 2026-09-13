ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS merchant_terms_accepted_ip text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS merchant_terms_accepted_user_agent text;
