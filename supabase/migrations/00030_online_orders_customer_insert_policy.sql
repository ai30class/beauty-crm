-- 顧客登入後建立線上預約會被 RLS 擋下（"new row violates row-level security
-- policy for table online_orders"）：online_orders 的 INSERT 規則只給了
-- anon 角色（online_orders_anon_insert），authenticated 角色只有店家本人
-- 的 online_orders_owner_all（owner_id = auth.uid()），顧客登入後兩條都
-- 不適用，完全無法送出預約。
-- 這裡補一條 authenticated 顧客可新增規則，並用 WITH CHECK 限制顧客只能
-- 新增 customer_user_id = 自己 uid 的訂單，避免冒用其他顧客身分建立訂單。
CREATE POLICY "online_orders_customer_insert" ON "public"."online_orders"
  FOR INSERT TO "authenticated"
  WITH CHECK ("customer_user_id" = "auth"."uid"());
