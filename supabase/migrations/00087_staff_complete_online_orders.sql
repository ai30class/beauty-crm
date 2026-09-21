-- 00087：員工完成線上預約並記帳（簡化版；商家在「服務人員管理」逐人開關，預設關）
--
-- 背景：員工對 online_orders 沒有任何 RLS 權限（訂單裡有訂金與付款資料），也只能建立「自己名下」的服務記錄，
-- 所以員工看不到線上預約的「完成服務並記錄收入」。Emma（9/21）決定：
--   ① 要商家逐人開關（預設關），有權限的員工才能完成；
--   ② 範圍是全店所有線上預約（狀態為 paid／confirmed，跟商家看到按鈕的條件一致）；
--   ③ 簡化版：只有金額、付款方式（現金／刷卡／銀行轉帳／LINE Pay／行動支付）、備註、服務人員；
--      不含套票扣款、保養品用量、協作分帳、施術照片（要的話由商家事後補）；
--   ④ 收入與抽成記在「預約指定的設計師」，沒指定就由完成的人選。
--
-- 做法：不開放 online_orders／service_records 的員工權限，改新增三支 SECURITY DEFINER 函式：
--   staff_can_complete_online_orders()        目前登入的員工有沒有這個開關
--   staff_get_online_order_for_completion()   拿結帳畫面需要的欄位（不含電話）
--   staff_complete_online_order()             建立服務記錄＋把訂單標成已完成（同一個交易）

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS can_complete_online_orders boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.staff_can_complete_online_orders() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(s.can_complete_online_orders, false)
  FROM public.profiles p JOIN public.staff s ON s.id = p.staff_id
  WHERE p.id = auth.uid() AND p.account_type = 'staff'
$$;

-- 結帳畫面用：只有「有開關的員工、自己店家的訂單、狀態 paid／confirmed」才回傳一列，否則回傳空
CREATE OR REPLACE FUNCTION public.staff_get_online_order_for_completion(p_order_id uuid)
RETURNS TABLE(
  id uuid,
  customer_id uuid,
  customer_name text,
  service_name text,
  total_amount numeric,
  deposit_amount numeric,
  deposit_method text,
  staff_id uuid,
  appointment_time timestamptz,
  status text
)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.customer_id, o.customer_name, o.service_name, o.total_amount,
         CASE WHEN o.booking_mode::text = 'deposit' THEN o.deposit_amount ELSE 0 END,
         CASE WHEN o.booking_mode::text = 'deposit' AND o.deposit_amount > 0
              THEN (CASE WHEN o.line_pay_transaction_id IS NOT NULL THEN 'line_pay' ELSE 'bank_transfer' END)
         END,
         o.staff_id, o.appointment_time, o.status::text
  FROM public.online_orders o
  WHERE o.id = p_order_id
    AND o.owner_id = public.staff_shop_owner_id()
    AND public.staff_can_complete_online_orders()
    AND o.status::text IN ('paid', 'confirmed')
$$;

CREATE OR REPLACE FUNCTION public.staff_complete_online_order(
  p_order_id       uuid,
  p_amount         numeric,
  p_payment_method text,
  p_notes          text,
  p_staff_id       uuid
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner      uuid := public.staff_shop_owner_id();
  o            public.online_orders%ROWTYPE;
  v_deposit    numeric := 0;
  v_dep_method public.payment_method_enum := NULL;
  v_staff      uuid;
  v_record     uuid;
BEGIN
  IF v_owner IS NULL OR NOT public.staff_can_complete_online_orders() THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('cash', 'card', 'bank_transfer', 'line_pay', 'mobile_pay') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD' USING ERRCODE = 'P0001';
  END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO o FROM public.online_orders
   WHERE id = p_order_id AND owner_id = v_owner
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF o.status::text NOT IN ('paid', 'confirmed') THEN
    RAISE EXCEPTION 'ORDER_NOT_COMPLETABLE' USING ERRCODE = 'P0001';
  END IF;
  IF o.customer_id IS NULL THEN
    RAISE EXCEPTION 'NO_CUSTOMER' USING ERRCODE = 'P0001';
  END IF;

  -- 業績歸屬：預約指定的設計師；沒指定才用完成的人選的（而且必須是這家店的服務人員）
  v_staff := COALESCE(o.staff_id, p_staff_id);
  IF v_staff IS NULL THEN
    RAISE EXCEPTION 'STAFF_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.id = v_staff AND s.owner_id = v_owner) THEN
    RAISE EXCEPTION 'INVALID_STAFF' USING ERRCODE = 'P0001';
  END IF;

  -- 已收訂金：跟商家的結帳畫面同一套算法（訂金不超過總額，收款方式看有沒有 LINE Pay 交易編號）
  IF o.booking_mode::text = 'deposit' THEN
    v_deposit := LEAST(COALESCE(o.deposit_amount, 0), p_amount);
    IF v_deposit > 0 THEN
      v_dep_method := (CASE WHEN o.line_pay_transaction_id IS NOT NULL THEN 'line_pay' ELSE 'bank_transfer' END)::public.payment_method_enum;
    END IF;
  END IF;

  INSERT INTO public.service_records
    (owner_id, customer_id, service_name, amount, deposit_amount, deposit_method,
     service_date, notes, payment_method, status, staff_id)
  VALUES
    (v_owner, o.customer_id, o.service_name, p_amount, v_deposit, v_dep_method,
     (o.appointment_time AT TIME ZONE 'Asia/Taipei')::date,
     NULLIF(btrim(COALESCE(p_notes, '')), ''),
     p_payment_method::public.payment_method_enum, 'completed', v_staff)
  RETURNING id INTO v_record;

  UPDATE public.online_orders SET status = 'completed' WHERE id = p_order_id;

  RETURN v_record;
END $$;

REVOKE ALL ON FUNCTION public.staff_can_complete_online_orders() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_get_online_order_for_completion(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_complete_online_order(uuid, numeric, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_can_complete_online_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_get_online_order_for_completion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_complete_online_order(uuid, numeric, text, text, uuid) TO authenticated;
