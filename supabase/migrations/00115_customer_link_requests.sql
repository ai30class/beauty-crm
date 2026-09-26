-- 00115：舊顧客檔要店家確認是本人才連結 LINE 帳號（2026-09-26 第四輪安全檢測 P1 情況 2，A 案第二步）
--
-- 問題：顧客用 LINE 登入預約時，填的電話對到一份「還沒綁任何帳號」的舊顧客檔，
--   upsert_customer_by_phone 會直接把那份檔案綁給預約者 → 只要知道老顧客電話，
--   就看得到她的顧客檔（含店家備註、標籤）、套票，還被當熟客免訂金。
--
-- 修法（Emma 2026-09-26 定案，見 vault〈顧客身分確認規劃_情況2〉）：
--   ① 這種情況「預約照常成立、照舊免訂金」，但先不綁，記一筆「待確認連結」。
--   ② 店家在後台看左右對照（LINE 名稱／預約填的資料 vs 店裡顧客檔）按「是本人」或「不是本人」。
--      是本人 → 綁定；不是本人 → 不綁，之後同一個 LINE 帳號用這支電話預約改收訂金、不再跳確認。
--   ③ 只有店家本人能按（員工的「管理顧客」權限在 00070 已取消，員工目前只能瀏覽顧客）。
--   ④ 新預約通知多一句提醒；顧客端可以查「自己上次預約填的資料」拿來自動帶入。
--   其他三種情況（新電話／綁的是自己／綁在別人）行為完全不變。
--
-- 前提：00114（套票只認綁定本人）已上線；send-reminders 已改用預約者本人 LINE（523ab08），
--   所以「還沒確認」的本人照樣收得到這筆線上預約的提醒。

-- ── 1) 待確認連結清單 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_link_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id        uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  requester_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_name     text NOT NULL,
  requested_phone    text NOT NULL,
  requested_birthday date,
  -- pending＝待確認；linked＝店家確認是本人、已綁定；rejected＝店家說不是本人；
  -- superseded＝這份顧客檔已經連結給別的帳號，這筆不用再處理
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'linked', 'rejected', 'superseded')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  decided_at         timestamptz,
  decided_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT customer_link_requests_customer_requester_key UNIQUE (customer_id, requester_user_id)
);

CREATE INDEX IF NOT EXISTS customer_link_requests_owner_status_idx
  ON public.customer_link_requests (owner_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS customer_link_requests_requester_idx
  ON public.customer_link_requests (requester_user_id);

ALTER TABLE public.customer_link_requests ENABLE ROW LEVEL SECURITY;

-- 只有店家本人讀得到自己店的；新增與修改一律走下面的函式
DROP POLICY IF EXISTS customer_link_requests_owner_select ON public.customer_link_requests;
CREATE POLICY customer_link_requests_owner_select ON public.customer_link_requests
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

REVOKE ALL ON public.customer_link_requests FROM anon, authenticated;
GRANT SELECT ON public.customer_link_requests TO authenticated;

-- ── 2) 用電話找顧客（00109 版＋第 4 種改成「先不綁、記待確認」）──────────
CREATE OR REPLACE FUNCTION public.upsert_customer_by_phone(
  p_owner_id uuid,
  p_name text,
  p_phone text,
  p_birthday date,
  p_customer_user_id uuid DEFAULT NULL
)
RETURNS TABLE(customer_id uuid, was_already_registered boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_id     uuid;
  v_bound  uuid;
  v_status text;
BEGIN
  -- p_customer_user_id 一律不採用；身分只認目前登入的帳號
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入後再預約' USING ERRCODE = '42501';
  END IF;

  SELECT id, customer_user_id INTO v_id, v_bound
  FROM public.customers
  WHERE owner_id = p_owner_id AND phone = p_phone
  LIMIT 1;

  IF v_id IS NULL THEN
    -- 第 1 種：店裡沒有這支電話 → 建新檔、直接綁（資料是他自己填的）
    INSERT INTO public.customers (owner_id, name, phone, birthday, notes, customer_user_id)
    VALUES (p_owner_id, p_name, p_phone, p_birthday, NULL, v_uid)
    RETURNING id INTO v_id;
    RETURN QUERY SELECT v_id, false;

  ELSIF v_bound = v_uid THEN
    -- 第 2 種：綁的就是自己 → 熟客（跟以前一樣更新姓名、補生日）
    UPDATE public.customers
    SET name = p_name,
        birthday = COALESCE(birthday, p_birthday)
    WHERE id = v_id;
    RETURN QUERY SELECT v_id, true;

  ELSIF v_bound IS NULL THEN
    -- 第 4 種（00115）：舊顧客檔還沒綁任何帳號 → 不綁、不改店家資料，記一筆待確認
    SELECT r.status INTO v_status
    FROM public.customer_link_requests r
    WHERE r.customer_id = v_id AND r.requester_user_id = v_uid;

    IF v_status = 'rejected' THEN
      -- 店家說過「不是本人」：不再跳確認，當一般非本人處理（收訂金）
      RETURN QUERY SELECT v_id, false;
      RETURN;
    END IF;

    INSERT INTO public.customer_link_requests AS r
      (owner_id, customer_id, requester_user_id, requested_name, requested_phone, requested_birthday)
    VALUES (p_owner_id, v_id, v_uid, p_name, p_phone, p_birthday)
    -- 用約束名稱指定（函式的回傳欄位也叫 customer_id，直接寫欄位名會被判定成模稜兩可）
    ON CONFLICT ON CONSTRAINT customer_link_requests_customer_requester_key DO UPDATE
      SET requested_name     = EXCLUDED.requested_name,
          requested_phone    = EXCLUDED.requested_phone,
          requested_birthday = COALESCE(EXCLUDED.requested_birthday, r.requested_birthday),
          updated_at         = now()
      WHERE r.status = 'pending';

    -- 確認前照舊當熟客免訂金（Emma 決定點 1）；本人完全不受影響
    RETURN QUERY SELECT v_id, true;

  ELSE
    -- 第 3 種：綁在別人帳號 → 不改對方的資料，也不算熟客（00109）
    RETURN QUERY SELECT v_id, false;
  END IF;
END;
$function$;

-- ── 3) 店家：列出待確認（含左右對照需要的資料）────────────────────────
CREATE OR REPLACE FUNCTION public.get_customer_link_requests(p_status text DEFAULT 'pending')
RETURNS TABLE(
  id uuid,
  customer_id uuid,
  requester_user_id uuid,
  status text,
  requested_name text,
  requested_phone text,
  requested_birthday date,
  line_display_name text,
  line_picture_url text,
  customer_name text,
  customer_phone text,
  customer_birthday date,
  last_visit_date date,
  visit_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.customer_id, r.requester_user_id, r.status,
         r.requested_name, r.requested_phone, r.requested_birthday,
         li.display_name, li.picture_url,
         c.name, c.phone, c.birthday,
         sr.last_visit, COALESCE(sr.cnt, 0),
         r.created_at, r.updated_at
  FROM public.customer_link_requests r
  JOIN public.customers c ON c.id = r.customer_id
  LEFT JOIN LATERAL (
    SELECT l.display_name, l.picture_url
    FROM public.line_identities l
    LEFT JOIN public.shop_line_channels sc ON sc.owner_id = r.owner_id
    WHERE l.user_id = r.requester_user_id
    ORDER BY (l.login_channel_id IS NOT DISTINCT FROM sc.login_channel_id) DESC, l.created_at DESC
    LIMIT 1
  ) li ON true
  LEFT JOIN LATERAL (
    SELECT max(s.service_date) AS last_visit, count(*) AS cnt
    FROM public.service_records s
    WHERE s.customer_id = r.customer_id
  ) sr ON true
  WHERE r.owner_id = auth.uid()
    AND (p_status IS NULL OR r.status = p_status)
  ORDER BY r.updated_at DESC;
$$;

-- ── 4) 店家：按「是本人」或「不是本人」────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_customer_link_request(p_request_id uuid, p_is_self boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  r       public.customer_link_requests%ROWTYPE;
  v_bound uuid;
  v_other text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.customer_link_requests WHERE id = p_request_id FOR UPDATE;
  -- 只有這家店的店家本人能處理；別家店、員工、顧客一律當作找不到
  IF NOT FOUND OR r.owner_id <> v_uid THEN
    RAISE EXCEPTION '找不到這筆待確認，或沒有權限' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION '這筆已經處理過了';
  END IF;

  IF NOT p_is_self THEN
    UPDATE public.customer_link_requests
    SET status = 'rejected', decided_at = now(), decided_by = v_uid, updated_at = now()
    WHERE id = r.id;
    RETURN '已標記為不是本人，這筆預約照常保留';
  END IF;

  SELECT customer_user_id INTO v_bound FROM public.customers WHERE id = r.customer_id FOR UPDATE;
  IF v_bound IS NOT NULL AND v_bound <> r.requester_user_id THEN
    UPDATE public.customer_link_requests
    SET status = 'superseded', updated_at = now()
    WHERE id = r.id;
    RAISE EXCEPTION '這份顧客檔已經連結其他 LINE 帳號，無法再連結';
  END IF;

  -- 同一個 LINE 帳號在這家店已經連結另一份顧客檔：先不動，請店家確認是不是重複的檔案
  SELECT c.name INTO v_other
  FROM public.customers c
  WHERE c.owner_id = r.owner_id AND c.customer_user_id = r.requester_user_id AND c.id <> r.customer_id
  LIMIT 1;
  IF v_other IS NOT NULL THEN
    RAISE EXCEPTION '這個 LINE 帳號已經連結到店裡另一位顧客「%」，請先確認是不是重複的顧客資料', v_other;
  END IF;

  -- 綁定；不改店家記的姓名，生日沒填過才補上
  UPDATE public.customers
  SET customer_user_id = r.requester_user_id,
      birthday = COALESCE(birthday, r.requested_birthday)
  WHERE id = r.customer_id;

  UPDATE public.customer_link_requests
  SET status = 'linked', decided_at = now(), decided_by = v_uid, updated_at = now()
  WHERE id = r.id;

  -- 同一份檔案其他人的待確認就不用再處理了
  UPDATE public.customer_link_requests
  SET status = 'superseded', updated_at = now()
  WHERE customer_id = r.customer_id AND id <> r.id AND status = 'pending';

  RETURN '已連結，這位顧客之後預約會直接被認得';
END;
$$;

-- ── 5) 顧客：預約頁自動帶入（綁好的讀顧客檔；還沒綁的讀「自己上次預約填的」）─────
CREATE OR REPLACE FUNCTION public.get_my_booking_prefill(p_owner_id uuid)
RETURNS TABLE(name text, phone text, birthday date, link_pending boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT c.name, c.phone, c.birthday, false
  FROM public.customers c
  WHERE c.owner_id = p_owner_id AND c.customer_user_id = v_uid
  ORDER BY c.updated_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN;
  END IF;

  -- 只回傳他自己當初填的內容，不回傳店家顧客檔裡的任何資料
  RETURN QUERY
  SELECT r.requested_name, r.requested_phone, r.requested_birthday, (r.status = 'pending')
  FROM public.customer_link_requests r
  WHERE r.owner_id = p_owner_id AND r.requester_user_id = v_uid
  ORDER BY r.updated_at DESC
  LIMIT 1;
END;
$$;

-- ── 6) 顧客：「我的套票」用，有沒有店家還在確認我的身分 ─────────────────
CREATE OR REPLACE FUNCTION public.my_customer_link_pending()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customer_link_requests
    WHERE requester_user_id = auth.uid() AND status = 'pending'
  );
$$;

-- ── 7) 新預約通知多一句（另掛一個觸發器，不重寫 00082 的通知函式）───────────
--   同一事件的觸發器照名稱順序執行：trg_online_orders_notify_owner 先寫通知，
--   這個 trg_online_orders_zz_link_notice 後補一句。出任何錯都不影響預約。
CREATE OR REPLACE FUNCTION public.online_orders_link_request_notice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notice text := '｜⚠️ 電話對到舊顧客檔，請到這筆預約確認是不是本人';
BEGIN
  BEGIN
    IF NEW.customer_id IS NOT NULL AND NEW.customer_user_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.customer_link_requests r
         WHERE r.customer_id = NEW.customer_id
           AND r.requester_user_id = NEW.customer_user_id
           AND r.status = 'pending'
       ) THEN
      UPDATE public.owner_notifications
      SET body = body || v_notice
      WHERE type = 'new_online_booking' AND ref_id = NEW.id
        AND position(v_notice IN body) = 0;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '待確認提醒寫入失敗（不影響預約）：%', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_online_orders_zz_link_notice ON public.online_orders;
CREATE TRIGGER trg_online_orders_zz_link_notice
  AFTER INSERT OR UPDATE OF status ON public.online_orders
  FOR EACH ROW EXECUTE FUNCTION public.online_orders_link_request_notice();

-- ── 8) 權限：未登入一律不能呼叫；登入者可呼叫（函式裡自己檢查身分）──────────
REVOKE ALL ON FUNCTION public.get_customer_link_requests(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_customer_link_requests(text) TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_customer_link_request(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.resolve_customer_link_request(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_booking_prefill(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_booking_prefill(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.my_customer_link_pending() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_customer_link_pending() TO authenticated;
REVOKE ALL ON FUNCTION public.online_orders_link_request_notice() FROM PUBLIC, anon, authenticated;
-- upsert_customer_by_phone：CREATE OR REPLACE 保留 00098 設好的權限（anon 不可、authenticated 可）
