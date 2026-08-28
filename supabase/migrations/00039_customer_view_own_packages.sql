-- 顧客端從頭到尾沒有任何管道能看到自己的儲值卡/套票餘額——service_packages
-- 只有店家本人的 authenticated RLS 規則。這裡補一條顧客可讀規則：
-- 顧客只能看到「自己名下（透過 customer_user_id 對應到的 customer_id）」
-- 的套票，不會看到其他顧客的資料。
-- 連結方式：顧客登入身分（customer_user_id = auth.uid()）已經在建立線上
-- 訂單時正確寫入 online_orders.customer_id，用這條關聯反查出他對應的
-- customer_id 有哪些套票。
CREATE POLICY "service_packages_customer_select" ON "public"."service_packages"
  FOR SELECT TO "authenticated"
  USING (
    customer_id IN (
      SELECT customer_id FROM public.online_orders
      WHERE customer_user_id = auth.uid() AND customer_id IS NOT NULL
    )
  );
