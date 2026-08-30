-- ⚠️ 安全修正：online_orders 有一條 "online_orders_anon_select"（qual = true, role = anon），
-- 讓完全未登入的人可以整張表 SELECT *，等於任何人不用登入就能讀到所有商家、所有顧客的
-- 姓名、電話、預約時間、金額（已實測用 anon key 直接打 REST API 證實會外洩真實顧客資料）。
--
-- 這條規則原本是為了讓「查詢/修改我的預約」這個免登入頁面（customer-lookup）能用手機號碼
-- 查自己的預約，但 RLS 沒辦法限制「只能用自己知道的手機號碼查」——RLS 只能限制列本身的
-- 可見性，不能限制呼叫端下的是什麼 WHERE 條件。正確做法是走 SECURITY DEFINER function
-- （跟既有的 upsert_customer_by_phone / customer_exists_by_phone 同一種模式），
-- 由資料庫端强制只回傳「手機號碼完全吻合」的資料，然後把這條過寬的 SELECT 規則移除。

CREATE OR REPLACE FUNCTION public.get_online_orders_by_phone(p_phone text)
RETURNS TABLE (
  id uuid,
  owner_id uuid,
  customer_name text,
  customer_phone text,
  customer_id uuid,
  customer_user_id uuid,
  staff_id uuid,
  service_template_id uuid,
  service_name text,
  duration_minutes integer,
  total_amount numeric,
  deposit_amount numeric,
  appointment_time timestamptz,
  end_time timestamptz,
  notes text,
  status text,
  booking_mode text,
  line_pay_transaction_id text,
  line_pay_order_id text,
  line_pay_payment_url text,
  line_pay_paid_at timestamptz,
  created_at timestamptz,
  staff_name text,
  staff_color text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id, o.owner_id, o.customer_name, o.customer_phone, o.customer_id, o.customer_user_id,
    o.staff_id, o.service_template_id, o.service_name, o.duration_minutes, o.total_amount,
    o.deposit_amount, o.appointment_time, o.end_time, o.notes, o.status, o.booking_mode::text,
    o.line_pay_transaction_id, o.line_pay_order_id, o.line_pay_payment_url, o.line_pay_paid_at,
    o.created_at, s.name, s.color
  FROM public.online_orders o
  LEFT JOIN public.staff s ON s.id = o.staff_id
  WHERE o.customer_phone = p_phone
  ORDER BY o.appointment_time DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_online_orders_by_phone(text) TO anon, authenticated;

DROP POLICY IF EXISTS "online_orders_anon_select" ON public.online_orders;
