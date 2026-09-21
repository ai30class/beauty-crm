-- 00086：員工帳號可以調整「線上預約」的時間（只能改時間，其他一律不能動）
--
-- 背景：員工對 online_orders 沒有任何 RLS 權限（訂單裡有訂金與付款資料，00068 起一律鎖住），
-- 排班表只能透過 00071 的唯讀函式看到時間／姓名／服務／設計師／狀態。
-- Emma（9/21）決定：員工可以幫同事調整全店任何一筆線上預約的時間（跟手動預約一樣）。
--
-- 做法：不開放 online_orders 的權限，改新增一支只做「改時間」的 SECURITY DEFINER 函式：
--   ① 只有員工帳號（staff_shop_owner_id() 不為空）能呼叫，而且只能改自己店家的訂單；
--   ② 已取消／已完成／已退款的訂單不能改（跟商家「調整預約」視窗的規則一致）；
--   ③ end_time 依原時長順延；改 appointment_time／end_time 會觸發 00080 的重疊檢查，
--      同一位設計師撞時段時仍會丟 SLOT_TAKEN，員工不能把兩筆排在同一格。
-- 不會通知顧客（商家自己在訂單頁調整時也沒有自動通知）。

CREATE OR REPLACE FUNCTION public.staff_reschedule_online_order(
  p_order_id uuid,
  p_appointment_time timestamptz
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner    uuid := public.staff_shop_owner_id();
  v_status   text;
  v_duration int;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'NOT_STAFF' USING ERRCODE = '42501';
  END IF;

  SELECT o.status::text, o.duration_minutes INTO v_status, v_duration
    FROM public.online_orders o
   WHERE o.id = p_order_id AND o.owner_id = v_owner
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_status IN ('cancelled', 'completed', 'refunded') THEN
    RAISE EXCEPTION 'ORDER_NOT_EDITABLE' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.online_orders
     SET appointment_time = p_appointment_time,
         end_time = p_appointment_time + make_interval(mins => COALESCE(v_duration, 0))
   WHERE id = p_order_id;
END $$;

REVOKE ALL ON FUNCTION public.staff_reschedule_online_order(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_reschedule_online_order(uuid, timestamptz) TO authenticated;
