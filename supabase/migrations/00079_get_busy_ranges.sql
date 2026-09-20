-- 00079：顧客預約頁「哪些時段已被佔用」的統一查詢（修正雙重預約）
--
-- 問題：顧客預約頁原本只看 online_orders 裡 paid／confirmed 的線上預約來判斷時段有沒有空，
--   ① 店裡手動排的預約（含電話約、舊系統匯入）看不到（顧客讀不到 appointments 表）
--   ② 設計師標的「預留時間」（上課、外出、午休…）看不到（顧客讀不到 staff_reserved_slots 表）
--   ③ 「待確認匯款」「待付款」的線上預約不占時段（店家確認收款前最長 48 小時，別人可以約同一時段）
-- 結果顧客可以約到已經被佔用的時段。
--
-- 做法：這個函式用 SECURITY DEFINER 代替顧客去讀上述三張表，但「只回傳設計師代號＋起訖時間」，
--   不含任何姓名、電話、備註、服務內容，所以不會外洩個資。

CREATE OR REPLACE FUNCTION public.get_busy_ranges(
  p_owner_id uuid,
  p_from     timestamptz,
  p_to       timestamptz
)
RETURNS TABLE (busy_staff_id uuid, busy_start timestamptz, busy_end timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.busy_staff_id, t.busy_start, t.busy_end
  FROM (

    -- 1) 線上預約：已付款／已確認，加上「還在等的」（待確認匯款在期限內、待付款 30 分鐘內）也先占著時段
    SELECT o.staff_id AS busy_staff_id, o.appointment_time AS busy_start, o.end_time AS busy_end
    FROM public.online_orders o
    WHERE o.owner_id = p_owner_id
      AND (
        o.status IN ('paid', 'confirmed')
        OR (o.status = 'pending_transfer_confirm'
            AND (o.deposit_confirm_deadline IS NULL OR o.deposit_confirm_deadline > now()))
        OR (o.status = 'pending_payment'
            AND o.created_at > now() - interval '30 minutes')
      )

    UNION ALL

    -- 2) 店裡手動預約：資料庫沒有時長欄位，跟排班表同一套規則——
    --    舊系統匯入的預約時長寫在備註「[舊系統匯入] HH:MM~HH:MM」，其餘一律當 60 分鐘
    SELECT a.staff_id,
           a.appointment_time,
           a.appointment_time + make_interval(mins => COALESCE(NULLIF(d.mins, 0), 60))
    FROM public.appointments a
    LEFT JOIN LATERAL (
      SELECT CASE WHEN x.m IS NOT NULL
                  THEN GREATEST((x.m[3]::int * 60 + x.m[4]::int) - (x.m[1]::int * 60 + x.m[2]::int), 0)
             END AS mins
      FROM (SELECT regexp_match(a.notes, '^\[舊系統匯入\]\s*(\d{2}):(\d{2})~(\d{2}):(\d{2})') AS m) x
    ) d ON true
    WHERE a.owner_id = p_owner_id
      AND a.status = 'pending'
      AND a.appointment_time < p_to
      AND a.appointment_time > p_from - interval '12 hours'

    UNION ALL

    -- 3) 設計師的預留時間（上課、外出、午休…）：日期＋「HH:MM」文字，換成台灣時間的時間點
    SELECT r.staff_id,
           (r.reserved_date + r.start_time::time) AT TIME ZONE 'Asia/Taipei',
           (r.reserved_date + r.end_time::time)   AT TIME ZONE 'Asia/Taipei'
    FROM public.staff_reserved_slots r
    WHERE r.owner_id = p_owner_id
      AND r.reserved_date BETWEEN ((p_from AT TIME ZONE 'Asia/Taipei')::date - 1)
                              AND ((p_to   AT TIME ZONE 'Asia/Taipei')::date + 1)

  ) t
  WHERE t.busy_start < p_to
    AND t.busy_end   > p_from
$$;

-- 顧客（已登入或未登入）都要能呼叫；一般 PUBLIC 預設權限先收回再明確授權
REVOKE ALL ON FUNCTION public.get_busy_ranges(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_busy_ranges(uuid, timestamptz, timestamptz) TO anon, authenticated;
