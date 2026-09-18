-- 員工帳號看不到顧客線上預約（online_orders）：migration 00068 只替 appointments 開了全店權限，
-- online_orders 沒有任何員工 policy，員工版排班表會漏掉整塊線上預約，可能因此撞期。
-- online_orders 每列都有顧客電話、付款金額、LINE Pay 交易資訊，RLS 只能整列開放、沒辦法只開部分欄位，
-- 所以不開放 SELECT policy，改用專門函式只回傳排班需要的欄位（跟 get_customer_name／
-- get_shop_staff_roster 同一個做法）。
--
-- 只回傳：id／預約時間／顧客姓名／服務名稱／時長／狀態／設計師／預約模式
-- 刻意不回傳：電話、金額、訂金、備註、LINE Pay 欄位、customer_id／customer_user_id
--
-- staff_shop_owner_id() 對商家和顧客帳號回傳 NULL，`owner_id = NULL` 不會成立，
-- 所以只有員工帳號拿得到自己那家店的資料；商家仍然直接讀 online_orders 表。
CREATE OR REPLACE FUNCTION public.get_shop_online_orders_for_schedule()
RETURNS TABLE(
  id uuid,
  appointment_time timestamptz,
  customer_name text,
  service_name text,
  duration_minutes int,
  status text,
  staff_id uuid,
  booking_mode text
)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.appointment_time, o.customer_name, o.service_name, o.duration_minutes,
         o.status, o.staff_id, o.booking_mode::text
  FROM public.online_orders o
  WHERE o.owner_id = public.staff_shop_owner_id()
    AND o.status NOT IN ('cancelled', 'refunded')
    AND o.appointment_time >= now() - interval '2 days'
  ORDER BY o.appointment_time
$$;
