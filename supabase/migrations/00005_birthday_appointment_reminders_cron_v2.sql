
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.notification_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL,
  ref_id      uuid NOT NULL,
  type        text NOT NULL,
  sent_date   date NOT NULL DEFAULT CURRENT_DATE,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ref_id, type, sent_date)
);
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notification_logs' AND policyname = 'owner_all_notification_logs'
  ) THEN
    CREATE POLICY "owner_all_notification_logs"
      ON public.notification_logs FOR ALL
      TO authenticated
      USING (owner_id = auth.uid())
      WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

SELECT cron.schedule(
  'birthday-reminders-daily',
  '0 1 * * *',
  $$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY')
               ),
    body    := '{"type":"birthday"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'appointment-reminders-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY')
               ),
    body    := '{"type":"appointment"}'::jsonb
  );
  $$
);
