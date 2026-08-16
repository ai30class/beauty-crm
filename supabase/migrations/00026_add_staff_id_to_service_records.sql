-- service_records 原本完全沒有記錄是哪位服務人員執行的，
-- 導致「服務人員業績」報表查詢的 staff_id/staff_name/total_amount 全部不存在，100% 必噴錯。
-- 補上 staff_id（可留空，適用還沒指定人員的舊紀錄），比照 online_orders 用同一張 staff 表關聯。
ALTER TABLE public.service_records
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;
