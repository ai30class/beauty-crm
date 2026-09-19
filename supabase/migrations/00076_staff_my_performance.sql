-- 員工唯讀看「自己的業績」（次數與收入，依月份彙總）。
--
-- 為什麼用專用函式、不直接讀 service_records：
-- 1. 員工對 service_records 只有「staff_id = 自己」的 policy，多人協作時「協作人員」(co_staff_id = 自己)
--    的那一份讀不到，直接查會少算。
-- 2. 商家的「服務人員業績」頁還會 join staff 表拿抽成比例，員工對 staff 表沒有 SELECT（避免薪資外洩）。
-- 這個函式只回傳「每月的服務次數與收入」兩個彙總數字，不回傳顧客、金額明細或備註，
-- 而且只算「呼叫者自己」的（staff_own_staff_id()）：商家、顧客呼叫時 staff_own_staff_id() 為 NULL，什麼都不回傳。
--
-- 收入的算法完全照商家頁的 getStaffPerformance()：
--   有協作人員且有分帳比例 → 主要人員拿 amount × staff_share_percent%，協作人員拿 amount × co_staff_share_percent%；
--   其餘（沒有協作、或沒填分帳比例）→ 整筆算主要人員 staff_id 的；每一筆各算 1 次服務。
CREATE OR REPLACE FUNCTION public.get_my_performance_by_month(p_from date, p_to date)
RETURNS TABLE(month_start date, service_count integer, total_revenue numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT public.staff_own_staff_id() AS sid, public.staff_shop_owner_id() AS oid
  ),
  takes AS (
    SELECT
      date_trunc('month', r.service_date)::date AS m,
      CASE
        WHEN r.co_staff_id IS NOT NULL AND r.staff_share_percent IS NOT NULL THEN
          CASE WHEN r.staff_id = me.sid
               THEN r.amount * r.staff_share_percent / 100
               ELSE r.amount * COALESCE(r.co_staff_share_percent, 0) / 100 END
        ELSE r.amount
      END AS take
    FROM public.service_records r, me
    WHERE me.sid IS NOT NULL
      AND r.owner_id = me.oid
      AND r.service_date >= p_from AND r.service_date < p_to
      AND (
        r.staff_id = me.sid
        OR (r.co_staff_id = me.sid AND r.staff_share_percent IS NOT NULL)
      )
  )
  SELECT m, count(*)::integer, COALESCE(sum(take), 0)::numeric
  FROM takes
  GROUP BY m
  ORDER BY m
$$;

REVOKE ALL ON FUNCTION public.get_my_performance_by_month(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_performance_by_month(date, date) TO authenticated;
