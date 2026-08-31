-- LINE 一鍵登入：記錄「這個 LINE 帳號對應到哪個 Supabase 登入帳號」。
-- 只由 line-login edge function（service_role）存取，不開放任何 client 端
-- 角色直接讀寫，避免又是一張沒篩對範圍的表。

CREATE TABLE IF NOT EXISTS public.line_identities (
  line_user_id text PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  picture_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.line_identities ENABLE ROW LEVEL SECURITY;
-- 故意不加任何 policy：預設 deny all，只有 service_role（繞過 RLS）能用。
