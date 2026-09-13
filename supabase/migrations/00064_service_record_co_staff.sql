-- 多人協作服務分帳：一筆服務記錄可以指定第二位協作人員（co_staff_id）與拆分比例
-- （staff_share_percent = 主要人員 staff_id 拿的比例，其餘給 co_staff_id）。
-- co_staff_id 為 NULL 時維持原本「整筆歸 staff_id」的行為，不影響既有資料。
ALTER TABLE public.service_records ADD COLUMN IF NOT EXISTS co_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE public.service_records ADD COLUMN IF NOT EXISTS staff_share_percent numeric(5,2);
