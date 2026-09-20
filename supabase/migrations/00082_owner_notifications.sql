-- 00082：店家後台的「新預約通知」
--
-- 顧客從預約頁預約成功（免訂金直接成立、或需訂金等待確認匯款）時，自動替店家記一筆通知，
-- 後台首頁與通知清單讀這張表。**只寫進資料庫，不發 LINE**（LINE 推播算額度，提醒只留給顧客）。
--
-- 設計重點：
--   ① 通知寫入失敗絕對不能擋住顧客預約：整段包在 EXCEPTION 裡，出錯只記警告。
--   ② 店家本人／員工自己在後台排的預約不通知（只有顧客自己從預約頁預約才算）。
--   ③ 同一筆預約同一種通知只記一次（UNIQUE (type, ref_id)）。
--   ④ 只有店家本人讀得到自己的通知（員工、顧客都看不到）；店家只能改 read_at（標已讀）。
--   ⑤ 通知內文只放姓名、服務、時間、設計師，不放電話。

CREATE TABLE IF NOT EXISTS public.owner_notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            text NOT NULL,
  ref_id          uuid,
  title           text NOT NULL,
  body            text NOT NULL,
  is_new_customer boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  read_at         timestamptz,
  UNIQUE (type, ref_id)
);

CREATE INDEX IF NOT EXISTS owner_notifications_owner_created_idx
  ON public.owner_notifications (owner_id, created_at DESC);

ALTER TABLE public.owner_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_notifications_select ON public.owner_notifications;
CREATE POLICY owner_notifications_select ON public.owner_notifications
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS owner_notifications_mark_read ON public.owner_notifications;
CREATE POLICY owner_notifications_mark_read ON public.owner_notifications
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- 前端只能讀、只能改 read_at；新增一律由下面的觸發器代寫
REVOKE ALL ON public.owner_notifications FROM anon, authenticated;
GRANT SELECT ON public.owner_notifications TO authenticated;
GRANT UPDATE (read_at) ON public.owner_notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.online_orders_notify_owner()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  notify_statuses text[] := ARRAY['confirmed', 'pending_transfer_confirm', 'paid'];
  v_is_new     boolean;
  v_staff_name text;
  v_when       text;
  v_title      text;
  v_body       text;
  v_weekday    text[] := ARRAY['日', '一', '二', '三', '四', '五', '六'];
BEGIN
  -- 通知出任何問題，都不能讓顧客的預約失敗
  BEGIN
    -- 只在「預約剛成立／剛進入待確認匯款」通知；已經在這些狀態之間往前走（例如店家按確認）不重複通知
    IF NOT (NEW.status = ANY (notify_statuses)) THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = ANY (notify_statuses) THEN
      RETURN NEW;
    END IF;

    -- 店家本人與員工在後台建立／調整的預約不通知
    IF auth.uid() IS NOT NULL
       AND (auth.uid() = NEW.owner_id OR public.staff_shop_owner_id() = NEW.owner_id) THEN
      RETURN NEW;
    END IF;

    -- 新客＝這家店沒有這支電話更早的線上預約、手動預約或服務記錄
    v_is_new :=
      NOT EXISTS (
        SELECT 1 FROM public.online_orders o
        WHERE o.owner_id = NEW.owner_id AND o.customer_phone = NEW.customer_phone
          AND o.id <> NEW.id AND o.status <> 'cancelled'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.appointments a
        JOIN public.customers c ON c.id = a.customer_id
        WHERE c.owner_id = NEW.owner_id AND c.phone = NEW.customer_phone
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.service_records sr
        JOIN public.customers c ON c.id = sr.customer_id
        WHERE c.owner_id = NEW.owner_id AND c.phone = NEW.customer_phone
      );

    SELECT s.name INTO v_staff_name FROM public.staff s WHERE s.id = NEW.staff_id;

    v_when := to_char(NEW.appointment_time AT TIME ZONE 'Asia/Taipei', 'FMMM/FMDD')
      || '（' || v_weekday[extract(dow FROM NEW.appointment_time AT TIME ZONE 'Asia/Taipei')::int + 1] || '）'
      || to_char(NEW.appointment_time AT TIME ZONE 'Asia/Taipei', 'HH24:MI');

    v_title := CASE NEW.status
      WHEN 'pending_transfer_confirm' THEN '新預約・待確認匯款'
      ELSE '新預約成功'
    END;

    v_body := NEW.customer_name
      || CASE WHEN v_is_new THEN '（新客）' ELSE '' END
      || '｜' || NEW.service_name
      || '｜' || v_when
      || CASE WHEN v_staff_name IS NOT NULL THEN '｜設計師 ' || v_staff_name ELSE '' END
      || CASE NEW.status
           WHEN 'pending_transfer_confirm' THEN '｜需訂金，請 48 小時內核對匯款並到訂單按「確認已收訂金」'
           WHEN 'paid' THEN '｜已付訂金'
           ELSE '｜免訂金，預約已成立'
         END;

    INSERT INTO public.owner_notifications (owner_id, type, ref_id, title, body, is_new_customer)
    VALUES (NEW.owner_id, 'new_online_booking', NEW.id, v_title, v_body, v_is_new)
    ON CONFLICT (type, ref_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '新預約通知寫入失敗（不影響預約）：%', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_online_orders_notify_owner ON public.online_orders;
CREATE TRIGGER trg_online_orders_notify_owner
  AFTER INSERT OR UPDATE OF status ON public.online_orders
  FOR EACH ROW EXECUTE FUNCTION public.online_orders_notify_owner();
