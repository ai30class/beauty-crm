-- 00114：顧客看套票，只認「真的綁在自己帳號」的顧客檔案（2026-09-26 第四輪安全檢測 P1，情況 1）
--
-- 問題：00039 的 service_packages_customer_select 是看「我建過的線上預約掛在哪個顧客檔」來放行。
--   但預約時填的電話如果已經綁在別人帳號，create_online_order 仍會把那個顧客檔的 ID 寫進訂單
--   （讓店家後台看得到這筆預約是誰的，家人共用電話也約得成）。結果：知道別人電話的登入者，
--   只要拿那支電話預約一次，就能在「我的套票」看到對方的套票與餘額。
--
-- 修法（Emma 2026-09-26 同意）：改成只看「customer_user_id＝目前登入帳號」的顧客檔案。
--   訂單怎麼掛、店家後台看到什麼都不變；只改顧客自己能看到哪些套票。
--   附帶效果：已綁帳號、但還沒線上預約過的顧客，也看得到自己的套票（本來就是他的）。
--
-- 不在這次範圍：電話對到「還沒綁帳號」的舊顧客檔時會直接綁給預約者（情況 2），另案處理。
--
-- 驗證：
--   select policyname, qual from pg_policies
--   where schemaname = 'public' and tablename = 'service_packages';
--   預期：service_packages_customer_select 的條件是 customers.customer_user_id = auth.uid()。

DROP POLICY IF EXISTS "service_packages_customer_select" ON public.service_packages;

CREATE POLICY "service_packages_customer_select" ON public.service_packages
  FOR SELECT TO authenticated
  USING (
    customer_id IN (
      SELECT c.id FROM public.customers c
      WHERE c.customer_user_id = auth.uid()
    )
  );
