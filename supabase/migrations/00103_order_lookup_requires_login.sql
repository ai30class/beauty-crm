-- 00103：顧客查／改／取消預約改為「要登入，而且只能動自己帳號名下的預約」（2026-09-23 安全審查 P1）
--
-- 問題：get_online_orders_by_phone / update_online_order_by_phone / cancel_online_order_by_phone 都只比對
--   「訂單 ID＋電話」，未登入也能呼叫。手機號碼不是足夠的身分證明：知道別人電話就能看到她的姓名、金額、
--   備註，還有付款交易 ID 與付款網址；再猜到訂單 ID 就能改期或取消。
--
-- 修法（Emma 2026-09-23 決定「需要登入」）：
--   ① 三支函式都要求已登入（auth.uid() 非空），未登入者收回執行權。
--   ② 只能看到／動到「綁在自己帳號名下」的預約：訂單的 customer_user_id 是自己，或訂單對應的顧客檔案
--      （customers.customer_user_id）綁的是自己。電話比對照舊保留，當第二道條件。
--   ③ 查詢回傳拿掉四個 LINE Pay 付款欄位（交易 ID、訂單編號、付款網址、付款時間）——顧客端沒有用到，不該給。
--      因為回傳欄位變了，這支要先 DROP 再 CREATE（CREATE OR REPLACE 不能改回傳型別）。
--   ④ update／cancel 的其他規則（只有免訂金 confirmed 能自助改／取消、00081 的時段規則）完全不變。
--
-- App 端：查詢頁（/customer-lookup）沒登入會先導去登入頁，登入後自動回到查詢頁。
--
-- 已知取捨：顧客如果曾用不同方式登入（例如一次 LINE、一次 Google），舊帳號名下的預約在新帳號看不到；
--   請她用當初預約時的登入方式登入即可。
--
-- 驗證：
--   select proname, has_function_privilege('anon', oid, 'EXECUTE') as anon,
--          has_function_privilege('authenticated', oid, 'EXECUTE') as logged_in
--   from pg_proc where proname in ('get_online_orders_by_phone','update_online_order_by_phone','cancel_online_order_by_phone')
--   order by proname;
--   預期：3 列，全部 anon=false、logged_in=true。

-- ① 查詢：拿掉付款欄位、加上登入與歸屬條件
DROP FUNCTION IF EXISTS public.get_online_orders_by_phone(text);

CREATE FUNCTION public.get_online_orders_by_phone(p_phone text)
RETURNS TABLE(
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
  created_at timestamptz,
  staff_name text,
  staff_color text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id, o.owner_id, o.customer_name, o.customer_phone, o.customer_id, o.customer_user_id,
    o.staff_id, o.service_template_id, o.service_name, o.duration_minutes, o.total_amount,
    o.deposit_amount, o.appointment_time, o.end_time, o.notes, o.status, o.booking_mode::text,
    o.created_at, s.name, s.color
  FROM public.online_orders o
  LEFT JOIN public.staff s ON s.id = o.staff_id
  WHERE o.customer_phone = p_phone
    AND auth.uid() IS NOT NULL
    AND (
      o.customer_user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = o.customer_id AND c.customer_user_id = auth.uid())
    )
  ORDER BY o.appointment_time DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_online_orders_by_phone(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_online_orders_by_phone(text) TO authenticated;

-- ② 改期：00081 的規則原封不動，只在最前面加登入檢查、在鎖定那筆時加歸屬條件
CREATE OR REPLACE FUNCTION public.update_online_order_by_phone(
  p_id uuid,
  p_phone text,
  p_appointment_time timestamptz,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o          public.online_orders%ROWTYPE;
  v_local    timestamp;
  v_date     date;
  v_key      text;
  v_start_m  int;
  v_dur_m    int;
  v_day      jsonb;
  v_open_m   int;
  v_close_m  int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '請先登入後再修改預約' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO o
  FROM public.online_orders
  WHERE id = p_id
    AND customer_phone = p_phone
    AND status IN ('pending', 'confirmed')
    AND (
      customer_user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = online_orders.customer_id AND c.customer_user_id = auth.uid())
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到這筆預約，或目前狀態已無法修改';
  END IF;

  -- 1) 不能改到過去
  IF p_appointment_time <= now() THEN
    RAISE EXCEPTION '不能改到已經過去的時間，請選擇之後的日期與時間';
  END IF;

  v_local   := p_appointment_time AT TIME ZONE 'Asia/Taipei';
  v_date    := v_local::date;
  v_key     := (ARRAY['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])[extract(dow FROM v_local)::int + 1];
  v_start_m := extract(hour FROM v_local)::int * 60 + extract(minute FROM v_local)::int;
  v_dur_m   := GREATEST(round(extract(epoch FROM (o.end_time - o.appointment_time)) / 60)::int, 0);
  IF v_dur_m = 0 THEN
    v_dur_m := o.duration_minutes;
  END IF;

  -- 2) 公休日
  IF EXISTS (
    SELECT 1
    FROM public.holidays h
    WHERE h.owner_id = o.owner_id
      AND h.holiday_date = v_date
      AND (h.staff_id IS NULL OR h.staff_id = o.staff_id)
  ) THEN
    RAISE EXCEPTION '這一天是公休日，請改選其他日期';
  END IF;

  -- 3) 店休日／營業時間外（店家沒設定營業時間就不擋）
  SELECT sp.business_hours -> v_key INTO v_day
  FROM public.shop_profiles sp
  WHERE sp.owner_id = o.owner_id;

  IF v_day IS NOT NULL THEN
    IF (v_day ->> 'open') = 'false' THEN
      RAISE EXCEPTION '這一天店休，請改選其他日期';
    END IF;
    IF (v_day ->> 'start') ~ '^\d{1,2}:\d{2}$' AND (v_day ->> 'end') ~ '^\d{1,2}:\d{2}$' THEN
      v_open_m  := split_part(v_day ->> 'start', ':', 1)::int * 60 + split_part(v_day ->> 'start', ':', 2)::int;
      v_close_m := split_part(v_day ->> 'end',   ':', 1)::int * 60 + split_part(v_day ->> 'end',   ':', 2)::int;
      IF v_start_m < v_open_m OR v_start_m + v_dur_m > v_close_m THEN
        RAISE EXCEPTION '這個時間不在營業時間內（營業時間 % ～ %），請改選其他時間',
          v_day ->> 'start', v_day ->> 'end';
      END IF;
    END IF;
  END IF;

  -- 4) 封鎖時段
  IF EXISTS (
    SELECT 1
    FROM public.shop_blocked_slots b
    WHERE b.owner_id = o.owner_id
      AND (b.staff_id IS NULL OR b.staff_id = o.staff_id)
      AND (CASE WHEN b.specific_date IS NOT NULL
                THEN b.specific_date = v_date
                ELSE (cardinality(b.applies_to) = 0 OR v_key = ANY (b.applies_to))
           END)
      AND v_start_m >= split_part(b.start_time, ':', 1)::int * 60 + split_part(b.start_time, ':', 2)::int
      AND v_start_m <  split_part(b.end_time,   ':', 1)::int * 60 + split_part(b.end_time,   ':', 2)::int
  ) THEN
    RAISE EXCEPTION '這個時段不接受預約，請改選其他時間';
  END IF;

  UPDATE public.online_orders
  SET appointment_time = p_appointment_time,
      end_time = p_appointment_time + make_interval(mins => v_dur_m),
      notes = p_notes
  WHERE id = p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_online_order_by_phone(uuid, text, timestamptz, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_online_order_by_phone(uuid, text, timestamptz, text) TO authenticated;

-- ③ 取消：加登入檢查與歸屬條件
CREATE OR REPLACE FUNCTION public.cancel_online_order_by_phone(
  p_id uuid,
  p_phone text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '請先登入後再取消預約' USING ERRCODE = '42501';
  END IF;

  UPDATE public.online_orders
  SET status = 'cancelled'
  WHERE id = p_id
    AND customer_phone = p_phone
    AND status IN ('pending', 'confirmed')
    AND (
      customer_user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = online_orders.customer_id AND c.customer_user_id = auth.uid())
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到這筆預約，或目前狀態已無法取消';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_online_order_by_phone(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cancel_online_order_by_phone(uuid, text) TO authenticated;
