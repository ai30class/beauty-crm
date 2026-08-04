-- 1. 擴充 enum：加入 'package'
ALTER TYPE payment_method_enum ADD VALUE IF NOT EXISTS 'package';

-- 2. service_records 加 package_id 欄位
ALTER TABLE service_records
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES service_packages(id) ON DELETE SET NULL;

-- 3. service_packages 加 purchase_payment_method 欄位
ALTER TABLE service_packages
  ADD COLUMN IF NOT EXISTS purchase_payment_method text
    CHECK (purchase_payment_method IN ('cash','card','line_pay')) DEFAULT 'cash';
