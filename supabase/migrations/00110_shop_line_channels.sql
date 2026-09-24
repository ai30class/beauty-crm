-- 00110：每家店用自己的 LINE 官方帳號（第一步：只加「存放的地方」，不改任何現有行為）
--
-- 背景：招商頁已對外寫「進階版用你自己的 LINE 官方帳號發送」，但 send-reminders 只讀一組
--   LINE_MESSAGING_CHANNEL_ACCESS_TOKEN、line-login 只讀一組 LINE_LOGIN_CHANNEL_ID/SECRET（都是椏椏的）。
--   這份先把「每家店自己的 LINE 鑰匙」的存放處準備好；Edge Function 與前端改用它是後面幾步。
--
-- 設計：
--   ① shop_line_channels：每家店一列，只放「不是秘密」的東西——LIFF ID、LINE Login 頻道 ID
--      （這兩個本來就會出現在預約連結與 LINE 登入網址裡）。
--   ② 真正的秘密（LINE Login Channel Secret、Messaging API Channel Access Token）放 Vault 加密，
--      名稱固定為 LINE_LOGIN_SECRET:<owner_id>、LINE_MESSAGING_TOKEN:<owner_id>，跟 00104 的 CRON_SECRET 同一套。
--   ③ set_shop_line_channel()：開通進階版時由平台管理者在 SQL Editor 執行（建置費服務的一部分），
--      店家、顧客都不能呼叫。
--   ④ get_shop_line_secrets()：只開給 service_role（Edge Function），讀解密後的鑰匙。
--   ⑤ get_shop_liff_id()：預約頁要知道這家店用哪個 LIFF，只回 LIFF ID，開給所有人。
--   ⑥ line_identities 加 login_channel_id：記這個 LINE 編號是從哪個登入頻道拿到的。
--      不同「提供者」底下，同一個人的 LINE 編號不同，推播時要用同一個提供者的編號才送得到。
--      既有的列留 NULL＝椏椏原本那組（環境變數裡的舊頻道），不改動。
--
-- 對現有店家的影響：沒有。表是空的，Edge Function 與前端還沒改，椏椏的提醒與 LINE 登入照舊。
--
-- 驗證：
--   select count(*) from public.shop_line_channels;                                         -- 0
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='line_identities' and column_name='login_channel_id';  -- 1 列
--   select p.proname,
--          has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as logged_in,
--          has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname in ('set_shop_line_channel','get_shop_line_secrets','get_shop_liff_id')
--    order by 1;
--   -- 預期：get_shop_liff_id 三個都 true；get_shop_line_secrets 只有 service_role true；
--   --       set_shop_line_channel 三個都 false（只有 SQL Editor 的管理者能執行）

-- ① 每家店的 LINE 設定（不含秘密）
CREATE TABLE IF NOT EXISTS public.shop_line_channels (
  owner_id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  liff_id          text NOT NULL,
  login_channel_id text NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_line_channels ENABLE ROW LEVEL SECURITY;
-- 故意不加任何 policy：預設全部擋掉，只能透過下面的函式存取。

-- ⑥ 記錄 LINE 編號來自哪個登入頻道（NULL＝椏椏原本那組舊頻道）
ALTER TABLE public.line_identities ADD COLUMN IF NOT EXISTS login_channel_id text;

-- ③ 開通時設定／更換某家店的 LINE 鑰匙（重複執行＝更新）
CREATE OR REPLACE FUNCTION public.set_shop_line_channel(
  p_owner_id uuid,
  p_liff_id text,
  p_login_channel_id text,
  p_login_channel_secret text,
  p_messaging_access_token text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_login_channel_id text := trim(coalesce(p_login_channel_id, ''));
  v_liff_id text := trim(coalesce(p_liff_id, ''));
  v_secret_name text := 'LINE_LOGIN_SECRET:' || p_owner_id;
  v_token_name text := 'LINE_MESSAGING_TOKEN:' || p_owner_id;
  v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.shop_profiles WHERE owner_id = p_owner_id) THEN
    RAISE EXCEPTION '找不到這家店（owner_id 錯了？）';
  END IF;
  IF v_login_channel_id !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'LINE Login 頻道 ID 應該是一串數字';
  END IF;
  -- LIFF ID 的格式是「LINE Login 頻道 ID-一串英數」；對不上代表 LIFF 開在別的頻道底下
  IF v_liff_id NOT LIKE v_login_channel_id || '-%' THEN
    RAISE EXCEPTION 'LIFF ID 開頭應該是 LINE Login 頻道 ID（%-…），請確認 LIFF 是開在同一個登入頻道底下', v_login_channel_id;
  END IF;
  IF coalesce(trim(p_login_channel_secret), '') = '' OR coalesce(trim(p_messaging_access_token), '') = '' THEN
    RAISE EXCEPTION 'Channel Secret 與 Channel Access Token 都要填';
  END IF;

  SELECT id INTO v_id FROM vault.secrets WHERE name = v_secret_name;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(trim(p_login_channel_secret), v_secret_name, 'LINE Login Channel Secret（00110）');
  ELSE
    PERFORM vault.update_secret(v_id, trim(p_login_channel_secret));
  END IF;

  v_id := NULL;
  SELECT id INTO v_id FROM vault.secrets WHERE name = v_token_name;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(trim(p_messaging_access_token), v_token_name, 'LINE Messaging API Channel Access Token（00110）');
  ELSE
    PERFORM vault.update_secret(v_id, trim(p_messaging_access_token));
  END IF;

  INSERT INTO public.shop_line_channels (owner_id, liff_id, login_channel_id, updated_at)
  VALUES (p_owner_id, v_liff_id, v_login_channel_id, now())
  ON CONFLICT (owner_id) DO UPDATE
    SET liff_id = EXCLUDED.liff_id,
        login_channel_id = EXCLUDED.login_channel_id,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_shop_line_channel(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_shop_line_channel(uuid, text, text, text, text) FROM anon, authenticated, service_role;

-- ④ Edge Function 讀某家店解密後的 LINE 鑰匙；沒設定過就回 0 列
CREATE OR REPLACE FUNCTION public.get_shop_line_secrets(p_owner_id uuid)
RETURNS TABLE (liff_id text, login_channel_id text, login_channel_secret text, messaging_access_token text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.liff_id,
         c.login_channel_id,
         (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'LINE_LOGIN_SECRET:' || c.owner_id),
         (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'LINE_MESSAGING_TOKEN:' || c.owner_id)
  FROM public.shop_line_channels c
  WHERE c.owner_id = p_owner_id;
$$;

REVOKE ALL ON FUNCTION public.get_shop_line_secrets(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_shop_line_secrets(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shop_line_secrets(uuid) TO service_role;

-- ⑤ 預約頁用：這家店的 LIFF ID（沒設定過回 NULL，前端就用椏椏原本那組）
CREATE OR REPLACE FUNCTION public.get_shop_liff_id(p_owner_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT liff_id FROM public.shop_line_channels WHERE owner_id = p_owner_id;
$$;

REVOKE ALL ON FUNCTION public.get_shop_liff_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shop_liff_id(uuid) TO anon, authenticated, service_role;
