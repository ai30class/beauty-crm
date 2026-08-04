
-- 1. service_templates 新增「是否需要預付訂金」
ALTER TABLE service_templates
  ADD COLUMN require_deposit boolean NOT NULL DEFAULT true;

-- 2. online_orders 新增「預約模式」
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_mode_enum') THEN
    CREATE TYPE booking_mode_enum AS ENUM ('deposit', 'direct');
  END IF;
END$$;

ALTER TABLE online_orders
  ADD COLUMN booking_mode booking_mode_enum NOT NULL DEFAULT 'deposit';
