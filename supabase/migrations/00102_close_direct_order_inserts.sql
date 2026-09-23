-- 00102：拆掉線上預約「直接寫入」的舊門（2026-09-23 安全審查 P0「假預約」＋P2「假加購」，第二階段）
--
-- ⚠️ 順序：一定要等「改用 create_online_order() 的 App」已經 push 部署、而且用測試店家實際約過一次沒問題，
--    才能套用這份。反過來的話，舊版 App 的顧客送出預約會被 RLS 擋下（new row violates row-level security policy）。
--
-- 拆掉之後：
--   - 未登入者對 online_orders 完全不能寫入（本來就不該能）。
--   - 已登入顧客也不能直接 INSERT online_orders / online_order_addons，只能走 create_online_order()，
--     金額、狀態、時段全由資料庫決定。
--   - 店家本人的 online_orders_owner_all / online_order_addons_owner_all 不動，後台功能不受影響。
--
-- 驗證：
--   select tablename, policyname, cmd from pg_policies
--   where schemaname='public' and tablename in ('online_orders','online_order_addons') order by 1,2;
--   預期：不再有 online_orders_anon_insert、online_orders_customer_insert、online_order_addons_public_insert。

DROP POLICY IF EXISTS "online_orders_anon_insert"        ON public.online_orders;
DROP POLICY IF EXISTS "online_orders_customer_insert"    ON public.online_orders;
DROP POLICY IF EXISTS "online_order_addons_public_insert" ON public.online_order_addons;
