
-- 服務記錄加入施術前後照片欄位
ALTER TABLE public.service_records
  ADD COLUMN IF NOT EXISTS before_photo_path text,
  ADD COLUMN IF NOT EXISTS after_photo_path  text;

-- 月收入彙總 view（給趨勢圖使用）
CREATE OR REPLACE VIEW public.monthly_income_summary AS
SELECT
  owner_id,
  EXTRACT(YEAR  FROM service_date::date)::int AS year,
  EXTRACT(MONTH FROM service_date::date)::int AS month,
  SUM(amount) AS total_income,
  COUNT(*)    AS service_count
FROM public.service_records
GROUP BY owner_id, year, month;

-- 月支出彙總 view
CREATE OR REPLACE VIEW public.monthly_expense_summary AS
SELECT
  owner_id,
  EXTRACT(YEAR  FROM expense_date::date)::int AS year,
  EXTRACT(MONTH FROM expense_date::date)::int AS month,
  SUM(amount) AS total_expenses
FROM public.expenses
GROUP BY owner_id, expense_date::date, owner_id
-- 重新整理：按月聚合
;

-- 重新建立正確版本
DROP VIEW IF EXISTS public.monthly_expense_summary;
CREATE OR REPLACE VIEW public.monthly_expense_summary AS
SELECT
  owner_id,
  EXTRACT(YEAR  FROM expense_date::date)::int AS year,
  EXTRACT(MONTH FROM expense_date::date)::int AS month,
  SUM(amount) AS total_expenses
FROM public.expenses
GROUP BY owner_id, year, month;
