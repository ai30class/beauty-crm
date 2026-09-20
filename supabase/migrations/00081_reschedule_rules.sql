-- 00081：顧客自助改期（update_online_order_by_phone）補上「跟線上預約同樣的限制」
--
-- 問題：顧客在「查詢／修改我的預約」可以自由選日期、自己打 HH:MM 時間，送出後資料庫只改時間，
--   完全不檢查——可以改到過去的時間、公休日、店休日、營業時間外、設計師不接客的時段。
--   （00080 已經會擋「跟別人重疊」，這裡補其餘的規則，跟顧客預約頁 getAvailableSlots 一致。）
--
-- 規則（都以台灣時間 Asia/Taipei 判斷；店家沒設定營業時間時不擋營業時間）：
--   1) 不能改到現在以前
--   2) 不能改到公休日（全店公休，或這筆預約的設計師休假）
--   3) 不能改到店休日（營業時間設定為「休息」）或營業時間外（開始時間要在營業時間內、結束時間不能超過打烊）
--   4) 不能改到設計師的封鎖時段（每週固定或單日；全店封鎖或這位設計師的個人封鎖）
-- 錯誤訊息直接是白話中文，畫面會原樣顯示給顧客。
-- 簽章、可改的狀態、權限都跟 00046／00080 一樣；重疊檢查仍由 00080 的觸發器負責。

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
  SELECT * INTO o
  FROM public.online_orders
  WHERE id = p_id
    AND customer_phone = p_phone
    AND status IN ('pending', 'confirmed')
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
  -- 原本的預約時長（結束時間 − 開始時間）；異常時退回 duration_minutes
  v_dur_m   := GREATEST(round(extract(epoch FROM (o.end_time - o.appointment_time)) / 60)::int, 0);
  IF v_dur_m = 0 THEN
    v_dur_m := o.duration_minutes;
  END IF;

  -- 2) 公休日：全店公休（staff_id 為空），或這筆預約的設計師休假
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

  -- 4) 封鎖時段（不接客）：開始時間落在封鎖時段內就不行，規則跟顧客預約頁一致
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

  -- 通過所有規則：更新時間（結束時間依原時長一併順延）。跟別人重疊由 00080 的觸發器擋（SLOT_TAKEN）
  UPDATE public.online_orders
  SET appointment_time = p_appointment_time,
      end_time = p_appointment_time + make_interval(mins => v_dur_m),
      notes = p_notes
  WHERE id = p_id;
END;
$$;
