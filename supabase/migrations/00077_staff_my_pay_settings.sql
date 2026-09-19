-- 員工唯讀看自己的抽成與月薪：需要知道「自己的」抽成比例與底薪。
-- 這兩個欄位在 staff 表裡，而員工對 staff 表沒有任何 SELECT policy（同一列還有別人的薪資，RLS 只能整列開放），
-- 所以照 get_customer_name／get_my_performance_by_month 的做法，用專用函式只回傳「自己那一列」的這兩個數字。
-- 只有員工帳號拿得到（staff_own_staff_id() 對商家、顧客是 NULL，什麼都不回傳）。
-- 階梯抽成（staff_commission_tiers）、額外獎金（staff_bonuses）、已結算薪資（payroll_records）
-- 員工本來就有「只能讀自己的」policy（migration 00068），不需要新增。
CREATE OR REPLACE FUNCTION public.get_my_pay_settings()
RETURNS TABLE(commission_rate numeric, base_salary numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(s.commission_rate, 0)::numeric, COALESCE(s.base_salary, 0)::numeric
  FROM public.staff s
  WHERE s.id = public.staff_own_staff_id()
    AND s.owner_id = public.staff_shop_owner_id()
$$;

REVOKE ALL ON FUNCTION public.get_my_pay_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_pay_settings() TO authenticated;
