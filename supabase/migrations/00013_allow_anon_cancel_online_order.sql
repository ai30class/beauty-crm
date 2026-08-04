
-- 允許顧客（anon）取消自己的線上預約
-- 限制：只能將 status 改為 'cancelled'，且原本不能是 cancelled/refunded
CREATE POLICY "anon can cancel online order"
  ON online_orders
  FOR UPDATE
  TO anon
  USING (status NOT IN ('cancelled', 'refunded'))
  WITH CHECK (status = 'cancelled');
