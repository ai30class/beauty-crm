-- 00101：線上預約改由「一支資料庫函式」建單（2026-09-23 安全審查 P0「假預約」＋P2「假加購」，第一階段）
--
-- 問題：online_orders 對 anon 開放 INSERT（WITH CHECK true），已登入顧客也只檢查 customer_user_id 是自己；
--   online_order_addons 對 anon／authenticated 開放 INSERT（WITH CHECK true）。金額、時長、訂金、狀態全是
--   前端算好送上來、資料庫照單全收——任何人都能替任何店塞假預約（連 status='confirmed' 都能自己填）。
--
-- 修法（分兩階段，避免中途卡到正在預約的顧客）：
--   第一階段（這份）：新增 create_online_order()，只接受「哪家店、哪個服務、哪位設計師、哪個時間、哪些加購、
--     顧客姓名電話生日」；價格、時長、訂金比例、熟客免訂金、狀態、結束時間全部由資料庫依店家設定重算，
--     並套用跟「顧客改期」（00081）與預約頁一樣的時段規則。主單＋加購一次寫入。這份只是「加一支新函式」，
--     舊流程不受影響，可以先套用。
--   第二階段（00102）：App 改用這支函式並部署之後，再把舊的直接 INSERT 規則拆掉。
--
-- 順序：先套用這份 → push 改用新函式的 App → 用測試店家實際約一次 → 再套用 00102。
--
-- 設計備註：
--   - 呼叫 upsert_customer_by_phone（00098 修過的版本）建／找顧客檔案，只認 auth.uid()。
--   - 「熟客免訂金」＝這家店已有這支電話的顧客檔案（跟現在預約頁的判斷一致），但改由資料庫判斷，
--     前端傳什麼都不算數。
--   - 跟別人重疊由 00080 的觸發器擋（SLOT_TAKEN）；這支函式是 SECURITY DEFINER 但 auth.uid() 仍是顧客，
--     所以觸發器的「店家自己排不擋」例外不會誤套用在顧客身上。
--   - 營業時間檢查跟預約頁一致：開始 ≥ 開店、開始＋服務時長＋服務後休息 ≤ 打烊；店家沒設定當天營業時間時，
--     預約頁只會列 09:00～20:00 的格子，這裡也用同一個預設。
--   - 時段只接受 :00／:30（預約頁每 30 分鐘一格）。
--
-- 驗證（貼完用唯讀 SQL 看）：
--   select proname, has_function_privilege('anon', oid, 'EXECUTE') as anon,
--          has_function_privilege('authenticated', oid, 'EXECUTE') as logged_in
--   from pg_proc where proname = 'create_online_order';
--   預期：一列，anon=false、logged_in=true。

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

REVOKE EXECUTE ON FUNCTION public.create_online_order(uuid, text, text, date, uuid, uuid, timestamptz, text, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_online_order(uuid, text, text, date, uuid, uuid, timestamptz, text, uuid[]) TO authenticated;
