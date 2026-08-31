-- ⚠️ 安全修正：online_orders 的 "anon can update active online order" 規則
-- 只檢查訂單目前狀態是不是 pending/confirmed，完全沒檢查呼叫的人是不是
-- 這張訂單真正的顧客——只要知道（或猜到、或從別處看到）一筆訂單的 UUID，
-- 任何未登入的人都能改掉別人的預約時間、備註，甚至直接取消掉。
--
-- 跟 get_online_orders_by_phone（見 00044）同一種模式：改成 SECURITY DEFINER
-- function，強制要求呼叫端同時帶對 customer_phone 才能改，然後把過寬的
-- UPDATE 規則整條移除。

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
BEGIN
  UPDATE public.online_orders
  SET appointment_time = p_appointment_time,
      notes = p_notes
  WHERE id = p_id
    AND customer_phone = p_phone
    AND status IN ('pending', 'confirmed');

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到這筆預約，或目前狀態已無法修改';
  END IF;
END;
$$;

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
  UPDATE public.online_orders
  SET status = 'cancelled'
  WHERE id = p_id
    AND customer_phone = p_phone
    AND status IN ('pending', 'confirmed');

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到這筆預約，或目前狀態已無法取消';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_online_order_by_phone(uuid, text, timestamptz, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_online_order_by_phone(uuid, text) TO anon, authenticated;

DROP POLICY IF EXISTS "anon can update active online order" ON public.online_orders;
