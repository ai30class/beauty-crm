-- 新手引導流程：首次登入才顯示，用這個欄位記錄是否已看過/跳過。
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
