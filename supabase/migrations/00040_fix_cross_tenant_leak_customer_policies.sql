-- 嚴重跨店家資料外洩：上次為了讓「登入後的顧客」能看到店家的服務項目/
-- 人員/店家資訊/公休日/封鎖時段，加了 5 條 authenticated 角色的 SELECT
-- 規則，但條件只寫「allow_online_booking=true」「is_active=true」或
-- 甚至「true」，完全沒有排除「這是另一家店的商家自己登入」的情況。
-- Postgres RLS 規則是 OR 疊加的，導致任一商家登入自己後台時，除了看到
-- 自己的資料（owner_all 規則），還會額外看到「所有其他店家」符合條件的
-- 服務項目/人員/店家資訊/公休日/封鎖時段——實測已確認發生：商家登入後
-- 看到 3 個服務項目，但沒有一個是自己的。
--
-- 修法：用剛好在上一輪加的 profiles.account_type 欄位，把這 5 條規則
-- 都限定「只有 account_type = 'customer' 的帳號才適用」，商家自己的
-- 帳號（account_type = 'merchant'）不再匹配這些規則，只會看到 owner_all
-- 規則放行的、自己名下的資料。真正的顧客登入流程完全不受影響。

DROP POLICY IF EXISTS "service_templates_customer_select" ON "public"."service_templates";
CREATE POLICY "service_templates_customer_select" ON "public"."service_templates"
  FOR SELECT TO "authenticated"
  USING (
    "allow_online_booking" = true
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_type = 'customer')
  );

DROP POLICY IF EXISTS "staff_customer_select_authenticated" ON "public"."staff";
CREATE POLICY "staff_customer_select_authenticated" ON "public"."staff"
  FOR SELECT TO "authenticated"
  USING (
    "is_active" = true
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_type = 'customer')
  );

DROP POLICY IF EXISTS "shop_profiles_customer_select" ON "public"."shop_profiles";
CREATE POLICY "shop_profiles_customer_select" ON "public"."shop_profiles"
  FOR SELECT TO "authenticated"
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_type = 'customer')
  );

DROP POLICY IF EXISTS "holidays_customer_select_authenticated" ON "public"."holidays";
CREATE POLICY "holidays_customer_select_authenticated" ON "public"."holidays"
  FOR SELECT TO "authenticated"
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_type = 'customer')
  );

DROP POLICY IF EXISTS "shop_blocked_slots_customer_select" ON "public"."shop_blocked_slots";
CREATE POLICY "shop_blocked_slots_customer_select" ON "public"."shop_blocked_slots"
  FOR SELECT TO "authenticated"
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_type = 'customer')
  );
