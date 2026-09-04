-- 加購服務：service_templates 加一個 is_addon 旗標，商家可以把某些項目
-- 標成「加購用」（例如深層護甲、加購按摩），顧客選主服務後可以額外加購。
ALTER TABLE public.service_templates
  ADD COLUMN IF NOT EXISTS is_addon boolean NOT NULL DEFAULT false;

-- 記錄每一筆線上訂單實際加購了哪些項目
CREATE TABLE IF NOT EXISTS public.online_order_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_template_id uuid REFERENCES public.service_templates(id) ON DELETE SET NULL,
  name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  duration_minutes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_online_order_addons_order_id ON public.online_order_addons (order_id);

ALTER TABLE public.online_order_addons ENABLE ROW LEVEL SECURITY;

-- 商家自己查看（owner_id 範圍）
DROP POLICY IF EXISTS "online_order_addons_owner_all" ON public.online_order_addons;
CREATE POLICY "online_order_addons_owner_all" ON public.online_order_addons
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- 顧客（含未登入）預約時可以新增加購紀錄，但沒有任何 SELECT 規則給顧客——
-- 比照 waitlist_entries 的做法，避免又做出一個可被整表讀取的坑
DROP POLICY IF EXISTS "online_order_addons_public_insert" ON public.online_order_addons;
CREATE POLICY "online_order_addons_public_insert" ON public.online_order_addons
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);
