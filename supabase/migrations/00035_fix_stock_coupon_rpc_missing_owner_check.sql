-- 全面掃描 SECURITY DEFINER 函式時發現：deduct_product_stock（扣庫存）跟
-- increment_coupon_issued（優惠券發放數 +1）內部完全沒有檢查 owner_id，
-- 且開放 anon／authenticated 都能直接呼叫——只要知道/猜到一個 product_id
-- 或 coupon_id，任何人都能任意扣任一店家的庫存、灌高任一優惠券的發放數。
-- 同檔案裡的兄弟函式 restock_product 有正確做 owner_id = auth.uid() 檢查，
-- 這兩個當初漏加。實測確認 products/coupons 表本身鎖得很好、不開放非店家
-- 讀取，所以 ID 目前不易外流，但函式本身仍應比照補上檢查，不能只靠
-- 「ID 猜不到」當防線。順便補上三個函式都缺少的 search_path 設定
-- （防禦性做法，非緊急，但一次做齊）。
CREATE OR REPLACE FUNCTION "public"."deduct_product_stock"("p_id" "uuid", "qty" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public
    AS $$
DECLARE
  current_stock integer;
  actual_deduct integer;
BEGIN
  SELECT stock INTO current_stock FROM products WHERE id = p_id AND owner_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '商品不存在'; END IF;
  actual_deduct := LEAST(qty, current_stock);
  UPDATE products SET stock = stock - actual_deduct WHERE id = p_id;
  RETURN actual_deduct;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."increment_coupon_issued"("coupon_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET search_path = public
    AS $$
  UPDATE coupons SET issued = issued + 1 WHERE id = coupon_id AND owner_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION "public"."restock_product"("p_id" "uuid", "qty" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public
    AS $$
BEGIN
  UPDATE products SET stock = stock + qty WHERE id = p_id AND owner_id = auth.uid();
END;
$$;
