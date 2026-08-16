-- 「先登入才能預約」機制上線後，線上預約流程對已登入顧客完全失效：
-- service_templates / staff / shop_profiles / holidays 這 4 張表都只有
-- anon（未登入訪客）角色的 SELECT 規則，authenticated 角色只有店家本人
-- （owner_id = auth.uid()）能讀。顧客登入後變成 authenticated 但不是店家，
-- 於是連「選擇服務項目」都是空的，整個線上預約等於故障。
-- 這裡比照各表現有的 anon 規則條件，各補一條 authenticated 顧客可讀規則，
-- 不擴大顧客可見資料範圍（服務仍只看得到開放線上預約的、人員仍只看得到在職的）。

CREATE POLICY "service_templates_customer_select" ON "public"."service_templates"
  FOR SELECT TO "authenticated"
  USING ("allow_online_booking" = true);

CREATE POLICY "staff_customer_select_authenticated" ON "public"."staff"
  FOR SELECT TO "authenticated"
  USING ("is_active" = true);

CREATE POLICY "shop_profiles_customer_select" ON "public"."shop_profiles"
  FOR SELECT TO "authenticated"
  USING (true);

CREATE POLICY "holidays_customer_select_authenticated" ON "public"."holidays"
  FOR SELECT TO "authenticated"
  USING (true);
