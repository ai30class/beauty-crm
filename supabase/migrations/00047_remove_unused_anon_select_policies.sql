-- 全面盤點 RLS 規則時發現：holidays／service_templates／staff 各有一條給
-- role=anon（完全未登入）的 SELECT 規則，讓任何人不用登入、不用建帳號，
-- 就能整表讀到「所有商家」的公休日／服務項目與價格／服務人員名單。
--
-- 確認過現在整個 App 沒有任何地方會用未登入狀態去查這三張表——顧客線上
-- 預約頁（online-booking）一律強制先登入才會載入任何資料（見
-- src/app/online-booking/index.tsx 開頭的 session 檢查），其餘會查這三張表
-- 的地方全部是商家後台頁面（已登入的 authenticated 角色）。這三條 anon
-- 規則看起來是更早期還沒加上「顧客要先登入」這個機制時留下的，現在已經
-- 沒有功能在用，純粹是多餘的曝露面，直接移除。

DROP POLICY IF EXISTS "holidays_anon_select" ON public.holidays;
DROP POLICY IF EXISTS "anon can read online booking services" ON public.service_templates;
DROP POLICY IF EXISTS "staff_customer_select" ON public.staff;
