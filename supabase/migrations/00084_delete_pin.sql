-- 00084：刪除預約前要輸入的「刪除密碼」（商家專用）
--
-- 目的：避免手滑按到垃圾桶就把預約刪掉。這是「防手滑」，不是資安防線：
-- 密碼只在畫面上擋，資料庫本身仍照原本的權限規則運作（店家本人／員工本來就能刪）。
--
-- 設計：
--   ① 密碼只存「加密後的雜湊」（pgcrypto 的 bcrypt），不存明文；資料表沒有任何前端可用的權限，
--      前端一律只能透過下面三個函式（設定／檢查有沒有設定／驗證）。
--   ② 只有商家本人能設定與變更；員工帳號不能設定，也不需要輸入（員工維持原樣）。
--   ③ 連續輸錯 5 次，鎖住 5 分鐘（防止有人拿著登入中的手機亂猜）。
--   ④ 忘記密碼：在 Supabase SQL Editor 執行
--        delete from public.owner_delete_pins where owner_id = '<店家 ID>';
--      刪掉之後，下次要刪除預約時會請你重新設定一組。

CREATE TABLE IF NOT EXISTS public.owner_delete_pins (
  owner_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash        text NOT NULL,
  failed_attempts int  NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 開 RLS 又不建任何 policy ＋ 撤掉所有權限：前端完全讀不到、寫不到
ALTER TABLE public.owner_delete_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_delete_pins FROM anon, authenticated;

-- 有沒有設定過刪除密碼
CREATE OR REPLACE FUNCTION public.has_delete_pin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.owner_delete_pins WHERE owner_id = auth.uid());
$$;

-- 驗證密碼。回傳：ok／wrong／locked／not_set
CREATE OR REPLACE FUNCTION public.verify_delete_pin(p_pin text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  r public.owner_delete_pins%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 'not_set';
  END IF;
  SELECT * INTO r FROM public.owner_delete_pins WHERE owner_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_set';
  END IF;
  IF r.locked_until IS NOT NULL AND r.locked_until > now() THEN
    RETURN 'locked';
  END IF;

  IF p_pin IS NOT NULL AND r.pin_hash = crypt(p_pin, r.pin_hash) THEN
    UPDATE public.owner_delete_pins
       SET failed_attempts = 0, locked_until = NULL
     WHERE owner_id = auth.uid();
    RETURN 'ok';
  END IF;

  IF r.failed_attempts + 1 >= 5 THEN
    UPDATE public.owner_delete_pins
       SET failed_attempts = 0, locked_until = now() + interval '5 minutes'
     WHERE owner_id = auth.uid();
    RETURN 'locked';
  END IF;
  UPDATE public.owner_delete_pins
     SET failed_attempts = r.failed_attempts + 1
   WHERE owner_id = auth.uid();
  RETURN 'wrong';
END;
$$;

-- 設定或變更密碼。第一次設定不用給舊密碼；已經設定過就要給對舊密碼。
-- 回傳：ok／invalid（不是 4～6 位數字）／wrong（舊密碼不對）／locked／not_allowed（員工或沒登入）
CREATE OR REPLACE FUNCTION public.set_delete_pin(p_new_pin text, p_current_pin text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  has_pin boolean;
  check_result text;
BEGIN
  IF auth.uid() IS NULL OR public.staff_shop_owner_id() IS NOT NULL THEN
    RETURN 'not_allowed';
  END IF;
  IF p_new_pin IS NULL OR p_new_pin !~ '^[0-9]{4,6}$' THEN
    RETURN 'invalid';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.owner_delete_pins WHERE owner_id = auth.uid()) INTO has_pin;
  IF has_pin THEN
    check_result := public.verify_delete_pin(p_current_pin);
    IF check_result <> 'ok' THEN
      RETURN check_result;
    END IF;
  END IF;

  INSERT INTO public.owner_delete_pins (owner_id, pin_hash, failed_attempts, locked_until, updated_at)
  VALUES (auth.uid(), crypt(p_new_pin, gen_salt('bf')), 0, NULL, now())
  ON CONFLICT (owner_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash, failed_attempts = 0, locked_until = NULL, updated_at = now();
  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.has_delete_pin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_delete_pin(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_delete_pin(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_delete_pin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_delete_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_delete_pin(text, text) TO authenticated;
