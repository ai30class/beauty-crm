-- 線上預約「熟客免訂金」原本的判斷是「這支電話在資料庫已經有生日」（was_already_registered =
-- v_existing_birthday IS NOT NULL）。生日改成選填之後，沒填生日的顧客第二次預約會一直被當新客、
-- 再收一次訂金，但預約頁的即時提示（customer_exists_by_phone：只看電話存不存在）卻寫
-- 「您是我們的熟客，本次預約免付訂金」，兩邊對不起來。
--
-- 修法：熟客 = 這家店已經有這支電話的顧客資料（跟 customer_exists_by_phone、預約頁提示同一個標準）。
-- 其餘行為完全不變：姓名照舊更新、生日只在資料庫原本是空的時候才補（COALESCE）、
-- customer_user_id 照舊補上；新顧客照舊回傳 false。
--
-- 副作用（Emma 已同意，方案 A）：商家自己建立、還沒有生日的顧客，第一次線上預約也會被當熟客免訂金。
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
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.customers
  WHERE owner_id = p_owner_id AND phone = p_phone
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.customers
    SET name = p_name,
        birthday = COALESCE(birthday, p_birthday),
        customer_user_id = COALESCE(p_customer_user_id, customer_user_id)
    WHERE id = v_id;
    RETURN QUERY SELECT v_id, true;
  ELSE
    INSERT INTO public.customers (owner_id, name, phone, birthday, notes, customer_user_id)
    VALUES (p_owner_id, p_name, p_phone, p_birthday, NULL, p_customer_user_id)
    RETURNING id INTO v_id;
    RETURN QUERY SELECT v_id, false;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.upsert_customer_by_phone(uuid, text, text, date, uuid) TO anon, authenticated;
