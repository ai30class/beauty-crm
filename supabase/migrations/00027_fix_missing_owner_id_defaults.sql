-- 全站掃描發現 5 張表的 owner_id 都跟 shop_blocked_slots 一樣忘了設 DEFAULT auth.uid()。
-- restock_log 已確認因此 100% 寫入失敗（RLS 擋下，且前端沒檢查 error，靜默吞掉）；
-- 其餘幾張表目前呼叫端多半有手動帶 owner_id，這裡補上純粹是防呆，不影響現有行為。
ALTER TABLE public.restock_log
  ALTER COLUMN owner_id SET DEFAULT auth.uid();

ALTER TABLE public.customer_accounts
  ALTER COLUMN owner_id SET DEFAULT auth.uid();

ALTER TABLE public.notification_logs
  ALTER COLUMN owner_id SET DEFAULT auth.uid();

ALTER TABLE public.online_orders
  ALTER COLUMN owner_id SET DEFAULT auth.uid();

ALTER TABLE public.shop_profiles
  ALTER COLUMN owner_id SET DEFAULT auth.uid();
