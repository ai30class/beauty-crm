-- 員工帳號（沒開「瀏覽顧客」權限）對 customers 表沒有 SELECT 權限，getMergedAppointments() 用
-- customer:customers!customer_id(name, phone) 帶回手動預約的顧客時是 null，預約列表與排班表就顯示「—」。
-- （線上預約不受影響：migration 00071 的函式本來就回傳顧客姓名。）
--
-- customers 每列都有電話／LINE／生日／備註，RLS 只能整列開放，所以照 get_customer_name／
-- search_customer_by_phone 的做法：專用函式只回傳「id＋姓名」。這是 get_customer_name 的批次版
-- （一次查多位，避免預約列表一筆預約打一次資料庫），範圍同樣限定在「自己這家店」：
-- 員工用 staff_shop_owner_id()，商家用 auth.uid()，顧客與匿名用戶兩者皆為 NULL、什麼都拿不到。
CREATE OR REPLACE FUNCTION public.get_customer_names(p_customer_ids uuid[]) RETURNS TABLE(id uuid, name text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name FROM public.customers c
  WHERE c.id = ANY(p_customer_ids)
    AND c.owner_id = COALESCE(public.staff_shop_owner_id(), auth.uid())
$$;

REVOKE ALL ON FUNCTION public.get_customer_names(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_names(uuid[]) TO authenticated;
