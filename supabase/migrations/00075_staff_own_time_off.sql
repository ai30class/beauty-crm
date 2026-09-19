-- 員工的「休假」與「封鎖時段」改成「只能管理自己的」；整家店的營業時間、店休、全店封鎖時段永遠只有商家能改。
--
-- 原本（migration 00068）：staff.can_manage_shop_settings 開關打開的員工，可以改整家店的營業時間
-- （shop_profiles）、全店公休日（holidays）、全店封鎖時段（shop_blocked_slots）；
-- 預留時間（staff_reserved_slots）則是基本層，任何員工可以替任何設計師排。
-- 這個開關的意義改成「可管理自己的休假與封鎖時段」（欄位名稱不改，避免大改動；UI 標籤已改）。
--
-- 另外順手修一個會讓「員工新增資料」全部失敗的問題：這幾張表的 owner_id 預設值是 auth.uid()，
-- 員工登入時 auth.uid() 是員工自己的帳號 ID，不是店家 ID，而員工的 INSERT policy 要求
-- owner_id = staff_shop_owner_id()（店家 ID），所以員工新增顧客／預約／預留時間／服務記錄時，
-- owner_id 會被預設成員工自己而被 RLS 擋下。預設值改成「員工就用所屬店家 ID，商家照舊用自己」。

-- ── 1) 個人封鎖時段：shop_blocked_slots 加 staff_id（NULL＝全店，有值＝只有這位設計師）────────
ALTER TABLE public.shop_blocked_slots
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE;

-- ── 2) owner_id 預設值：員工用所屬店家 ID，商家（staff_shop_owner_id() 為 NULL）照舊用自己 ─────
ALTER TABLE public.customers           ALTER COLUMN owner_id SET DEFAULT COALESCE(public.staff_shop_owner_id(), auth.uid());
ALTER TABLE public.appointments        ALTER COLUMN owner_id SET DEFAULT COALESCE(public.staff_shop_owner_id(), auth.uid());
ALTER TABLE public.staff_reserved_slots ALTER COLUMN owner_id SET DEFAULT COALESCE(public.staff_shop_owner_id(), auth.uid());
ALTER TABLE public.service_records     ALTER COLUMN owner_id SET DEFAULT COALESCE(public.staff_shop_owner_id(), auth.uid());
ALTER TABLE public.holidays            ALTER COLUMN owner_id SET DEFAULT COALESCE(public.staff_shop_owner_id(), auth.uid());
ALTER TABLE public.shop_blocked_slots  ALTER COLUMN owner_id SET DEFAULT COALESCE(public.staff_shop_owner_id(), auth.uid());

-- ── 3) holidays 原本 UNIQUE(owner_id, holiday_date)：同一天只能有一筆，
--       個人休假會跟「全店公休」或別位設計師同一天的休假互相卡住。改成「同一天、同一個對象」才算重複。
ALTER TABLE public.holidays DROP CONSTRAINT IF EXISTS holidays_owner_id_holiday_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS holidays_owner_date_staff_uniq
  ON public.holidays (owner_id, holiday_date, COALESCE(staff_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ── 4) 員工不再能改「整家店」的東西 ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "staff_manage_shop_profiles"      ON public.shop_profiles;       -- 營業時間、店家資訊
DROP POLICY IF EXISTS "staff_manage_holidays"           ON public.holidays;            -- 全店公休
DROP POLICY IF EXISTS "staff_manage_shop_blocked_slots" ON public.shop_blocked_slots;  -- 全店封鎖時段
DROP POLICY IF EXISTS "staff_reserved_slots_all"        ON public.staff_reserved_slots; -- 任何人都能排任何人的預留時間

-- ── 5) 員工只能管理「自己的」休假／封鎖時段／預留時間（且商家要開「可管理自己的休假與封鎖時段」開關）───
CREATE POLICY "staff_manage_own_holidays" ON public.holidays FOR ALL TO authenticated
  USING (owner_id = public.staff_shop_owner_id() AND staff_id IS NOT NULL
         AND staff_id = public.staff_own_staff_id() AND public.staff_can_manage_shop_settings())
  WITH CHECK (owner_id = public.staff_shop_owner_id() AND staff_id IS NOT NULL
         AND staff_id = public.staff_own_staff_id() AND public.staff_can_manage_shop_settings());

CREATE POLICY "staff_manage_own_blocked_slots" ON public.shop_blocked_slots FOR ALL TO authenticated
  USING (owner_id = public.staff_shop_owner_id() AND staff_id IS NOT NULL
         AND staff_id = public.staff_own_staff_id() AND public.staff_can_manage_shop_settings())
  WITH CHECK (owner_id = public.staff_shop_owner_id() AND staff_id IS NOT NULL
         AND staff_id = public.staff_own_staff_id() AND public.staff_can_manage_shop_settings());

-- 預留時間：排班表要看得到全店設計師的（基本層），但只能新增／修改／刪除自己的
CREATE POLICY "staff_view_reserved_slots" ON public.staff_reserved_slots FOR SELECT TO authenticated
  USING (owner_id = public.staff_shop_owner_id());

CREATE POLICY "staff_manage_own_reserved_slots" ON public.staff_reserved_slots FOR ALL TO authenticated
  USING (owner_id = public.staff_shop_owner_id()
         AND staff_id = public.staff_own_staff_id() AND public.staff_can_manage_shop_settings())
  WITH CHECK (owner_id = public.staff_shop_owner_id()
         AND staff_id = public.staff_own_staff_id() AND public.staff_can_manage_shop_settings());

COMMENT ON COLUMN public.staff.can_manage_shop_settings IS
  '歷史欄位名稱。現在的意思：可管理「自己的」休假、封鎖時段與預留時間（不含整家店的營業時間／店休／全店封鎖時段，那些永遠只有商家能改）';
