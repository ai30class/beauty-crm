-- 00098：修「用電話劫持顧客檔案」（2026-09-23 安全審查 P0）
--
-- 問題：upsert_customer_by_phone 直接採信呼叫端傳進來的 p_customer_user_id，
--   `customer_user_id = COALESCE(p_customer_user_id, customer_user_id)` 會用外面傳的值蓋掉既有綁定。
--   店家 ID 任何人都查得到（shop_profiles 對 anon 整表可讀，預約頁要用），所以只要知道對方的
--   電話，就能把任何店家的任何顧客檔案綁到自己帳號，再經由 customers_self_select、
--   online_orders_customer_select、套票的 RLS 讀到對方的資料。
--   另外，正式庫還留著最早的 4 參數版本（00031），改成 5 參數時 Postgres 當成新函式、舊的從沒被拆掉，
--   一樣開放給未登入者呼叫。
--
-- 修法：
--   ① 函式內一律用 auth.uid()，完全忽略 p_customer_user_id（參數保留只是為了不動 App 的呼叫方式，
--      App 端傳什麼都不會被採用）。
--   ② 未登入不准呼叫。預約頁本來就要登入才進得去（index.tsx 沒 session 會導回 customer-auth），
--      所以不影響現行流程。
--   ③ 既有檔案已綁定「別的帳號」時：不改綁、也不改姓名／生日（避免冒用電話竄改別人的檔案），
--      只回傳 id 讓預約照常成立（家人共用一支電話的情況仍能約，跟現在一樣）。
--   ④ 拆掉 4 參數舊版；5 參數版收回 PUBLIC／anon 的執行權，只留 authenticated。
--      （Postgres 建函式時預設會把執行權給 PUBLIC，單獨 REVOKE anon 不夠，要連 PUBLIC 一起收。）
--   ⑤ customer_exists_by_phone 一併收回未登入者的執行權：它只回「這支電話在這家店有沒有檔案」的是非題，
--      但沒理由開給未登入的人（預約頁呼叫它時已經登入）。
--
-- 驗證（貼完用唯讀 SQL 看）：
--   select proname, pg_get_function_identity_arguments(oid),
--          has_function_privilege('anon', oid, 'EXECUTE') as anon,
--          has_function_privilege('authenticated', oid, 'EXECUTE') as logged_in
--   from pg_proc where proname in ('upsert_customer_by_phone','customer_exists_by_phone');
--   預期：upsert 只剩「一列」（5 參數），兩支都是 anon=false、logged_in=true。

CREATE OR REPLACE FUNCTION public.upsert_customer_by_phone(
  p_owner_id uuid,
  p_name text,
  p_phone text,
  p_birthday date,
  p_customer_user_id uuid DEFAULT NULL
)
RETURNS TABLE(customer_id uuid, was_already_registered boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_id    uuid;
  v_bound uuid;
BEGIN
  -- p_customer_user_id 一律不採用；身分只認目前登入的帳號
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入後再預約' USING ERRCODE = '42501';
  END IF;

  SELECT id, customer_user_id INTO v_id, v_bound
  FROM public.customers
  WHERE owner_id = p_owner_id AND phone = p_phone
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    -- 只有「還沒綁帳號」或「綁的就是自己」才更新資料並綁定；綁了別人的一律不動
    IF v_bound IS NULL OR v_bound = v_uid THEN
      UPDATE public.customers
      SET name = p_name,
          birthday = COALESCE(birthday, p_birthday),
          customer_user_id = v_uid
      WHERE id = v_id;
    END IF;
    RETURN QUERY SELECT v_id, true;
  ELSE
    INSERT INTO public.customers (owner_id, name, phone, birthday, notes, customer_user_id)
    VALUES (p_owner_id, p_name, p_phone, p_birthday, NULL, v_uid)
    RETURNING id INTO v_id;
    RETURN QUERY SELECT v_id, false;
  END IF;
END;
$function$;

-- 拆掉最早的 4 參數舊版（00031），它從沒被覆蓋、一直留在正式庫
DROP FUNCTION IF EXISTS public.upsert_customer_by_phone(uuid, text, text, date);

REVOKE EXECUTE ON FUNCTION public.upsert_customer_by_phone(uuid, text, text, date, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_customer_by_phone(uuid, text, text, date, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.customer_exists_by_phone(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.customer_exists_by_phone(uuid, text) TO authenticated;
