-- 讓已登入的回頭客不用每次預約都重打一次姓名/電話/生日：
-- customers 加一個 customer_user_id 欄位，記錄「這筆顧客檔案屬於哪個登入帳號」，
-- 之後同一個帳號、同一家店回訪時，可以直接讀出上次填過的資料。

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_customer_user_id
  ON public.customers (customer_user_id)
  WHERE customer_user_id IS NOT NULL;

-- 顧客本人可以讀到自己的檔案（只限 customer_user_id 對得上自己），
-- 不影響原本商家自己（owner_id=auth.uid()）的既有規則
DROP POLICY IF EXISTS "customers_self_select" ON public.customers;
CREATE POLICY "customers_self_select" ON public.customers
  FOR SELECT TO authenticated
  USING (customer_user_id = auth.uid());

-- upsert_customer_by_phone 加一個 p_customer_user_id 參數（有預設值，
-- 不影響既有呼叫端），顧客線上預約送出時順便把 customer_user_id 補上
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
  v_existing_birthday date;
BEGIN
  SELECT id, birthday INTO v_id, v_existing_birthday
  FROM public.customers
  WHERE owner_id = p_owner_id AND phone = p_phone
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.customers
    SET name = p_name,
        birthday = COALESCE(birthday, p_birthday),
        customer_user_id = COALESCE(p_customer_user_id, customer_user_id)
    WHERE id = v_id;
    RETURN QUERY SELECT v_id, (v_existing_birthday IS NOT NULL);
  ELSE
    INSERT INTO public.customers (owner_id, name, phone, birthday, notes, customer_user_id)
    VALUES (p_owner_id, p_name, p_phone, p_birthday, NULL, p_customer_user_id)
    RETURNING id INTO v_id;
    RETURN QUERY SELECT v_id, false;
  END IF;
END;
$function$;
