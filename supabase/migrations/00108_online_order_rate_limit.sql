-- 00108：線上預約數量限制（2026-09-24 安全檢查「限流」，Emma 定案）
--
-- 問題：任何人用 LINE／Google 登入就是顧客，可以一直呼叫 create_online_order 送假預約，把店家的時段佔滿
--   （免訂金的直接成立；要訂金的也會先佔 48 小時才被排程取消）。
--
-- 修法：create_online_order 開頭（確認身分之後）加兩道限制——
--   ① 同一個顧客帳號、同一家店，「還沒到的有效預約」（待付款／待確認匯款／已付款／已確認，時間在未來）最多 3 筆；
--   ② 同一個顧客帳號、所有店家合計，24 小時內新建的預約最多 10 筆（含已取消的）。
--   超過就擋下並提示私訊店家。同一個帳號的呼叫用 advisory lock 排隊，避免同時送出多筆一起鑽過上限。
--   其他邏輯與 00101 完全相同（00101 在正式庫是去掉註解後貼上的版本，已用 md5 比對「00101 去註解」＝線上版本）。
--   店家後台自己建的預約不走這支函式，不受影響。
--
-- 驗證：
--   select position('pg_advisory_xact_lock' in prosrc) > 0 as has_limit from pg_proc where proname = 'create_online_order';  -- true

CREATE OR REPLACE FUNCTION public.create_online_order(
  p_owner_id            uuid,
  p_name                text,
  p_phone               text,
  p_birthday            date,
  p_staff_id            uuid,
  p_service_template_id uuid,
  p_appointment_time    timestamptz,
  p_notes               text,
  p_addon_template_ids  uuid[] DEFAULT '{}'
)
RETURNS TABLE(order_id uuid, booking_mode text, deposit_amount numeric, was_already_registered boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  t            public.service_templates%ROWTYPE;
  v_addon_ids  uuid[];
  v_addon_cnt  int;
  v_addon_amt  numeric := 0;
  v_addon_dur  int := 0;
  v_total      numeric;
  v_dur        int;
  v_end        timestamptz;
  v_local      timestamp;
  v_date       date;
  v_key        text;
  v_start_m    int;
  v_day        jsonb;
  v_open_m     int := 9 * 60;
  v_close_m    int := 20 * 60;
  v_restricted boolean;
  v_allowed    jsonb;
  v_customer   uuid;
  v_registered boolean;
  v_need_dep   boolean;
  v_deposit    numeric := 0;
  v_status     text;
  v_mode       text;
  v_deadline   timestamptz;
  v_order_id   uuid;
BEGIN
  -- 0) 身分與基本欄位
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入後再預約' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION '請輸入姓名';
  END IF;
  IF p_phone IS NULL OR p_phone !~ '^09\d{8}$' THEN
    RAISE EXCEPTION '請輸入正確的手機號碼（09 開頭 10 碼）';
  END IF;

  -- 0b) 預約數量限制（00108）：防有人用顧客帳號大量送假預約把時段佔滿
  --     同一個帳號的呼叫排隊處理（交易結束自動放開），避免同時送出多筆一起鑽過上限
  PERFORM pg_advisory_xact_lock(hashtext('create_online_order:' || v_uid::text));
  --     ① 同一家店「還沒到的有效預約」最多 3 筆
  IF (SELECT count(*) FROM public.online_orders o
      WHERE o.customer_user_id = v_uid
        AND o.owner_id = p_owner_id
        AND o.status IN ('pending_payment', 'pending_transfer_confirm', 'paid', 'confirmed')
        AND o.appointment_time > now()) >= 3 THEN
    RAISE EXCEPTION '您在這家店已經有 3 筆還沒到的預約，暫時不能再線上預約；需要加約請直接私訊店家';
  END IF;
  --     ② 所有店家合計，24 小時內新建的預約最多 10 筆（含已取消的，擋反覆預約再取消）
  IF (SELECT count(*) FROM public.online_orders o
      WHERE o.customer_user_id = v_uid
        AND o.created_at > now() - interval '24 hours') >= 10 THEN
    RAISE EXCEPTION '您 24 小時內的線上預約次數已達上限，請稍後再試，或直接私訊店家';
  END IF;

  -- 1) 服務項目：必須是這家店的、開放線上預約、而且不是加購項目
  SELECT * INTO t
  FROM public.service_templates
  WHERE id = p_service_template_id
    AND owner_id = p_owner_id
    AND allow_online_booking = true
    AND is_addon = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到這項服務，或目前不開放線上預約';
  END IF;

  -- 2) 設計師（可不指定）：必須是這家店在職的
  IF p_staff_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = p_staff_id AND s.owner_id = p_owner_id AND s.is_active = true
  ) THEN
    RAISE EXCEPTION '找不到這位設計師，或目前暫停服務';
  END IF;

  -- 3) 加購：每一項都必須是這家店的加購項目且開放線上預約；金額與時長從資料庫拿
  v_addon_ids := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_addon_template_ids, '{}'::uuid[])) AS x);
  IF cardinality(v_addon_ids) > 0 THEN
    SELECT count(*), COALESCE(sum(a.default_amount), 0), COALESCE(sum(a.duration_minutes), 0)
    INTO v_addon_cnt, v_addon_amt, v_addon_dur
    FROM public.service_templates a
    WHERE a.id = ANY (v_addon_ids)
      AND a.owner_id = p_owner_id
      AND a.is_addon = true
      AND a.allow_online_booking = true;
    IF v_addon_cnt <> cardinality(v_addon_ids) THEN
      RAISE EXCEPTION '加購項目有誤，請重新選擇';
    END IF;
  END IF;

  -- 4) 金額、時長、結束時間：一律由資料庫算（跟預約頁的算法一致：結束時間不含服務後休息）
  v_total := t.default_amount + v_addon_amt;
  v_dur   := t.duration_minutes + v_addon_dur;
  v_end   := p_appointment_time + make_interval(mins => v_dur);

  -- 5) 時段規則（跟 00081 顧客改期 ＋ 預約頁一致）
  IF p_appointment_time <= now() THEN
    RAISE EXCEPTION '不能預約已經過去的時間，請選擇之後的日期與時間';
  END IF;

  v_local   := p_appointment_time AT TIME ZONE 'Asia/Taipei';
  v_date    := v_local::date;
  v_key     := (ARRAY['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])[extract(dow FROM v_local)::int + 1];
  v_start_m := extract(hour FROM v_local)::int * 60 + extract(minute FROM v_local)::int;

  IF extract(minute FROM v_local)::int NOT IN (0, 30) OR extract(second FROM v_local) <> 0 THEN
    RAISE EXCEPTION '請選擇整點或半點的時段';
  END IF;

  -- 5a) 公休日：全店公休，或指定的設計師休假
  IF EXISTS (
    SELECT 1 FROM public.holidays h
    WHERE h.owner_id = p_owner_id
      AND h.holiday_date = v_date
      AND (h.staff_id IS NULL OR h.staff_id = p_staff_id)
  ) THEN
    RAISE EXCEPTION '這一天是公休日，請改選其他日期';
  END IF;

  -- 5b) 營業時間：開始 ≥ 開店、開始＋時長＋服務後休息 ≤ 打烊（沒設定時用預約頁的預設 09:00～20:00）
  SELECT sp.business_hours -> v_key INTO v_day
  FROM public.shop_profiles sp
  WHERE sp.owner_id = p_owner_id;

  IF v_day IS NOT NULL THEN
    IF (v_day ->> 'open') = 'false' THEN
      RAISE EXCEPTION '這一天店休，請改選其他日期';
    END IF;
    IF (v_day ->> 'start') ~ '^\d{1,2}:\d{2}$' AND (v_day ->> 'end') ~ '^\d{1,2}:\d{2}$' THEN
      v_open_m  := split_part(v_day ->> 'start', ':', 1)::int * 60 + split_part(v_day ->> 'start', ':', 2)::int;
      v_close_m := split_part(v_day ->> 'end',   ':', 1)::int * 60 + split_part(v_day ->> 'end',   ':', 2)::int;
    END IF;
  END IF;
  IF v_start_m < v_open_m OR v_start_m + v_dur + t.break_after_minutes > v_close_m THEN
    RAISE EXCEPTION '這個時間不在營業時間內，請改選其他時間';
  END IF;

  -- 5c) 封鎖時段（全店，或指定的那位設計師）：開始時間落在封鎖範圍內就不行
  IF EXISTS (
    SELECT 1 FROM public.shop_blocked_slots b
    WHERE b.owner_id = p_owner_id
      AND (b.staff_id IS NULL OR b.staff_id = p_staff_id)
      AND (CASE WHEN b.specific_date IS NOT NULL
                THEN b.specific_date = v_date
                ELSE (cardinality(b.applies_to) = 0 OR v_key = ANY (b.applies_to))
           END)
      AND v_start_m >= split_part(b.start_time, ':', 1)::int * 60 + split_part(b.start_time, ':', 2)::int
      AND v_start_m <  split_part(b.end_time,   ':', 1)::int * 60 + split_part(b.end_time,   ':', 2)::int
  ) THEN
    RAISE EXCEPTION '這個時段不接受預約，請改選其他時間';
  END IF;

  -- 5d) 這位顧客的預約時段限制（店家針對特定顧客設定的）
  SELECT c.booking_restricted, c.booking_allowed_hours INTO v_restricted, v_allowed
  FROM public.customers c
  WHERE c.owner_id = p_owner_id AND c.phone = p_phone
  LIMIT 1;
  IF COALESCE(v_restricted, false) AND jsonb_typeof(v_allowed) = 'array' AND jsonb_array_length(v_allowed) > 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_allowed) AS r
      WHERE v_start_m >= split_part(r ->> 'start', ':', 1)::int * 60 + split_part(r ->> 'start', ':', 2)::int
        AND v_start_m <  split_part(r ->> 'end',   ':', 1)::int * 60 + split_part(r ->> 'end',   ':', 2)::int
    ) THEN
      RAISE EXCEPTION '這個時段不在您可預約的時間內，請改選其他時間';
    END IF;
  END IF;

  -- 6) 顧客檔案（00098 版：只認 auth.uid()，綁了別人的不改）；熟客＝這家店已有這支電話的檔案
  SELECT u.customer_id, u.was_already_registered INTO v_customer, v_registered
  FROM public.upsert_customer_by_phone(p_owner_id, btrim(p_name), p_phone, p_birthday, NULL) AS u;

  -- 7) 訂金：服務需要訂金且不是熟客才收；比例用店家在服務項目設定的 deposit_percent
  v_need_dep := t.require_deposit AND NOT v_registered;
  IF v_need_dep THEN
    v_deposit  := round(v_total * t.deposit_percent / 100.0, 0);
    v_status   := 'pending_transfer_confirm';
    v_mode     := 'deposit';
    v_deadline := now() + interval '48 hours';
  ELSE
    v_deposit  := 0;
    v_status   := 'confirmed';
    v_mode     := 'direct';
    v_deadline := NULL;
  END IF;

  -- 8) 建主單（跟別人重疊由 00080 觸發器擋，會丟 SLOT_TAKEN）
  INSERT INTO public.online_orders (
    owner_id, customer_name, customer_phone, customer_id, customer_user_id,
    staff_id, service_template_id, service_name, duration_minutes,
    total_amount, deposit_amount, appointment_time, end_time, notes,
    status, booking_mode, deposit_confirm_deadline
  ) VALUES (
    p_owner_id, btrim(p_name), p_phone, v_customer, v_uid,
    p_staff_id, t.id, t.name, v_dur,
    v_total, v_deposit, p_appointment_time, v_end, NULLIF(btrim(COALESCE(p_notes, '')), ''),
    v_status, v_mode::booking_mode_enum, v_deadline
  )
  RETURNING id INTO v_order_id;

  -- 9) 加購明細（名稱、金額、時長都從資料庫拿）
  IF cardinality(v_addon_ids) > 0 THEN
    INSERT INTO public.online_order_addons (order_id, owner_id, service_template_id, name, amount, duration_minutes)
    SELECT v_order_id, p_owner_id, a.id, a.name, a.default_amount, a.duration_minutes
    FROM public.service_templates a
    WHERE a.id = ANY (v_addon_ids);
  END IF;

  RETURN QUERY SELECT v_order_id, v_mode, v_deposit, v_registered;
END;
$$;
