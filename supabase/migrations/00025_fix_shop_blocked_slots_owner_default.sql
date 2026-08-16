-- shop_blocked_slots.owner_id 原本沒有 DEFAULT auth.uid()，導致新增時 owner_id 為 NULL，
-- 違反 RLS policy「owner_id = auth.uid()」，店家完全無法新增全店封閉時段。
ALTER TABLE public.shop_blocked_slots
  ALTER COLUMN owner_id SET DEFAULT auth.uid();
