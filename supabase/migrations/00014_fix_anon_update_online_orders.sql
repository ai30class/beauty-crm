
-- 移除舊的合併政策（只允許 cancelled）
DROP POLICY IF EXISTS "anon can cancel online order" ON online_orders;

-- 政策 1：顧客修改預約時間/備註（appointment_time, end_time, notes）
-- 限制：只能修改未完成/未取消的訂單，且不能改動 status/owner_id 等關鍵欄位
CREATE POLICY "anon can update online order details"
  ON online_orders
  FOR UPDATE
  TO anon
  USING (status NOT IN ('cancelled', 'refunded', 'completed'))
  WITH CHECK (status NOT IN ('cancelled', 'refunded', 'completed'));

-- 政策 2：顧客取消預約
CREATE POLICY "anon can cancel online order"
  ON online_orders
  FOR UPDATE
  TO anon
  USING (status NOT IN ('cancelled', 'refunded'))
  WITH CHECK (status = 'cancelled');
