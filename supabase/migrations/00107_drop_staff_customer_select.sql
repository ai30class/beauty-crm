-- 00107：拆掉「顧客可讀所有店家服務人員整列」的舊規則（2026-09-23 安全檢查，第二階段）
--
-- ⚠️ 順序：一定要等「改用 get_booking_staff／get_my_orders_staff 的 App」已經 push 部署、驗證過，才能套用這份。
--    反過來的話，舊版 App 的預約頁會讀不到任何服務人員（清單變空），「我的預約」也看不到設計師名字。
--
-- 拆掉之後：顧客帳號對 staff 表完全讀不到（底薪、抽成、權限開關不再外洩）；預約頁與「我的預約」改走 00106 的函式。
-- 老闆（staff_owner_all）不受影響；員工讀同店名單本來就走 get_shop_staff_roster 等函式，也不受影響。
--
-- 驗證：
--   select policyname from pg_policies where schemaname = 'public' and tablename = 'staff' order by 1;
--   預期：不再有 staff_customer_select_authenticated。

DROP POLICY IF EXISTS "staff_customer_select_authenticated" ON public.staff;
