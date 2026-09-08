-- 每小時檢查一次「待確認匯款」訂單有沒有超過期限，超過就自動取消、釋出時段。
SELECT cron.schedule(
  'expire-pending-deposit-orders',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY')
               ),
    body    := '{"type":"expire_pending_deposit"}'::jsonb
  );
  $$
);
