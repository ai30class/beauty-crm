-- 00106：顧客端讀服務人員改走「只回公開欄位」的函式（2026-09-23 安全檢查「四種身分動態測試」，第一階段）
--
-- 問題：00040 的 staff_customer_select_authenticated 讓任何顧客帳號（LINE／Google 登入就是）讀「所有店家」
--   服務中的服務人員「整列」，預約頁又用 select('*')，所以 base_salary（底薪）、commission_rate（抽成）、
--   can_* 權限開關都會送到顧客瀏覽器。RLS 只能擋整列、不能擋欄位，而老闆也是 authenticated、要看得到
--   這些欄位，所以不能用欄位權限收回，只能換成函式。
--
-- 修法（分兩階段，跟 00101／00102 一樣，避免中途卡到正在預約的顧客）：
--   第一階段（這份）：新增兩支只回公開欄位的函式，舊規則先不動。
--     - get_booking_staff(p_owner)：預約頁「選設計師」清單——該店服務中的人員，
--       只有 id、owner_id、name、role、color、is_active、bio、avatar_url、created_at。
--     - get_my_orders_staff()：「我的預約」顯示設計師名字——只回「呼叫者自己的線上預約」有指定到的人員
--       的 id、name、color（含已暫停服務的人，舊預約才顯示得出名字）。
--   第二階段（00107）：App 改用這兩支函式並部署驗證之後，再拆掉 staff_customer_select_authenticated。
--
-- 驗證：
--   select proname, has_function_privilege('anon', oid, 'EXECUTE') as anon,
--          has_function_privilege('authenticated', oid, 'EXECUTE') as logged_in
--   from pg_proc where proname in ('get_booking_staff', 'get_my_orders_staff');
--   預期：兩支都 anon=false、logged_in=true。

CREATE OR REPLACE FUNCTION public.get_booking_staff(p_owner uuid)
RETURNS TABLE (
  id uuid,
  owner_id uuid,
  name text,
  role text,
  color text,
  is_active boolean,
  bio text,
  avatar_url text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.owner_id, s.name::text, s.role::text, s.color::text, s.is_active, s.bio::text, s.avatar_url::text, s.created_at::timestamptz
  FROM public.staff s
  WHERE auth.uid() IS NOT NULL
    AND s.owner_id = p_owner
    AND s.is_active = true
  ORDER BY s.created_at;
$$;

CREATE OR REPLACE FUNCTION public.get_my_orders_staff()
RETURNS TABLE (
  id uuid,
  name text,
  color text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT s.id, s.name::text, s.color::text
  FROM public.online_orders o
  JOIN public.staff s ON s.id = o.staff_id
  WHERE auth.uid() IS NOT NULL
    AND o.customer_user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_booking_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_booking_staff(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_booking_staff(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_orders_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_orders_staff() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_orders_staff() TO authenticated;
