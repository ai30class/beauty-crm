-- 00088：手動預約記錄「時長」
--
-- 背景：手動預約（店家／員工在排班表點空白處、或預約管理新增的預約）原本沒有時長欄位，
-- 你選了 180 分鐘的服務，存檔時時長就被丟掉，之後排班表、顧客預約頁的空檔計算、
-- 防重複預約檢查（00079／00080 的 get_busy_ranges_core）一律當 60 分鐘。
-- Emma（9/21）：選 180 分鐘的服務，預約完成後要占 180 分鐘。
--
-- 做法：
--   ① appointments 新增 duration_minutes（可空）。新增預約時存下所選服務的時長；編輯預約頁也能改。
--   ② get_busy_ranges_core 的手動預約時長改成：有記錄就用記錄 → 沒記錄的舊資料照原規則
--      （舊系統匯入的看備註「[舊系統匯入] HH:MM~HH:MM」，其餘 60 分鐘）。
--      對外的 get_busy_ranges 與線上預約的防重複觸發器都呼叫核心函式，所以不用另外改。
-- 舊資料的 duration_minutes 都是空的，行為完全不變。

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS duration_minutes int
  CHECK (duration_minutes IS NULL OR (duration_minutes >= 5 AND duration_minutes <= 720));

CREATE OR REPLACE FUNCTION public.get_busy_ranges_core(
  p_owner_id         uuid,
  p_from             timestamptz,
  p_to               timestamptz,
  p_exclude_order_id uuid
)
RETURNS TABLE (busy_staff_id uuid, busy_start timestamptz, busy_end timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.busy_staff_id, t.busy_start, t.busy_end
  FROM (

    -- 1) 線上預約：已付款／已確認，加上還在等的（待確認匯款在期限內、待付款 30 分鐘內）
    SELECT o.staff_id AS busy_staff_id, o.appointment_time AS busy_start, o.end_time AS busy_end
    FROM public.online_orders o
    WHERE o.owner_id = p_owner_id
      AND (p_exclude_order_id IS NULL OR o.id <> p_exclude_order_id)
      AND (
        o.status IN ('paid', 'confirmed')
        OR (o.status = 'pending_transfer_confirm'
            AND (o.deposit_confirm_deadline IS NULL OR o.deposit_confirm_deadline > now()))
        OR (o.status = 'pending_payment'
            AND o.created_at > now() - interval '30 minutes')
      )

    UNION ALL

    -- 2) 店裡手動預約：有記錄時長（duration_minutes）就用；沒記錄的舊資料照原規則——
    --    舊系統匯入的看備註，其餘 60 分鐘
    SELECT a.staff_id,
           a.appointment_time,
           a.appointment_time + make_interval(mins => COALESCE(a.duration_minutes, NULLIF(d.mins, 0), 60))
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

    -- 3) 設計師的預留時間（上課、外出、午休…）
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

-- 核心函式只給資料庫內部（觸發器、get_busy_ranges）呼叫，不開放給顧客直接呼叫（跟 00080 一樣）
REVOKE ALL ON FUNCTION public.get_busy_ranges_core(uuid, timestamptz, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
