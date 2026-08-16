-- 線上預約表單「輸入手機號即時顯示您是我們的熟客」提示，原本用
-- getCustomerByPhone() 直接查 customers 表，顧客登入後一樣被 RLS 擋下
-- （owner_id = auth.uid() 對顧客永遠不成立），提示永遠不會出現。
-- 這裡加一個只回傳 boolean 的 SECURITY DEFINER 函式，不外洩任何顧客
-- PII（電話、生日、備註等），比照 upsert_customer_by_phone 的做法。
CREATE OR REPLACE FUNCTION "public"."customer_exists_by_phone"(
  "p_owner_id" uuid,
  "p_phone" text
) RETURNS boolean
  LANGUAGE "sql" SECURITY DEFINER
  SET search_path = public
  AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.customers
    WHERE owner_id = p_owner_id AND phone = p_phone
  );
$$;

GRANT EXECUTE ON FUNCTION "public"."customer_exists_by_phone"(uuid, text) TO "anon", "authenticated";
