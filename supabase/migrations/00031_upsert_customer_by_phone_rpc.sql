-- 顧客自助線上預約時，upsertCustomerByPhone() 原本直接操作 customers 表：
-- 1) 新增時沒帶 owner_id，靠 DEFAULT auth.uid() 帶入，顧客登入時就被寫到
--    顧客自己帳號名下而不是店家名下（店家的顧客管理/熟客判斷/生日提醒
--    全部看不到這些人）。
-- 2) 查詢是否已建檔（getCustomerByPhone）靠 SELECT RLS（owner_id = auth.uid()），
--    顧客登入時這條件永遠不成立，導致每次都誤判為新顧客、重複建檔
--    （customers 表沒有電話唯一限制，會一直增生）。
--
-- 若直接開放 customers 給顧客 SELECT 會讓任一顧客透過 API 直接撈到
-- 全店顧客的電話/生日/備註等個人資料，是隱私外洩，不能這樣做。
-- 改用 SECURITY DEFINER 函式，在伺服器端專門做「依 owner_id+phone 查有
-- 沒有、有就更新、沒有就新增」，不開放任何新的直接讀取權限。
CREATE OR REPLACE FUNCTION "public"."upsert_customer_by_phone"(
  "p_owner_id" uuid,
  "p_name" text,
  "p_phone" text,
  "p_birthday" date
) RETURNS TABLE("customer_id" uuid, "was_already_registered" boolean)
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  v_id uuid;
  v_existing_birthday date;
BEGIN
  SELECT id, birthday INTO v_id, v_existing_birthday
  FROM public.customers
  WHERE owner_id = p_owner_id AND phone = p_phone
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.customers
    SET name = p_name,
        birthday = COALESCE(birthday, p_birthday)
    WHERE id = v_id;
    RETURN QUERY SELECT v_id, (v_existing_birthday IS NOT NULL);
  ELSE
    INSERT INTO public.customers (owner_id, name, phone, birthday, notes)
    VALUES (p_owner_id, p_name, p_phone, p_birthday, NULL)
    RETURNING id INTO v_id;
    RETURN QUERY SELECT v_id, false;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."upsert_customer_by_phone"(uuid, text, text, date) TO "anon", "authenticated";

-- 修正先前已經被誤判寫到顧客自己帳號名下的測試資料（電話 0912345888）
UPDATE public.customers
SET owner_id = '9f9a4cc0-f3e6-47a6-9b39-b12801a1cbd9'
WHERE phone = '0912345888' AND owner_id = '4a3222db-e474-4266-83eb-1f47786685a9';
