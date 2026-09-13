-- 商家帳號審核機制第一步：關掉自助註冊、改成申請表單 + 人工手動建帳號。
-- 這張表存放「想加入試用」的申請名單，不綁定任何 owner_id（申請當下還沒有帳號），
-- Emma 直接在 Supabase Table Editor 看名單、手動審核建帳號（Table Editor 走的是
-- 管理權限，不受這裡的 RLS 限制）。前端只需要「能寫入」，不需要「能讀回」，
-- 所以只開 INSERT policy，沒有 SELECT policy——這樣任何人都不能透過 App 讀到
-- 別人的申請資料。
CREATE TABLE IF NOT EXISTS public.signup_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_name    text        NOT NULL,
  contact_name text        NOT NULL,
  contact_info text        NOT NULL, -- LINE ID / Email / 手機，自由填寫
  message      text,
  status       text        NOT NULL DEFAULT 'pending', -- pending / contacted / approved / rejected，Emma 自己在 Table Editor 更新
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.signup_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can submit a signup request"
  ON public.signup_requests FOR INSERT TO anon, authenticated
  WITH CHECK (true);
