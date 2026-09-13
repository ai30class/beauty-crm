-- 人員預留時間：週排班表點空白處可直接標記「這個時段被佔用」，不綁定顧客／預約，
-- 純粹讓時段在畫面上顯示已被佔用（例如午休、外出、教育訓練）。跟 shop_blocked_slots
-- 不同——那個是整間店共用、依星期重複的機制，這個是單一員工、單一時段、一次性的標記。
CREATE TABLE IF NOT EXISTS public.staff_reserved_slots (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       uuid        NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_id       uuid        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  reserved_date  date        NOT NULL,
  start_time     text        NOT NULL, -- "HH:MM"
  end_time       text        NOT NULL, -- "HH:MM"
  label          text        NOT NULL DEFAULT '預留時間',
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_reserved_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can manage own reserved slots"
  ON public.staff_reserved_slots FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
