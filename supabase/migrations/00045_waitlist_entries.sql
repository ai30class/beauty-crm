-- 候補名單：顧客想約的時段已滿時可以登記候補，商家在後台看名單主動聯繫
CREATE TABLE IF NOT EXISTS public.waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_user_id uuid,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  service_template_id uuid REFERENCES public.service_templates(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  desired_date date NOT NULL,
  desired_time text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'notified', 'booked', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_entries_owner_date ON public.waitlist_entries (owner_id, desired_date);

ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;

-- 商家自己管理（查看、標記狀態、刪除）
DROP POLICY IF EXISTS "waitlist_entries_owner_all" ON public.waitlist_entries;
CREATE POLICY "waitlist_entries_owner_all" ON public.waitlist_entries
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- 顧客（含未登入）可以新增候補登記，但不給任何 SELECT 權限——
-- 候補名單只給商家自己看，避免重蹈 online_orders 那種「qual=true 被整表讀取」的覆轍（見二十四）
DROP POLICY IF EXISTS "waitlist_entries_public_insert" ON public.waitlist_entries;
CREATE POLICY "waitlist_entries_public_insert" ON public.waitlist_entries
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);
