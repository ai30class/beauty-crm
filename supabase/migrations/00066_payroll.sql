-- 月薪自動計算：底薪（可選）、階梯式抽成、額外獎金、鎖定月結薪資快照。

-- 1) 員工底薪：可選，預設 0（沒有底薪的員工維持 0，薪水完全靠抽成+獎金，不用強制每人都填）。
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS base_salary numeric(10,2) NOT NULL DEFAULT 0;

-- 2) 階梯式抽成：員工的業績抽成規則。若某員工完全沒有設定任何階梯，計薪時退回沿用
--    staff.commission_rate（單一固定費率），既有員工不受影響、不用強制搬家。
--    採「就高適用制」：當月業績落在哪一階（min_revenue <= 業績，且 max_revenue 為 NULL
--    或業績 <= max_revenue），整筆業績都按該階的 rate 計算，不是超額累進制。
CREATE TABLE IF NOT EXISTS public.staff_commission_tiers (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid          NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_id     uuid          NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  min_revenue  numeric(10,2) NOT NULL,
  max_revenue  numeric(10,2),
  rate         numeric(5,2)  NOT NULL,
  created_at   timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_commission_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can manage own commission tiers"
  ON public.staff_commission_tiers FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- 3) 額外獎金：跟業績抽成分開的手動加給（例如全勤獎金、推薦獎金），一位員工一個月可以有多筆。
CREATE TABLE IF NOT EXISTS public.staff_bonuses (
  id         uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid          NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_id   uuid          NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  year       int           NOT NULL,
  month      int           NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount     numeric(10,2) NOT NULL,
  note       text,
  created_at timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can manage own staff bonuses"
  ON public.staff_bonuses FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- 4) 月結薪資快照：按「產生本月薪資」才寫入。之後即使原始服務記錄、抽成規則或獎金被修改，
--    已產生的月份金額不會跟著變動——要改，只能明確按「重新產生」用 upsert 整筆覆蓋。
--    每位員工每月只有一筆。
CREATE TABLE IF NOT EXISTS public.payroll_records (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                 uuid          NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_id                 uuid          NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  year                     int           NOT NULL,
  month                    int           NOT NULL CHECK (month BETWEEN 1 AND 12),
  total_revenue            numeric(10,2) NOT NULL DEFAULT 0,
  commission_rate_applied  numeric(5,2)  NOT NULL DEFAULT 0,
  commission_amount        numeric(10,2) NOT NULL DEFAULT 0,
  base_salary              numeric(10,2) NOT NULL DEFAULT 0,
  bonus_amount             numeric(10,2) NOT NULL DEFAULT 0,
  total_salary             numeric(10,2) NOT NULL DEFAULT 0,
  generated_at             timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (staff_id, year, month)
);

ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can manage own payroll records"
  ON public.payroll_records FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
