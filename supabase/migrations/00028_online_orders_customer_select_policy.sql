-- 「查詢我的預約」從頭到尾沒運作過：online_orders 對 authenticated 角色只有
-- online_orders_owner_all（owner_id = auth.uid()，只給店家本人），顧客登入後
-- 反而失去 anon 角色原本的（過寬的）SELECT 權限，變成完全看不到任何訂單。
-- 這裡新增一條窄範圍規則：顧客只能看到 customer_user_id = 自己 uid 的訂單，
-- 不會看到其他顧客的預約。
CREATE POLICY "online_orders_customer_select" ON "public"."online_orders"
  FOR SELECT TO "authenticated"
  USING ("customer_user_id" = "auth"."uid"());
