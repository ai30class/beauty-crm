-- 00112：收回 customer_exists_by_phone 的登入者執行權（2026-09-25 第三輪安全檢測 P2）
--
-- 問題：這支 SECURITY DEFINER 函式回答「這支電話在這家店有沒有顧客檔案」。00098 已收回未登入者的
--   執行權，但任何登入帳號（顧客用 LINE／Google 一登入就算）仍可逐支電話探測某人是不是某店熟客。
-- 修法：預約頁不再即時查（新版程式：熟客提示只看登入者自己的顧客檔案，實際收不收訂金一律由
--   create_online_order 送出時判斷），這裡把 authenticated 的執行權也收回。函式本體保留（service_role
--   仍可用），日後確定不需要再 DROP。
--
-- ⚠️ 順序：程式（不再呼叫這支函式的版本）先上線，再執行這份；反過來的話舊版預約頁打電話時會報錯。
--
-- 驗證（唯讀）：
--   select has_function_privilege('authenticated', 'public.customer_exists_by_phone(uuid, text)', 'execute') as authed,
--          has_function_privilege('anon',          'public.customer_exists_by_phone(uuid, text)', 'execute') as anon;
--   預期：兩個都是 false。

REVOKE EXECUTE ON FUNCTION public.customer_exists_by_phone(uuid, text) FROM PUBLIC, anon, authenticated;
