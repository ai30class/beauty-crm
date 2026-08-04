-- 1. customers 加入 booking_restriction 欄位
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS booking_restricted   boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_allowed_hours jsonb        NOT NULL DEFAULT '[]'::jsonb;
-- booking_allowed_hours 格式：[{"start":"09:00","end":"12:00"}, ...]
-- 空陣列 = 無限制（不可預約的時段），當 booking_restricted=true 且陣列非空時才生效

-- 2. 全店封閉時段表（shop_blocked_slots）
CREATE TABLE IF NOT EXISTS public.shop_blocked_slots (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label       text         NOT NULL DEFAULT '',     -- 說明，如「午休」
  start_time  text         NOT NULL,                -- "HH:MM" 24h
  end_time    text         NOT NULL,                -- "HH:MM" 24h
  applies_to  text[]       NOT NULL DEFAULT '{}',   -- 適用星期：["mon","tue",...] 空=每天
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_blocked_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can manage blocked slots"
  ON public.shop_blocked_slots
  FOR ALL TO authenticated
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
