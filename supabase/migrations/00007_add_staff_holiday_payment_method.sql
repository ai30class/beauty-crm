
-- 1. holidays 新增 staff_id（NULL = 全店公休，有值 = 指定人員休假）
ALTER TABLE holidays
  ADD COLUMN staff_id uuid REFERENCES staff(id) ON DELETE CASCADE;

-- 2. service_records 新增付款方式
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method_enum') THEN
    CREATE TYPE payment_method_enum AS ENUM ('cash', 'card', 'line_pay');
  END IF;
END$$;

ALTER TABLE service_records
  ADD COLUMN payment_method payment_method_enum NOT NULL DEFAULT 'cash';

-- 3. service_records 新增 status（completed = 正常完成，pending = 尚未結帳）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_record_status_enum') THEN
    CREATE TYPE service_record_status_enum AS ENUM ('completed', 'pending');
  END IF;
END$$;

ALTER TABLE service_records
  ADD COLUMN status service_record_status_enum NOT NULL DEFAULT 'completed';

-- 4. RLS：holidays 的既有 policy 已含 staff_id，無需額外異動
-- 確保 service_records SELECT/UPDATE policy 存在（已存在則跳過，用 DO block 避免重複）
