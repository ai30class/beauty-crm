-- 00080：線上預約「送出／改期當下」由資料庫再擋一次重疊（修正雙重預約，第二步）
--
-- 00079 讓顧客預約頁「看得到」哪些時段被佔用，但仍有兩個洞：
--   ① 兩個人同時按送出（畫面上看到的都是空的），兩筆會雙雙成功——資料庫沒有任何防重疊的保護
--   ② 顧客自助改期（update_online_order_by_phone）完全不檢查有沒有空，而且只改 appointment_time、
--      沒同步改 end_time，改完的預約起訖時間會壞掉（結束時間還停在舊日期），等於在排班表上「隱形」
--
-- 做法：
--   A. 把 00079 的查詢拆成「核心函式」（可排除某一筆訂單自己），對外的 get_busy_ranges 改呼叫核心，行為不變
--   B. online_orders 加 BEFORE INSERT／UPDATE 觸發器：會占時段的訂單，若跟同一位設計師的其他佔用重疊，
--      直接拒絕（錯誤訊息 SLOT_TAKEN）；用「每家店一把鎖」讓同時送出的人排隊、後到的被擋
--   C. 改期函式一併把 end_time 依原時長順延，並讓觸發器檢查新時段
--
-- 店家本人與員工（在後台微調預約）不受觸發器限制——衝突與否由畫面提醒、由店家自己決定。

-- ── A. 核心：可排除某一筆訂單自己（改期時不能跟自己撞）───────────────────────────
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

    -- 2) 店裡手動預約（時長規則同排班表：舊系統匯入看備註，其餘 60 分鐘）
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

-- 核心函式只給資料庫內部（觸發器、get_busy_ranges）呼叫，不開放給顧客直接呼叫
REVOKE ALL ON FUNCTION public.get_busy_ranges_core(uuid, timestamptz, timestamptz, uuid) FROM PUBLIC, anon, authenticated;

-- 對外的 get_busy_ranges：簽章與權限都不變（顧客端已在使用），內容改成呼叫核心
CREATE OR REPLACE FUNCTION public.get_busy_ranges(
  p_owner_id uuid,
  p_from     timestamptz,
  p_to       timestamptz
)
RETURNS TABLE (busy_staff_id uuid, busy_start timestamptz, busy_end timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.busy_staff_id, c.busy_start, c.busy_end
  FROM public.get_busy_ranges_core(p_owner_id, p_from, p_to, NULL) c
$$;

-- ── B. 觸發器：會占時段的線上預約，不准跟同一位設計師的其他佔用重疊 ───────────────
CREATE OR REPLACE FUNCTION public.online_orders_prevent_overlap()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hold_statuses text[] := ARRAY['paid', 'confirmed', 'pending_transfer_confirm', 'pending_payment'];
BEGIN
  -- 取消、完成、退款…這類不占時段的狀態，不檢查
  IF NOT (NEW.status = ANY (hold_statuses)) THEN
    RETURN NEW;
  END IF;

  -- 店家本人與員工在後台微調預約：不擋（畫面會提醒衝突，由店家自己決定）
  IF auth.uid() IS NOT NULL
     AND (auth.uid() = NEW.owner_id OR public.staff_shop_owner_id() = NEW.owner_id) THEN
    RETURN NEW;
  END IF;

  -- 更新時，若「時間、結束時間、設計師」都沒變、且原本就在占時段（例如只是付款狀態往前走、改備註），不重查
  IF TG_OP = 'UPDATE'
     AND OLD.status = ANY (hold_statuses)
     AND NEW.appointment_time = OLD.appointment_time
     AND NEW.end_time = OLD.end_time
     AND NEW.staff_id IS NOT DISTINCT FROM OLD.staff_id THEN
    RETURN NEW;
  END IF;

  -- 每家店一把鎖：同時送出的人排隊，後面的人一定看得到前面剛成立的預約
  PERFORM pg_advisory_xact_lock(hashtextextended('online_orders_slot:' || NEW.owner_id::text, 0));

  -- 指定設計師：只跟「同一位設計師」的佔用比；沒有設計師（店家沒設定服務人員）：跟全店的佔用比
  IF EXISTS (
    SELECT 1
    FROM public.get_busy_ranges_core(NEW.owner_id, NEW.appointment_time, NEW.end_time, NEW.id) b
    WHERE NEW.staff_id IS NULL OR b.busy_staff_id = NEW.staff_id
  ) THEN
    RAISE EXCEPTION 'SLOT_TAKEN' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_online_orders_prevent_overlap ON public.online_orders;
CREATE TRIGGER trg_online_orders_prevent_overlap
  BEFORE INSERT OR UPDATE OF appointment_time, end_time, staff_id, status ON public.online_orders
  FOR EACH ROW EXECUTE FUNCTION public.online_orders_prevent_overlap();

-- ── C. 顧客自助改期：連結束時間一起順延，並讓觸發器檢查新時段 ─────────────────────
--    （簽章、可改的狀態、權限都跟 00046 一樣；只多了 end_time 依原時長順延）
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
      end_time = p_appointment_time + (end_time - appointment_time),
      notes = p_notes
  WHERE id = p_id
    AND customer_phone = p_phone
    AND status IN ('pending', 'confirmed');

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到這筆預約，或目前狀態已無法修改';
  END IF;
END;
$$;
