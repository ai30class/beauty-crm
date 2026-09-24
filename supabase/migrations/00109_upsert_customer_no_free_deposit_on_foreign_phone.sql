-- 00109：綁在「別人帳號」的電話，不再被當成熟客免訂金（2026-09-24 第二輪安全檢查 P2）
--
-- 問題：00098 讓 upsert_customer_by_phone 不會改寫「已綁定別人帳號」的顧客檔案（正確），
--   但仍回傳 was_already_registered = true。create_online_order 用它判斷「熟客免訂金」，
--   所以知道某位熟客電話的登入者，可以拿那支電話預約、少付訂金。
--
-- 修法（Emma 2026-09-24 同意）：只有「檔案還沒綁帳號」或「綁的就是自己」才算熟客；
--   綁在別人帳號的電話一律回傳 false → 當新客收訂金。預約仍然成立（家人共用一支電話
--   照樣約得成，只是要付訂金），不改寫對方的姓名與綁定，其餘行為完全不變。
--
-- 只重寫這一支函式；簽名與權限不變（CREATE OR REPLACE 會保留 00098 設好的權限：
--   anon 不能呼叫、authenticated 可以）。
--
-- 驗證：貼完跑「復原式自我測試」（見 handoff／對話），預期
--   別人帳號的電話 → false 且姓名與綁定都沒被改；自己的電話 → true；沒綁帳號的電話 → true 並綁給自己。

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
    IF v_bound IS NULL OR v_bound = v_uid THEN
      UPDATE public.customers
      SET name = p_name,
          birthday = COALESCE(birthday, p_birthday),
          customer_user_id = v_uid
      WHERE id = v_id;
      RETURN QUERY SELECT v_id, true;
    ELSE
      -- 綁在別人帳號：不改對方的資料，也不算熟客（避免拿別人的電話免訂金）
      RETURN QUERY SELECT v_id, false;
    END IF;
  ELSE
    INSERT INTO public.customers (owner_id, name, phone, birthday, notes, customer_user_id)
    VALUES (p_owner_id, p_name, p_phone, p_birthday, NULL, v_uid)
    RETURNING id INTO v_id;
    RETURN QUERY SELECT v_id, false;
  END IF;
END;
$function$;
