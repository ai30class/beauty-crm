-- 00104：send-reminders 只接受排程呼叫（2026-09-23 安全檢查「Edge Function 稽核」）
--
-- 問題：send-reminders 完全沒檢查是誰在呼叫。排程（pg_cron）用 Vault 裡的 SUPABASE_ANON_KEY 當通行證，
--   但 anon key 本來就是公開的（網頁程式裡就有），所以任何人都能叫它執行：例如觸發平常沒排程的
--   「預約前 1 小時提醒」（type=appointment），讓顧客收到不該收的 LINE、消耗店家的 LINE 訊息額度。
--   （notification_logs 有防重複，同一則同一天不會發兩次，所以不至於被拿來狂發。）
--
-- 修法：一組只有資料庫知道的暗號（CRON_SECRET）。
--   ① 在 Vault 產生一組隨機暗號——在資料庫裡直接產生，任何人（包括 Claude）都不必看到或複製它。
--   ② check_cron_secret()：Edge Function 用 service_role 把收到的暗號丟進來比對，只回傳是／否；
--      只開給 service_role，未登入者、登入者都不能呼叫（不能拿來猜暗號）。
--   ③ 三個排程改成多帶一個 x-cron-secret 標頭（cron.schedule 用同名會直接覆蓋原本的排程）。
--   ④ send-reminders 收到沒帶暗號、或暗號不對的呼叫，一律回 401，不做任何事。
--
-- ⚠️ 順序：先套用這份（排程開始帶暗號，舊版 Edge Function 會直接忽略多出來的標頭，不影響運作）
--    → 再部署新版 send-reminders。反過來的話，新版函式會擋掉還沒帶暗號的排程，提醒會停擺。
--
-- 00094（滿意度回饋排程，尚未套用）之後要套用時，也要照這份的寫法帶 x-cron-secret。
--
-- 驗證：
--   select name from vault.secrets where name = 'CRON_SECRET';                        -- 1 列
--   select has_function_privilege('anon', 'public.check_cron_secret(text)', 'EXECUTE') as anon,
--          has_function_privilege('authenticated', 'public.check_cron_secret(text)', 'EXECUTE') as logged_in; -- 都 false
--   select jobname, schedule, position('x-cron-secret' in command) > 0 as has_secret from cron.job order by 1;  -- 3 列都 true

-- ① 暗號（重複執行不會換掉已存在的暗號）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'CRON_SECRET') THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'CRON_SECRET',
      'send-reminders 排程暗號（00104）'
    );
  END IF;
END $$;

-- ② 比對函式
CREATE OR REPLACE FUNCTION public.check_cron_secret(p_secret text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(p_secret, '') <> ''
     AND EXISTS (
       SELECT 1 FROM vault.decrypted_secrets
       WHERE name = 'CRON_SECRET' AND decrypted_secret = p_secret
     );
$$;

REVOKE ALL ON FUNCTION public.check_cron_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_cron_secret(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_cron_secret(text) TO service_role;

-- ③ 三個現行排程改成帶暗號（時間、內容跟原本一樣）
SELECT cron.schedule(
  'birthday-reminders-daily',
  '0 1 * * *',
  $cron$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY'),
                 'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET')
               ),
    body    := '{"type":"birthday"}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'appointment-reminders-day-before',
  '0 2 * * *',
  $cron$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY'),
                 'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET')
               ),
    body    := '{"type":"appointment_day_before"}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'expire-pending-deposit-orders',
  '0 * * * *',
  $cron$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY'),
                 'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET')
               ),
    body    := '{"type":"expire_pending_deposit"}'::jsonb
  );
  $cron$
);
